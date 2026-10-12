import type { VaultConfig, VaultState } from "@mutav-finance/mutav-protocol-solana";

export const BRL = 1_000_000n;

/** A pilot-shaped config: c = 100%, 20% take, devnet example caps. */
export function config(over: Partial<VaultConfig> = {}): VaultConfig {
  return {
    paused: false,
    coverageRatioBps: 10_000,
    feeTakeBps: 2_000,
    featureFlags: 0n,
    caps: {
      maxTvl: 100_000n * BRL,
      maxCoverPerGuarantee: 30_000n * BRL,
      maxClaimPerCall: 10_000n * BRL,
      maxClaimPerPeriod: 20_000n * BRL,
      minRequest: 1_000n * BRL,
      maxRequest: 30_000n * BRL,
      maxNavMoveBps: 10_000,
      stressBuffer: 0n,
      maxQueueWaitSecs: 0n,
      maxReinstateAge: 0n,
      reserved: new Uint8Array(32),
    },
    ...over,
  } as unknown as VaultConfig;
}

export function state(over: Partial<VaultState> = {}): VaultState {
  return {
    mode: 0,
    brsBalance: 0n,
    remainingCoverTotal: 0n,
    provisions: 0n,
    sharesOutstanding: 0n,
    feesInTotal: 0n,
    feeTakeTotal: 0n,
    claimsPaidTotal: 0n,
    depositHead: 0n,
    redeemHead: 0n,
    claimDayBuckets: Array(31).fill(0n),
    claimDayAnchor: 0n,
    ...over,
  } as unknown as VaultState;
}
