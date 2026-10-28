// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]

/** The store answered with GraphQL errors. Their messages come from the store, never from this app's secrets. */
export class StoreError extends Error {
  constructor(readonly messages: string[]) {
    super(`The store reported: ${messages.join("; ")}`);
    this.name = "StoreError";
  }
}

/**
 * Talks to the writable store: a grandstack-server running the aura model, which no one else can reach. It has no sign-in of its own;
 * what keeps others out is that it is on a private network and is not routed through the gateway.
 */
export class StoreClient {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
    if (!res.ok && !body.errors) throw new StoreError([`HTTP ${res.status}`]);
    if (body.errors?.length) throw new StoreError(body.errors.map((e) => e.message));
    return body.data as T;
  }
}

/** A string for use inside a GraphQL query: quoted and escaped. Use variables where you can; this is for building batched mutations. */
export const literal = (value: unknown): string => JSON.stringify(value);
