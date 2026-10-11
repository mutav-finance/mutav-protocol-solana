"use client";
/**
 * Opaque agency ids for the demo register form. The operator assigns each
 * agency a random 32-byte id once and keeps the mapping off-chain (in
 * mutav-app; here, this browser's storage), so the chain never holds anything
 * derivable from the agency's name. Storage can be unavailable (private
 * window): then every registration gets a fresh id, which is still opaque.
 */
import { randomRef } from "../refs";

const KEY = "mutav.demo.agencyIds";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function agencyIdFor(label: string): string {
  const map = load();
  const hit = map[label];
  if (hit && /^[0-9a-f]{64}$/.test(hit)) return hit;
  const id = randomRef();
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...map, [label]: id }));
  } catch {
    // Not persisted: still a random, opaque id.
  }
  return id;
}
