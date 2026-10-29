// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
// Starts the real grandstack-server, the way the compose stack runs it, as a child process. It is a sibling repository, not a
// dependency: clone grandstack-server beside this repository and build it (`npm ci && npm run build` there), or set GRANDSTACK_SERVER_DIR.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export const serverDir = (): string => resolve(process.env.GRANDSTACK_SERVER_DIR ?? resolve(repoRoot, "../grandstack-server"));
export const modelsDir = (): string => resolve(repoRoot, "models");

/** Says what is missing, in a way a person can act on. Called before anything is started. */
export function assertServerBuilt(): void {
  const entry = resolve(serverDir(), "dist/index.js");
  if (!existsSync(entry)) {
    throw new Error(
      `The integration tests run the real grandstack-server, and ${entry} does not exist. ` +
        `Clone grandstack-server beside this repository (on a version that has MODEL and READ_ONLY), run "npm ci && npm run build" in it, or set GRANDSTACK_SERVER_DIR.`,
    );
  }
}

const freePort = () =>
  new Promise<number>((resolvePort, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolvePort(port));
    });
  });

export interface RunningServer {
  url: string;
  stop(): Promise<void>;
}

/** Starts one server for the aura model against the given Neo4j, and waits until it answers. */
export async function startServer(options: { uri: string; username: string; password: string; database: string; readOnly: boolean }): Promise<RunningServer> {
  const port = await freePort();
  let output = "";
  const child: ChildProcess = spawn(process.execPath, [resolve(serverDir(), "dist/index.js")], {
    cwd: serverDir(),
    env: {
      ...process.env,
      NEO4J_URI: options.uri,
      NEO4J_USERNAME: options.username,
      NEO4J_PASSWORD: options.password,
      NEO4J_DATABASE: options.database,
      MODEL: "aura",
      MODELS_DIR: modelsDir(),
      FEDERATION: "true",
      READ_ONLY: String(options.readOnly),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => (output += d));
  child.stderr?.on("data", (d) => (output += d));
  let exited = false;
  child.once("exit", () => (exited = true));

  const url = `http://127.0.0.1:${port}/graphql`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (exited) throw new Error(`grandstack-server exited while starting:\n${output.slice(-1500)}`);
    try {
      if ((await fetch(`${url}?query=%7B__typename%7D`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`grandstack-server did not answer within a minute:\n${output.slice(-1500)}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    url,
    stop: () =>
      new Promise<void>((done) => {
        if (exited) return done();
        child.once("exit", () => done());
        child.kill("SIGTERM");
      }),
  };
}
