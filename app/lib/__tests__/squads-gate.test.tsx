import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as multisig from "@sqds/multisig";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { inAppApproval } from "../flags";
import { composeProposalAction, plainConfigAction, ProposalRefusedError } from "../server/squads";
import type { ServerEnv } from "../server/env";
import { SquadsPanel, type ProposalView, type SquadsResp } from "@/components/admin/Squads";
import { squadsConfigChange, unknownTransactionAccount } from "../proposal-decode";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

const MS = PublicKey.unique().toBase58();
const MEMBER = PublicKey.unique().toBase58();

describe("in-app approval is a build-time localnet gate (NEW-R3-1, NEW-R3-2)", () => {
  it("is on only for localnet", () => {
    expect(inAppApproval("localnet")).toBe(true);
    expect(inAppApproval(" LOCALNET ")).toBe(false);
    expect(inAppApproval("devnet")).toBe(false);
    expect(inAppApproval(undefined)).toBe(false);
    expect(inAppApproval("")).toBe(false);
  });

  it("the server refuses to compose a vote or execute off localnet", async () => {
    const env = { cluster: "devnet", rpcUrl: "https://api.devnet.solana.com", squadsMultisig: MS, programId: MS } as unknown as ServerEnv;
    const read = vi.spyOn(multisig.accounts.Multisig, "fromAccountAddress");
    for (const action of ["approve", "reject", "cancel", "execute"] as const) {
      await expect(composeProposalAction(env, MEMBER, 1n, action)).rejects.toBeInstanceOf(ProposalRefusedError);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("the server refuses a vote on a localnet env when the build is not localnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", "devnet");
    vi.resetModules();
    const fresh = await import("../server/squads");
    const ms = await import("@sqds/multisig");
    const read = vi.spyOn(ms.accounts.Multisig, "fromAccountAddress");
    const env = { cluster: "localnet", rpcUrl: "http://127.0.0.1:8899", squadsMultisig: MS, programId: MS } as unknown as ServerEnv;
    await expect(fresh.composeProposalAction(env, MEMBER, 1n, "approve")).rejects.toBeInstanceOf(fresh.ProposalRefusedError);
    expect(read).not.toHaveBeenCalled();
  });

  it("POST /api/squads answers 404 on a devnet build, before reading the body", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", "devnet");
    vi.resetModules();
    const { POST } = await import("@/app/api/squads/route");
    const req = { headers: new Headers(), text: () => Promise.reject(new Error("body read")), json: () => Promise.reject(new Error("body read")) };
    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/Squads app/);
  });

  it("POST /api/squads is reachable on a localnet build", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", "localnet");
    vi.resetModules();
    const { POST } = await import("@/app/api/squads/route");
    const res = await POST(new Request("http://127.0.0.1/api/squads", { method: "POST", body: "{}" }));
    expect(res.status).not.toBe(404);
  });
});

const proposal = (over: Partial<ProposalView> = {}): ProposalView => ({
  index: 4n,
  transaction: MS,
  proposal: MS,
  status: "Active",
  statusAt: null,
  approvals: [],
  rejections: [],
  cancellations: [],
  stale: false,
  executable: false,
  executableAt: null,
  instructions: ["SetConfig"],
  decoded: [{ program: "mutav", programId: MS, name: "SetConfig", details: [{ label: "caps.max_tvl", value: "1 → 2 (loosens a risk cap (raised))", warn: true }, { label: "fee_take_bps", value: "2000 → 1500" }] }],
  foreign: [],
  ...over,
});

const sq = (proposals: ProposalView[]): SquadsResp => ({
  configured: true,
  adminIsVault: true,
  now: 1_000n,
  multisig: { address: MS, vault: MS, threshold: 2, timeLock: 60, members: [{ key: MEMBER, permissions: 7 }], transactionIndex: 4n, proposals },
});

const approved = proposal({ index: 5n, status: "Approved", executable: true, executableAt: 10n, approvals: [MEMBER, MS] });
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("/admin Squads panel on a devnet build is read-only", () => {
  const html = renderToStaticMarkup(<SquadsPanel sq={sq([proposal(), approved])} error={null} onDone={() => {}} inAppApproval={false} cluster="devnet" />);
  it("renders no Approve, Reject, Execute or Cancel button", () => {
    expect(html).not.toMatch(/<button/);
    for (const b of [">Approve<", ">Reject<", ">Execute<", ">Cancel<"]) expect(html).not.toContain(b);
  });
  it("links every open proposal to the Squads app with the verification note", () => {
    expect(html.match(/Squads v4 client \(open source\)/g)?.length).toBe(2);
    expect(html).toContain("https://github.com/Squads-Protocol/public-v4-client");
    expect(text(html)).toContain("#4");
    expect(text(html)).toContain("#5");
    expect(text(html).match(/bun run verify-proposal/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("https://github.com/mutav-finance/mutav-protocol-solana/blob/main/docs/security/verify-proposal.md");
    expect(text(html)).toMatch(/only vault_transaction_create and proposal_create: refuse to sign anything else/);
  });
  it("shows every argument open, not folded behind Details", () => {
    expect(html).not.toContain("<details");
    expect(text(html)).toContain("caps.max_tvl: 1 → 2");
    expect(text(html)).toContain("fee_take_bps: 2000 → 1500");
  });
  it("shows a Squads config change with every argument", () => {
    const cfg = proposal({ index: 6n, instructions: [], decoded: [squadsConfigChange(multisig.PROGRAM_ID.toBase58(), [{ kind: "AddMember", key: MEMBER, permissions: 7 }, { kind: "ChangeThreshold", threshold: 1 }])], foreign: [multisig.PROGRAM_ID.toBase58()] });
    const t = text(renderToStaticMarkup(<SquadsPanel sq={sq([cfg])} error={null} onDone={() => {}} inAppApproval={false} cluster="devnet" />));
    expect(t).toContain(`AddMember: key: ${MEMBER}`);
    expect(t).toContain("AddMember: permissions: Initiate, Vote, Execute (mask 7)");
    expect(t).toContain("ChangeThreshold: threshold: 1 (one key alone controls the vault)");
    expect(t).toContain("SQUADS CONFIG CHANGE");
  });
  it("with inAppApproval left at its default, a devnet build renders no vote button", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", "devnet");
    vi.resetModules();
    const { SquadsPanel: Panel } = await import("@/components/admin/Squads");
    const out = renderToStaticMarkup(<Panel sq={sq([proposal(), approved])} error={null} onDone={() => {}} cluster="devnet" />);
    expect(out).not.toMatch(/<button/);
    for (const b of [">Approve<", ">Reject<", ">Execute<", ">Cancel<"]) expect(out).not.toContain(b);
    expect(out).toContain("Squads v4 client (open source)");
  });
  it("the same default on a localnet build reaches the in-app votes (they need a wallet)", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", "localnet");
    vi.resetModules();
    const { SquadsPanel: Panel } = await import("@/components/admin/Squads");
    expect(() => renderToStaticMarkup(<Panel sq={sq([proposal()])} error={null} onDone={() => {}} cluster="localnet" />)).toThrow(/useWallet outside WalletProvider/);
  });
  it("labels an unreadable proposal and says not to approve it", () => {
    const bad = proposal({ index: 7n, instructions: [], decoded: [unknownTransactionAccount(MS, "discriminator 00 is neither")], foreign: [MS] });
    const t = text(renderToStaticMarkup(<SquadsPanel sq={sq([bad])} error={null} onDone={() => {}} inAppApproval={false} cluster="devnet" />));
    expect(t).toContain("UNREADABLE PROPOSAL");
    expect(t).toMatch(/Do not approve it/);
    expect(t).not.toContain("FOREIGN INSTRUCTION");
  });
  it("no approval link for a finished proposal", () => {
    const done = renderToStaticMarkup(<SquadsPanel sq={sq([proposal({ status: "Executed" })])} error={null} onDone={() => {}} inAppApproval={false} cluster="devnet" />);
    expect(done).not.toContain("Squads v4 client (open source)");
  });
});

describe("plainConfigAction converts every Squads ConfigAction variant", () => {
  const k = PublicKey.unique();
  const k2 = PublicKey.unique();
  const cases: [multisig.generated.ConfigAction, unknown][] = [
    [{ __kind: "AddMember", newMember: { key: k, permissions: { mask: 3 } } }, { kind: "AddMember", key: k.toBase58(), permissions: 3 }],
    [{ __kind: "RemoveMember", oldMember: k }, { kind: "RemoveMember", key: k.toBase58() }],
    [{ __kind: "ChangeThreshold", newThreshold: 2 }, { kind: "ChangeThreshold", threshold: 2 }],
    [{ __kind: "SetTimeLock", newTimeLock: 86_400 }, { kind: "SetTimeLock", seconds: 86_400 }],
    [
      { __kind: "AddSpendingLimit", createKey: k, vaultIndex: 0, mint: k2, amount: 9, period: multisig.generated.Period.Week, members: [k], destinations: [k2] },
      { kind: "AddSpendingLimit", createKey: k.toBase58(), vaultIndex: 0, mint: k2.toBase58(), amount: 9n, period: 2, members: [k.toBase58()], destinations: [k2.toBase58()] },
    ],
    [{ __kind: "RemoveSpendingLimit", spendingLimit: k }, { kind: "RemoveSpendingLimit", spendingLimit: k.toBase58() }],
    [{ __kind: "SetRentCollector", newRentCollector: k }, { kind: "SetRentCollector", rentCollector: k.toBase58() }],
    [{ __kind: "SetRentCollector", newRentCollector: null }, { kind: "SetRentCollector", rentCollector: null }],
  ];
  it.each(cases.map(([a, want]) => [a.__kind, a, want] as const))("%s", (_name, a, want) => {
    expect(plainConfigAction(a)).toEqual(want);
  });
  it("an unknown variant is kept by name", () => {
    expect(plainConfigAction({ __kind: "Future" } as unknown as multisig.generated.ConfigAction)).toEqual({ kind: "Unknown", name: "Future" });
  });
});

describe("proposal create carries the creator's approval only on localnet (NEW-R3-1)", () => {
  const disc = (d: ArrayLike<number>) => Buffer.from(d).toString("hex");
  const KINDS: Record<string, string> = {
    [disc(multisig.generated.vaultTransactionCreateInstructionDiscriminator)]: "vaultTransactionCreate",
    [disc(multisig.generated.proposalCreateInstructionDiscriminator)]: "proposalCreate",
    [disc(multisig.generated.proposalApproveInstructionDiscriminator)]: "proposalApprove",
  };
  /** `build`: NEXT_PUBLIC_CLUSTER at build time; `cluster`: the server env. Both must be localnet for the approval. */
  async function kinds(cluster: "localnet" | "devnet", build: "localnet" | "devnet" = cluster) {
    vi.stubEnv("NEXT_PUBLIC_CLUSTER", build);
    vi.resetModules();
    const fresh = await import("../server/squads");
    const ms = await import("@sqds/multisig");
    const web3 = await import("@solana/web3.js");
    vi.spyOn(ms.accounts.Multisig, "fromAccountAddress").mockResolvedValue({ transactionIndex: 3, members: [{ key: new web3.PublicKey(MEMBER) }] } as never);
    vi.spyOn(web3.Connection.prototype, "getLatestBlockhash").mockResolvedValue({ blockhash: PublicKey.unique().toBase58(), lastValidBlockHeight: 1 });
    const env = { cluster, rpcUrl: cluster === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com", squadsMultisig: MS, programId: MS } as unknown as ServerEnv;
    const { tx, index } = await fresh.composeProposalCreate(env, MEMBER, [], "memo");
    expect(index).toBe(4n);
    const msg = VersionedTransaction.deserialize(Buffer.from(tx, "base64")).message;
    return msg.compiledInstructions.map((ix) => KINDS[disc(ix.data.subarray(0, 8))] ?? "other");
  }
  it("devnet: create only, no proposal_approve", async () => {
    expect(await kinds("devnet")).toEqual(["vaultTransactionCreate", "proposalCreate"]);
  });
  it("localnet: create plus the creator's approval", async () => {
    expect(await kinds("localnet")).toEqual(["vaultTransactionCreate", "proposalCreate", "proposalApprove"]);
  });
  it("a localnet env on a devnet build: no approval (both must be localnet)", async () => {
    expect(await kinds("localnet", "devnet")).toEqual(["vaultTransactionCreate", "proposalCreate"]);
  });
  it("a devnet env on a localnet build: no approval", async () => {
    expect(await kinds("devnet", "localnet")).toEqual(["vaultTransactionCreate", "proposalCreate"]);
  });
});
