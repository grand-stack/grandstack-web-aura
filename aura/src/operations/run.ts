// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { AuraApiError, AuraAuthError, AuraUnreachableError, type AuraClient, type InstanceDetail, type InstanceUpdate } from "../client.js";
import { refreshInstance } from "../sync.js";
import type { StoreClient } from "../storeClient.js";
import type { Changes } from "./diff.js";
import { STEPS, type OperationStatus, type PlannableKind } from "./state.js";
import { addSteps, loadOperation, moveOperation, setStep, type StoredOperation } from "./store.js";

export interface RunDeps {
  store: StoreClient;
  aura: AuraClient;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** How long to wait before the nth look at the instance. */
  pollDelayMs: (attempt: number) => number;
  /** Stop waiting after this long. The change may still finish; the next sync will show it. */
  timeoutMs: number;
}

const iso = (d: Date) => d.toISOString();

/** Waits that start short and grow, so a quick change is noticed quickly and a slow one is not hammered. */
export const defaultPollDelay = (attempt: number): number => Math.min(15_000, Math.round(3000 * 1.4 ** attempt));

/** The change to send, what the instance must look like afterwards, and how to tell. */
interface Expectation {
  /** The stable status the instance reaches when the change is done. */
  status: string;
  send: (aura: AuraClient, id: string) => Promise<number>;
  matches: (detail: InstanceDetail) => boolean;
}

export function toAuraBody(changes: Changes): InstanceUpdate {
  return {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.memory !== undefined ? { memory: changes.memory } : {}),
    ...(changes.storage !== undefined ? { storage: changes.storage } : {}),
    ...(changes.vectorOptimized !== undefined ? { vector_optimized: changes.vectorOptimized } : {}),
    ...(changes.graphAnalyticsPlugin !== undefined ? { graph_analytics_plugin: changes.graphAnalyticsPlugin } : {}),
  };
}

export function expectation(kind: PlannableKind, changes: Changes = {}): Expectation {
  if (kind === "PAUSE") return { status: "paused", send: async (a, id) => (await a.pauseInstance(id), 202), matches: () => true };
  if (kind === "RESUME") return { status: "running", send: async (a, id) => (await a.resumeInstance(id), 202), matches: () => true };
  return {
    status: "running",
    send: async (a, id) => (await a.updateInstance(id, toAuraBody(changes))).status,
    // Aura can still show the old values for a moment after it accepts a change, so "running" alone is not "done"
    matches: (d) =>
      (changes.name === undefined || d.name === changes.name) &&
      (changes.memory === undefined || d.memory === changes.memory) &&
      (changes.storage === undefined || d.storage === changes.storage) &&
      (changes.vectorOptimized === undefined || d.vector_optimized === changes.vectorOptimized) &&
      (changes.graphAnalyticsPlugin === undefined || d.graph_analytics_plugin === changes.graphAnalyticsPlugin),
  };
}

/** What to tell the person when Aura said no, or could not be reached. Never includes anything but Aura's own plain message. */
export function explainFailure(err: unknown, phase: "sending" | "waiting"): string {
  if (err instanceof AuraAuthError) return "Aura rejected the stored client id and secret. Replace the credentials, then plan the change again.";
  if (err instanceof AuraUnreachableError) {
    return phase === "sending"
      ? "Lost contact with Aura while sending the change, so it is not known whether Aura received it. Check the instance, then plan the change again if it did not happen."
      : "Lost contact with Aura while waiting. The change may still finish; the stored copy will catch up at the next sync.";
  }
  if (err instanceof AuraApiError) {
    const said = err.problems[0]?.message;
    if (err.status === 409) return "Aura is already working on this instance. Wait for it to finish, then plan the change again.";
    if (err.status === 404) return "Aura no longer has this instance.";
    if (err.status === 429) return "Aura is limiting requests right now. Try again in a minute.";
    if (err.status === 401 || err.status === 403) return "Aura rejected the stored client id and secret. Replace the credentials, then plan the change again.";
    if (err.status === 400) return `Aura refused the change${said ? `: ${said}` : "."}`;
    return `Aura answered ${err.status}${said ? `: ${said}` : ""}.${phase === "sending" ? " It is not known whether the change was made." : ""}`;
  }
  return "The change stopped because of an unexpected error.";
}

/** "45 seconds", "2 minutes". */
export function spokenDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds === 1) return "1 second";
  return seconds < 120 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`;
}

class Stop extends Error {
  constructor(readonly step: number, message: string) {
    super(message);
  }
}

/**
 * Carries out a confirmed operation: sends the request to Aura, watches the instance until it shows the change, brings the stored copy
 * up to date and records each step on the way. It never throws: a failure is recorded on the operation, in plain words.
 *
 * `alreadySent` is for an operation picked up again after a restart whose request had gone out: it only watches.
 */
export async function runOperation(deps: RunDeps, operationId: string, options: { alreadySent?: boolean } = {}): Promise<void> {
  const { store, aura } = deps;
  const at = () => iso(deps.now());
  let status: OperationStatus = options.alreadySent ? "RUNNING" : "CONFIRMED";
  let step = options.alreadySent ? 4 : 2;

  const op = await loadOperation(store, operationId);
  if (!op || !op.targetId) return;
  const targetId = op.targetId;

  const stop = (message: string): never => {
    throw new Stop(step, message);
  };

  try {
    const expected = expectation(op.desired.kind, op.desired.changes);

    if (!options.alreadySent) {
      // Mark the step before claiming the operation: a crash between the two is then found, on restart, as "may have been sent"
      step = 2;
      await setStep(store, operationId, 2, "ACTIVE", at());
      if (!(await moveOperation(store, operationId, "CONFIRMED", "RUNNING", {}, at()))) return; // someone else has it
      status = "RUNNING";
      let answered: number;
      try {
        answered = await expected.send(aura, targetId);
      } catch (err) {
        return stop(explainFailure(err, "sending"));
      }
      await setStep(store, operationId, 2, "DONE", at());
      step = 3;
      await setStep(store, operationId, 3, "DONE", at(), `Aura answered ${answered}`);
    }

    // Watch the instance until it is in the stable status and shows what was asked
    step = 4;
    await setStep(store, operationId, 4, "ACTIVE", at(), "Checking with Aura");
    const started = deps.now().getTime();
    let lastSeen: string | undefined;
    let lostContact = 0;
    let finalDetail: InstanceDetail | undefined;
    for (let attempt = 0; ; attempt++) {
      if (deps.now().getTime() - started > deps.timeoutMs) {
        return stop(`Aura did not show the change within ${spokenDuration(deps.timeoutMs)}. It may still finish; the stored copy will catch up at the next sync.`);
      }
      await deps.sleep(deps.pollDelayMs(attempt));
      let detail: InstanceDetail;
      try {
        detail = await aura.getInstance(targetId);
        lostContact = 0;
      } catch (err) {
        if (err instanceof AuraAuthError || (err instanceof AuraApiError && [401, 403, 404].includes(err.status))) return stop(explainFailure(err, "waiting"));
        // A bad moment (no connection, a server error) is not the end: look again, and give up only if it keeps happening
        if (++lostContact >= 3) return stop(explainFailure(err instanceof AuraApiError ? err : new AuraUnreachableError(), "waiting"));
        continue;
      }
      if (detail.status !== lastSeen) {
        lastSeen = detail.status;
        await setStep(store, operationId, 4, "ACTIVE", at(), `Aura says: ${detail.status}`);
      }
      if (detail.status === "loading failed") return stop("Aura reports this instance as 'loading failed'.");
      if (detail.status === expected.status && expected.matches(detail)) {
        finalDetail = detail;
        break;
      }
    }

    await setStep(store, operationId, 4, "DONE", at());
    step = 5;
    await setStep(store, operationId, 5, "ACTIVE", at());
    await refreshInstance(store, finalDetail, at());
    await setStep(store, operationId, 5, "DONE", at());
    step = 6;
    await setStep(store, operationId, 6, "DONE", at());
    await moveOperation(store, operationId, "RUNNING", "SUCCEEDED", { finishedAt: at() }, at());
  } catch (err) {
    const message = err instanceof Stop ? err.message : "The change stopped because of an unexpected error.";
    if (!(err instanceof Stop)) console.error(`Operation ${operationId} stopped at step ${step}: ${err instanceof Error ? err.name : "error"}`);
    try {
      await setStep(store, operationId, err instanceof Stop ? err.step : step, "FAILED", at(), message);
      await moveOperation(store, operationId, status, "FAILED", { error: message, finishedAt: at() }, at());
    } catch {
      console.error(`Could not record the failure of operation ${operationId}`);
    }
  }
}

/** Creates the six steps of an operation. Step 1 is already done: it is confirmed. */
export async function createSteps(store: StoreClient, operationId: string, at: string): Promise<void> {
  await addSteps(store, operationId, STEPS.map((label, i) => ({ seq: i + 1, label, status: i === 0 ? "DONE" : "PENDING", at: i === 0 ? at : undefined })));
}

export type { StoredOperation };
