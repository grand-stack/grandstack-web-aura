// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { seedInstances, seedTenants, type Instance, type Tenant } from "./data.js";

export interface MockAuraOptions {
  /** How long each asynchronous step takes (create, resize, pause, resume, delete). Default 3000 ms. */
  stepMs?: number;
  clientId?: string;
  clientSecret?: string;
  /** Access token lifetime. Default 3600000 ms (the real API's lifetime is not in the spec). */
  tokenTtlMs?: number;
  /** Requests allowed per token per minute before answering 429. Default: no limit. */
  rateLimitPerMinute?: number;
  /** Creating instances is refused (405) once this many exist. Default: no limit. */
  maxInstances?: number;
}

/**
 * Ways to make the fake misbehave on purpose, so a client's failure handling can be tested. Never set by the real API's behaviour.
 * They can be set in a test through `state.faults`, or over HTTP with POST /__faults (and cleared with DELETE /__faults).
 */
export interface Faults {
  /** Answer the next change (POST, PATCH or DELETE on an instance) with this error instead of doing it. Used once. */
  rejectNext?: { status: number; message: string; reason: string };
  /** Finish every asynchronous change in this status instead of the usual one, for example "loading failed". */
  endAs?: string;
  /** Never finish: an instance that starts a change stays in the transitional status. */
  stall?: boolean;
  /** Answer the next change by cutting the connection after doing it, so the caller cannot tell whether it worked. Used once. */
  dropNext?: boolean;
}

export interface MockAura {
  server: Server;
  /** The live state, for tests that need to look or arrange. */
  state: { tenants: Tenant[]; instances: Map<string, Instance>; passwords: Map<string, string>; faults: Faults };
  /** Put the seed data back and forget all tokens and pending changes. For tests that share one mock. */
  reset(): void;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

const TRANSITIONAL = new Set(["creating", "destroying", "pausing", "resuming", "suspending", "loading", "restoring", "updating", "overwriting"]);
const INSTANCE_TYPES = new Set(["free-db", "professional-db", "professional-ds", "business-critical", "enterprise-db", "enterprise-ds"]);

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(`HTTP ${status}`);
  }
}

const apiError = (status: number, message: string, reason: string, field?: string, headers?: Record<string, string>) =>
  new HttpError(status, { errors: [{ message, reason, ...(field ? { field } : {}) }] }, headers);
const middlewareError = (status: number, message: string, headers?: Record<string, string>) => new HttpError(status, { error: message }, headers);

export function createMockAura(options: MockAuraOptions = {}): MockAura {
  const stepMs = options.stepMs ?? 3000;
  const clientId = options.clientId ?? "mock-client";
  const clientSecret = options.clientSecret ?? "mock-secret";
  const tokenTtlMs = options.tokenTtlMs ?? 3_600_000;

  const state: MockAura["state"] = {
    tenants: seedTenants(),
    instances: new Map(seedInstances().map((i) => [i.id, i])),
    passwords: new Map(),
    faults: {},
  };
  const tokens = new Map<string, number>(); // token -> expiry (ms since epoch)
  const requestLog = new Map<string, number[]>(); // token -> request times
  const timers = new Set<NodeJS.Timeout>();

  const later = (fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, stepMs);
    t.unref();
    timers.add(t);
  };

  const transition = (inst: Instance, during: string, after: string | null) => {
    inst.status = during;
    later(() => {
      if (state.faults.stall) return;
      if (after === null) state.instances.delete(inst.id);
      else inst.status = state.faults.endAs ?? after;
    });
  };

  const view = (i: Instance) => ({
    id: i.id,
    name: i.name,
    status: i.status,
    connection_url: i.connection_url,
    created_at: i.created_at,
    region: i.region,
    type: i.type,
    cloud_provider: i.cloud_provider,
    tenant_id: i.tenant_id,
    memory: i.memory,
    storage: i.storage,
    vector_optimized: i.vector_optimized,
    graph_analytics_plugin: i.graph_analytics_plugin,
  });

  const findInstance = (id: string): Instance => {
    const inst = state.instances.get(id);
    if (!inst) throw apiError(404, `DB not found: ${id}`, "db-not-found");
    return inst;
  };
  const findTenant = (id: string): Tenant => {
    const t = state.tenants.find((x) => x.id === id);
    if (!t) throw apiError(404, "The tenant you specified could not be found", "tenant-not-found");
    return t;
  };
  const conflictIfBusy = (inst: Instance) => {
    if (TRANSITIONAL.has(inst.status)) throw apiError(409, `The database is current undergoing an operation: ${inst.status}`, "ongoing-database-operation");
  };

  const readBody = async (req: IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  };

  const requireJson = (req: IncomingMessage) => {
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) throw middlewareError(415, "Unsupported Media Type");
  };
  const parseJson = (raw: string): Record<string, unknown> => {
    if (raw.trim() === "") return {};
    try {
      const v = JSON.parse(raw);
      if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
      return v as Record<string, unknown>;
    } catch {
      throw apiError(400, "The request body is not valid JSON", "invalid-json");
    }
  };

  const authenticate = (req: IncomingMessage): string => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) throw middlewareError(401, "Unauthorized");
    const token = match[1]!;
    const expiry = tokens.get(token);
    if (expiry === undefined) throw middlewareError(401, "Unauthorized");
    if (expiry < Date.now()) throw middlewareError(403, "The access token has expired");
    if (options.rateLimitPerMinute !== undefined) {
      const now = Date.now();
      const recent = (requestLog.get(token) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= options.rateLimitPerMinute) {
        const retryAfter = Math.max(1, Math.ceil((60_000 - (now - recent[0]!)) / 1000));
        throw middlewareError(429, "Rate limit exceeded", { "Retry-After": String(retryAfter) });
      }
      recent.push(now);
      requestLog.set(token, recent);
    }
    return token;
  };

  const handleToken = async (req: IncomingMessage) => {
    const match = /^Basic (.+)$/.exec(req.headers.authorization ?? "");
    const [id, secret] = match ? Buffer.from(match[1]!, "base64").toString("utf8").split(":") : [];
    const body = new URLSearchParams(await readBody(req));
    if (body.get("grant_type") !== "client_credentials") throw new HttpError(400, { error: "unsupported_grant_type" });
    if (id !== clientId || secret !== clientSecret) throw new HttpError(401, { error: "invalid_client" });
    const token = randomBytes(24).toString("hex");
    tokens.set(token, Date.now() + tokenTtlMs);
    return { status: 200, body: { access_token: token, token_type: "bearer", expires_in: Math.floor(tokenTtlMs / 1000) } };
  };

  const validateCreate = (b: Record<string, unknown>) => {
    for (const f of ["version", "region", "memory", "name", "type", "tenant_id", "cloud_provider"]) {
      if (typeof b[f] !== "string" || b[f] === "") throw apiError(400, `${f} is required`, "invalid-request", f);
    }
    const name = b.name as string;
    if (name.length > 30) throw apiError(400, "name must be 30 characters or fewer", "invalid-request", "name");
    if (name !== name.trim()) throw apiError(400, "name must not have leading or trailing whitespace", "invalid-request", "name");
    if (!INSTANCE_TYPES.has(b.type as string)) throw apiError(400, `Unknown instance type ${String(b.type)}`, "invalid-request", "type");
    const tenant = findTenant(b.tenant_id as string);
    const config = tenant.instance_configurations.find(
      (c) =>
        c.cloud_provider === b.cloud_provider &&
        c.region === b.region &&
        c.type === b.type &&
        c.memory === b.memory &&
        c.version === b.version &&
        (b.storage === undefined || c.storage === b.storage),
    );
    if (!config) throw apiError(400, "That combination is not available for this project", "invalid-configuration");
    return config;
  };

  const route = async (req: IncomingMessage, url: URL): Promise<{ status: number; body: unknown; headers?: Record<string, string>; drop?: boolean }> => {
    const method = req.method ?? "GET";
    const path = url.pathname;

    if (method === "POST" && path === "/oauth/token") return handleToken(req);

    // Test controls, not part of the Aura API. They only exist in this fake.
    if (path === "/__faults") {
      if (method === "DELETE") state.faults = {};
      else if (method === "POST") state.faults = parseJson(await readBody(req)) as Faults;
      else throw middlewareError(404, "Not found");
      return { status: 200, body: { faults: state.faults } };
    }

    if (!path.startsWith("/v1/")) throw middlewareError(404, "Not found");
    authenticate(req);
    const parts = path.slice("/v1/".length).split("/").filter(Boolean);
    const [resource, id, action] = parts;

    // A change can be refused outright, or done but with the answer lost (the connection is cut)
    const isChange = resource === "instances" && (method === "POST" || method === "PATCH" || method === "DELETE") && id !== undefined && id !== "sizing";
    if (isChange && state.faults.rejectNext) {
      const { status, message, reason } = state.faults.rejectNext;
      state.faults.rejectNext = undefined;
      throw apiError(status, message, reason);
    }
    const dropAfter = isChange && state.faults.dropNext === true;
    if (dropAfter) state.faults.dropNext = undefined;
    const done = async () => {
      const reply = await handle();
      return dropAfter ? { ...reply, drop: true } : reply;
    };
    return done();

    async function handle(): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
    if (resource === "tenants") {
      if (method === "GET" && !id) return { status: 200, body: { data: state.tenants.map((t) => ({ id: t.id, name: t.name })) } };
      if (method === "GET" && id && !action) {
        const t = findTenant(id);
        return { status: 200, body: { data: { id: t.id, name: t.name, instance_configurations: t.instance_configurations } } };
      }
    }

    if (resource === "instances") {
      if (method === "GET" && !id) {
        const tenantId = url.searchParams.get("tenantId");
        const data = [...state.instances.values()]
          .filter((i) => !tenantId || i.tenant_id === tenantId)
          .map((i) => ({ id: i.id, name: i.name, tenant_id: i.tenant_id, cloud_provider: i.cloud_provider, created_at: i.created_at }));
        return { status: 200, body: { data } };
      }

      if (method === "POST" && !id) {
        requireJson(req);
        const b = parseJson(await readBody(req));
        const config = validateCreate(b);
        if (options.maxInstances !== undefined && state.instances.size >= options.maxInstances) {
          throw apiError(405, "You have reached the maximum number of instances", "instance-limit-reached");
        }
        const newId = randomBytes(4).toString("hex");
        const password = randomBytes(12).toString("base64url");
        const inst: Instance = {
          id: newId,
          name: b.name as string,
          status: "creating",
          tenant_id: b.tenant_id as string,
          cloud_provider: config.cloud_provider,
          region: config.region,
          type: config.type,
          memory: config.memory,
          storage: config.storage,
          version: config.version,
          connection_url: `neo4j+s://${newId}.databases.neo4j.io`,
          username: "neo4j",
          created_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
          vector_optimized: b.vector_optimized === true,
          graph_analytics_plugin: b.graph_analytics_plugin === true,
        };
        state.instances.set(newId, inst);
        state.passwords.set(newId, password);
        transition(inst, "creating", "running");
        return {
          status: 202,
          body: {
            data: {
              id: inst.id,
              connection_url: inst.connection_url,
              username: inst.username,
              password,
              tenant_id: inst.tenant_id,
              cloud_provider: inst.cloud_provider,
              region: inst.region,
              name: inst.name,
              type: inst.type,
              created_at: inst.created_at,
              vector_optimized: inst.vector_optimized,
              graph_analytics_plugin: inst.graph_analytics_plugin,
            },
          },
        };
      }

      if (id && !action) {
        if (method === "GET") return { status: 200, body: { data: view(findInstance(id)) } };

        if (method === "DELETE") {
          const inst = findInstance(id);
          conflictIfBusy(inst);
          transition(inst, "destroying", null);
          state.passwords.delete(id);
          return { status: 202, body: { data: view(inst) } };
        }

        if (method === "PATCH") {
          requireJson(req);
          const inst = findInstance(id);
          const b = parseJson(await readBody(req));
          const known = ["name", "memory", "storage", "vector_optimized", "graph_analytics_plugin"];
          if (!known.some((k) => k in b)) throw apiError(400, "Nothing to change", "invalid-request");
          conflictIfBusy(inst);
          if ("name" in b) {
            const name = b.name;
            if (typeof name !== "string" || name.length < 1 || name.length > 30 || name !== name.trim()) {
              throw apiError(400, "name must be 1 to 30 characters with no leading or trailing whitespace", "invalid-request", "name");
            }
          }
          const resizing = "memory" in b || "storage" in b;
          if (resizing) {
            const memory = (b.memory as string | undefined) ?? inst.memory;
            const storage = (b.storage as string | undefined) ?? inst.storage;
            const tenant = findTenant(inst.tenant_id);
            const ok = tenant.instance_configurations.some(
              (c) => c.cloud_provider === inst.cloud_provider && c.region === inst.region && c.type === inst.type && c.memory === memory && c.storage === storage,
            );
            if (!ok) throw apiError(400, "That memory and storage combination is not available for this instance", "invalid-configuration", "memory");
            inst.memory = memory;
            inst.storage = storage;
          }
          if ("name" in b) inst.name = b.name as string;
          if (typeof b.vector_optimized === "boolean") inst.vector_optimized = b.vector_optimized;
          if (typeof b.graph_analytics_plugin === "boolean") inst.graph_analytics_plugin = b.graph_analytics_plugin;
          if (resizing) {
            transition(inst, "updating", "running");
            return { status: 202, body: {} };
          }
          return { status: 200, body: { data: view(inst) } };
        }
      }

      if (id && (action === "pause" || action === "resume") && method === "POST") {
        requireJson(req);
        const inst = findInstance(id);
        conflictIfBusy(inst);
        const need = action === "pause" ? "running" : "paused";
        if (inst.status !== need) throw apiError(400, `Cannot ${action} an instance that is ${inst.status}`, "invalid-state");
        transition(inst, action === "pause" ? "pausing" : "resuming", action === "pause" ? "paused" : "running");
        return { status: 202, body: { data: view(inst) } };
      }
    }

    throw middlewareError(404, "Not found");
    }
  };

  const server = createServer((req, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    route(req, url)
      .then(({ status, body, headers, drop }) => {
        // The change was made, but the caller never hears about it
        if (drop) req.socket.destroy();
        else send(res, status, body, headers);
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError) send(res, err.status, err.body, err.headers);
        else send(res, 500, { error: "Internal Server Error" });
      });
  });

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": randomUUID(), ...headers });
    res.end(JSON.stringify(body));
  };

  return {
    server,
    state,
    reset() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      state.tenants = seedTenants();
      state.instances = new Map(seedInstances().map((i) => [i.id, i]));
      state.passwords = new Map();
      state.faults = {};
      requestLog.clear();
    },
    listen: (port = 0) =>
      new Promise((resolve) => {
        server.listen(port, () => resolve((server.address() as { port: number }).port));
      }),
    close: () =>
      new Promise((resolve) => {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
