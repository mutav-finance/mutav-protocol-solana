"use client";

/**
 * A `set_config` proposal builder for one group of fields. Blank fields keep
 * their on-chain value (the composer carries every unnamed field over); a
 * filled field must parse within its bound before anything is proposed.
 */
import { useState, type ReactNode } from "react";
import { Grid, Note, TextField } from "@/components/demo/shared";
import { AdminAction, Facts, type Mode } from "@/components/admin/shared";
import { fmtBps, fmtBrs, fmtDuration, parseBrs } from "@/lib/format";
import { parseBps, parseIntIn } from "@/lib/reserve-assets";
import type { AdminTx } from "@/lib/tx-kinds";

export type Field = {
  key: string;
  label: string;
  /** The on-chain value, formatted. */
  now: string;
  /** Parses an input; null when out of bound. */
  parse: (input: string) => bigint | number | null;
  bound: string;
};

const I64_MAX = (1n << 63n) - 1n;

/** BRS amount (6 decimals). */
export const brsField = (key: string, label: string, now: bigint): Field => ({ key, label, now: fmtBrs(now, 0), parse: (s) => parseBrs(s), bound: "BRS amount" });
/** Seconds, with an inclusive minimum. */
export const secsField = (key: string, label: string, now: bigint, min = 0n): Field => ({ key, label, now: fmtDuration(now), parse: (s) => parseIntIn(s, min, I64_MAX), bound: `seconds, ≥ ${min}` });
/** Basis points, within `[min, max]`. */
export const bpsField = (key: string, label: string, now: number, max: number, min = 0): Field => ({
  key,
  label,
  now: fmtBps(now),
  parse: (s) => {
    const v = parseBps(s, max);
    return v === null || v < min ? null : v;
  },
  bound: `${min}–${max} bps`,
});

/**
 * `build` turns the parsed, filled fields into a request, or a reason why the
 * program would refuse it (for bounds across fields).
 */
export function ConfigCard({ title, mode, fields, build, bound, does }: { title: string; mode: Mode; fields: Field[]; build: (v: Record<string, bigint | number>) => Extract<AdminTx, { kind: "set_config" }> | string; bound: ReactNode; does: ReactNode }) {
  const [input, setInput] = useState<Record<string, string>>({});
  const values: Record<string, bigint | number> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const s = (input[f.key] ?? "").trim();
    if (!s) continue;
    const v = f.parse(s);
    if (v === null) errors.push(f.key);
    else values[f.key] = v;
  }
  const filled = Object.keys(values).length > 0;
  const built = filled && errors.length === 0 ? build(values) : null;
  const request = built && typeof built !== "string" ? built : null;
  return (
    <AdminAction title={title} label="set_config" mode={mode} request={request}>
      <Facts now={<span className="font-mono" style={{ fontSize: 12 }}>{fields.map((f) => `${f.label}: ${f.now}`).join(" · ")}</span>} bound={<span className="font-mono" style={{ fontSize: 12 }}>{bound}</span>} does={does} />
      <Grid>
        {fields.map((f) => (
          <TextField key={f.key} id={`adm-cfg-${f.key}`} label={f.label} value={input[f.key] ?? ""} onChange={(v) => setInput((s) => ({ ...s, [f.key]: v }))} numeric hint={errors.includes(f.key) ? `out of bound: ${f.bound}` : `now ${f.now} · blank keeps it`} />
        ))}
      </Grid>
      {typeof built === "string" && <Note tone="warn">{built}</Note>}
    </AdminAction>
  );
}
