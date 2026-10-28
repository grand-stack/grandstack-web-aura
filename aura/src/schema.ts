// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse, type GraphQLSchema } from "graphql";
import type { ChangeInput } from "./operations/plan.js";
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

  type Query {
    """The state of the connection to Aura."""
    auraSetup: AuraSetup!
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
    Confirm a planned change: send it to Aura, once, and watch until the instance shows it. Refused if the instance changed since it
    was planned, if another change is under way for it, or if it was already confirmed or cancelled.
    """
    confirmOperation(operationId: ID!): ConfirmedChange!
    """Withdraw a planned change before it is sent. Refused once it has been confirmed."""
    cancelOperation(operationId: ID!): Boolean!
  }
`;

export function buildSchema(service: AuraService): GraphQLSchema {
  return buildSubgraphSchema({
    typeDefs: parse(typeDefs),
    resolvers: {
      Query: { auraSetup: () => service.setup() },
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
        confirmOperation: (_: unknown, args: { operationId: string }) => service.operations.confirm(args.operationId),
        cancelOperation: async (_: unknown, args: { operationId: string }) => {
          await service.operations.cancel(args.operationId);
          return true;
        },
      },
    },
  });
}
