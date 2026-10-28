// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";

// ajv-formats is CommonJS, so under NodeNext its default import is the module object, not the plugin function
const addFormats = (addFormatsModule as unknown as { default: (ajv: Ajv) => void }).default;

/** The real Aura API v1 OpenAPI file, kept in the repo's docs folder. */
const SPEC_URL = new URL("../../docs/aura_api_spec_v1-2.yaml", import.meta.url);
const SPEC_ID = "https://aura.test/spec";

const spec = parse(readFileSync(SPEC_URL, "utf8")) as any;

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: SPEC_ID, components: spec.components });

/** Point `#/components/...` references at the registered spec document. */
function absolutize(node: any): any {
  if (Array.isArray(node)) return node.map(absolutize);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === "$ref" && typeof v === "string" && v.startsWith("#/") ? SPEC_ID + v : absolutize(v)]));
  }
  return node;
}

function resolve(node: any): any {
  if (node && typeof node === "object" && typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
    return node.$ref
      .slice(2)
      .split("/")
      .reduce((acc: any, key: string) => acc[key], spec);
  }
  return node;
}

/** The JSON response schema the spec declares for a path, method and status, or undefined when it declares none. */
export function responseSchema(path: string, method: string, status: number): object | undefined {
  const response = resolve(spec.paths?.[path]?.[method.toLowerCase()]?.responses?.[String(status)]);
  const schema = response?.content?.["application/json"]?.schema;
  return schema ? absolutize(schema) : undefined;
}

export function declaredStatuses(path: string, method: string): number[] {
  return Object.keys(spec.paths?.[path]?.[method.toLowerCase()]?.responses ?? {}).map(Number);
}

/** Returns the validation problems, or an empty array when the body matches the spec. */
export function validate(path: string, method: string, status: number, body: unknown): string[] {
  const schema = responseSchema(path, method, status);
  if (!schema) return [`${method} ${path} declares no JSON schema for status ${status}`];
  const check = ajv.compile(schema);
  return check(body) ? [] : (check.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath || "/"} ${e.message}`);
}
