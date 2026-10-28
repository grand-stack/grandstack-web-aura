// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse, type GraphQLSchema } from "graphql";
import type { ChangeInput, CreateInput } from "./operations/plan.js";
import type { AuraService } from "./service.js";

// The aura subgraph's own schema. Instances, tenants and the rest come from the store subgraph; this one adds setup and sync.
export const typeDefs = /* GraphQL */ `
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

  """Where the connection to Aura stands. Safe to show: it holds no secret."""
  type AuraSetup {
    """True until credentials are stored. The interface then shows only the connect form."""
    required: Boolean!
    """Whether credentials are stored."""
    connected: Boolean!
    """The client id with its middle hidden, for example a1b2....a7b8."""
    clientIdHint: String
    """When the last successful sync finished (ISO 8601, UTC)."""
    lastSyncAt: String
    """Whether a sync is running now."""
    syncing: Boolean!
    """The most recent sync run, started by anyone."""
    lastSyncRunId: ID
    """How the most recent sync run went: RUNNING, SUCCEEDED, SLOWED or FAILED."""
    lastSyncStatus: String
    """Why the most recent sync failed, in plain words."""
    lastSyncError: String
  }

  """The result of connecting an Aura account."""
  type ConnectResult {
    """True. A failure is an error, not a false here."""
    connected: Boolean!
    """The first sync, already started. Follow it through the sync run in the store."""
    syncRunId: ID!
  }

  """The result of asking for a sync."""
  type SyncStart {
    """False when a sync was already running, in which case syncRunId is that one."""
    started: Boolean!
    """The sync run to follow."""
    syncRunId: ID!
  }

  """What to change on an instance. Send only what you want changed. Memory and storage go together, as one of the pairs the tenant is offered."""
  input InstanceChange {
    """A new name, 1 to 30 characters."""
    name: String
    """A new memory, for example 16GB. Needs storage too."""
    memory: String
    """The storage that goes with the memory, for example 32GB."""
    storage: String
    """Turn vector optimization on or off."""
    vectorOptimized: Boolean
    """Turn the Graph Analytics plugin on or off."""
    graphAnalyticsPlugin: Boolean
  }

  """A change that has been planned and is waiting for review. Nothing has been sent to Aura."""
  type PlannedChange {
    """The operation to review in the store, and then confirm or cancel."""
    operationId: ID!
  }

  """A change that has been confirmed. It is now being carried out; follow it through the operation in the store."""
  type ConfirmedChange {
    """The operation."""
    operationId: ID!
    """Its status right after confirming, which is CONFIRMED."""
    status: String!
  }

  """What to create. Every choice must be a combination the tenant is offered, which the store holds."""
  input InstanceCreate {
    """The tenant (Aura project) to create it in."""
    tenantId: String!
    """gcp, aws or azure."""
    cloudProvider: String!
    """The region id, for example europe-west1."""
    region: String!
    """The Aura tier, for example professional-db."""
    type: String!
    """The memory, for example 8GB."""
    memory: String!
    """The storage that goes with the memory. Filled in from the offered combination if left out."""
    storage: String
    """A name, 1 to 30 characters."""
    name: String!
    """Turn vector optimization on."""
    vectorOptimized: Boolean
    """Turn the Graph Analytics plugin on."""
    graphAnalyticsPlugin: Boolean
  }

  """A stored password, shown once. This is the only place a password is ever returned."""
  type RevealedPassword {
    """The username that goes with it."""
    username: String!
    """The password. Do not log it or keep it."""
    password: String!
  }

  """One thing that differs between the stored copy of an instance and Aura."""
  type InstanceDifference {
    """The field, for example memory."""
    field: String!
    """What to call it."""
    label: String!
    """What the stored copy says."""
    stored: String!
    """What Aura says now."""
    live: String!
  }

  """The result of comparing an instance with Aura. Nothing is changed."""
  type InstanceCheck {
    """When Aura was asked (ISO 8601, UTC)."""
    checkedAt: String!
    """False when Aura no longer has the instance."""
    inAura: Boolean!
    """What differs. Empty when the stored copy is right."""
    differences: [InstanceDifference!]!
  }

  type Query {
    """The state of the connection to Aura."""
    auraSetup: AuraSetup!
    """Compare one instance with what Aura says now, without changing the stored copy."""
    checkInstance(instanceId: String!): InstanceCheck!
  }

  type Mutation {
    """
    Connect (or replace) the Aura account. The client id and secret are checked with Aura first, and nothing is stored if Aura
    refuses them. The secret is stored encrypted and is never returned. Starts a first sync.
    """
    connectAura(clientId: String!, clientSecret: String!): ConnectResult!
    """Read Aura again now. Does nothing new if a sync is already running."""
    syncNow: SyncStart!
    """
    Delete the stored client secret and stop syncing. Instances, stored passwords and history are kept, and nothing changes in
    Aura. Connect again to resume.
    """
    disconnectAura: Boolean!
    """
    Plan a rename, resize or switch change on a running instance. This only records the plan, with what would change, for review.
    Nothing is sent to Aura until confirmOperation.
    """
    planUpdate(instanceId: String!, changes: InstanceChange!): PlannedChange!
    """Plan pausing a running instance. Nothing is sent to Aura until confirmOperation."""
    planPause(instanceId: String!): PlannedChange!
    """Plan resuming a paused instance. Nothing is sent to Aura until confirmOperation."""
    planResume(instanceId: String!): PlannedChange!
    """
    Plan creating an instance. The choices are checked against what the tenant is offered. Nothing is sent to Aura until
    confirmOperation.
    """
    planCreate(input: InstanceCreate!): PlannedChange!
    """Plan deleting an instance. Nothing is sent to Aura until confirmOperation, which for a delete needs the name typed exactly."""
    planDelete(instanceId: String!): PlannedChange!
    """
    Confirm a planned change: send it to Aura, once, and watch until the instance shows it. Refused if the instance changed since it
    was planned, if another change is under way for it, or if it was already confirmed or cancelled. A delete also needs typedName
    to be the instance's name, exactly.
    """
    confirmOperation(operationId: ID!, typedName: String): ConfirmedChange!
    """
    Show the stored password of an instance, once per call, and record that it was shown. Refused when no password is stored, as
    for an instance found by a sync.
    """
    revealInstancePassword(instanceId: String!): RevealedPassword!
    """Withdraw a planned change before it is sent. Refused once it has been confirmed."""
    cancelOperation(operationId: ID!): Boolean!
  }
`;

export function buildSchema(service: AuraService): GraphQLSchema {
  return buildSubgraphSchema({
    typeDefs: parse(typeDefs),
    resolvers: {
      Query: {
        auraSetup: () => service.setup(),
        checkInstance: (_: unknown, args: { instanceId: string }) => service.checkInstance(args.instanceId),
      },
      Mutation: {
        connectAura: (_: unknown, args: { clientId: string; clientSecret: string }) => service.connect(args.clientId, args.clientSecret),
        syncNow: async () => {
          const { started, runId } = await service.syncNow();
          return { started, syncRunId: runId };
        },
        disconnectAura: async () => {
          await service.disconnect();
          return true;
        },
        planUpdate: (_: unknown, args: { instanceId: string; changes: ChangeInput }) => service.operations.plan("UPDATE", args.instanceId, args.changes),
        planPause: (_: unknown, args: { instanceId: string }) => service.operations.plan("PAUSE", args.instanceId),
        planResume: (_: unknown, args: { instanceId: string }) => service.operations.plan("RESUME", args.instanceId),
        planCreate: (_: unknown, args: { input: CreateInput }) => service.operations.planCreate(args.input),
        planDelete: (_: unknown, args: { instanceId: string }) => service.operations.planDelete(args.instanceId),
        confirmOperation: (_: unknown, args: { operationId: string; typedName?: string | null }) => service.operations.confirm(args.operationId, args.typedName),
        revealInstancePassword: (_: unknown, args: { instanceId: string }) => service.revealPassword(args.instanceId),
        cancelOperation: async (_: unknown, args: { operationId: string }) => {
          await service.operations.cancel(args.operationId);
          return true;
        },
      },
    },
  });
}
