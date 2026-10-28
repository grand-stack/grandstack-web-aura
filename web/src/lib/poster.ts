// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { hash } from "./hash";

/** Deterministic generated art, like the movie app's posters: no image files. The colour says which cloud the instance is on. */
const GRADIENTS: Record<string, [string, string]> = {
  gcp: ["#0b4a73", "#13689f"],
  aws: ["#7a4200", "#a85d00"],
  azure: ["#0a5459", "#0d7a80"],
};
// Every pair keeps white text above 4.5:1
const FALLBACK: [string, string] = ["#3b4a5c", "#566a80"];

export function posterStyle(cloud: string | undefined | null, name: string): { background: string } {
  const [from, to] = (cloud ? GRADIENTS[cloud] : undefined) ?? FALLBACK;
  const angle = 125 + (hash(name) % 21);
  return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
}
