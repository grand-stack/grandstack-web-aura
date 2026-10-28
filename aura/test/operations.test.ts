// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { describe, expect, it } from "vitest";
import { AuraApiError, AuraAuthError, AuraUnreachableError, type InstanceDetail } from "../src/client.js";
import { UserError } from "../src/errors.js";
import { describe as describeChange, sameSnapshot, showsChanges, spaced, type Snapshot } from "../src/operations/diff.js";
import { guardInstance, guardKind, normaliseChanges } from "../src/operations/plan.js";
import { defaultPollDelay, expectation, explainFailure, spokenDuration, toAuraBody } from "../src/operations/run.js";
import { HOLDS_INSTANCE, STEPS, canMove, isFinished, type OperationStatus } from "../src/operations/state.js";
import type { StoredInstance } from "../src/operations/store.js";

const ALL: OperationStatus[] = ["PLANNED", "CONFIRMED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];

describe("the state machine", () => {
  it("allows only the moves of plan, confirm, run, finish", () => {
    const allowed = ALL.flatMap((from) => ALL.filter((to) => canMove(from, to)).map((to) => `${from}>${to}`));
    expect(allowed.sort()).toEqual(["CONFIRMED>FAILED", "CONFIRMED>RUNNING", "PLANNED>CANCELLED", "PLANNED>CONFIRMED", "RUNNING>FAILED", "RUNNING>SUCCEEDED"]);
  });
  it("cannot skip a step: a plan never goes straight to running or done", () => {
    expect(canMove("PLANNED", "RUNNING")).toBe(false);
    expect(canMove("PLANNED", "SUCCEEDED")).toBe(false);
    expect(canMove("CONFIRMED", "SUCCEEDED")).toBe(false);
  });
  it("cannot leave an end state", () => {
    for (const end of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      expect(isFinished(end)).toBe(true);
      for (const to of ALL) expect(canMove(end, to), `${end} to ${to}`).toBe(false);
    }
    expect(isFinished("PLANNED")).toBe(false);
  });
  it("cannot be cancelled once it has been sent", () => {
    expect(canMove("CONFIRMED", "CANCELLED")).toBe(false);
    expect(canMove("RUNNING", "CANCELLED")).toBe(false);
  });
  it("holds the instance only once confirmed, not while merely planned", () => {
    expect(HOLDS_INSTANCE).toEqual(["CONFIRMED", "RUNNING"]);
  });
  it("shows six steps, the sixth being Done", () => {
    expect(STEPS).toHaveLength(6);
    expect(STEPS[0]).toBe("Change confirmed");
    expect(STEPS[5]).toBe("Done");
  });
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ name: "orders-prod", status: "running", memory: "4GB", storage: "8GB", vectorOptimized: false, graphAnalyticsPlugin: false, ...over });

describe("the diff", () => {
  it("lists only what differs, in plain words", () => {
    const plan = describeChange("UPDATE", snap(), { name: "orders-v2", memory: "8GB", storage: "16GB", vectorOptimized: true });
    expect(plan.items).toEqual([
      { field: "name", label: "Name", before: "orders-prod", after: "orders-v2" },
      { field: "memory", label: "Memory", before: "4 GB", after: "8 GB" },
      { field: "storage", label: "Storage", before: "8 GB", after: "16 GB" },
      { field: "vectorOptimized", label: "Vector optimized", before: "Off", after: "On" },
    ]);
  });
  it("leaves out a field that is set to what it already is", () => {
    expect(describeChange("UPDATE", snap(), { name: "orders-prod", memory: "4GB" }).items).toEqual([]);
  });
  it("says a free instance has no storage, and unknown switches are unknown", () => {
    const plan = describeChange("UPDATE", snap({ storage: null, vectorOptimized: null }), { storage: "8GB", vectorOptimized: true });
    expect(plan.items.map((i) => [i.before, i.after])).toEqual([["None", "8 GB"], ["Unknown", "On"]]);
  });
  it("warns about billing for a bigger size only, and says Aura decides for a smaller one", () => {
    expect(describeChange("UPDATE", snap(), { memory: "8GB", storage: "16GB" }).warnings.join()).toContain("may change what you are billed");
    expect(describeChange("UPDATE", snap({ memory: "8GB", storage: "16GB" }), { memory: "4GB", storage: "8GB" }).warnings.join()).toContain("Aura decides whether a smaller size is allowed");
    expect(describeChange("UPDATE", snap(), { name: "x" }).warnings).toEqual([]);
  });
  it("does not claim anything about price or what Aura allows beyond that", () => {
    const all = describeChange("UPDATE", snap(), { memory: "8GB", storage: "16GB" }).warnings.join(" ");
    expect(all).not.toMatch(/\$|£|€|per hour|per month|cost/i);
  });
  it("describes a pause and a resume as a change of state, and warns that a paused instance cannot be used", () => {
    const pause = describeChange("PAUSE", snap(), {});
    expect(pause.items).toEqual([{ field: "state", label: "State", before: "Running", after: "Paused" }]);
    expect(pause.warnings[0]).toContain("cannot be used");
    expect(describeChange("RESUME", snap({ status: "paused" }), {}).items).toEqual([{ field: "state", label: "State", before: "Paused", after: "Running" }]);
  });
  it("spaces sizes", () => {
    expect(spaced("16GB")).toBe("16 GB");
    expect(spaced(null)).toBe("None");
    expect(spaced("weird")).toBe("weird");
  });
  it("knows when an instance already shows the changes", () => {
    expect(showsChanges(snap({ memory: "8GB", storage: "16GB" }), { memory: "8GB", storage: "16GB" })).toBe(true);
    expect(showsChanges(snap(), { memory: "8GB", storage: "16GB" })).toBe(false);
    expect(showsChanges(snap(), {})).toBe(true);
  });
  it("tells whether the fields a plan depends on have changed", () => {
    expect(sameSnapshot(snap(), snap())).toBe(true);
    for (const over of [{ name: "x" }, { status: "paused" }, { memory: "8GB" }, { storage: "16GB" }, { vectorOptimized: true }, { graphAnalyticsPlugin: true }] as Partial<Snapshot>[]) {
      expect(sameSnapshot(snap(), snap(over)), JSON.stringify(over)).toBe(false);
    }
  });
});

const instance = (over: Partial<StoredInstance> = {}): StoredInstance => ({
  ...snap(), auraId: "a1b2c3d4", statusGroup: "READY", region: "europe-west1", cloud: "gcp", tierType: "professional-db", tenantId: "t1", syncedAt: "2026-10-28T10:00:00.000Z", deletedInAuraAt: null, ...over,
});
const SIZES = [{ memory: "4GB", storage: "8GB" }, { memory: "8GB", storage: "16GB" }, { memory: "16GB", storage: "32GB" }];
const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(UserError);
    return (e as UserError).message;
  }
  throw new Error("expected a UserError");
};

describe("guarding an instance", () => {
  it("needs the instance to be in the store", () => {
    expect(message(() => guardInstance(null))).toBe("That instance is not in the store. Sync, then try again.");
  });
  it("refuses one that Aura no longer lists", () => {
    expect(message(() => guardInstance(instance({ deletedInAuraAt: "2026-10-28T09:00:00.000Z" })))).toContain("no longer in Aura");
  });
  it("refuses one Aura is working on, naming what it is doing", () => {
    expect(message(() => guardInstance(instance({ status: "updating", statusGroup: "IN_PROGRESS" })))).toBe("Aura is working on this instance (updating). Wait for it to finish.");
  });
  it("accepts a running one", () => {
    expect(guardInstance(instance()).auraId).toBe("a1b2c3d4");
  });
});

describe("guarding each kind of change", () => {
  it("pauses only a running instance", () => {
    expect(() => guardKind("PAUSE", instance())).not.toThrow();
    expect(message(() => guardKind("PAUSE", instance({ status: "paused", statusGroup: "STOPPED" })))).toBe("Only a running instance can be paused (this one is paused).");
  });
  it("resumes only a paused instance (not a suspended one)", () => {
    expect(() => guardKind("RESUME", instance({ status: "paused", statusGroup: "STOPPED" }))).not.toThrow();
    expect(message(() => guardKind("RESUME", instance()))).toBe("Only a paused instance can be resumed (this one is running).");
    expect(message(() => guardKind("RESUME", instance({ status: "suspended", statusGroup: "STOPPED" })))).toContain("this one is suspended");
  });
  it("edits only a running instance, and says to resume a paused one first", () => {
    expect(() => guardKind("UPDATE", instance())).not.toThrow();
    expect(message(() => guardKind("UPDATE", instance({ status: "paused", statusGroup: "STOPPED" })))).toBe("Resume this instance first. A paused instance cannot be edited.");
    expect(message(() => guardKind("UPDATE", instance({ status: "loading failed", statusGroup: "FAILED" })))).toContain("this one is loading failed");
  });
});

describe("normalising a change", () => {
  const norm = (input: Parameters<typeof normaliseChanges>[1], over: Partial<StoredInstance> = {}) => normaliseChanges(instance(over), input, SIZES);

  it("keeps what differs and drops what does not", () => {
    expect(norm({ name: "orders-v2", memory: "8GB", storage: "16GB", vectorOptimized: false })).toEqual({ name: "orders-v2", memory: "8GB", storage: "16GB" });
  });
  it("trims the name", () => {
    expect(norm({ name: "  orders-v2  " })).toEqual({ name: "orders-v2" });
  });
  it("refuses an empty name, and one longer than 30 characters, but accepts exactly 30", () => {
    expect(message(() => norm({ name: "   " }))).toBe("The name cannot be empty.");
    expect(message(() => norm({ name: "x".repeat(31) }))).toBe("The name can be at most 30 characters.");
    expect(norm({ name: "x".repeat(30) })).toEqual({ name: "x".repeat(30) });
  });
  it("counts characters, not bytes, for the name limit", () => {
    expect(norm({ name: "é".repeat(30) })).toEqual({ name: "é".repeat(30) });
  });
  it("needs memory and storage together", () => {
    expect(message(() => norm({ memory: "8GB" }))).toBe("Memory and storage are chosen together.");
    expect(message(() => norm({ storage: "16GB" }))).toBe("Memory and storage are chosen together.");
  });
  it("accepts only a pair the tenant is offered for this instance", () => {
    expect(message(() => norm({ memory: "8GB", storage: "32GB" }))).toContain("not offered");
    expect(message(() => norm({ memory: "999GB", storage: "999GB" }))).toContain("not offered");
    expect(norm({ memory: "16GB", storage: "32GB" })).toEqual({ memory: "16GB", storage: "32GB" });
  });
  it("refuses memory and storage when no options are known, rather than guessing", () => {
    expect(message(() => normaliseChanges(instance(), { memory: "8GB", storage: "16GB" }, []))).toContain("not offered");
  });
  it("sends both memory and storage when only the storage of the pair differs from now", () => {
    // An instance whose storage is not the usual partner of its memory: choosing the offered pair changes only the storage
    expect(norm({ memory: "4GB", storage: "8GB" }, { storage: "16GB" })).toEqual({ memory: "4GB", storage: "8GB" });
  });
  it("treats a switch whose current value is unknown as a change", () => {
    expect(norm({ vectorOptimized: false }, { vectorOptimized: null })).toEqual({ vectorOptimized: false });
  });
  it("says so when nothing would change", () => {
    expect(message(() => norm({}))).toBe("Nothing would change.");
    expect(message(() => norm({ name: "orders-prod", memory: "4GB", storage: "8GB", vectorOptimized: false, graphAnalyticsPlugin: false }))).toBe("Nothing would change.");
    expect(message(() => norm({ name: null, memory: null, storage: null, vectorOptimized: null }))).toBe("Nothing would change.");
  });
});

describe("what is sent to Aura", () => {
  it("uses Aura's field names and only the fields given", () => {
    expect(toAuraBody({ name: "x", memory: "8GB", storage: "16GB", vectorOptimized: true, graphAnalyticsPlugin: false })).toEqual({
      name: "x", memory: "8GB", storage: "16GB", vector_optimized: true, graph_analytics_plugin: false,
    });
    expect(toAuraBody({ name: "x" })).toEqual({ name: "x" });
    expect(toAuraBody({})).toEqual({});
  });
});

const detail = (over: Partial<InstanceDetail> = {}) => ({ id: "a1b2c3d4", name: "orders-prod", status: "running", memory: "4GB", storage: "8GB", vector_optimized: false, graph_analytics_plugin: false, ...over }) as InstanceDetail;

describe("when a change counts as done", () => {
  it("is not done while Aura still shows the old size, even if it says running (it can lag behind a change it accepted)", () => {
    const e = expectation("UPDATE", { memory: "8GB", storage: "16GB" });
    expect(e.status).toBe("running");
    expect(e.matches(detail())).toBe(false);
    expect(e.matches(detail({ memory: "8GB" }))).toBe(false); // storage still old
    expect(e.matches(detail({ memory: "8GB", storage: "16GB" }))).toBe(true);
  });
  it("checks every field that was asked for, and none that was not", () => {
    const e = expectation("UPDATE", { name: "new", vectorOptimized: true });
    expect(e.matches(detail({ name: "new", vector_optimized: true, memory: "999GB" }))).toBe(true);
    expect(e.matches(detail({ name: "new" }))).toBe(false);
    expect(e.matches(detail({ vector_optimized: true }))).toBe(false);
  });
  it("is done for a pause when Aura says paused, and for a resume when it says running", () => {
    expect(expectation("PAUSE").status).toBe("paused");
    expect(expectation("RESUME").status).toBe("running");
  });
});

describe("explaining a failure", () => {
  const api = (status: number, message?: string) => new AuraApiError(status, message ? [{ message }] : []);
  it.each([
    [api(409), "sending", "Aura is already working on this instance. Wait for it to finish, then plan the change again."],
    [api(404), "waiting", "Aura no longer has this instance."],
    [api(429), "sending", "Aura is limiting requests right now. Try again in a minute."],
    [api(403), "sending", "Aura rejected the stored client id and secret. Replace the credentials, then plan the change again."],
    [new AuraAuthError(), "sending", "Aura rejected the stored client id and secret. Replace the credentials, then plan the change again."],
    [api(400, "memory is invalid"), "sending", "Aura refused the change: memory is invalid"],
  ] as const)("says the right thing for %#", (err, phase, text) => {
    expect(explainFailure(err, phase)).toBe(text);
  });
  it("says it is not known whether the change was made when contact was lost while sending", () => {
    expect(explainFailure(new AuraUnreachableError(), "sending")).toContain("not known whether Aura received it");
    expect(explainFailure(api(500, "boom"), "sending")).toContain("It is not known whether the change was made");
  });
  it("says the change may still finish when contact was lost while waiting", () => {
    expect(explainFailure(new AuraUnreachableError(), "waiting")).toContain("may still finish");
    expect(explainFailure(api(500, "boom"), "waiting")).not.toContain("not known whether");
  });
  it("gives a plain sentence for anything unexpected, without its details", () => {
    expect(explainFailure(new Error("secret=hunter2 at bolt://db"), "sending")).toBe("The change stopped because of an unexpected error.");
  });
});

describe("spokenDuration", () => {
  it("speaks seconds below two minutes and minutes above, never zero", () => {
    expect(spokenDuration(400)).toBe("1 second");
    expect(spokenDuration(45_000)).toBe("45 seconds");
    expect(spokenDuration(119_000)).toBe("119 seconds");
    expect(spokenDuration(120_000)).toBe("2 minutes");
    expect(spokenDuration(30 * 60_000)).toBe("30 minutes");
  });
});

describe("how often Aura is asked", () => {
  it("starts short, grows, and stops growing at 15 seconds", () => {
    const delays = Array.from({ length: 12 }, (_, i) => defaultPollDelay(i));
    expect(delays[0]).toBe(3000);
    for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    expect(delays.at(-1)).toBe(15_000);
    expect(Math.max(...delays)).toBe(15_000);
  });
});
