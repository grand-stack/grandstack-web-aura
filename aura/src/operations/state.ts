// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]

/** Where an operation is in plan, review, confirm, progress. The same values as the store's OperationStatus. */
export type OperationStatus = "PLANNED" | "CONFIRMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

/** The changes to an existing instance that are not creating or deleting it. */
export type PlannableKind = "UPDATE" | "PAUSE" | "RESUME";

/** Everything an operation can do. The same values as the store's OperationKind. */
export type OperationKind = PlannableKind | "CREATE" | "DELETE";

/** What a create asks Aura for, once checked against the options the tenant is offered. */
export interface CreateRequest {
  tenantId: string;
  tenantName: string;
  cloudProvider: string;
  region: string;
  regionName: string;
  type: string;
  version: string;
  memory: string;
  storage: string;
  name: string;
  vectorOptimized: boolean;
  graphAnalyticsPlugin: boolean;
}

const MOVES: Record<OperationStatus, OperationStatus[]> = {
  PLANNED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["RUNNING", "FAILED"],
  RUNNING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canMove(from: OperationStatus, to: OperationStatus): boolean {
  return MOVES[from].includes(to);
}

export const isFinished = (status: OperationStatus): boolean => MOVES[status].length === 0;

/** An operation that holds its instance: nothing else may be confirmed for it until it ends. Planned ones hold nothing. */
export const HOLDS_INSTANCE: OperationStatus[] = ["CONFIRMED", "RUNNING"];

/** The six steps every operation shows, in order. Step 1 is done when it is confirmed. */
export const STEPS = [
  "Change confirmed",
  "Request sent to Aura",
  "Accepted by Aura",
  "Waiting for Aura to finish",
  "Updating the stored copy",
  "Done",
] as const;
