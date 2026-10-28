// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { GraphQLError } from "graphql";
import { AuraAuthError, AuraClient } from "./client.js";
import type { SecretStore } from "./secrets.js";
import { maskClientId } from "./status.js";
import type { StoreClient } from "./storeClient.js";
import { startSync, type SyncResult } from "./sync.js";

/** A problem the person can act on. Its message is shown to them, so it never contains a secret. */
export class UserError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "USER_ERROR" } });
  }
}

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
}

const iso = (d: Date) => d.toISOString();
const MAX_CREDENTIAL_LENGTH = 200;

export class AuraService {
  private client: AuraClient | undefined;
  private running: { runId: string; done: Promise<SyncResult> } | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly o: ServiceOptions) {}

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

  private async startOnce(): Promise<{ started: boolean; runId: string }> {
    if (this.running) return { started: false, runId: this.running.runId };
    const { runId, done } = await startSync({
      aura: this.auraClient(),
      store: this.o.store,
      accountId: this.o.accountId,
      concurrency: this.o.syncConcurrency,
      now: this.o.now,
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
