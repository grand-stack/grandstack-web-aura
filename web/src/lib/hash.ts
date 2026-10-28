// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
/** A small, stable, non-negative hash of a string (djb2). Used to vary generated art, never for anything secret. */
export function hash(text: string): number {
  let h = 5381;
  for (const ch of text) h = ((h << 5) + h + (ch.codePointAt(0) ?? 0)) | 0;
  return Math.abs(h);
}
