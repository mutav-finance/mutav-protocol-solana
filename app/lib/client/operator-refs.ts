"use client";
/**
 * What the operator keeps off-chain for the demo register form (ADR 0019
 * decision 8): each agency's OPAQUE RANDOM id, assigned once, and each
 * lease's refs_hash SALT, so the hash can be re-checked later. In production
 * mutav-app holds both; here, this browser's storage. Storage can be
 * unavailable (private window): then every registration gets fresh random
 * values, which stay opaque but cannot be re-checked.
 */
import { randomRef } from "../refs";

const AGENCIES = "mutav.demo.agencyIds";
const SALTS = "mutav.demo.refsSalts";

function load(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** The value stored under `label`, or a new random one, stored. */
function keep(key: string, label: string): string {
  const map = load(key);
  const hit = map[label];
  if (hit && /^[0-9a-f]{64}$/.test(hit)) return hit;
  const v = randomRef();
  try {
    localStorage.setItem(key, JSON.stringify({ ...map, [label]: v }));
  } catch {
    // Not persisted: still random and opaque.
  }
  return v;
}

export const agencyIdFor = (agency: string) => keep(AGENCIES, agency);
export const refsSaltFor = (lease: string) => keep(SALTS, lease);
