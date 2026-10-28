// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { AuraClient } from "../client.js";
import { UserError } from "../errors.js";
import type { StoreClient } from "../storeClient.js";
import { refreshInstance } from "../sync.js";
import { sameSnapshot, type Changes } from "./diff.js";
import { buildPlan, guardInstance, guardKind, normaliseChanges, type ChangeInput } from "./plan.js";
import { createSteps, defaultPollDelay, expectation, runOperation, type RunDeps } from "./run.js";
import type { OperationStatus, PlannableKind } from "./state.js";
import { createOperation, holdingOperations, loadInstance, loadOperation, loadSizeOptions, moveOperation, setStep, snapshotOf, unfinishedOperations } from "./store.js";

export interface OperationServiceOptions {
  store: StoreClient;
  client: () => AuraClient;
  isConnected: () => Promise<boolean>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  pollDelayMs?: (attempt: number) => number;
  timeoutMs?: number;
  /** Who is recorded as asking. There is no sign-in yet, so this says so. */
  requestedBy?: string;
}

const TRANSITIONAL: Record<PlannableKind, string> = { UPDATE: "updating", PAUSE: "pausing", RESUME: "resuming" };

/**
 * Plan, review, confirm, progress. Planning reads the store and writes one PLANNED operation: it never calls Aura. Only confirming
 * does, and only for a plan that is still true, for an instance nothing else is changing, and only once.
 */
export class OperationService {
  private readonly running = new Map<string, Promise<void>>();
  /** Instances whose confirmation is being decided right now, so two confirmations cannot both pass the checks. */
  private readonly confirming = new Set<string>();

  constructor(private readonly o: OperationServiceOptions) {}

  private now(): Date {
    return (this.o.now ?? (() => new Date()))();
  }

  private deps(): RunDeps {
    return {
      store: this.o.store,
      aura: this.o.client(),
      now: () => this.now(),
      sleep: this.o.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      pollDelayMs: this.o.pollDelayMs ?? defaultPollDelay,
      timeoutMs: this.o.timeoutMs ?? 30 * 60_000,
    };
  }

  async plan(kind: PlannableKind, instanceId: string, input: ChangeInput = {}): Promise<{ operationId: string }> {
    const instance = guardInstance(await loadInstance(this.o.store, instanceId));
    guardKind(kind, instance);
    if ((await holdingOperations(this.o.store, instanceId)).length > 0) throw new UserError("Another change to this instance is already in progress.");

    let changes: Changes = {};
    if (kind === "UPDATE") {
      const sizes = input.memory ? await loadSizeOptions(this.o.store, instance) : [];
      changes = normaliseChanges(instance, input, sizes);
    }
    const plan = buildPlan(kind, instance, changes);
    const operationId = await createOperation(this.o.store, {
      kind,
      instance,
      desired: kind === "UPDATE" ? { kind, changes } : { kind },
      before: snapshotOf(instance),
      plan,
      requestedBy: this.o.requestedBy ?? "local",
      at: this.now().toISOString(),
    });
    return { operationId };
  }

  /** Confirm a plan. Nothing reaches Aura before this, and this only starts the work: progress is read from the operation. */
  async confirm(operationId: string): Promise<{ operationId: string; status: OperationStatus }> {
    if (!(await this.o.isConnected())) throw new UserError("Connect an Aura account first.");
    const op = await loadOperation(this.o.store, operationId);
    if (!op) throw new UserError("That change does not exist.");
    if (op.status !== "PLANNED") throw new UserError(op.status === "CANCELLED" ? "This change was cancelled." : "This change was already confirmed.");
    if (!op.targetId) throw new UserError("This change has no instance.");
    const target = op.targetId;

    if (this.confirming.has(target)) throw new UserError("Another change to this instance is being confirmed. Try again in a moment.");
    this.confirming.add(target);
    try {
      const instance = guardInstance(await loadInstance(this.o.store, target));
      guardKind(op.desired.kind, instance);
      // The plan was made from what the store showed. If that has changed (a sync, or another change), it may no longer be right.
      if (!sameSnapshot(op.before, snapshotOf(instance))) throw new UserError("This instance changed after you planned this. Plan the change again.");
      if ((await holdingOperations(this.o.store, target)).length > 0) throw new UserError("Another change to this instance is already in progress.");

      const at = this.now().toISOString();
      // One query that only succeeds if the operation is still PLANNED: the second of two confirmations loses here
      if (!(await moveOperation(this.o.store, operationId, "PLANNED", "CONFIRMED", { confirmedAt: at }, at))) throw new UserError("This change was already confirmed or cancelled.");
      await createSteps(this.o.store, operationId, at);
    } finally {
      this.confirming.delete(target);
    }
    this.start(operationId);
    return { operationId, status: "CONFIRMED" };
  }

  async cancel(operationId: string): Promise<void> {
    const op = await loadOperation(this.o.store, operationId);
    if (!op) throw new UserError("That change does not exist.");
    if (op.status !== "PLANNED") throw new UserError(op.status === "CANCELLED" ? "This change was already cancelled." : "This change has already been sent to Aura, so it can no longer be cancelled.");
    const at = this.now().toISOString();
    if (!(await moveOperation(this.o.store, operationId, "PLANNED", "CANCELLED", { finishedAt: at }, at))) throw new UserError("This change was already confirmed or cancelled.");
  }

  private start(operationId: string, options: { alreadySent?: boolean } = {}): void {
    if (this.running.has(operationId)) return;
    const work = runOperation(this.deps(), operationId, options).finally(() => this.running.delete(operationId));
    this.running.set(operationId, work);
  }

  /**
   * Picks up operations a restart interrupted. Whether Aura was asked decides what is safe:
   * - never asked (the sending step never started): just run it;
   * - asked and answered: only watch;
   * - possibly asked (it was being sent): look at Aura. If the instance already shows it, record success; if Aura is working on it,
   *   watch; otherwise fail it and say so, rather than ask Aura a second time.
   */
  async recover(): Promise<number> {
    if (!(await this.o.isConnected())) return 0;
    let picked = 0;
    for (const { id } of await unfinishedOperations(this.o.store)) {
      if (this.running.has(id)) continue;
      const op = await loadOperation(this.o.store, id);
      if (!op || !op.targetId) continue;
      picked++;
      const at = () => this.now().toISOString();
      if (op.steps.length === 0) await createSteps(this.o.store, id, at());
      const sending = op.steps.find((s) => s.seq === 2)?.status ?? "PENDING";

      if (sending === "PENDING") {
        this.start(id);
      } else if (sending === "DONE") {
        this.start(id, { alreadySent: true });
      } else {
        const expected = expectation(op.desired.kind, op.desired.changes);
        try {
          const detail = await this.o.client().getInstance(op.targetId);
          if (detail.status === expected.status && expected.matches(detail)) {
            for (const seq of [2, 3, 4, 5, 6]) await setStep(this.o.store, id, seq, "DONE", at());
            await refreshInstance(this.o.store, detail, at());
            // It is already done in Aura. An operation only reaches SUCCEEDED through RUNNING.
            if (op.status === "CONFIRMED") await moveOperation(this.o.store, id, "CONFIRMED", "RUNNING", {}, at());
            await moveOperation(this.o.store, id, "RUNNING", "SUCCEEDED", { finishedAt: at() }, at());
            continue;
          }
          if (detail.status === TRANSITIONAL[op.desired.kind]) {
            if (op.status === "CONFIRMED") await moveOperation(this.o.store, id, "CONFIRMED", "RUNNING", {}, at());
            for (const seq of [2, 3]) await setStep(this.o.store, id, seq, "DONE", at());
            this.start(id, { alreadySent: true });
            continue;
          }
        } catch {
          // Cannot look: fall through to the cautious answer
        }
        const message = "This app stopped while it was sending the change, so it is not known whether Aura received it. Check the instance, then plan the change again if it did not happen.";
        await setStep(this.o.store, id, 2, "FAILED", at(), message);
        await moveOperation(this.o.store, id, op.status, "FAILED", { error: message, finishedAt: at() }, at());
      }
    }
    return picked;
  }

  /** Resolves when every operation this process is running has ended. For tests and a clean shutdown. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running.values()]);
  }
}
