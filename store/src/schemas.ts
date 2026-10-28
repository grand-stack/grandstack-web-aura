// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { Neo4jGraphQL } from "@neo4j/graphql";
import { Kind, parse, type GraphQLSchema } from "graphql";
import type { Driver } from "neo4j-driver";

/** Names of the types that become Neo4j nodes (those marked @node). */
export function nodeTypeNames(typeDefs: string): string[] {
  return parse(typeDefs)
    .definitions.filter((d) => d.kind === Kind.OBJECT_TYPE_DEFINITION && (d.directives ?? []).some((x) => x.name.value === "node"))
    .map((d) => (d as { name: { value: string } }).name.value);
}

/**
 * The public schema: a federation subgraph that can only be read. Every node type gets `@mutation(operations: [])`, so the
 * generated create, update and delete mutations are never produced. Changes reach the store through the internal schema only.
 */
export function publicTypeDefs(typeDefs: string): string {
  const extensions = nodeTypeNames(typeDefs).map((name) => `extend type ${name} @mutation(operations: [])`);
  return `${typeDefs}\n${extensions.join("\n")}\n`;
}

export async function buildPublicSchema(typeDefs: string, driver?: Driver): Promise<GraphQLSchema> {
  return new Neo4jGraphQL({ typeDefs: publicTypeDefs(typeDefs), driver }).getSubgraphSchema();
}

/** The internal schema: the same types with full create, read, update and delete. Only the aura subgraph may call it. */
export async function buildInternalSchema(typeDefs: string, driver?: Driver): Promise<GraphQLSchema> {
  return new Neo4jGraphQL({ typeDefs, driver }).getSubgraphSchema();
}
