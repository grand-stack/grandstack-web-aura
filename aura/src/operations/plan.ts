// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { UserError } from "../errors.js";
import { describe, type Changes, type Plan } from "./diff.js";
import type { CreateRequest, PlannableKind } from "./state.js";
import { type StoredInstance } from "./store.js";

const MAX_NAME = 30;

export interface ChangeInput {
  name?: string | null;
  memory?: string | null;
  storage?: string | null;
  vectorOptimized?: boolean | null;
  graphAnalyticsPlugin?: boolean | null;
}

/** Guards that hold for any change: it needs an instance that is in the store, still in Aura, and not already being worked on. */
export function guardInstance(instance: StoredInstance | null): StoredInstance {
  if (!instance) throw new UserError("That instance is not in the store. Sync, then try again.");
  if (instance.deletedInAuraAt !== null) throw new UserError("This instance is no longer in Aura, so it cannot be changed.");
  if (instance.statusGroup === "IN_PROGRESS") throw new UserError(`Aura is working on this instance (${instance.status}). Wait for it to finish.`);
  return instance;
}

/** The state each kind of change needs the instance to be in, as Aura names it. */
export function guardKind(kind: PlannableKind, instance: StoredInstance): void {
  if (kind === "PAUSE" && instance.status !== "running") throw new UserError(`Only a running instance can be paused (this one is ${instance.status}).`);
  if (kind === "RESUME" && instance.status !== "paused") throw new UserError(`Only a paused instance can be resumed (this one is ${instance.status}).`);
  if (kind === "UPDATE" && instance.status !== "running") {
    throw new UserError(instance.status === "paused" ? "Resume this instance first. A paused instance cannot be edited." : `Only a running instance can be edited (this one is ${instance.status}).`);
  }
}

/**
 * Turns what the person asked for into the changes to send: names trimmed and checked, memory and storage as a pair that the tenant
 * is offered, only what really differs. Throws a UserError that says what to fix. Nothing here talks to Aura.
 */
export function normaliseChanges(instance: StoredInstance, input: ChangeInput, sizes: { memory: string; storage: string }[]): Changes {
  const changes: Changes = {};

  if (input.name !== undefined && input.name !== null) {
    const name = input.name.trim();
    if (name.length === 0) throw new UserError("The name cannot be empty.");
    if (name.length > MAX_NAME) throw new UserError(`The name can be at most ${MAX_NAME} characters.`);
    changes.name = name;
  }

  const hasMemory = input.memory !== undefined && input.memory !== null;
  const hasStorage = input.storage !== undefined && input.storage !== null;
  if (hasMemory !== hasStorage) throw new UserError("Memory and storage are chosen together.");
  if (hasMemory && hasStorage) {
    if (!sizes.some((s) => s.memory === input.memory && s.storage === input.storage)) {
      throw new UserError("That memory and storage is not offered for this instance's cloud, region and tier.");
    }
    changes.memory = input.memory!;
    changes.storage = input.storage!;
  }

  if (typeof input.vectorOptimized === "boolean") changes.vectorOptimized = input.vectorOptimized;
  if (typeof input.graphAnalyticsPlugin === "boolean") changes.graphAnalyticsPlugin = input.graphAnalyticsPlugin;

  // Keep only what differs from now, so an untouched field is never sent
  const differing: Changes = {};
  if (changes.name !== undefined && changes.name !== instance.name) differing.name = changes.name;
  if (changes.memory !== undefined && (changes.memory !== instance.memory || changes.storage !== instance.storage)) {
    differing.memory = changes.memory;
    differing.storage = changes.storage;
  }
  if (changes.vectorOptimized !== undefined && changes.vectorOptimized !== instance.vectorOptimized) differing.vectorOptimized = changes.vectorOptimized;
  if (changes.graphAnalyticsPlugin !== undefined && changes.graphAnalyticsPlugin !== instance.graphAnalyticsPlugin) differing.graphAnalyticsPlugin = changes.graphAnalyticsPlugin;
  if (Object.keys(differing).length === 0) throw new UserError("Nothing would change.");
  return differing;
}

export function buildPlan(kind: PlannableKind, instance: StoredInstance, changes: Changes): Plan {
  return describe(kind, instance, changes);
}

/** Deleting is allowed for any instance Aura is not already working on, running, paused or failed. */
export function guardDelete(instance: StoredInstance): void {
  if (instance.deletedInAuraAt !== null) throw new UserError("This instance is no longer in Aura.");
}

export interface CreateInput {
  tenantId: string;
  cloudProvider: string;
  region: string;
  type: string;
  memory: string;
  storage?: string | null;
  name: string;
  vectorOptimized?: boolean | null;
  graphAnalyticsPlugin?: boolean | null;
}

/** One option the tenant is offered, as stored. */
export interface OfferedConfiguration {
  cloudProvider: string;
  region: string;
  regionName: string;
  type: string;
  memory: string;
  storage: string;
  version: string;
}

/**
 * Checks a create against what the tenant is offered, and fills in what the person did not choose (the storage that goes with the
 * memory, the version, the region's name). Anything that is not an offered combination is refused, so a request Aura would reject
 * is never built. Throws a UserError that says what to fix.
 */
export function normaliseCreate(input: CreateInput, tenantName: string, offered: OfferedConfiguration[]): CreateRequest {
  const name = input.name.trim();
  if (name.length === 0) throw new UserError("The name cannot be empty.");
  if (name.length > MAX_NAME) throw new UserError(`The name can be at most ${MAX_NAME} characters.`);

  const match = offered.find(
    (c) =>
      c.cloudProvider === input.cloudProvider && c.region === input.region && c.type === input.type && c.memory === input.memory &&
      (input.storage === undefined || input.storage === null || c.storage === input.storage),
  );
  if (!match) throw new UserError("That combination of cloud, region, tier and size is not offered for this tenant.");
  return {
    tenantId: input.tenantId,
    tenantName,
    cloudProvider: match.cloudProvider,
    region: match.region,
    regionName: match.regionName,
    type: match.type,
    version: match.version,
    memory: match.memory,
    storage: match.storage,
    name,
    vectorOptimized: input.vectorOptimized === true,
    graphAnalyticsPlugin: input.graphAnalyticsPlugin === true,
  };
}
