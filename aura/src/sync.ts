// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { AuraApiError, AuraAuthError, AuraUnreachableError, type AuraClient, type InstanceDetail } from "./client.js";
import { configKey, statusGroup, tierLabel } from "./status.js";
import { StoreClient, StoreError } from "./storeClient.js";

export interface SyncDeps {
  aura: AuraClient;
  store: StoreClient;
  accountId: string;
  /** How many instance detail requests run at once. */
  concurrency?: number;
  now?: () => Date;
}

export type SyncOutcome = "SUCCEEDED" | "SLOWED" | "FAILED";

export interface SyncResult {
  runId: string;
  status: SyncOutcome;
  tenants: number;
  instances: number;
  configurations: number;
  requests: number;
  retries: number;
  /** Instances that were in the list but gone by the time their details were read. */
  vanished: number;
  /** Instances no longer in Aura, now marked deletedInAuraAt. */
  markedDeleted: number;
  error?: string;
}

const iso = (d: Date) => d.toISOString();
const CHUNK = 20;

/** What we say about a failure. Only text that cannot hold a secret. */
export function describeFailure(err: unknown): string {
  if (err instanceof AuraAuthError) return "Aura rejected the stored client id and secret. Replace the credentials.";
  if (err instanceof AuraUnreachableError) return "Could not reach Aura. Try again in a moment.";
  if (err instanceof AuraApiError) return err.message;
  if (err instanceof StoreError) return "The store rejected a change.";
  return "The sync stopped because of an unexpected error.";
}

/** Run `work` over `items`, at most `limit` at a time, keeping the order of results. */
export async function mapPool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

const chunks = <T>(items: T[], size = CHUNK): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Several update mutations in one request, each with its own variables. */
export async function updateMany(store: StoreClient, type: string, plural: string, items: { where: unknown; update: unknown }[]): Promise<void> {
  for (const group of chunks(items)) {
    const declarations = group.map((_, i) => `$w${i}: ${type}Where, $u${i}: ${type}UpdateInput`).join(", ");
    const calls = group.map((_, i) => `m${i}: update${plural}(where: $w${i}, update: $u${i}) { info { nodesCreated } }`).join("\n");
    const variables = Object.fromEntries(group.flatMap((item, i) => [[`w${i}`, item.where], [`u${i}`, item.update]]));
    await store.request(`mutation(${declarations}) { ${calls} }`, variables);
  }
}

async function createMany(store: StoreClient, type: string, plural: string, input: unknown[]): Promise<void> {
  for (const group of chunks(input, 50)) {
    await store.request(`mutation($input: [${type}CreateInput!]!) { create${plural}(input: $input) { info { nodesCreated } } }`, { input: group });
  }
}

/** The properties of an instance as the store keeps them, from what Aura's detail endpoint returned. */
export function instanceProperties(detail: InstanceDetail, syncedAt: string) {
  return {
    name: detail.name,
    status: detail.status,
    statusGroup: statusGroup(detail.status),
    connectionUrl: detail.connection_url ?? null,
    region: detail.region ?? null,
    memory: detail.memory ?? null,
    // Free instances have no storage
    storage: detail.storage ?? null,
    vectorOptimized: detail.vector_optimized ?? null,
    graphAnalyticsPlugin: detail.graph_analytics_plugin ?? null,
    secondariesCount: detail.secondaries_count ?? null,
    cdcEnrichmentMode: detail.cdc_enrichment_mode ?? null,
    metricsIntegrationUrl: detail.metrics_integration_url ?? null,
    graphNodes: detail.graph_nodes ?? null,
    graphRelationships: detail.graph_relationships ?? null,
    customerManagedKeyId: detail.customer_managed_key_id ?? null,
    createdAt: detail.created_at ?? null,
    syncedAt,
  };
}

/** Brings one instance's stored copy up to date from what Aura just reported. Tags and links are left as they are. */
export async function refreshInstance(store: StoreClient, detail: InstanceDetail, syncedAt: string): Promise<void> {
  await updateMany(store, "Instance", "Instances", [
    { where: { auraId: { eq: detail.id } }, update: { ...setAll(instanceProperties(detail, syncedAt)), deletedInAuraAt: { set: null } } },
  ]);
}

const withoutNulls = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const setAll = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { set: v }]));

/**
 * Starts a sync. The run is recorded in the store before this returns, so a caller can hand back its id straight away; the work
 * itself continues in `done`, which never rejects (a failed sync is a FAILED run, not an exception).
 */
export async function startSync(deps: SyncDeps): Promise<{ runId: string; done: Promise<SyncResult> }> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  deps.aura.resetStats();
  const created = await store.request<{ createSyncRuns: { syncRuns: { id: string }[] } }>(
    `mutation($input: [SyncRunCreateInput!]!) { createSyncRuns(input: $input) { syncRuns { id } } }`,
    { input: [{ startedAt: iso(now()), status: "RUNNING" }] },
  );
  const runId = created.createSyncRuns.syncRuns[0]!.id;
  return { runId, done: finish(deps, runId) };
}

async function finish(deps: SyncDeps, runId: string): Promise<SyncResult> {
  const { aura, store } = deps;
  const now = deps.now ?? (() => new Date());
  const result: SyncResult = { runId, status: "SUCCEEDED", tenants: 0, instances: 0, configurations: 0, requests: 0, retries: 0, vanished: 0, markedDeleted: 0 };
  try {
    await sync(deps, result);
    result.status = aura.stats.rateLimited > 0 ? "SLOWED" : "SUCCEEDED";
  } catch (err) {
    result.status = "FAILED";
    result.error = describeFailure(err);
  }
  result.requests = aura.stats.requests;
  result.retries = aura.stats.retries;
  try {
    await store.request(`mutation($w: SyncRunWhere, $u: SyncRunUpdateInput) { updateSyncRuns(where: $w, update: $u) { info { nodesCreated } } }`, {
      w: { id: { eq: runId } },
      u: setAll({
        finishedAt: iso(now()),
        status: result.status,
        tenants: result.tenants,
        instances: result.instances,
        configurations: result.configurations,
        requests: result.requests,
        retries: result.retries,
        error: result.error ?? null,
      }),
    });
    if (result.status !== "FAILED") {
      await store.request(`mutation($w: AuraAccountWhere, $u: AuraAccountUpdateInput) { updateAuraAccounts(where: $w, update: $u) { info { nodesCreated } } }`, {
        w: { id: { eq: deps.accountId } },
        u: setAll({ lastSyncAt: iso(now()) }),
      });
    }
  } catch (err) {
    // The run could not be recorded as finished. Say so once, without detail, and keep the original result.
    console.error(`Could not record the end of sync run ${runId}: ${describeFailure(err)}`);
  }
  return result;
}

async function sync(deps: SyncDeps, result: SyncResult): Promise<void> {
  const { aura, store, accountId } = deps;
  const syncedAt = iso((deps.now ?? (() => new Date()))());

  // 1. Tenants and the options each can create
  const tenants = await aura.listTenants();
  const known = await store.request<{ tenants: { auraId: string; configurations: { key: string }[] }[] }>(`{ tenants { auraId configurations { key } } }`);
  const knownTenants = new Map(known.tenants.map((t) => [t.auraId, new Set(t.configurations.map((c) => c.key))]));

  const newTenants = tenants.filter((t) => !knownTenants.has(t.id));
  await createMany(
    store,
    "Tenant",
    "Tenants",
    newTenants.map((t) => ({ auraId: t.id, name: t.name, syncedAt, account: { connect: [{ where: { node: { id: { eq: accountId } } } }] } })),
  );
  await updateMany(
    store,
    "Tenant",
    "Tenants",
    tenants.filter((t) => knownTenants.has(t.id)).map((t) => ({ where: { auraId: { eq: t.id } }, update: setAll({ name: t.name, syncedAt }) })),
  );
  result.tenants = tenants.length;

  for (const tenant of tenants) {
    const detail = await aura.getTenant(tenant.id);
    const seen = new Map(detail.instance_configurations.map((c) => [configKey(tenant.id, c), c]));
    const have = knownTenants.get(tenant.id) ?? new Set<string>();

    const toCreate = [...seen].filter(([key]) => !have.has(key));
    await createMany(
      store,
      "InstanceConfiguration",
      "InstanceConfigurations",
      toCreate.map(([key, c]) => ({
        key,
        cloudProvider: c.cloud_provider,
        region: c.region,
        regionName: c.region_name,
        type: c.type,
        memory: c.memory,
        storage: c.storage,
        version: c.version,
        syncedAt,
        tenant: { connect: [{ where: { node: { auraId: { eq: tenant.id } } } }] },
      })),
    );
    const stillOffered = [...seen.keys()].filter((key) => have.has(key));
    if (stillOffered.length > 0) {
      await updateMany(store, "InstanceConfiguration", "InstanceConfigurations", chunks(stillOffered, 100).map((keys) => ({ where: { key: { in: keys } }, update: setAll({ syncedAt }) })));
    }
    const stale = [...have].filter((key) => !seen.has(key));
    if (stale.length > 0) {
      await store.request(`mutation($w: InstanceConfigurationWhere) { deleteInstanceConfigurations(where: $w) { nodesDeleted } }`, { w: { key: { in: stale } } });
    }
    await updateMany(store, "Tenant", "Tenants", [{ where: { auraId: { eq: tenant.id } }, update: setAll({ configsSyncedAt: syncedAt }) }]);
    result.configurations += seen.size;
  }

  // 2. Instances. The list is only a summary, so each instance is read on its own for its status and size.
  const summaries = await aura.listInstances();
  const details = (
    await mapPool(summaries, deps.concurrency ?? 3, async (summary) => {
      try {
        return await aura.getInstance(summary.id);
      } catch (err) {
        if (err instanceof AuraApiError && err.status === 404) {
          result.vanished++;
          return undefined;
        }
        throw err;
      }
    })
  ).filter((d): d is InstanceDetail => d !== undefined);
  const tenantOf = new Map(summaries.map((s) => [s.id, s.tenant_id]));

  // Tags the instances hang off
  const tags = await store.request<{ cloudProviders: { name: string }[]; tiers: { type: string }[] }>(`{ cloudProviders { name } tiers { type } }`);
  const haveClouds = new Set(tags.cloudProviders.map((c) => c.name));
  const haveTiers = new Set(tags.tiers.map((t) => t.type));
  const newClouds = [...new Set(details.map((d) => d.cloud_provider))].filter((n) => !haveClouds.has(n));
  const newTiers = [...new Set(details.map((d) => d.type))].filter((t) => !haveTiers.has(t));
  await createMany(store, "CloudProvider", "CloudProviders", newClouds.map((name) => ({ name })));
  await createMany(store, "Tier", "Tiers", newTiers.map((type) => ({ type, label: tierLabel(type) })));

  const stored = await store.request<{ instances: { auraId: string; deletedInAuraAt: string | null; cloud: { name: string }[]; tier: { type: string }[] }[] }>(
    `{ instances { auraId deletedInAuraAt cloud { name } tier { type } } }`,
  );
  const storedById = new Map(stored.instances.map((i) => [i.auraId, i]));

  const toCreate = details.filter((d) => !storedById.has(d.id));
  await createMany(
    store,
    "Instance",
    "Instances",
    toCreate.map((d) => ({
      auraId: d.id,
      ...withoutNulls(instanceProperties(d, syncedAt)),
      tenant: { connect: [{ where: { node: { auraId: { eq: tenantOf.get(d.id) ?? d.tenant_id } } } }] },
      cloud: { connect: [{ where: { node: { name: { eq: d.cloud_provider } } } }] },
      tier: { connect: [{ where: { node: { type: { eq: d.type } } } }] },
    })),
  );

  const existing = details.filter((d) => storedById.has(d.id));
  await updateMany(
    store,
    "Instance",
    "Instances",
    existing.map((d) => ({ where: { auraId: { eq: d.id } }, update: { ...setAll(instanceProperties(d, syncedAt)), deletedInAuraAt: { set: null } } })),
  );

  // A cloud or tier that changed in Aura (for example an upgrade made in the Console) moves the tag. Disconnect the old one and
  // connect the new one as two steps: connecting a tag that is already linked adds a second link, so never connect blindly.
  for (const d of existing) {
    const before = storedById.get(d.id)!;
    const where = { auraId: { eq: d.id } };
    if (before.cloud[0]?.name !== d.cloud_provider) {
      for (const old of before.cloud) await updateMany(store, "Instance", "Instances", [{ where, update: { cloud: [{ disconnect: [{ where: { node: { name: { eq: old.name } } } }] }] } }]);
      await updateMany(store, "Instance", "Instances", [{ where, update: { cloud: [{ connect: [{ where: { node: { name: { eq: d.cloud_provider } } } }] }] } }]);
    }
    if (before.tier[0]?.type !== d.type) {
      for (const old of before.tier) await updateMany(store, "Instance", "Instances", [{ where, update: { tier: [{ disconnect: [{ where: { node: { type: { eq: old.type } } } }] }] } }]);
      await updateMany(store, "Instance", "Instances", [{ where, update: { tier: [{ connect: [{ where: { node: { type: { eq: d.type } } } }] }] } }]);
    }
  }

  // Instances the store has but Aura no longer lists: keep them for history, marked as gone
  const listed = new Set(summaries.map((s) => s.id));
  const gone = stored.instances.filter((i) => !listed.has(i.auraId) && i.deletedInAuraAt === null);
  await updateMany(store, "Instance", "Instances", gone.map((i) => ({ where: { auraId: { eq: i.auraId } }, update: setAll({ deletedInAuraAt: syncedAt }) })));

  result.instances = details.length;
  result.markedDeleted = gone.length;
}
