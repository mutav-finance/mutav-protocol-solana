"use client";

/**
 * /reserve · Claims detail table: five reading columns plus a chevron; the
 * whole row opens its detail.
 * Timestamps, explorer links and the leg live in the expand row (progressive
 * disclosure), so the main row reads as status → guarantee → amount → speed.
 * Open claims (awaiting payment, then awaiting PIX) sort first, then newest filing.
 * The program sets no settlement deadline (ADR 0019): the payout SLA is the
 * operator platform's, so no row is marked late.
 */
import { Fragment, useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { Button } from "@/components/ui/button";
import { fmtDuration, fmtTime } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import type { ClaimRow } from "@/lib/view";
import { Num, Table, short } from "@/components/reserve/sections/shared";

const PAGE = 10;

const TIPS = {
  Status: "Filed, paid from the reserve, or received by the landlord (PIX), from the claim filing on-chain.",
  "Filed → paid": "From when the claim was filed to when it was paid.",
  "Paid → settled": "From payment to the landlord receiving it by PIX.",
};

type Status = { label: string; color: string; title?: string; rank: number };

/** Stage of one claim from its filing account: awaiting payment, paid (PIX pending), or settled. */
export function claimStatus(c: ClaimRow): Status {
  if (c.stage === "filed") return { label: "awaiting payment", color: "var(--color-text-3)", title: "Filed, not paid yet.", rank: 0 };
  if (c.stage === "paid") return { label: "paid", color: "var(--color-text-3)", title: "Paid from the reserve; the landlord has not received it by PIX yet.", rank: 1 };
  return { label: "settled", color: "var(--color-text-3)", rank: 2 };
}

/** 6px square badge with a mono label (brand status mark, no fill behind the text). */
export function StatusBadge({ s }: { s: Status }) {
  return (
    <span className="inline-flex items-center gap-2" title={s.title}>
      <span aria-hidden="true" style={{ width: 6, height: 6, background: s.color, display: "inline-block", flexShrink: 0 }} />
      <Mono style={{ color: s.color === "var(--color-text-3)" ? "var(--color-text-2)" : s.color, fontSize: 12 }}>{s.label}</Mono>
    </span>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-body text-(--color-text-3) text-2xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ClaimsTable({ rows }: { rows: ClaimRow[] }) {
  const fmtBrs = useFmt();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  // Stable sort: exceptions first, newest filing within each group (claimsTimeline returns newest first).
  const sorted = [...rows].sort((a, b) => claimStatus(a).rank - claimStatus(b).rank);
  const visible = all ? sorted : sorted.slice(0, PAGE);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <Table label="Claims timeline" head={["Status", "Guarantee", ["Amount", "num"], ["Filed → paid", "num"], ["Paid → settled", "num"], ["Details", "num"]]} tips={TIPS}>
        {visible.map((c) => {
          const isOpen = open.has(c.filing);
          const detailId = `claim-${c.filing}`;
          return (
            <Fragment key={c.filing}>
              <tr
                className="cursor-pointer hover:bg-(--color-surface-2)"
                onClick={(e) => {
                  // Links and the chevron button handle their own clicks.
                  if ((e.target as HTMLElement).closest("a, button")) return;
                  toggle(c.filing);
                }}
              >
                <td><StatusBadge s={claimStatus(c)} /></td>
                <td>
                  <span className="inline-flex items-baseline gap-2">
                    <Explorer value={c.guarantee} label={short(c.guaranteeId)} />
                    <span className="font-body" style={{ fontSize: 11, color: "var(--color-text-3)" }}>{c.leg}</span>
                  </span>
                </td>
                <Num>{fmtBrs(c.amount ?? c.provision)}</Num>
                <Num>{c.fileToPay !== null ? fmtDuration(c.fileToPay) : "—"}</Num>
                <Num>{c.payToSettle !== null ? fmtDuration(c.payToSettle) : c.paidAt !== null ? "pending" : "—"}</Num>
                <td className="num">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? detailId : undefined}
                    aria-label={`${isOpen ? "Hide" : "Show"} details of the claim on ${short(c.guaranteeId)}`}
                    onClick={() => toggle(c.filing)}
                    className="text-(--color-text-3) hover:text-(--color-text) h-6 w-6 px-0 font-mono"
                  >
                    <span aria-hidden="true" className={`inline-block transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}>
                      ›
                    </span>
                  </Button>
                </td>
              </tr>
              {isOpen && (
                <tr id={detailId}>
                  <td colSpan={6} className="bg-(--color-surface)">
                    <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="Filed">
                        <Explorer value={c.filing} label={fmtTime(c.filedAt)} />
                      </Detail>
                      <Detail label="Paid">{c.paidAt !== null ? <Explorer value={c.filing} label={fmtTime(c.paidAt)} /> : <span className="font-body text-(--color-text-3)">not paid yet</span>}</Detail>
                      <Detail label="Received by landlord (PIX)">
                        {c.settledAt !== null ? <Mono style={{ fontSize: 12 }}>{fmtTime(c.settledAt)}</Mono> : <span className="font-body text-(--color-text-3)" style={{ fontSize: 12 }}>pending</span>}
                      </Detail>
                      <Detail label="Guarantee">
                        <Explorer value={c.guarantee} />
                      </Detail>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
      {sorted.length > PAGE && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all (${sorted.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
