// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createHash } from "node:crypto";

export type StatusGroup = "READY" | "STOPPED" | "IN_PROGRESS" | "FAILED";

/** The 13 statuses the Aura API reports, grouped as the interface shows them. */
const GROUPS: Record<string, StatusGroup> = {
  running: "READY",
  paused: "STOPPED",
  suspended: "STOPPED",
  "loading failed": "FAILED",
  creating: "IN_PROGRESS",
  updating: "IN_PROGRESS",
  pausing: "IN_PROGRESS",
  resuming: "IN_PROGRESS",
  suspending: "IN_PROGRESS",
  loading: "IN_PROGRESS",
  restoring: "IN_PROGRESS",
  overwriting: "IN_PROGRESS",
  destroying: "IN_PROGRESS",
};

export const KNOWN_STATUSES = Object.keys(GROUPS);

/** A status the spec does not list is treated as in progress, so Edit, Pause and Delete stay locked until it is understood. */
export function statusGroup(status: string): StatusGroup {
  return GROUPS[status] ?? "IN_PROGRESS";
}

const TIER_LABELS: Record<string, string> = {
  "free-db": "AuraDB Free",
  "professional-db": "AuraDB Professional",
  "business-critical": "AuraDB Business Critical",
  "enterprise-db": "AuraDB Virtual Dedicated Cloud",
  "professional-ds": "AuraDS Professional",
  "enterprise-ds": "AuraDS Enterprise",
};

export const TIER_TYPES = Object.keys(TIER_LABELS);

export function tierLabel(type: string): string {
  return TIER_LABELS[type] ?? type;
}

export interface ConfigurationFields {
  cloud_provider: string;
  region: string;
  type: string;
  memory: string;
  storage: string;
  version: string;
}

/** A stable id for one offered combination within a tenant, so a sync can upsert it and remove it when Aura stops offering it. */
export function configKey(tenantId: string, c: ConfigurationFields): string {
  return createHash("sha256")
    .update([tenantId, c.cloud_provider, c.region, c.type, c.memory, c.storage, c.version].join("\u001f"))
    .digest("hex")
    .slice(0, 32);
}

/** For example a1b2c3d4e5f6a7b8 becomes a1b2....a7b8. Short ids are hidden completely. */
export function maskClientId(clientId: string): string {
  return clientId.length >= 12 ? `${clientId.slice(0, 4)}....${clientId.slice(-4)}` : "....";
}
