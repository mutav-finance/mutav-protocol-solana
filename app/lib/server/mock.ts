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
  coverageFromAccounts,
  type VaultConfig,
  type VaultState,
} from "@mutav-finance/mutav-protocol-solana";
import { REF, refHex, sha256 } from "../refs";
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

/** The fictional reserve (ADR 0028 values): R$60k from MUTAV's capital wallet in two fills, five leases at two agencies, fees, income, one paid claim and one filed claim above the operator limit. */
async function build() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const keys = Object.fromEntries(
    await Promise.all(
      (["mint", "admin", "operator", "pauser", "capital", "treasury", "payments", "multisig", "member2", "member3"] as const).map(async (k) => [k, await addressOf(k)]),
    ),
  ) as Keys;
  const addresses = await findReserveAddresses(keys.mint, { programAddress: PROGRAM });

  // Opaque agency ids and a salted refs hash (ADR 0019 decision 8); no rent on-chain.
  const agencyA = await bytes(refHex("mock:agency:A"));
  const agencyB = await bytes(refHex("mock:agency:B"));
  const SALT = "6d6f636b";
  const lease = (id: string, agencyId: Uint8Array, rent: bigint, at: bigint, over: Partial<Record<string, unknown>> = {}) =>
    Promise.all([bytes(REF.guaranteeId(id)), bytes(REF.refsHash(id, SALT))]).then(([gid, refs]) => ({
      discriminator: disc,
      version: 1,
      bump: 255,
      id: gid,
      agencyId,
      refsHash: refs,
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
      closeReason: 0,
      reserved: zeros(64),
      ...over,
    }));
  const g = await Promise.all([
    lease("LEASE-2026-0001", agencyA, 2_500n, now - 60n * DAY, { defaultPaid: 2_500n * BRL }),
    lease("LEASE-2026-0002", agencyA, 3_200n, now - 45n * DAY, { provisionDefault: 3_200n * BRL, openClaims: 1 }),
    lease("LEASE-2026-0003", agencyB, 1_800n, now - 30n * DAY),
    lease("LEASE-2026-0004", agencyB, 2_000n, now - 90n * DAY, { status: 1, closedAt: now - 10n * DAY }),
    // A claim above `maxClaimPerCall`: it waits for the Reserve Admin's approve_claim.
    lease("LEASE-2026-0005", agencyB, 6_000n, now - 20n * DAY, { provisionDefault: 16_000n * BRL, openClaims: 1 }),
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
        // More dated fees across ~90 days, so the Overview history has a shape.
        ["INV-2026-0004", 2_800n, 82n],
        ["INV-2026-0005", 3_000n, 67n],
        ["INV-2026-0006", 4_500n, 52n],
        ["INV-2026-0007", 2_200n, 33n],
        ["INV-2026-0008", 3_800n, 14n],
      ] as const
    ).map(async ([inv, gross, ago], i) => ({
      address: await addressOf(`fee:${i}`),
      blockTime: now - ago * DAY,
      data: { discriminator: disc, version: 1, bump: 255, kind: 1, refHash: await bytes(REF.invoice(inv)), period: 0, gross: gross * BRL, take: (gross * BRL) / 5n, net: gross * BRL - (gross * BRL) / 5n, slot: 400_000_000n + BigInt(i) * 1_000n, reserved: zeros(32) },
    })),
  );
  const income = [
    {
      address: await addressOf("income:0"),
      blockTime: now - 8n * DAY,
      data: { discriminator: disc, version: 1, bump: 255, kind: 0, refHash: await bytes(REF.income("NORA-202609-01")), period: 202_609, gross: 1_200n * BRL, take: 0n, net: 1_200n * BRL, slot: 400_010_000n, reserved: zeros(32) },
    },
    {
      address: await addressOf("income:1"),
      blockTime: now - 38n * DAY,
      data: { discriminator: disc, version: 1, bump: 255, kind: 0, refHash: await bytes(REF.income("NORA-202608-01")), period: 202_608, gross: 900n * BRL, take: 0n, net: 900n * BRL, slot: 400_005_000n, reserved: zeros(32) },
    },
  ];
  const notice1 = await bytes(REF.notice("NOTICE-0001"));
  const notice2 = await bytes(REF.notice("NOTICE-0002"));
  const notice3 = await bytes(REF.notice("NOTICE-0003"));
  const unpaid = { paidAmount: 0n, paidAt: 0n, paymentsAccount: ZERO, pixE2eHash: zeros(32), settledAt: 0n, approvedAmount: 0n, revision: 0 };
  const filings = [
    {
      address: await addressOf("filing:0"),
      data: {
        discriminator: disc, version: 1, bump: 255, guarantee: gAddr[0]!, leg: 1, noticeRefHash: notice1, provision: 2_500n * BRL, filedAt: now - 20n * DAY, status: 3,
        paidAmount: 2_500n * BRL, paidAt: now - 19n * DAY, paymentsAccount: keys.payments, pixE2eHash: await bytes(REF.pixE2e("E1234567820261006120000demo0001")), settledAt: now - 18n * DAY,
        approvedAmount: 0n, revision: 0, reserved: zeros(32),
      },
    },
    { address: await addressOf("filing:1"), data: { discriminator: disc, version: 1, bump: 255, guarantee: gAddr[1]!, leg: 1, noticeRefHash: notice2, provision: 3_200n * BRL, filedAt: now - 2n * DAY, status: 0, ...unpaid, reserved: zeros(32) } },
    // Above the operator limit per payment (R$15k): not approved yet (approvedAmount 0).
    { address: await addressOf("filing:2"), data: { discriminator: disc, version: 1, bump: 255, guarantee: gAddr[4]!, leg: 1, noticeRefHash: notice3, provision: 16_000n * BRL, filedAt: now - 1n * DAY, status: 0, ...unpaid, reserved: zeros(32) } },
  ];

  const deposited = 50_000n * BRL;
  /** An earlier, smaller fill that opened the reserve before the main one. */
  const seedFill = 10_000n * BRL;
  const feesNet = fees.reduce((s, f) => s + f.data.net, 0n);
  const incomeNet = income.reduce((s, r) => s + r.data.net, 0n);
  const claimsPaid = filings.reduce((s, f) => s + f.data.paidAmount, 0n);
  const sharesOutstanding = deposited + seedFill;

  const deposits = [
    {
      address: await addressOf("deposit:1"),
      data: { discriminator: disc, version: 1, bump: 255, owner: keys.capital, seq: 2n, assets: 10_000n * BRL, sharesOut: 0n, navAtFulfil: 0n, requestedAt: now - 1n * DAY, fulfilledAt: 0n, status: 0, minSharesOut: 0n, reserved: zeros(32) },
    },
  ];
  const redeems = [
    {
      address: await addressOf("redeem:0"),
      data: {
        discriminator: disc, version: 1, bump: 255, owner: keys.capital, seq: 0n, shares: 5_000n * BRL, assetsOut: 0n, navAtFill: 0n,
        requestedAt: now - 3n * DAY, filledAt: 0n, status: 0, sharesFilled: 0n, minAssetsOut: 0n, reserved: zeros(32),
      },
    },
    {
      // Parked by the Reserve Admin (ADR 0030): out of the queue, the shares still owed to the owner.
      address: await addressOf("redeem:1"),
      data: {
        discriminator: disc, version: 1, bump: 255, owner: keys.capital, seq: 1n, shares: 2_000n * BRL, assetsOut: 0n, navAtFill: 0n,
        requestedAt: now - 2n * DAY, filledAt: 0n, status: 2, sharesFilled: 0n, minAssetsOut: 0n, reserved: zeros(32),
      },
    },
  ];

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
    coverageRatioBps: 2_500,
    feeTakeBps: 2_000,
    paymentsAccount: keys.payments,
    treasuryAccount: keys.treasury,
    investorAllowlistRoot: await sha256("mock:allowlist-root"),
    caps: {
      maxTvl: 1_000_000n * BRL,
      maxCoverPerGuarantee: 120_000n * BRL,
      maxClaimPerCall: 15_000n * BRL,
      maxClaimPerPeriod: 20_000n * BRL,
      minRequest: 1_000n * BRL,
      maxRequest: 100_000n * BRL,
      maxNavMoveBps: 10_000,
      stressBuffer: 19_000n * BRL,
      maxQueueWaitSecs: 0n,
      maxReinstateAge: 0n,
      reserved: zeros(32),
    },
    paused: false,
    featureFlags: 0n,
    mutavCapitalWallet: keys.capital,
    adapterCount: 0,
    adapterBitmap: 0,
    pendingAdmin: ZERO,
    pendingAdminExpiresAt: 0n,
    pendingOperator: ZERO,
    pendingOperatorExpiresAt: 0n,
    pendingPauser: ZERO,
    pendingPauserExpiresAt: 0n,
    guardians: [],
    disabledOps: 0,
    kycAttester: ZERO,
    attestationProgram: ZERO,
    requiredAttestationType: zeros(32),
    attesterEpoch: 0,
    reserved: zeros(64),
  } as unknown as VaultConfig;

  const brsBalance = deposited + seedFill + feesNet + incomeNet - claimsPaid;
  const state = {
    discriminator: disc,
    version: 1,
    bump: 255,
    mode: 0,
    brsBalance,
    remainingCoverTotal,
    coverageRequired: 0n,
    provisions,
    sharesOutstanding,
    navPerShare: NAV_SCALE,
    pendingDepositsTotal: deposits.reduce((s, d) => s + d.data.assets, 0n),
    pendingRedeemShares: redeems.reduce((s, r) => s + r.data.shares, 0n),
    claimableAssetsTotal: 0n,
    activeGuarantees: g.filter((x) => x.status === 0).length,
    nextDepositSeq: 3n,
    depositHead: 2n,
    nextRedeemSeq: 2n,
    redeemHead: 0n,
    feesInTotal: fees.reduce((s, f) => s + f.data.gross, 0n),
    feeTakeTotal: fees.reduce((s, f) => s + f.data.take, 0n),
    claimsPaidTotal: claimsPaid,
    fulfilHalted: false,
    lastRefreshTs: now - 3_600n,
    lastRefreshSlot: 400_020_000n,
    incomeTotal: incomeNet,
    // Refresh folds verified inflows into the published NAV and resets this.
    inflowNav: 0n,
    // The one paid claim, in its UTC-day bucket (day % 31) of the 31-day window.
    claimDayBuckets: Array.from({ length: 31 }, (_, i) => (BigInt(i) === ((now - 19n * DAY) / DAY) % 31n ? claimsPaid : 0n)),
    claimDayAnchor: (now - 19n * DAY) / DAY,
    depositedAssetsTotal: deposited + seedFill,
    mintedSharesTotal: sharesOutstanding,
    redeemedSharesTotal: 0n,
    redeemedAssetsTotal: 0n,
    reserved: zeros(64),
  } as unknown as VaultState;
  // Stored fields the program writes at refresh, recomputed with the client's math mirror.
  const s0 = coverageFromAccounts(config, state);
  Object.assign(state, {
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
    coverage: coverageFromAccounts(config, state),
    now,
    slot: 400_020_500n,
    token: { mint: keys.mint, mintOwner: TOKEN_PROGRAM, freezeAuthority: null, supply: 1_000_000n * BRL, reserveFrozen: false },
    incomeInbox: { address: await addressOf("income-inbox"), exists: true, amount: 300n * BRL },
  };
  const ledger: Ledger = {
    capitalEvents: [
      { side: "deposit", signature: await signatureOf("fill:0"), ts: now - 59n * DAY, fromSeq: 1n, toSeq: 1n, assets: deposited, shares: deposited, nav: NAV_SCALE },
      { side: "deposit", signature: await signatureOf("fill:seed"), ts: now - 88n * DAY, fromSeq: 0n, toSeq: 0n, assets: seedFill, shares: seedFill, nav: NAV_SCALE },
    ],
    guarantees: g.map((data, i) => ({ address: gAddr[i]!, data: data as never })),
    filings: filings as never,
    fees: fees as never,
    income: income as never,
    deposits: deposits as never,
    redeems: redeems as never,
  };
  return { reserve, ledger, keys };
}

const data = () => (built ??= build());

/** A fresh `now` on each read, so time-based labels (ages, time lock) stay current. */
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
  const root = Buffer.from(reserve.config.investorAllowlistRoot).toString("hex");
  const allowlist = { root, listSize: 1, owners: [reserve.config.mutavCapitalWallet], listRoot: root };
  if (!owner) return { owner: null, allowlist: { state: null, ...allowlist }, brs: { account: "", amount: null }, shares: { account: "", amount: null } };
  return {
    owner,
    allowlist: { state: "allowlisted", ...allowlist },
    brs: { account: await addressOf(`brs-ata:${owner}`), amount: 25_000n * BRL },
    // Every share outstanding, less those escrowed in redeem requests (pending or parked).
    shares: { account: await addressOf(`share-ata:${owner}`), amount: reserve.state.sharesOutstanding - reserve.state.pendingRedeemShares },
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
      cancellations: [],
      stale: false,
      executable: executableAt !== null && now >= executableAt,
      executableAt,
      instructions,
      decoded: [],
      foreign: [],
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
