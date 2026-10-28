// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
const GB = /^(\d+(?:\.\d+)?)\s*GB$/i;

/** "8GB" becomes "8 GB". Anything else is shown as Aura sent it. */
export function size(value?: string | null): string {
  if (!value) return "";
  const m = GB.exec(value.trim());
  return m ? `${m[1]} GB` : value;
}

/** For example "8 GB · 16 GB". Free instances have no storage, so only the memory shows. */
export function memoryAndStorage(memory?: string | null, storage?: string | null): string {
  return [size(memory), size(storage)].filter(Boolean).join(" · ");
}

/** The number of gigabytes in "16GB", or NaN when it is not a size. For sorting. */
export function gigabytes(value?: string | null): number {
  const m = value ? GB.exec(value.trim()) : null;
  return m ? Number(m[1]) : Number.NaN;
}

export function formatDate(iso?: string | null): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2 minutes ago". After about a month it gives the date. A time in the future (a skewed clock) reads as "just now". */
export function relativeTime(iso?: string | null, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  if (minutes < 45) return `${minutes} minutes ago`;
  if (minutes < 90) return "an hour ago";
  if (hours < 22) return `${hours} hours ago`;
  if (hours < 36) return "a day ago";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

/** Two letters for a poster: the first letters of the first two words, or the first two letters of a single word. */
export function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const CLOUDS: Record<string, string> = { gcp: "GCP", aws: "AWS", azure: "Azure" };
export function cloudLabel(cloud?: string | null): string {
  return cloud ? (CLOUDS[cloud] ?? cloud) : "";
}
