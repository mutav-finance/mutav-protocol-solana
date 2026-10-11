"use client";

/**
 * /reserve · Claims detail table: five reading columns plus a Details toggle.
 * Timestamps, explorer links and the leg live in the expand row (progressive
 * disclosure), so the main row reads as status → guarantee → amount → speed.
 * Exceptions (late, past SLA) sort first, then newest filing.
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
  SLA: "The settlement deadline set by the Reserve Admin. A payment not settled in time is marked late on-chain at the next refresh.",
  "Filed → paid": "From when the claim was filed to when it was paid.",
  "Paid → settled": "From payment to settlement by PIX.",
};

type Status = { label: string; color: string; title?: string; rank: number };

/** SLA status of one claim: late (recorded on-chain), past SLA (not yet recorded) or on time. */
export function slaStatus(c: ClaimRow): Status {
  if (c.lateOnChain) return { label: "late", color: "var(--color-error)", rank: 0 };
  if (c.overdue) return { label: "past SLA", color: "var(--color-copper)", title: "Marked late on-chain at the next refresh.", rank: 1 };
  return { label: "on time", color: "var(--color-text-3)", rank: 2 };
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
  const sorted = [...rows].sort((a, b) => slaStatus(a).rank - slaStatus(b).rank);
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
      <Table label="Claims timeline" head={["SLA", "Guarantee", ["Amount", "num"], ["Filed → paid", "num"], ["Paid → settled", "num"], ["Details", "num"]]} tips={TIPS}>
        {visible.map((c) => {
          const isOpen = open.has(c.filing);
          const detailId = `claim-${c.filing}`;
          return (
            <Fragment key={c.filing}>
              <tr>
                <td><StatusBadge s={slaStatus(c)} /></td>
                <td>
                  <span className="inline-flex items-baseline gap-2">
                    <Explorer value={c.guarantee} label={short(c.guaranteeId)} />
                    <Mono dim style={{ fontSize: 11 }}>{c.leg}</Mono>
                  </span>
                </td>
                <Num>{fmtBrs(c.amount ?? c.provision)}</Num>
                <Num>{c.fileToPay !== null ? fmtDuration(c.fileToPay) : "—"}</Num>
                <Num>{c.payToSettle !== null ? fmtDuration(c.payToSettle) : c.paidAt !== null ? "pending" : "—"}</Num>
                <td className="num">
                  <Button type="button" variant="ghost" size="sm" aria-expanded={isOpen} aria-controls={detailId} onClick={() => toggle(c.filing)} className="font-mono text-2xs">
                    {isOpen ? "Hide" : "Show"}
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
                      <Detail label="Paid">{c.payout && c.paidAt !== null ? <Explorer value={c.payout} label={fmtTime(c.paidAt)} /> : <Mono dim>not paid yet</Mono>}</Detail>
                      <Detail label="Settled by PIX">
                        <Mono dim={c.settledAt === null} style={{ fontSize: 12 }}>{c.settledAt !== null ? fmtTime(c.settledAt) : "pending"}</Mono>
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
