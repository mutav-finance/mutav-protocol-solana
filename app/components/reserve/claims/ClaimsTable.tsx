"use client";

/**
 * /reserve · Claims detail table: status, guarantee, amount, the filed, paid
 * and settled timestamps (UTC, to the second, from the ClaimFiling account)
 * and the filed → settled time, plus a chevron; the whole row opens its
 * detail (the two partial durations and explorer links).
 * Open claims (needs approval, approved, awaiting payment, then awaiting PIX)
 * sort first, then newest filing.
 * Below 600px each claim stacks as a block (`.claims-table` in globals.css):
 * stage and amount, guarantee and the chevron, then the times, each labelled.
 * The program sets no settlement deadline (ADR 0019): the payout SLA is the
 * operator platform's, so no row is marked late.
 */
import { Fragment, useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { Button } from "@/components/ui/button";
import { elapsed, fmtBrs, fmtDuration, fmtStamp, fmtTime } from "@/lib/format";
import { CLAIM_STAGE_LABEL, type ClaimRow } from "@/lib/view";
import { Num, Table, short } from "@/components/reserve/sections/shared";

const PAGE = 10;

const TIPS = {
  Status: "Needs the Reserve Admin's approval, approved, awaiting payment, paid from the reserve, or received by the landlord (PIX), from the claim filing on-chain.",
  "Filed (UTC)": "When file_claim was recorded on-chain (ClaimFiling filed_at).",
  "Paid (UTC)": "When pay_claim moved the claim payment out of the reserve (ClaimFiling paid_at).",
  "Settled (UTC)": "When settle_payout recorded the landlord's PIX receipt (ClaimFiling settled_at).",
  "Filed → settled": "From filing to the landlord receiving it by PIX.",
};

type Status = { label: string; color: string; title?: string; rank: number };

/**
 * Stage of one claim from its filing account (`CLAIM_STAGE_LABEL`; an
 * unapproved filing within the operator's per-call limit reads as awaiting
 * payment). Ranks order the table: needs approval, approved, awaiting
 * payment, paid (PIX pending), settled.
 */
export function claimStatus(c: ClaimRow): Status {
  const s = (label: string, rank: number, title?: string): Status => ({ label, color: "var(--color-text-3)", title, rank });
  switch (c.stage) {
    case "needs_approval":
      return s(CLAIM_STAGE_LABEL.needs_approval, 0, "Above the operator's limit per payment: the Reserve Admin must approve it before it is paid (ADR 0021).");
    case "approved":
      return s(CLAIM_STAGE_LABEL.approved, 1, "Approved by the Reserve Admin, not paid yet.");
    case "filed":
      return s("awaiting payment", 2, "Filed, not paid yet.");
    case "paid":
      return s(CLAIM_STAGE_LABEL.paid, 3, "Paid from the reserve; the landlord has not received it by PIX yet.");
    default:
      return s(CLAIM_STAGE_LABEL.settled, 4);
  }
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
      <Table label="Claims timeline" head={["Status", "Guarantee", ["Amount", "num"], ["Filed (UTC)", "num"], ["Paid (UTC)", "num"], ["Settled (UTC)", "num"], ["Filed → settled", "num"], ["Details", "num"]]} tips={TIPS} className="claims-table">
        {visible.map((c) => {
          const isOpen = open.has(c.filing);
          const detailId = `claim-${c.filing}`;
          const settled = elapsed(c.filedAt, c.settledAt);
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
                <Num label="Filed (UTC)">{fmtStamp(c.filedAt)}</Num>
                <Num label="Paid (UTC)">{c.paidAt !== null ? fmtStamp(c.paidAt) : "—"}</Num>
                <Num label="Settled (UTC)">{c.settledAt !== null ? fmtStamp(c.settledAt) : c.paidAt !== null ? "pending" : "—"}</Num>
                <Num label="Filed → settled">{settled !== null ? fmtDuration(settled) : "—"}</Num>
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
                <tr id={detailId} className="claims-detail">
                  <td colSpan={8} className="bg-(--color-surface)">
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
                      <Detail label="Filed → paid">
                        <Mono style={{ fontSize: 12 }}>{c.fileToPay !== null ? fmtDuration(c.fileToPay) : "—"}</Mono>
                      </Detail>
                      <Detail label="Paid → settled">
                        <Mono style={{ fontSize: 12 }}>{c.payToSettle !== null ? fmtDuration(c.payToSettle) : c.paidAt !== null ? "pending" : "—"}</Mono>
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
