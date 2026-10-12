"use client";

/**
 * The MUTAV program on Solana as a blueprint (React Flow, static): the
 * reserve, its escrows, the treasury and payments accounts, the operator, the
 * admin Squads multisig, Nora's BRS, and the coverage gate between them.
 *
 * Amber marks only the reserve and the gate; the three roles carry their
 * role colour and marker (lib/roles). Pan/zoom/drag are off. Below
 * 768px the canvas is swapped for a stacked list (`.diagram-mobile`).
 */
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RoleMarker, RoleTag } from "@/components/RoleTag";
import { ROLE_META, type Role } from "@/lib/roles";

type BoxData = { title: string; sub: string; w: number; h: number; accent?: boolean; gate?: boolean; role?: Role };

const HIDDEN: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: "none", background: "transparent" };
/**
 * Handle ids: a side's centre (`t`, `b`, `l`, `r`), plus off-centre points
 * (`l25` = left side at 25% down, `b25`/`b75` = bottom at 25%/75% across) so
 * two edges meeting one box land apart and their labels never stack.
 */
const SIDES: [string, Position, React.CSSProperties?][] = [
  ["t", Position.Top],
  ["b", Position.Bottom],
  ["l", Position.Left],
  ["r", Position.Right],
  ["l25", Position.Left, { top: "25%" }],
  ["b25", Position.Bottom, { left: "25%" }],
  ["b75", Position.Bottom, { left: "75%" }],
];

function Box({ data }: NodeProps<Node<BoxData>>) {
  return (
    <div
      style={{
        width: data.w,
        height: data.h,
        background: "var(--color-surface)",
        border: `1px ${data.gate ? "dashed" : "solid"} ${data.accent || data.gate ? "var(--color-accent)" : "var(--color-border)"}`,
        borderTop: data.role ? `3px solid ${ROLE_META[data.role].color}` : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "0 12px",
        textAlign: "center",
      }}
    >
      <span className="font-display" style={{ fontSize: data.accent ? 18 : 13, letterSpacing: "0.03em", color: data.gate ? "var(--color-accent)" : "var(--color-text)", lineHeight: 1.1 }}>
        {data.role ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RoleMarker role={data.role} size={9} />
            {data.title}
          </span>
        ) : (
          data.title
        )}
      </span>
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--color-text-3)", lineHeight: 1.4, whiteSpace: "pre-line" }}>
        {data.sub}
      </span>
      {SIDES.flatMap(([id, pos, at]) => [
        <Handle key={`s${id}`} id={`s${id}`} type="source" position={pos} style={{ ...HIDDEN, ...at }} />,
        <Handle key={`t${id}`} id={`t${id}`} type="target" position={pos} style={{ ...HIDDEN, ...at }} />,
      ])}
    </div>
  );
}

const nodeTypes = { box: Box };

const n = (id: string, x: number, y: number, data: BoxData): Node<BoxData> => ({ id, type: "box", position: { x, y }, data, draggable: false, selectable: false });

// Layout: the operator's fee take and contribute_fees share one trunk down the
// left; Nora sits on the bottom row and meets the reserve from below, so no two
// labels share a segment; the right column leaves room for the widest label.
const NODES: Node<BoxData>[] = [
  n("operator", 0, 20, { title: "OPERATOR", sub: "MUTAV platform key\nregisters · fees · claims", w: 190, h: 74, role: "operator" }),
  n("gate", 425, 26, { title: "COVERAGE GATE", sub: "new cover must fit\nin free capital", w: 170, h: 62, gate: true }),
  n("admin", 890, 20, { title: "RESERVE ADMIN", sub: "Squads M-of-N multisig\ntime-locked proposals", w: 200, h: 74, role: "admin" }),
  n("reserve", 380, 170, { title: "RESERVE", sub: "BRS held by the program\nNAV · coverage · free capital\nshares minted at NAV", w: 260, h: 130, accent: true }),
  n("escrows", 880, 186, { title: "ESCROWS", sub: "pending deposits\npending redemptions\nclaims (filled redemptions)", w: 220, h: 98 }),
  n("treasury", 0, 390, { title: "TREASURY", sub: "MUTAV's fee take\n(operating revenue)", w: 190, h: 64 }),
  n("nora", 220, 390, { title: "NORA · BRS", sub: "issues the BRL stablecoin\nholds its freeze authority", w: 200, h: 64 }),
  n("payments", 560, 390, { title: "PAYMENTS ACCOUNT", sub: "claim payments out\n→ PIX to the agency", w: 220, h: 64 }),
  n("investor", 890, 390, { title: "INVESTOR", sub: "allowlisted capital wallet\n(KYC off-chain)", w: 200, h: 64, role: "investor" }),
];

const edge = (id: string, source: string, sh: string, target: string, th: string, label: string, opts: { accent?: boolean; dashed?: boolean } = {}): Edge => ({
  id,
  source,
  sourceHandle: `s${sh}`,
  target,
  targetHandle: `t${th}`,
  type: "smoothstep",
  label,
  labelStyle: { fill: opts.accent ? "var(--color-accent)" : "var(--color-text-2)", fontFamily: "var(--font-mono)", fontSize: 10 },
  labelBgStyle: { fill: "var(--color-canvas)" },
  labelBgPadding: [4, 2],
  style: { stroke: opts.accent ? "var(--color-accent)" : "var(--color-text-3)", strokeWidth: 1, strokeDasharray: opts.dashed ? "4 4" : undefined },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: opts.accent ? "#E8A020" : "#7C828D" },
});

const EDGES: Edge[] = [
  edge("e1", "operator", "r", "gate", "l", "register_guarantee"),
  edge("e2", "gate", "b", "reserve", "t", "fits → cover booked", { accent: true }),
  edge("e3", "operator", "b", "reserve", "l25", "contribute_fees (net)"),
  edge("e4", "operator", "b", "treasury", "t", "fee take"),
  edge("e5", "reserve", "b75", "payments", "t", "pay_claim · never gated"),
  edge("e6", "admin", "b", "escrows", "t", "fulfil_deposits / fulfil_redeems"),
  edge("e7", "escrows", "l", "reserve", "r", "deposits in · redemptions out (gated)"),
  edge("e8", "nora", "t", "reserve", "b25", "freeze authority", { dashed: true }),
  edge("e9", "investor", "t", "escrows", "b", "request_deposit / request_redeem"),
];

const MOBILE: [string, string, Role?][] = [
  ["Operator", "Registers guarantees, contributes guarantee fees, files, pays and settles claims.", "operator"],
  ["Coverage gate", "A new guarantee is accepted only if its cover fits in free capital. Redemptions pass the same gate."],
  ["Reserve", "BRS held by the program. Publishes NAV, coverage required and free capital."],
  ["Investor", "Requests deposits and redemptions, then claims shares or assets. Deposits are allowlist-gated; holders can always redeem. In the pilot, MUTAV's capital wallet.", "investor"],
  ["Escrows", "Deposits and redemptions wait in FIFO escrows until the Reserve Admin fulfils them."],
  ["Reserve Admin (Squads)", "M-of-N multisig with a time lock. Fulfils the queues, sets config and caps, pauses.", "admin"],
  ["Treasury", "Receives MUTAV's take of each guarantee fee, outside the reserve."],
  ["Payments account", "Receives claim payments, which the gate never blocks, then pays agencies by PIX."],
  ["Nora · BRS", "Issues BRS and holds its freeze authority."],
];

export function ProtocolDiagram() {
  return (
    <figure style={{ margin: 0 }} aria-label="Protocol diagram">
      <div className="diagram-canvas" style={{ width: "100%", height: 500, border: "1px solid var(--color-border)", background: "var(--color-canvas)" }}>
        <ReactFlow
          nodes={NODES}
          edges={EDGES}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="#2A2D33" style={{ opacity: 0.3 }} />
        </ReactFlow>
      </div>
      <ol className="diagram-mobile" style={{ flexDirection: "column", gap: 10, margin: 0, padding: 0 }}>
        {MOBILE.map(([t, d, role]) => (
          <li key={t} style={{ listStyle: "none", border: "1px solid var(--color-border)", borderTop: role ? `3px solid ${ROLE_META[role].color}` : undefined, padding: "10px 12px", background: "var(--color-surface)" }}>
            <p className="font-display" style={{ fontSize: 13, margin: "0 0 4px" }}>{role ? <RoleTag role={role} /> : t}</p>
            <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0 }}>{d}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
