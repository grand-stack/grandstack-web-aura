// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createMockAura, type MockAura, type MockAuraOptions } from "../src/server.js";

export interface Reply {
  status: number;
  json: any;
  headers: Headers;
}

export interface Harness {
  mock: MockAura;
  base: string;
  /** A valid access token, fetched with the default credentials. */
  token: string;
  call(method: string, path: string, init?: { body?: unknown; token?: string | null; contentType?: string | null }): Promise<Reply>;
  /** Poll GET /instances/{id} until `done(status)` is true, or fail after a timeout. */
  waitFor(id: string, done: (status: string) => boolean): Promise<string>;
  close(): Promise<void>;
}

export async function start(options: MockAuraOptions = {}): Promise<Harness> {
  const mock = createMockAura({ stepMs: 25, ...options });
  const port = await mock.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const clientId = options.clientId ?? "mock-client";
  const clientSecret = options.clientSecret ?? "mock-secret";

  const tokenReply = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const token = ((await tokenReply.json()) as { access_token: string }).access_token;

  const call: Harness["call"] = async (method, path, init = {}) => {
    const headers: Record<string, string> = {};
    const token_ = init.token === undefined ? token : init.token;
    if (token_ !== null) headers.Authorization = `Bearer ${token_}`;
    const hasBody = init.body !== undefined || method === "POST" || method === "PATCH";
    const contentType = init.contentType === undefined ? "application/json" : init.contentType;
    if (hasBody && contentType !== null) headers["Content-Type"] = contentType;
    const res = await fetch(`${base}/v1${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(init.body ?? {}) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => undefined), headers: res.headers };
  };

  const waitFor: Harness["waitFor"] = async (id, done) => {
    for (let i = 0; i < 200; i++) {
      const r = await call("GET", `/instances/${id}`);
      if (r.status === 404 && done("gone")) return "gone";
      if (r.status === 200 && done(r.json.data.status)) return r.json.data.status;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting on instance ${id}`);
  };

  return { mock, base, token, call, waitFor, close: () => mock.close() };
}
