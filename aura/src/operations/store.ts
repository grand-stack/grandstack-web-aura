// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { StoreClient } from "../storeClient.js";
import type { Changes, Plan, Snapshot } from "./diff.js";
import { statusGroup, tierLabel } from "../status.js";
import type { CreatedInstance } from "../client.js";
import { HOLDS_INSTANCE, canMove, type CreateRequest, type OperationKind, type OperationStatus } from "./state.js";
import type { OfferedConfiguration } from "./plan.js";

/** The stored copy of an instance, with what planning needs to know about where it lives. */
export interface StoredInstance extends Snapshot {
  auraId: string;
  statusGroup: "READY" | "STOPPED" | "IN_PROGRESS" | "FAILED";
  region: string | null;
  cloud: string | null;
  tierType: string | null;
  tenantId: string | null;
  syncedAt: string | null;
  deletedInAuraAt: string | null;
}

export interface StoredStep {
  seq: number;
  label: string;
  status: "PENDING" | "ACTIVE" | "DONE" | "FAILED";
  detail: string | null;
}

export interface StoredOperation {
  id: string;
  kind: string;
  status: OperationStatus;
  desired: { kind: OperationKind; changes?: Changes; create?: CreateRequest };
  before: Snapshot;
  plan: Plan;
  basedOnSyncedAt: string | null;
  targetId: string | null;
  steps: StoredStep[];
}

export async function loadInstance(store: StoreClient, auraId: string): Promise<StoredInstance | null> {
  const data = await store.request<{
    instances: {
      auraId: string; name: string; status: string; statusGroup: StoredInstance["statusGroup"]; memory: string | null; storage: string | null; region: string | null;
      vectorOptimized: boolean | null; graphAnalyticsPlugin: boolean | null; syncedAt: string | null; deletedInAuraAt: string | null;
      cloud: { name: string }[]; tier: { type: string }[]; tenant: { auraId: string }[];
    }[];
  }>(
    `query($id: String!) { instances(where: { auraId: { eq: $id } }) {
       auraId name status statusGroup memory storage region vectorOptimized graphAnalyticsPlugin syncedAt deletedInAuraAt
       cloud { name } tier { type } tenant { auraId } } }`,
    { id: auraId },
  );
  const i = data.instances[0];
  if (!i) return null;
  return {
    auraId: i.auraId, name: i.name, status: i.status, statusGroup: i.statusGroup, memory: i.memory, storage: i.storage, region: i.region,
    vectorOptimized: i.vectorOptimized, graphAnalyticsPlugin: i.graphAnalyticsPlugin, syncedAt: i.syncedAt, deletedInAuraAt: i.deletedInAuraAt,
    cloud: i.cloud[0]?.name ?? null, tierType: i.tier[0]?.type ?? null, tenantId: i.tenant[0]?.auraId ?? null,
  };
}

export const snapshotOf = (i: Snapshot): Snapshot => ({
  name: i.name, status: i.status, memory: i.memory, storage: i.storage, vectorOptimized: i.vectorOptimized, graphAnalyticsPlugin: i.graphAnalyticsPlugin,
});

/** The memory and storage pairs this instance's tenant can create in its cloud, region and tier. They are the only sizes planning accepts. */
export async function loadSizeOptions(store: StoreClient, i: StoredInstance): Promise<{ memory: string; storage: string }[]> {
  if (!i.tenantId || !i.cloud || !i.region || !i.tierType) return [];
  const data = await store.request<{ instanceConfigurations: { memory: string; storage: string }[] }>(
    `query($tenant: String!, $cloud: String!, $region: String!, $type: String!) {
       instanceConfigurations(where: { AND: [
         { tenant: { some: { auraId: { eq: $tenant } } } }, { cloudProvider: { eq: $cloud } }, { region: { eq: $region } }, { type: { eq: $type } }
       ] }) { memory storage } }`,
    { tenant: i.tenantId, cloud: i.cloud, region: i.region, type: i.tierType },
  );
  return data.instanceConfigurations;
}

export async function holdingOperations(store: StoreClient, auraId: string): Promise<{ id: string; status: OperationStatus }[]> {
  const data = await store.request<{ operations: { id: string; status: OperationStatus }[] }>(
    `query($id: String!, $statuses: [OperationStatus!]!) {
       operations(where: { AND: [{ status: { in: $statuses } }, { target: { some: { auraId: { eq: $id } } } }] }) { id status } }`,
    { id: auraId, statuses: HOLDS_INSTANCE },
  );
  return data.operations;
}

export async function createOperation(
  store: StoreClient,
  input: { kind: OperationKind; instance?: StoredInstance; desired: object; before?: Snapshot; plan: Plan; requestedBy: string; at: string },
): Promise<string> {
  const data = await store.request<{ createOperations: { operations: { id: string }[] } }>(
    `mutation($input: [OperationCreateInput!]!) { createOperations(input: $input) { operations { id } } }`,
    {
      input: [{
        kind: input.kind,
        status: "PLANNED",
        desired: JSON.stringify(input.desired),
        before: JSON.stringify(input.before ?? {}),
        diff: JSON.stringify(input.plan),
        basedOnSyncedAt: input.instance?.syncedAt ?? null,
        requestedBy: input.requestedBy,
        createdAt: input.at,
        updatedAt: input.at,
        // A create has no instance yet. It is linked once Aura has made one.
        ...(input.instance ? { target: { connect: [{ where: { node: { auraId: { eq: input.instance.auraId } } } }] } } : {}),
      }],
    },
  );
  return data.createOperations.operations[0]!.id;
}

export async function loadOperation(store: StoreClient, id: string): Promise<StoredOperation | null> {
  const data = await store.request<{
    operations: {
      id: string; kind: string; status: OperationStatus; desired: string | null; before: string | null; diff: string | null; basedOnSyncedAt: string | null;
      target: { auraId: string }[]; steps: { seq: number; label: string; status: StoredStep["status"]; detail: string | null }[];
    }[];
  }>(
    `query($id: ID!) { operations(where: { id: { eq: $id } }) {
       id kind status desired before diff basedOnSyncedAt target { auraId } steps(sort: [{ seq: ASC }]) { seq label status detail } } }`,
    { id },
  );
  const o = data.operations[0];
  if (!o) return null;
  return {
    id: o.id, kind: o.kind, status: o.status,
    desired: JSON.parse(o.desired ?? "{}"), before: JSON.parse(o.before ?? "{}"), plan: JSON.parse(o.diff ?? '{"items":[],"warnings":[]}'),
    basedOnSyncedAt: o.basedOnSyncedAt, targetId: o.target[0]?.auraId ?? null, steps: o.steps,
  };
}

/**
 * Moves an operation from one status to another in a single query, only if it is still in `from`. Returns false if someone else got
 * there first, which is how two confirmations of the same plan are told apart.
 */
export async function moveOperation(store: StoreClient, id: string, from: OperationStatus, to: OperationStatus, extra: Record<string, unknown>, at: string): Promise<boolean> {
  // The state machine is enforced here, so no code path can make a jump it does not allow
  if (!canMove(from, to)) throw new Error(`An operation cannot move from ${from} to ${to}`);
  const data = await store.request<{ updateOperations: { operations: { id: string }[] } }>(
    `mutation($w: OperationWhere, $u: OperationUpdateInput) { updateOperations(where: $w, update: $u) { operations { id } } }`,
    {
      w: { AND: [{ id: { eq: id } }, { status: { eq: from } }] },
      u: { status: { set: to }, updatedAt: { set: at }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { set: v }])) },
    },
  );
  return data.updateOperations.operations.length === 1;
}

export async function addSteps(store: StoreClient, id: string, steps: { seq: number; label: string; status: StoredStep["status"]; at?: string }[]): Promise<void> {
  await store.request(`mutation($w: OperationWhere, $u: OperationUpdateInput) { updateOperations(where: $w, update: $u) { operations { id } } }`, {
    w: { id: { eq: id } },
    u: { steps: [{ create: steps.map((s) => ({ node: { seq: s.seq, label: s.label, status: s.status, at: s.at ?? null } })) }] },
  });
}

export async function setStep(store: StoreClient, id: string, seq: number, status: StoredStep["status"], at: string, detail?: string): Promise<void> {
  await store.request(`mutation($w: OperationStepWhere, $u: OperationStepUpdateInput) { updateOperationSteps(where: $w, update: $u) { operationSteps { seq } } }`, {
    w: { AND: [{ seq: { eq: seq } }, { operation: { some: { id: { eq: id } } } }] },
    u: { status: { set: status }, at: { set: at }, ...(detail === undefined ? {} : { detail: { set: detail } }) },
  });
}

export async function unfinishedOperations(store: StoreClient): Promise<{ id: string }[]> {
  const data = await store.request<{ operations: { id: string }[] }>(`query($statuses: [OperationStatus!]!) { operations(where: { status: { in: $statuses } }) { id } }`, { statuses: HOLDS_INSTANCE });
  return data.operations;
}

/** The tenant's name, or null when the store has no such tenant. */
export async function loadTenantName(store: StoreClient, tenantId: string): Promise<string | null> {
  const data = await store.request<{ tenants: { name: string }[] }>(`query($id: String!) { tenants(where: { auraId: { eq: $id } }) { name } }`, { id: tenantId });
  return data.tenants[0]?.name ?? null;
}

/** Every combination of cloud, region, tier and size the tenant is offered, as stored. */
export async function loadOffered(store: StoreClient, tenantId: string): Promise<OfferedConfiguration[]> {
  const data = await store.request<{ instanceConfigurations: OfferedConfiguration[] }>(
    `query($tenant: String!) { instanceConfigurations(where: { tenant: { some: { auraId: { eq: $tenant } } } }) { cloudProvider region regionName type memory storage version } }`,
    { tenant: tenantId },
  );
  return data.instanceConfigurations;
}

/** Makes sure the cloud and tier tags an instance hangs off exist: a tenant may be offered a cloud none of its instances use yet. */
async function ensureTags(store: StoreClient, cloud: string, type: string): Promise<void> {
  const tags = await store.request<{ cloudProviders: { name: string }[]; tiers: { type: string }[] }>(`{ cloudProviders { name } tiers { type } }`);
  if (!tags.cloudProviders.some((c) => c.name === cloud)) {
    await store.request(`mutation($input: [CloudProviderCreateInput!]!) { createCloudProviders(input: $input) { info { nodesCreated } } }`, { input: [{ name: cloud }] });
  }
  if (!tags.tiers.some((t) => t.type === type)) {
    await store.request(`mutation($input: [TierCreateInput!]!) { createTiers(input: $input) { info { nodesCreated } } }`, { input: [{ type, label: tierLabel(type) }] });
  }
}

/** Records an instance Aura has just accepted, in the "creating" status, with its tenant, cloud and tier, and links the operation to it. */
export async function recordCreatedInstance(store: StoreClient, operationId: string, created: CreatedInstance, r: CreateRequest, at: string): Promise<void> {
  await ensureTags(store, r.cloudProvider, r.type);
  await store.request(`mutation($input: [InstanceCreateInput!]!) { createInstances(input: $input) { info { nodesCreated } } }`, {
    input: [{
      auraId: created.id,
      name: r.name,
      status: "creating",
      statusGroup: statusGroup("creating"),
      connectionUrl: created.connection_url,
      region: r.region,
      memory: r.memory,
      storage: r.storage,
      version: r.version,
      vectorOptimized: r.vectorOptimized,
      graphAnalyticsPlugin: r.graphAnalyticsPlugin,
      createdAt: at,
      syncedAt: at,
      tenant: { connect: [{ where: { node: { auraId: { eq: r.tenantId } } } }] },
      cloud: { connect: [{ where: { node: { name: { eq: r.cloudProvider } } } }] },
      tier: { connect: [{ where: { node: { type: { eq: r.type } } } }] },
    }],
  });
  await store.request(`mutation($w: OperationWhere, $u: OperationUpdateInput) { updateOperations(where: $w, update: $u) { operations { id } } }`, {
    w: { id: { eq: operationId } },
    u: { target: [{ connect: [{ where: { node: { auraId: { eq: created.id } } } }] }] },
  });
}

/** Marks an instance as gone from Aura, once. The record stays so the history does. */
export async function markInstanceDeleted(store: StoreClient, auraId: string, at: string): Promise<void> {
  // A sync may have noticed first; keep its time. (The store's filters cannot test for null, so look first.)
  if ((await loadInstance(store, auraId))?.deletedInAuraAt) return;
  await store.request(`mutation($w: InstanceWhere, $u: InstanceUpdateInput) { updateInstances(where: $w, update: $u) { instances { auraId } } }`, {
    w: { auraId: { eq: auraId } },
    u: { deletedInAuraAt: { set: at } },
  });
}
