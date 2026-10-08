/**
 * Mock chain for UI work: fictional accounts shaped exactly like the reads in
 * chain.ts, operator.ts, investor.ts and squads.ts, so every screen renders
 * without a validator. Dev only: `NEXT_PUBLIC_MOCK_CHAIN=1` under `next dev`;
 * a production build ignores the flag. Nothing here signs or sends, and the
 * transaction routes refuse while it is on.
 */
import { getAddressDecoder, getBase58Decoder, type Address } from "@solana/kit";
import {
  findReserveAddresses,
  NAV_SCALE,
  solvencyFromAccounts,
  type AdapterEntry,
  type VaultConfig,
  type VaultState,
} from "@mutav-finance/mutav-protocol-solana";
import { REF, sha256 } from "../refs";
import { fromHex } from "../serde";
import type { Ledger, ReserveView } from "../view";
import type { OperatorHistory } from "./operator";
import type { InvestorView } from "./investor";
import type { MultisigView, ProposalView } from "./squads";

export const mockEnabled = () => process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";

export class MockChainError extends Error {
  override name = "MockChainError";
  constructor() {
    super("Mock chain (NEXT_PUBLIC_MOCK_CHAIN=1): transactions are disabled; the data on screen is fictional");
  }
}

const BRL = 1_000_000n;
const DAY = 86_400n;
const ZERO = "11111111111111111111111111111111" as Address;
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const PROGRAM = "8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9" as Address;

const addressOf = async (label: string) => getAddressDecoder().decode(await sha256(`mock:${label}`)) as Address;
const signatureOf = async (label: string) => {
  const a = await sha256(`mock:sig:a:${label}`);
  const b = await sha256(`mock:sig:b:${label}`);
  return getBase58Decoder().decode(new Uint8Array([...a, ...b]));
};
const bytes = async (hex: Promise<string>) => fromHex(await hex);
const zeros = (n: number) => new Uint8Array(n);
const disc = zeros(8);

type Keys = Record<"mint" | "admin" | "operator" | "pauser" | "capital" | "treasury" | "payments" | "multisig" | "member2" | "member3", Address>;

let built: Promise<{ reserve: ReserveView; ledger: Ledger; keys: Keys }> | null = null;

/** The fictional reserve: R$50k from MUTAV's capital wallet, four leases at two agencies, fees, income and one paid claim. */
async function build() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const keys = Object.fromEntries(
    await Promise.all(
      (["mint", "admin", "operator", "pauser", "capital", "treasury", "payments", "multisig", "member2", "member3"] as const).map(async (k) => [k, await addressOf(k)]),
    ),
  ) as Keys;
  const addresses = await findReserveAddresses(keys.mint, { programAddress: PROGRAM });

  const agencyA = await bytes(REF.agencyId("IMOB-CENTRO"));
  const agencyB = await bytes(REF.agencyId("IMOB-JARDINS"));
  const lease = (id: string, agencyId: Uint8Array, rent: bigint, at: bigint, over: Partial<Record<string, unknown>> = {}) =>
    Promise.all([bytes(REF.guaranteeId(id)), bytes(REF.refsHash(id))]).then(([gid, refs]) => ({
      discriminator: disc,
      version: 1,
      bump: 255,
      id: gid,
      agencyId,
      refsHash: refs,
      rent: rent * BRL,
      defaultMultiplierBps: 30_000,
      exitMultiplierBps: 20_000,
      defaultCover: 3n * rent * BRL,
      exitCover: 2n * rent * BRL,
      defaultPaid: 0n,
      exitPaid: 0n,
      provisionDefault: 0n,
      provisionExit: 0n,
      openClaims: 0,
      status: 0,
      registeredAt: at,
      closedAt: 0n,
      reserved: zeros(64),
      ...over,
    }));
  const g = await Promise.all([
    lease("LEASE-2026-0001", agencyA, 2_500n, now - 60n * DAY, { defaultPaid: 2_500n * BRL }),
    lease("LEASE-2026-0002", agencyA, 3_200n, now - 45n * DAY, { provisionDefault: 3_200n * BRL, openClaims: 1 }),
    lease("LEASE-2026-0003", agencyB, 1_800n, now - 30n * DAY),
    lease("LEASE-2026-0004", agencyB, 2_000n, now - 90n * DAY, { status: 1, closedAt: now - 10n * DAY }),
  ]);
  const gAddr = await Promise.all(g.map((_, i) => addressOf(`guarantee:${i}`)));
  const remaining = (x: (typeof g)[number]) => (x.status === 0 ? x.defaultCover - x.defaultPaid + x.exitCover - x.exitPaid : 0n);
  const remainingCoverTotal = g.reduce((s, x) => s + remaining(x), 0n);
  const provisions = g.reduce((s, x) => s + x.provisionDefault + x.provisionExit, 0n);

  const fees = await Promise.all(
    (
      [
        ["INV-2026-0001", 4_000n, 40n],
        ["INV-2026-0002", 5_000n, 25n],
        ["INV-2026-0003", 3_500n, 5n],
      ] as const
    ).map(async ([inv, gross, ago], i) => ({
      address: await addressOf(`fee:${i}`),
      blockTime: now - ago * DAY,
      data: { discriminator: disc, version: 1, bump: 255, invoiceRefHash: await bytes(REF.invoice(inv)), gross: gross * BRL, take: (gross * BRL) / 5n, net: gross * BRL - (gross * BRL) / 5n, slot: 400_000_000n + BigInt(i) * 1_000n, reserved: zeros(32) },
    })),
  );
  const income = [
    {
      address: await addressOf("income:0"),
      blockTime: now - 8n * DAY,
      data: { discriminator: disc, version: 1, bump: 255, incomeRefHash: await bytes(REF.income("NORA-202609-01")), period: 202_609, gross: 1_200n * BRL, take: 0n, net: 1_200n * BRL, slot: 400_010_000n, reserved: zeros(32) },
    },
  ];
  const notice1 = await bytes(REF.notice("NOTICE-0001"));
  const notice2 = await bytes(REF.notice("NOTICE-0002"));
  const filings = [
    { address: await addressOf("filing:0"), data: { discriminator: disc, version: 1, bump: 255, guarantee: gAddr[0]!, leg: 0, noticeRefHash: notice1, provision: 2_500n * BRL, filedAt: now - 20n * DAY, status: 1, reserved: zeros(32) } },
    { address: await addressOf("filing:1"), data: { discriminator: disc, version: 1, bump: 255, guarantee: gAddr[1]!, leg: 0, noticeRefHash: notice2, provision: 3_200n * BRL, filedAt: now - 2n * DAY, status: 0, reserved: zeros(32) } },
  ];
  const payouts = [
    {
      address: await addressOf("payout:0"),
      data: {
        discriminator: disc, version: 1, bump: 255, guarantee: gAddr[0]!, leg: 0, amount: 2_500n * BRL, noticeRefHash: notice1, paymentsAccount: keys.payments,
        status: 1, paidAt: now - 19n * DAY, pixE2eHash: await bytes(REF.pixE2e("E1234567820261006120000demo0001")), settledAt: now - 18n * DAY, late: 0, reserved: zeros(32),
      },
    },
  ];
  const exposures = await Promise.all(
    ([[agencyA, [0, 1]], [agencyB, [2, 3]]] as const).map(async ([agencyId, idx], i) => ({
      address: await addressOf(`exposure:${i}`),
      data: {
        discriminator: disc, version: 1, bump: 255, agencyId,
        outstandingCover: idx.reduce((s, j) => s + remaining(g[j]!), 0n),
        activeGuarantees: idx.filter((j) => g[j]!.status === 0).length,
        claimsPaidTotal: idx.reduce((s, j) => s + g[j]!.defaultPaid + g[j]!.exitPaid, 0n),
        reserved: zeros(32),
      },
    })),
  );

  const deposited = 50_000n * BRL;
  const feesNet = fees.reduce((s, f) => s + f.data.net, 0n);
  const incomeNet = income.reduce((s, r) => s + r.data.net, 0n);
  const claimsPaid = payouts.reduce((s, p) => s + p.data.amount, 0n);
  const sharesOutstanding = deposited;

  const deposits = [
    {
      address: await addressOf("deposit:1"),
      data: { discriminator: disc, version: 1, bump: 255, owner: keys.capital, seq: 1n, assets: 10_000n * BRL, sharesOut: 0n, navAtFulfil: 0n, requestedAt: now - 1n * DAY, fulfilledAt: 0n, status: 0, reserved: zeros(32) },
    },
  ];
  const redeems = [
    {
      address: await addressOf("redeem:0"),
      data: {
        discriminator: disc, version: 1, bump: 255, owner: keys.capital, seq: 0n, sharesRequested: 5_000n * BRL, sharesRemaining: 5_000n * BRL, sharesFilled: 0n,
        assetsFilled: 0n, assetsClaimable: 0n, fillCount: 0, lastFillNav: 0n, requestedAt: now - 3n * DAY, lastFillAt: 0n, status: 0, reserved: zeros(32),
      },
    },
  ];

  const adapter = (): AdapterEntry => ({ programId: ZERO, subAuthority: ZERO, assetMint: ZERO, cap: 0n, allocated: 0n, enabled: false, reserved: zeros(40) }) as unknown as AdapterEntry;
  const config = {
    discriminator: disc,
    version: 1,
    bump: 255,
    authorityBump: 254,
    admin: keys.admin,
    operator: keys.operator,
    pauser: keys.pauser,
    reserveMint: keys.mint,
    reserveTokenProgram: TOKEN_PROGRAM,
    reserveDecimals: 6,
    shareMint: addresses.shareMint,
    coverageRatioBps: 1_000,
    feeTakeBps: 2_000,
    paymentsAccount: keys.payments,
    treasuryAccount: keys.treasury,
    investorAllowlistRoot: await sha256("mock:allowlist-root"),
    adapters: Array.from({ length: 8 }, () => adapter()),
    caps: {
      maxTvl: 300_000n * BRL,
      maxCoverPerGuarantee: 40_000n * BRL,
      maxCoverPerAgency: 10_000_000n * BRL,
      maxClaimPerCall: 10_000n * BRL,
      maxClaimPerPeriod: 20_000n * BRL,
      claimPeriodSecs: 30n * DAY,
      maxTesouroShareBps: 0,
      minRequest: 1_000n * BRL,
      maxRequest: 100_000n * BRL,
      minFillAssets: 500n * BRL,
      reserved: zeros(64),
    },
    price: { tesouroPriceAccount: ZERO, p0: 1_000_000_000n, t0: 0n, yMaxBps: 1_500, maxStalenessSecs: DAY, maxDeviationBps: 200, maxNavMoveBps: 10_000, reserved: zeros(32) },
    payoutSlaSecs: 2n * DAY,
    paused: false,
    featureFlags: 0n,
    mutavCapitalWallet: keys.capital,
    exit: {
      bufferTargetBps: 0, bufferHeadroomBps: 0, bufferReleaseAfterSecs: 0n, curveVersion: 0, hMinBps: 0, hPegBps: 0, hMaxBps: 0, pressureEpochSecs: 0n,
      minInstantAssets: 0n, maxInstantPerTx: 0n, maxInstantPerWallet: 0n, maxInstantPerPeriod: 0n, instantPeriodSecs: 0n, minHoldSecs: 0n, maxPriceAgeSecs: 0n,
      allowlistRoot: zeros(32), barred: Array.from({ length: 4 }, () => ZERO), reserved: zeros(32),
    },
    incomeTakeBps: 0,
    reserved: zeros(64),
  } as unknown as VaultConfig;

  const state = {
    discriminator: disc,
    version: 1,
    bump: 255,
    mode: 0,
    brsBalance: deposited + feesNet + incomeNet - claimsPaid,
    tesouroUnits: 0n,
    tesouroPrice: 1_000_000_000n,
    tesouroPriceTs: now - DAY,
    stableAssets: 0n,
    remainingCoverTotal,
    coverageRequired: 0n,
    provisions,
    sharesOutstanding,
    navPerShare: NAV_SCALE,
    pendingDepositsTotal: deposits.reduce((s, d) => s + d.data.assets, 0n),
    pendingRedeemShares: redeems.reduce((s, r) => s + r.data.sharesRemaining, 0n),
    claimableAssetsTotal: 0n,
    bufferEarmark: 0n,
    pendingNotices: filings.filter((f) => f.data.status === 0).length,
    activeGuarantees: g.filter((x) => x.status === 0).length,
    nextDepositSeq: 2n,
    depositHead: 1n,
    nextRedeemSeq: 1n,
    redeemHead: 0n,
    claimPeriodStart: now - 20n * DAY,
    claimPeriodPaid: claimsPaid,
    feesInTotal: fees.reduce((s, f) => s + f.data.gross, 0n),
    feeTakeTotal: fees.reduce((s, f) => s + f.data.take, 0n),
    claimsPaidTotal: claimsPaid,
    latePayouts: 0,
    fulfilHalted: false,
    lastRefreshTs: now - 3_600n,
    lastRefreshSlot: 400_020_000n,
    incomeTotal: incomeNet,
    incomeTakeTotal: 0n,
    inflowsSinceRefresh: 0n,
    reserved: zeros(128),
  } as unknown as VaultState;
  // Stored fields the program writes at refresh, recomputed with the client's math mirror.
  const s0 = solvencyFromAccounts(config, state);
  Object.assign(state, {
    stableAssets: s0.stableAssets,
    coverageRequired: s0.coverageRequired,
    navPerShare: (s0.netAssets * NAV_SCALE) / sharesOutstanding,
  });

  const reserve: ReserveView = {
    cluster: "localnet",
    programId: PROGRAM,
    explorerRpc: "http://127.0.0.1:8899",
    addresses,
    config,
    state,
    solvency: solvencyFromAccounts(config, state),
    now,
    slot: 400_020_500n,
    token: { mint: keys.mint, mintOwner: TOKEN_PROGRAM, freezeAuthority: null, supply: 1_000_000n * BRL, reserveFrozen: false },
    incomeInbox: { address: await addressOf("income-inbox"), exists: true, amount: 300n * BRL },
  };
  const ledger: Ledger = {
    capitalEvents: [
      { side: "deposit", signature: await signatureOf("fill:0"), ts: now - 59n * DAY, fromSeq: 0n, toSeq: 0n, assets: deposited, shares: deposited, nav: NAV_SCALE },
    ],
    guarantees: g.map((data, i) => ({ address: gAddr[i]!, data: data as never })),
    filings: filings as never,
    payouts: payouts as never,
    exposures: exposures as never,
    fees: fees as never,
    income: income as never,
    deposits: deposits as never,
    redeems: redeems as never,
  };
  return { reserve, ledger, keys };
}

const data = () => (built ??= build());

/** A fresh `now` on each read, so time-based labels (SLA, time lock) stay current. */
export async function mockReserve(): Promise<ReserveView> {
  const { reserve } = await data();
  return { ...reserve, now: BigInt(Math.floor(Date.now() / 1000)) };
}

export async function mockLedger(): Promise<{ reserve: ReserveView; ledger: Ledger }> {
  return { reserve: await mockReserve(), ledger: (await data()).ledger };
}

export async function mockOperator(): Promise<OperatorHistory> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const rows: [string, bigint][] = [
    ["file_claim", 2n * DAY],
    ["sweep_income", 8n * DAY],
    ["settle_payout", 18n * DAY],
    ["pay_claim", 19n * DAY],
    ["file_claim", 20n * DAY],
    ["contribute_fees", 25n * DAY],
    ["register_guarantee", 30n * DAY],
    ["contribute_fees", 40n * DAY],
  ];
  return {
    activity: await Promise.all(rows.map(async ([name, ago], i) => ({ signature: await signatureOf(`op:${i}`), blockTime: now - ago, ok: true, instructions: [name] }))),
    rolesChanged: { signature: await signatureOf("set_roles"), blockTime: now - 70n * DAY },
    rolesScanned: 42,
  };
}

/** With a wallet connected, it is shown as allowlisted and holding the capital wallet's position. */
export async function mockInvestor(owner: string | null): Promise<InvestorView> {
  const { reserve } = await data();
  const allowlist = { root: Buffer.from(reserve.config.investorAllowlistRoot).toString("hex"), listSize: 1 };
  if (!owner) return { owner: null, allowlist: { state: null, ...allowlist }, brs: { account: "", amount: null }, shares: { account: "", amount: null }, holderState: null };
  return {
    owner,
    allowlist: { state: "allowlisted", ...allowlist },
    brs: { account: await addressOf(`brs-ata:${owner}`), amount: 25_000n * BRL },
    shares: { account: await addressOf(`share-ata:${owner}`), amount: 45_000n * BRL },
    holderState: { address: await addressOf(`holder:${owner}`), lastSharesInTs: reserve.now - 59n * DAY },
  };
}

export async function mockSquads() {
  const { keys } = await data();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timeLock = 86_400;
  const p = async (index: bigint, status: ProposalView["status"], ago: bigint, approvals: Address[], instructions: string[]): Promise<ProposalView> => {
    const statusAt = now - ago;
    const executableAt = status === "Approved" ? statusAt + BigInt(timeLock) : null;
    return {
      index,
      transaction: await addressOf(`ms-tx:${index}`),
      proposal: await addressOf(`ms-prop:${index}`),
      status,
      statusAt,
      approvals,
      rejections: [],
      executable: executableAt !== null && now >= executableAt,
      executableAt,
      instructions,
    };
  };
  const multisig: MultisigView = {
    address: keys.multisig,
    vault: keys.admin,
    threshold: 2,
    timeLock,
    members: [
      { key: keys.member2, permissions: 7 },
      { key: keys.member3, permissions: 7 },
      { key: await addressOf("member1"), permissions: 7 },
    ],
    transactionIndex: 4n,
    staleTransactionIndex: 0n,
    proposals: [
      await p(4n, "Active", 3_600n, [keys.member2], ["set_config"]),
      await p(3n, "Approved", 2n * DAY, [keys.member2, keys.member3], ["fulfil_deposits"]),
      await p(2n, "Executed", 59n * DAY, [keys.member2, keys.member3], ["fulfil_deposits"]),
      await p(1n, "Executed", 70n * DAY, [keys.member2, keys.member3], ["set_allowlist_root"]),
    ],
  };
  return { configured: true, adminIsVault: true, multisig, now };
}
