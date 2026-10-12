//! `VaultState` (spec §3.2): the reserve's internal accounting.

use anchor_lang::prelude::*;

use crate::constants::{
    CLAIM_WINDOW_DAYS, MODE_NORMAL, MODE_UNDER_COVERED, PROGRAM_LAYOUT_VERSION, VAULT_STATE_SIZE,
};

/// Seeds: `["state", config]`. Written by every state-changing instruction;
/// recomputed by `refresh`. Starts empty (all zero) at `initialize`.
#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub version: u8,
    pub bump: u8,
    /// `MODE_NORMAL` / `MODE_UNDER_COVERED`.
    pub mode: u8,
    /// Tracked BRS in `reserve` (internal accounting). The reserve's stable
    /// assets: the pilot holds BRS only (ADR 0018).
    pub brs_balance: u64,
    pub remaining_cover_total: u64,
    pub coverage_required: u64,
    pub provisions: u64,
    pub shares_outstanding: u64,
    /// Last published NAV per share (`NAV_SCALE`).
    pub nav_per_share: u64,
    pub pending_deposits_total: u64,
    pub pending_redeem_shares: u64,
    pub claimable_assets_total: u64,
    pub active_guarantees: u32,
    pub next_deposit_seq: u64,
    pub deposit_head: u64,
    pub next_redeem_seq: u64,
    pub redeem_head: u64,
    pub fees_in_total: u64,
    pub fee_take_total: u64,
    pub claims_paid_total: u64,
    pub fulfil_halted: bool,
    pub last_refresh_ts: i64,
    pub last_refresh_slot: u64,
    /// Lifetime issuer income swept into `reserve` (`sweep_income`).
    pub income_total: u64,
    /// NAV per share (`NAV_SCALE`) added by verified inflows
    /// (`contribute_fees`, `sweep_income`) since the last `refresh`: the sum
    /// of `ceil(net × NAV_SCALE / shares_outstanding)` at each inflow
    /// (`pricing::inflow_nav`; `0` while no shares are outstanding),
    /// saturating. Per share, so fills in the window leave it exact. The
    /// NAV-move guard measures net of it; `refresh` and `clear_fulfil_halt`
    /// reset it to 0.
    pub inflow_nav: u64,
    /// Claim payments per UTC day over the last `CLAIM_WINDOW_DAYS`, a ring
    /// indexed by `day % CLAIM_WINDOW_DAYS` (ADR 0019).
    pub claim_day_buckets: [u64; CLAIM_WINDOW_DAYS],
    /// The day (`unix_ts / 86_400`) the ring was last rolled to. `0` = never.
    pub claim_day_anchor: i64,
    // -- Lifetime capital counters (ADR 0019 carve, written from the first
    // fill). Monotonic; for the transparency page and reconciliation. --
    /// BRS moved into `reserve` by deposit fills.
    pub deposited_assets_total: u64,
    /// Shares created by deposit fills.
    pub minted_shares_total: u64,
    /// Shares burned by redemption fills.
    pub redeemed_shares_total: u64,
    /// BRS moved to `claims` by redemption fills.
    pub redeemed_assets_total: u64,
    /// Zeroed. Holds the planned carves (phase-2 `InstantExitState` 88 bytes
    /// and the buffer earmark, the claim-notice counter, the ADR 0012
    /// counters) without a migration (spec §14.2, ADR 0019).
    pub _reserved: [u8; 224],
}

const _: () = assert!(8 + VaultState::INIT_SPACE == VAULT_STATE_SIZE);

impl VaultState {
    /// Version guard (spec §14.2 R1b): a layout version this binary
    /// understands and a known `mode`. Instructions that read `VaultState`
    /// refuse anything else with `UnsupportedVersion`.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.mode, MODE_NORMAL | MODE_UNDER_COVERED)
    }

    /// Moves the claim window to `day` (ADR 0019): the buckets of the days
    /// that left the window are cleared. A `day` before the anchor (a clock
    /// step back) keeps the anchor, so a bucket is never reused early.
    /// Returns the effective day, `max(day, anchor)`: the day whose bucket a
    /// payment made now must be written to.
    pub fn roll_claim_window(&mut self, day: i64) -> i64 {
        let day = day.max(self.claim_day_anchor);
        let gap = day - self.claim_day_anchor;
        if gap >= CLAIM_WINDOW_DAYS as i64 {
            self.claim_day_buckets = [0; CLAIM_WINDOW_DAYS];
        } else {
            for d in (self.claim_day_anchor + 1)..=day {
                self.claim_day_buckets[d.rem_euclid(CLAIM_WINDOW_DAYS as i64) as usize] = 0;
            }
        }
        self.claim_day_anchor = day;
        day
    }

    /// Claim payments in the window, after `roll_claim_window`.
    pub fn claim_window_paid(&self) -> u128 {
        self.claim_day_buckets.iter().map(|b| *b as u128).sum()
    }

    /// The bucket of `day`: the effective day `roll_claim_window` returned.
    pub fn claim_bucket_mut(&mut self, day: i64) -> &mut u64 {
        &mut self.claim_day_buckets[day.rem_euclid(CLAIM_WINDOW_DAYS as i64) as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zeroed() -> VaultState {
        let bytes = vec![0u8; VaultState::INIT_SPACE];
        VaultState::deserialize(&mut bytes.as_slice()).unwrap()
    }

    #[test]
    fn the_claim_window_keeps_exactly_31_days() {
        let mut s = zeroed();
        let d0 = 20_000;
        s.roll_claim_window(d0);
        *s.claim_bucket_mut(d0) += 5;
        // Day 30 after d0 is still inside the 31-day window.
        s.roll_claim_window(d0 + 30);
        assert_eq!(s.claim_window_paid(), 5);
        *s.claim_bucket_mut(d0 + 30) += 7;
        // Day 31: d0 leaves the window, d0 + 30 stays.
        s.roll_claim_window(d0 + 31);
        assert_eq!(s.claim_window_paid(), 7);
        // A clock step back keeps the anchor.
        s.roll_claim_window(d0);
        assert_eq!((s.claim_day_anchor, s.claim_window_paid()), (d0 + 31, 7));
        // A long gap clears everything.
        s.roll_claim_window(d0 + 1_000);
        assert_eq!(s.claim_window_paid(), 0);
    }

    #[test]
    fn a_payment_after_a_clock_step_back_sits_in_the_anchor_bucket() {
        // Roll to d, then pay with the clock at d − 1: the payment counts on
        // day d, and leaves the window on day d + 31.
        let mut s = zeroed();
        let d = 20_000;
        assert_eq!(s.roll_claim_window(d), d);
        let e = s.roll_claim_window(d - 1);
        assert_eq!(e, d);
        *s.claim_bucket_mut(e) += 9;
        assert_eq!(s.claim_day_buckets[(d % 31) as usize], 9);
        assert_eq!(s.roll_claim_window(d + 30), d + 30);
        assert_eq!(s.claim_window_paid(), 9);
        s.roll_claim_window(d + 31);
        assert_eq!(s.claim_window_paid(), 0);
    }

    proptest::proptest! {
        #![proptest_config(proptest::prelude::ProptestConfig {
            cases: 256,
            failure_persistence: None,
            ..proptest::prelude::ProptestConfig::default()
        })]

        /// The ring of 31 daily buckets equals a naive oracle that keeps every
        /// `(day, amount)` payment and sums those of the last 31 days (the
        /// effective day and the 30 before it), including gaps of 31 days or
        /// more and clock steps back (ADR 0019).
        #[test]
        fn the_ring_matches_a_naive_oracle(
            steps in proptest::collection::vec((-40i64..=80, 0u64..=1_000_000), 1..64),
        ) {
            let mut s = zeroed();
            let mut oracle: Vec<(i64, u64)> = Vec::new();
            let mut day = 20_000i64;
            for (delta, amount) in steps {
                day += delta;
                let e = s.roll_claim_window(day);
                let expected: u128 = oracle
                    .iter()
                    .filter(|(d, _)| *d > e - CLAIM_WINDOW_DAYS as i64)
                    .map(|(_, a)| *a as u128)
                    .sum();
                proptest::prop_assert_eq!(s.claim_window_paid(), expected);
                *s.claim_bucket_mut(e) += amount;
                oracle.push((e, amount));
            }
        }
    }

    #[test]
    fn version_and_mode_guard() {
        let mut s = zeroed();
        s.version = PROGRAM_LAYOUT_VERSION;
        assert!(s.is_supported());
        s.mode = MODE_UNDER_COVERED;
        assert!(s.is_supported());
        s.mode = MODE_UNDER_COVERED + 1;
        assert!(!s.is_supported(), "unknown mode");
        s.mode = u8::MAX;
        assert!(!s.is_supported(), "unknown mode");
        s.mode = MODE_NORMAL;
        s.version = PROGRAM_LAYOUT_VERSION + 1;
        assert!(!s.is_supported(), "newer layout");
    }
}
