// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { buildSubgraphSchema } from "@apollo/subgraph";
import { parse, type GraphQLSchema } from "graphql";
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
      },
    },
  });
}
