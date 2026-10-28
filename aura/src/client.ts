// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { components } from "./generated/aura-api.js";
import type { AuraCredentials } from "./secrets.js";

export type InstanceDetail = components["schemas"]["Instance"]["data"];
export type InstanceSummary = components["schemas"]["InstanceSummary"];
export type ProjectDetail = components["schemas"]["Project"]["data"];
export type ProjectSummary = components["schemas"]["ProjectSummary"];
export type InstanceConfigurationData = ProjectDetail["instance_configurations"][number];

export interface Problem {
  message: string;
  reason?: string;
  field?: string;
}

/** Aura answered with an error status. `problems` is what its error body said, which is safe to show. */
export class AuraApiError extends Error {
  constructor(
    readonly status: number,
    readonly problems: Problem[],
  ) {
    super(`Aura answered ${status}${problems[0] ? `: ${problems[0].message}` : ""}`);
    this.name = "AuraApiError";
  }
}

/** The request never got an answer: no network, DNS failure, refused connection. */
export class AuraUnreachableError extends Error {
  constructor() {
    super("Could not reach Aura");
    this.name = "AuraUnreachableError";
  }
}

/** Aura's token endpoint refused the client id and secret. */
export class AuraAuthError extends Error {
  constructor() {
    super("Aura rejected the client id and secret");
    this.name = "AuraAuthError";
  }
}

export interface AuraClientOptions {
  /** For example https://api.neo4j.io, without /v1. */
  baseUrl: string;
  /** Called when a token is needed, so the secret is read as late as possible and never kept here. */
  credentials: () => Promise<AuraCredentials>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries after a 429 or a 5xx, per request. Default 4. */
  maxRetries?: number;
  /** The longest we will wait because Aura said Retry-After. A longer ask is treated as an error. Default 60 s. */
  maxWaitMs?: number;
  /** Used when the token response has no expires_in. The spec does not give a lifetime. Default 3600 s. */
  fallbackTokenSeconds?: number;
}

export interface ClientStats {
  requests: number;
  retries: number;
  rateLimited: number;
}

const REFRESH_MARGIN_MS = 60_000;

export class AuraClient {
  readonly stats: ClientStats = { requests: 0, retries: 0, rateLimited: 0 };

  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly maxWaitMs: number;
  private readonly fallbackTokenSeconds: number;
  private token: { value: string; expiresAt: number } | undefined;
  private tokenInFlight: Promise<string> | undefined;
  /** After a 429 every request waits, not just the one that was refused. */
  private pausedUntil = 0;

  constructor(private readonly options: AuraClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 4;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.fallbackTokenSeconds = options.fallbackTokenSeconds ?? 3600;
  }

  resetStats(): void {
    this.stats.requests = 0;
    this.stats.retries = 0;
    this.stats.rateLimited = 0;
  }

  /** Forget the cached token, for example after the credentials were replaced. */
  forgetToken(): void {
    this.token = undefined;
  }

  /** Fetches a token (or reuses the cached one). Throws AuraAuthError if the credentials are wrong. Used to validate new credentials. */
  async checkCredentials(): Promise<void> {
    await this.accessToken();
  }

  private accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - this.now() > REFRESH_MARGIN_MS) return Promise.resolve(this.token.value);
    // Concurrent callers share one refresh, so a burst never asks the token endpoint more than once
    this.tokenInFlight ??= this.fetchToken().finally(() => {
      this.tokenInFlight = undefined;
    });
    return this.tokenInFlight;
  }

  private async fetchToken(): Promise<string> {
    const { clientId, clientSecret } = await this.options.credentials();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    for (let attempt = 0; ; attempt++) {
      await this.waitIfPaused();
      this.stats.requests++;
      const res = await this.send(`${this.options.baseUrl}/oauth/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (res.ok) {
        const body = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!body.access_token) throw new AuraApiError(res.status, [{ message: "The token response had no access_token" }]);
        this.token = { value: body.access_token, expiresAt: this.now() + (body.expires_in ?? this.fallbackTokenSeconds) * 1000 };
        return body.access_token;
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new AuraAuthError();
      if (!(await this.shouldRetry(res, attempt))) throw new AuraApiError(res.status, await readProblems(res));
    }
  }

  /** Decides whether a 429 or 5xx is worth another go, and waits as asked. Returns false when retries are used up. */
  private async shouldRetry(res: Response, attempt: number): Promise<boolean> {
    if (res.status === 429) {
      this.stats.rateLimited++;
      if (attempt >= this.maxRetries) return false;
      const wait = retryAfterMs(res, this.now()) ?? 5000;
      if (wait > this.maxWaitMs) throw new AuraApiError(429, [{ message: `Aura asked us to wait ${Math.ceil(wait / 1000)} seconds`, reason: "rate-limit-exceeded" }]);
      this.pausedUntil = Math.max(this.pausedUntil, this.now() + wait);
      this.stats.retries++;
      return true;
    }
    if (res.status >= 500 && attempt < this.maxRetries) {
      this.stats.retries++;
      await this.sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
      return true;
    }
    return false;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch {
      // Not the error itself: it can carry the address, and never anything the person needs to see
      throw new AuraUnreachableError();
    }
  }

  private async waitIfPaused(): Promise<void> {
    const wait = this.pausedUntil - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let reauthenticated = false;
    for (let attempt = 0; ; attempt++) {
      await this.waitIfPaused();
      const token = await this.accessToken();
      this.stats.requests++;
      const res = await this.send(`${this.options.baseUrl}/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      // An expired or revoked token: get a fresh one once. If that fails too, the error is real.
      if ((res.status === 401 || res.status === 403) && !reauthenticated) {
        reauthenticated = true;
        this.token = undefined;
        this.stats.retries++;
        attempt--;
        continue;
      }
      if (!(await this.shouldRetry(res, attempt))) throw new AuraApiError(res.status, await readProblems(res));
    }
  }

  async listTenants(): Promise<ProjectSummary[]> {
    return (await this.request<{ data: ProjectSummary[] }>("GET", "/tenants")).data;
  }

  async getTenant(tenantId: string): Promise<ProjectDetail> {
    return (await this.request<{ data: ProjectDetail }>("GET", `/tenants/${encodeURIComponent(tenantId)}`)).data;
  }

  /** The summary list: id, name, tenant, cloud provider and created time. Status and size need getInstance. */
  async listInstances(tenantId?: string): Promise<InstanceSummary[]> {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return (await this.request<{ data: InstanceSummary[] }>("GET", `/instances${query}`)).data;
  }

  async getInstance(instanceId: string): Promise<InstanceDetail> {
    return (await this.request<{ data: InstanceDetail }>("GET", `/instances/${encodeURIComponent(instanceId)}`)).data;
  }
}

/** Retry-After is either a number of seconds or an HTTP date. */
export function retryAfterMs(res: Response, now: number): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(1000, date - now);
}

async function readProblems(res: Response): Promise<Problem[]> {
  try {
    const body = (await res.json()) as { errors?: Problem[]; error?: string };
    if (Array.isArray(body.errors)) return body.errors.map((e) => ({ message: String(e.message), reason: e.reason, field: e.field }));
    if (typeof body.error === "string") return [{ message: body.error }];
  } catch {
    // not JSON: fall through
  }
  return [{ message: res.statusText || "Unknown error" }];
}
