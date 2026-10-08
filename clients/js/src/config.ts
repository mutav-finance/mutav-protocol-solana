/**
 * Config helpers for the settlement floor (ADR 0018, option (a)).
 *
 * The program stores the complement of the floor, `caps.maxAllocatedBps`
 * (the most of stable assets all adapters together may hold outside the
 * settlement token), so a zeroed field is the pilot's "nothing allocated".
 * Every instruction argument (`CapsInput.minSettlementBps`), event
 * (`ConfigUpdated` field 106) and screen speaks the floor itself:
 * `minSettlementBps = 10_000 − maxAllocatedBps`. Pure functions; nothing
 * here signs.
 */
import type { Caps, CapsInput, VaultConfig } from './generated';

const BPS = 10_000;

/**
 * The settlement floor of a reserve: the minimum share of stable assets held
 * in `reserve_mint`, in bps. `10_000` in the pilot (BRS only).
 */
export function minSettlementBps(config: Pick<VaultConfig, 'caps'>): number {
  return Math.max(0, BPS - config.caps.maxAllocatedBps);
}

/**
 * The `CapsInput` that reproduces `caps` as stored, with `overrides` on top:
 * the request shape `initialize` / `set_config` take. Converts the stored
 * complement back to `minSettlementBps`, so spreading a read config into a
 * request never sends the wrong field.
 */
export function capsInputFromConfig(caps: Caps, overrides: Partial<CapsInput> = {}): CapsInput {
  const { reserved: _reserved, maxAllocatedBps: _stored, ...rest } = caps;
  void _reserved;
  void _stored;
  return { ...rest, minSettlementBps: minSettlementBps({ caps }), ...overrides };
}
