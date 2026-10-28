// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import type { InstanceDetail } from "../src/client.js";
import { instanceProperties } from "../src/sync.js";

// Real Aura answers differ from its OpenAPI file in places. These are shapes seen from the real API.
const detail = (over: Record<string, unknown>) => ({ id: "6dc59936", name: "Instance01", status: "running", type: "free-db", cloud_provider: "gcp", region: "europe-west1", memory: "1GB", tenant_id: "t", ...over }) as unknown as InstanceDetail;

describe("instanceProperties with what real Aura sends", () => {
  it("keeps graph_nodes and graph_relationships as text when they arrive as numbers (the spec says strings)", () => {
    const p = instanceProperties(detail({ graph_nodes: 0, graph_relationships: 1234 }), "2026-10-28T10:00:00.000Z");
    expect(p.graphNodes).toBe("0");
    expect(p.graphRelationships).toBe("1234");
  });
  it("keeps them as they are when they are strings, and null when absent", () => {
    expect(instanceProperties(detail({ graph_nodes: "1.2K" }), "x").graphNodes).toBe("1.2K");
    expect(instanceProperties(detail({}), "x")).toMatchObject({ graphNodes: null, graphRelationships: null });
  });
  it("copes with a free instance: no storage, no version, no secondaries", () => {
    expect(instanceProperties(detail({}), "x")).toMatchObject({ storage: null, memory: "1GB", vectorOptimized: null, secondariesCount: null });
  });
});
