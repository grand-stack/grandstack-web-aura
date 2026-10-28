// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { PlanCreateMutationVariables } from "../graphql/generated/graphql";
import { nameError, sizeKey, sizeOptions, type SizeOption } from "./changes";

/** One combination a tenant is offered, as stored. Every list in the create form is derived from these, so an invalid request cannot be built. */
export interface Offer {
  cloudProvider: string;
  region: string;
  regionName: string;
  type: string;
  memory: string;
  storage: string;
  version: string;
}

export interface Choice {
  tenant: string;
  cloud: string;
  region: string;
  type: string;
  /** sizeKey of the chosen memory and storage pair. */
  size: string;
  name: string;
  vectorOptimized: boolean;
  graphAnalyticsPlugin: boolean;
}

export const EMPTY_CHOICE: Choice = { tenant: "", cloud: "", region: "", type: "", size: "", name: "", vectorOptimized: false, graphAnalyticsPlugin: false };

/** The steps, one decision each. Region and tier share a step: they are two choices of one kind ("where and what"). */
export const STEPS = ["tenant", "cloud", "where", "size", "name"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_TITLE: Record<Step, string> = {
  tenant: "Which tenant?",
  cloud: "Which cloud?",
  where: "Where, and which tier?",
  size: "How big?",
  name: "Name it",
};

/** Names for the tiers, as the aura subgraph names them. The store only knows the tiers an instance already uses, so a tier nobody has yet needs a name here. */
const TIER_LABELS: Record<string, string> = {
  "free-db": "AuraDB Free",
  "professional-db": "AuraDB Professional",
  "business-critical": "AuraDB Business Critical",
  "enterprise-db": "AuraDB Virtual Dedicated Cloud",
  "professional-ds": "AuraDS Professional",
  "enterprise-ds": "AuraDS Enterprise",
};
export const tierName = (type: string): string => TIER_LABELS[type] ?? type;

const TIER_ORDER = ["free-db", "professional-db", "business-critical", "enterprise-db", "professional-ds", "enterprise-ds"];

const unique = <T>(items: T[]): T[] => [...new Set(items)];

export const cloudsOf = (offers: readonly Offer[]): string[] => unique(offers.map((o) => o.cloudProvider)).sort();

export function regionsOf(offers: readonly Offer[], cloud: string): { region: string; regionName: string }[] {
  const byRegion = new Map(offers.filter((o) => o.cloudProvider === cloud).map((o) => [o.region, o.regionName]));
  return [...byRegion].map(([region, regionName]) => ({ region, regionName })).sort((a, b) => a.regionName.localeCompare(b.regionName));
}

export function tiersOf(offers: readonly Offer[], cloud: string, region: string): string[] {
  const types = unique(offers.filter((o) => o.cloudProvider === cloud && o.region === region).map((o) => o.type));
  const rank = (t: string) => (TIER_ORDER.includes(t) ? TIER_ORDER.indexOf(t) : TIER_ORDER.length);
  return types.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function sizesOf(offers: readonly Offer[], cloud: string, region: string, type: string): SizeOption[] {
  return sizeOptions(offers.filter((o) => o.cloudProvider === cloud && o.region === region && o.type === type));
}

/** Changes one choice and clears every choice that depended on it, so the form can never hold a combination that is not offered. */
export function choose(choice: Choice, patch: Partial<Choice>): Choice {
  const next = { ...choice, ...patch };
  if (patch.tenant !== undefined && patch.tenant !== choice.tenant) Object.assign(next, { cloud: "", region: "", type: "", size: "" });
  if (patch.cloud !== undefined && patch.cloud !== choice.cloud) Object.assign(next, { region: "", type: "", size: "" });
  if ((patch.region !== undefined && patch.region !== choice.region) || (patch.type !== undefined && patch.type !== choice.type)) next.size = "";
  return next;
}

/** Whether a step has what it needs, given what was chosen and what is offered. */
export function stepDone(step: Step, c: Choice, offers: readonly Offer[]): boolean {
  switch (step) {
    case "tenant": return c.tenant !== "";
    case "cloud": return c.cloud !== "" && cloudsOf(offers).includes(c.cloud);
    case "where": return c.region !== "" && c.type !== "" && tiersOf(offers, c.cloud, c.region).includes(c.type);
    case "size": return c.size !== "" && sizesOf(offers, c.cloud, c.region, c.type).some((s) => sizeKey(s) === c.size);
    case "name": return nameError(c.name) === undefined;
  }
}

/** The first step that is not done, or undefined when the whole form is ready to review. */
export function firstOpenStep(c: Choice, offers: readonly Offer[]): Step | undefined {
  return STEPS.find((s) => !stepDone(s, c, offers));
}

/** What to send to plan the create, or undefined when something is missing. Memory and storage go together. */
export function createVariables(c: Choice, offers: readonly Offer[]): PlanCreateMutationVariables | undefined {
  if (firstOpenStep(c, offers) !== undefined) return undefined;
  const [memory, storage] = c.size.split("|") as [string, string];
  return {
    input: {
      tenantId: c.tenant,
      cloudProvider: c.cloud,
      region: c.region,
      type: c.type,
      memory,
      storage,
      name: c.name.trim(),
      ...(c.vectorOptimized ? { vectorOptimized: true } : {}),
      ...(c.graphAnalyticsPlugin ? { graphAnalyticsPlugin: true } : {}),
    },
  };
}
