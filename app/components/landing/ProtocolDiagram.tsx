"use client";

/**
 * The MUTAV program on Solana as a blueprint (React Flow, static): the
 * reserve, its escrows, the treasury and payments accounts, the operator, the
 * admin Squads multisig, Nora's BRS, and the solvency gate between them.
 *
 * Amber marks only the reserve and the gate. Pan/zoom/drag are off. Below
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

type BoxData = { title: string; sub: string; w: number; h: number; accent?: boolean; gate?: boolean };

const HIDDEN: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: "none", background: "transparent" };
const SIDES = [
  ["t", Position.Top],
  ["b", Position.Bottom],
  ["l", Position.Left],
  ["r", Position.Right],
] as const;

function Box({ data }: NodeProps<Node<BoxData>>) {
  return (
    <div
      style={{
        width: data.w,
        height: data.h,
        background: "var(--color-surface)",
        border: `1px ${data.gate ? "dashed" : "solid"} ${data.accent || data.gate ? "var(--color-accent)" : "var(--color-border)"}`,
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
        {data.title}
      </span>
      <span className="font-mono" style={{ fontSize: 9.5, color: "var(--color-text-3)", lineHeight: 1.4, whiteSpace: "pre-line" }}>
        {data.sub}
      </span>
      {SIDES.flatMap(([id, pos]) => [
        <Handle key={`s${id}`} id={`s${id}`} type="source" position={pos} style={HIDDEN} />,
        <Handle key={`t${id}`} id={`t${id}`} type="target" position={pos} style={HIDDEN} />,
      ])}
    </div>
  );
}

const nodeTypes = { box: Box };

const n = (id: string, x: number, y: number, data: BoxData): Node<BoxData> => ({ id, type: "box", position: { x, y }, data, draggable: false, selectable: false });

const NODES: Node<BoxData>[] = [
  n("operator", 0, 20, { title: "OPERATOR", sub: "MUTAV platform key\nregisters · fees · claims", w: 190, h: 74 }),
  n("gate", 300, 26, { title: "SOLVENCY GATE", sub: "new cover must fit\nin free capital", w: 170, h: 62, gate: true }),
  n("admin", 840, 20, { title: "ADMIN · SQUADS", sub: "M-of-N multisig\ntime-locked proposals", w: 200, h: 74 }),
  n("reserve", 380, 170, { title: "RESERVE", sub: "BRS held by the program\nNAV · coverage · free capital\nshares minted at NAV", w: 260, h: 130, accent: true }),
  n("escrows", 820, 186, { title: "ESCROWS", sub: "pending deposits\npending redemptions\nclaims (filled redemptions)", w: 220, h: 98 }),
  n("nora", 0, 200, { title: "NORA · BRS", sub: "issues the BRL stablecoin\nholds its freeze authority", w: 200, h: 70 }),
  n("treasury", 120, 390, { title: "TREASURY", sub: "MUTAV's fee take\n(operating revenue)", w: 190, h: 64 }),
  n("payments", 560, 390, { title: "PAYMENTS ACCOUNT", sub: "claim payments out\n→ PIX to the agency", w: 220, h: 64 }),
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
  edge("e3", "operator", "b", "reserve", "l", "contribute_fees (net)"),
  edge("e4", "operator", "b", "treasury", "t", "fee take"),
  edge("e5", "reserve", "b", "payments", "t", "pay_claim · never gated"),
  edge("e6", "admin", "b", "escrows", "t", "fulfil_deposits / fulfil_redeems"),
  edge("e7", "escrows", "l", "reserve", "r", "deposits in · redemptions out (gated)"),
  edge("e8", "nora", "r", "reserve", "l", "freeze authority", { dashed: true }),
];

const MOBILE: [string, string][] = [
  ["Operator", "Registers guarantees, contributes guarantee fees, files and pays claims."],
  ["Solvency gate", "A new guarantee is accepted only if its cover fits in free capital. Redemptions pass the same gate."],
  ["Reserve", "BRS held by the program. Publishes NAV, coverage required and free capital."],
  ["Escrows", "Deposits and redemptions wait in FIFO escrows until the admin multisig fulfils them."],
  ["Admin (Squads)", "M-of-N multisig with a time lock. Fulfils the queues and sets caps."],
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
        {MOBILE.map(([t, d]) => (
          <li key={t} style={{ listStyle: "none", border: "1px solid var(--color-border)", padding: "10px 12px", background: "var(--color-surface)" }}>
            <p className="font-display" style={{ fontSize: 13, margin: "0 0 4px" }}>{t}</p>
            <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0 }}>{d}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
