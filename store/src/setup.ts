// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFile } from "node:fs/promises";
import type { Driver } from "neo4j-driver";

/** Split a Cypher file into statements: `//` comment lines are dropped, statements end with a semicolon. */
export function parseStatements(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runSetup(driver: Driver, database: string, path: string): Promise<number> {
  const statements = parseStatements(await readFile(path, "utf8"));
  const session = driver.session({ database });
  try {
    for (const statement of statements) await session.run(statement);
  } finally {
    await session.close();
  }
  return statements.length;
}
