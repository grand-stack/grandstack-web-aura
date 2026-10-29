// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { AuraApiError, AuraAuthError, AuraClient } from "./client.js";
import { UserError } from "./errors.js";
import type { SecretStore } from "./secrets.js";
import { OperationService } from "./operations/service.js";
import { loadInstance, unfinishedOperations } from "./operations/store.js";
import { maskClientId } from "./status.js";
import type { StoreClient } from "./storeClient.js";
import { startSync, type SyncResult } from "./sync.js";

export { UserError };

export interface AuraSetup {
  /** True until credentials are stored. The interface shows only the connect form. */
  required: boolean;
  connected: boolean;
  clientIdHint: string | null;
  lastSyncAt: string | null;
  syncing: boolean;
  lastSyncRunId: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface ServiceOptions {
  accountId: string;
  auraBaseUrl: string;
  syncConcurrency: number;
  syncIntervalMs: number;
  secrets: SecretStore;
  store: StoreClient;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** How long to wait before the nth look at an instance a change is waiting on. Short in tests. */
  operationPollDelayMs?: (attempt: number) => number;
  /** How long a change may take before it is given up on. Default 30 minutes. */
  operationTimeoutMs?: number;
}

const iso = (d: Date) => d.toISOString();
const MAX_CREDENTIAL_LENGTH = 200;

export class AuraService {
  private client: AuraClient | undefined;
  private running: { runId: string; done: Promise<SyncResult> } | undefined;
  private timer: NodeJS.Timeout | undefined;

  /** Plan, confirm and cancel changes to instances. */
  readonly operations: OperationService;

  constructor(private readonly o: ServiceOptions) {
    this.operations = new OperationService({
      store: o.store,
      client: () => this.auraClient(),
      vault: {
        save: (id, username, password) => o.secrets.saveInstanceCredential(id, username, password),
        link: (id) => o.secrets.linkInstanceCredential(id),
        delete: (id) => o.secrets.deleteInstanceCredential(id),
      },
      isConnected: () => o.secrets.hasAuraSecret(o.accountId),
      now: o.now,
      sleep: o.sleep,
      pollDelayMs: o.operationPollDelayMs,
      timeoutMs: o.operationTimeoutMs,
    });
  }

  private now(): Date {
    return (this.o.now ?? (() => new Date()))();
  }

  /** One long-lived client, so its token is reused between syncs. It reads the secret from the store only when it needs a token. */
  private auraClient(): AuraClient {
    this.client ??= new AuraClient({
      baseUrl: this.o.auraBaseUrl,
      fetch: this.o.fetch,
      sleep: this.o.sleep,
      credentials: async () => {
        const credentials = await this.o.secrets.loadAuraSecret(this.o.accountId);
        if (!credentials) throw new UserError("No Aura account is connected.");
        return credentials;
      },
    });
    return this.client;
  }

  async setup(): Promise<AuraSetup> {
    const hasSecret = await this.o.secrets.hasAuraSecret(this.o.accountId);
    const data = await this.o.store.request<{
      auraAccounts: { clientIdHint: string | null; lastSyncAt: string | null }[];
      syncRuns: { id: string; status: string; error: string | null }[];
    }>(
      `query($id: ID!) {
         auraAccounts(where: { id: { eq: $id } }) { clientIdHint lastSyncAt }
         syncRuns(sort: [{ startedAt: DESC }], limit: 1) { id status error }
       }`,
      { id: this.o.accountId },
    );
    const account = data.auraAccounts[0];
    const run = data.syncRuns[0];
    return {
      required: !hasSecret,
      connected: hasSecret,
      clientIdHint: account?.clientIdHint ?? null,
      lastSyncAt: account?.lastSyncAt ?? null,
      syncing: this.running !== undefined,
      lastSyncRunId: run?.id ?? null,
      lastSyncStatus: run?.status ?? null,
      lastSyncError: run?.error ?? null,
    };
  }

  /**
   * Checks the credentials with Aura first, and stores nothing if Aura refuses them. On success the secret is stored encrypted,
   * the account is recorded, and a first sync starts in the background.
   */
  async connect(clientIdInput: string, clientSecretInput: string): Promise<{ connected: true; syncRunId: string }> {
    const clientId = clientIdInput.trim();
    const clientSecret = clientSecretInput.trim();
    if (!clientId || !clientSecret) throw new UserError("Enter both the client id and the client secret.");
    if (clientId.length > MAX_CREDENTIAL_LENGTH || clientSecret.length > MAX_CREDENTIAL_LENGTH) throw new UserError("That client id or secret is too long.");

    const probe = new AuraClient({
      baseUrl: this.o.auraBaseUrl,
      fetch: this.o.fetch,
      sleep: this.o.sleep,
      maxRetries: 1,
      credentials: async () => ({ clientId, clientSecret }),
    });
    try {
      await probe.checkCredentials();
    } catch (err) {
      if (err instanceof AuraAuthError) throw new UserError("Aura rejected that client id and secret. Check them in the Aura Console.");
      throw new UserError("Could not reach Aura to check the credentials. Try again in a moment.");
    }

    await this.o.secrets.saveAuraSecret(this.o.accountId, { clientId, clientSecret });
    this.client = undefined;
    await this.recordAccount(maskClientId(clientId));
    const started = await this.startOnce();
    return { connected: true, syncRunId: started.runId };
  }

  /** Deletes the stored secret and stops syncing. Instances, stored passwords and history stay. Nothing changes in Aura. */
  async disconnect(): Promise<void> {
    await this.o.secrets.deleteAuraSecret(this.o.accountId);
    this.client = undefined;
    await this.o.store.request(`mutation($w: AuraAccountWhere, $u: AuraAccountUpdateInput) { updateAuraAccounts(where: $w, update: $u) { info { nodesCreated } } }`, {
      w: { id: { eq: this.o.accountId } },
      u: { status: { set: "DISCONNECTED" } },
    });
  }

  /** Starts a sync unless one is already running, in which case it reports that one. */
  async syncNow(): Promise<{ started: boolean; runId: string }> {
    if (!(await this.o.secrets.hasAuraSecret(this.o.accountId))) throw new UserError("Connect an Aura account first.");
    return this.startOnce();
  }

  /**
   * Removes what came from Aura (the tenants, their instance options and the instances Aura lists) and reads it in again. The Aura
   * credentials, past operations, stored passwords and sync history are kept (see `SecretStore.clearAuraCopy`). Nothing changes in Aura.
   * Refused while a sync or a change is under way, because both would be working on what is being removed.
   */
  async resetStore(): Promise<{ started: boolean; runId: string; removed: { tenants: number; options: number; instances: number } }> {
    if (!(await this.o.secrets.hasAuraSecret(this.o.accountId))) throw new UserError("Connect an Aura account first.");
    if (this.running) throw new UserError("A sync is running. Wait for it to finish, then reset the store.");
    if ((await unfinishedOperations(this.o.store)).length > 0) throw new UserError("A change to an instance is in progress. Wait for it to finish, then reset the store.");
    const removed = await this.o.secrets.clearAuraCopy(this.o.accountId);
    const started = await this.startOnce();
    return { ...started, removed };
  }

  /**
   * Shows an instance's stored password, once per call, and records that it was shown. The only place a password leaves the store.
   * `by` is who asked; there is no sign-in yet, so it says so.
   */
  async revealPassword(instanceId: string, by = "local"): Promise<{ username: string; password: string }> {
    const revealed = await this.o.secrets.revealInstanceCredential(instanceId, by, this.now().toISOString());
    if (!revealed) throw new UserError("No password is stored for this instance. Aura shows it only when an instance is created, so an instance found by a sync has none.");
    return revealed;
  }

  /**
   * Compares an instance as stored with Aura as it is now, without changing the stored copy. The person decides whether to sync.
   */
  async checkInstance(instanceId: string): Promise<{ checkedAt: string; inAura: boolean; differences: { field: string; label: string; stored: string; live: string }[] }> {
    if (!(await this.o.secrets.hasAuraSecret(this.o.accountId))) throw new UserError("Connect an Aura account first.");
    const stored = await loadInstance(this.o.store, instanceId);
    if (!stored) throw new UserError("That instance is not in the store. Sync, then try again.");
    const checkedAt = this.now().toISOString();
    let live;
    try {
      live = await this.auraClient().getInstance(instanceId);
    } catch (err) {
      if (err instanceof AuraApiError && err.status === 404) return { checkedAt, inAura: false, differences: [] };
      throw err instanceof AuraAuthError ? new UserError("Aura rejected the stored client id and secret. Replace the credentials.") : new UserError("Could not read the instance from Aura. Try again in a moment.");
    }
    const show = (v: unknown) => (v === null || v === undefined ? "Unknown" : typeof v === "boolean" ? (v ? "On" : "Off") : String(v));
    const pairs: [string, string, unknown, unknown][] = [
      ["name", "Name", stored.name, live.name],
      ["status", "Status", stored.status, live.status],
      ["memory", "Memory", stored.memory, live.memory],
      ["storage", "Storage", stored.storage, live.storage],
      ["vectorOptimized", "Vector optimized", stored.vectorOptimized, live.vector_optimized],
      ["graphAnalyticsPlugin", "Graph analytics plugin", stored.graphAnalyticsPlugin, live.graph_analytics_plugin],
    ];
    return {
      checkedAt,
      inAura: true,
      // A value Aura does not report is not a difference
      differences: pairs.filter(([, , a, b]) => b !== undefined && b !== null && (a ?? null) !== b).map(([field, label, a, b]) => ({ field, label, stored: show(a), live: show(b) })),
    };
  }

  private async startOnce(): Promise<{ started: boolean; runId: string }> {
    if (this.running) return { started: false, runId: this.running.runId };
    const started = await startSync({
      aura: this.auraClient(),
      store: this.o.store,
      accountId: this.o.accountId,
      concurrency: this.o.syncConcurrency,
      now: this.o.now,
    });
    const runId = started.runId;
    // After every sync, put back any link a reset took away. The sync only counts as finished once that is done.
    const done = started.done.then(async (result) => {
      try {
        await this.o.secrets.relinkAfterReset();
      } catch {
        // the next sync tries again
      }
      return result;
    });
    this.running = { runId, done };
    void done.finally(() => {
      this.running = undefined;
    });
    return { started: true, runId };
  }

  /** Resolves when the running sync, if any, has finished. For tests and a clean shutdown. */
  async idle(): Promise<void> {
    await this.running?.done;
  }

  private async recordAccount(clientIdHint: string): Promise<void> {
    const existing = await this.o.store.request<{ auraAccounts: { id: string }[] }>(`query($id: ID!) { auraAccounts(where: { id: { eq: $id } }) { id } }`, { id: this.o.accountId });
    if (existing.auraAccounts.length === 0) {
      await this.o.store.request(`mutation($input: [AuraAccountCreateInput!]!) { createAuraAccounts(input: $input) { info { nodesCreated } } }`, {
        input: [{ id: this.o.accountId, label: "Aura account", clientIdHint, status: "CONNECTED", connectedAt: iso(this.now()) }],
      });
    } else {
      await this.o.store.request(`mutation($w: AuraAccountWhere, $u: AuraAccountUpdateInput) { updateAuraAccounts(where: $w, update: $u) { info { nodesCreated } } }`, {
        w: { id: { eq: this.o.accountId } },
        u: { clientIdHint: { set: clientIdHint }, status: { set: "CONNECTED" } },
      });
    }
  }

  /** Start the timer, and sync once now if an account is already connected (for example after a restart). */
  async start(): Promise<void> {
    if (this.o.syncIntervalMs > 0) {
      this.timer = setInterval(() => void this.tick(), this.o.syncIntervalMs);
      this.timer.unref();
    }
    // Pick up any change a restart interrupted, then sync
    try {
      await this.operations.recover();
    } catch (err) {
      console.error(`Could not resume interrupted changes: ${err instanceof Error ? err.name : "error"}`);
    }
    await this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    try {
      if (await this.o.secrets.hasAuraSecret(this.o.accountId)) await this.startOnce();
    } catch (err) {
      console.error(`Scheduled sync could not start: ${err instanceof Error ? err.name : "error"}`);
    }
  }
}
