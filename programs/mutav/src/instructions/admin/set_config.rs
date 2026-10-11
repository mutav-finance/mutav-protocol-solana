//! `set_config(params)` (spec §5.1, §14.3; ADR 0026): a sparse update.
//!
//! Each `ConfigParam` sets one field. The params are applied in place, then
//! the **whole** resulting config is validated (`validate_config` and the
//! money-account rules), so a cross-field rule such as
//! `max_claim_per_period ≥ max_claim_per_call` holds whichever fields a
//! proposal touches. A refusal reverts every param of the call.
//!
//! A change of a field that moves the solvency figures or the NAV-move
//! guard (`coverage_ratio_bps`, `max_nav_move_bps`, `stress_buffer`) needs a
//! `refresh` in the same slot first (`RefreshRequired`): `/admin` puts the
//! `refresh` in the same transaction, so the change applies to the state
//! the admin saw and the guard's baseline is current.
//!
//! Also recomputes the cached `VaultState.coverage_required` when the
//! coverage ratio `c` changes (#29), so readers of the cache see the new `c`
//! at once. `mode` stays `refresh`'s: it needs the bounded price and emits
//! `ModeChanged`. Every gate recomputes both, so neither cache is a safety
//! input.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{field, CONFIG_SEED, MAX_CONFIG_PARAMS, STATE_SEED},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges},
    instructions::admin::{validate_config, validate_money_accounts, vault_authority_key},
    solvency::coverage_required,
    state::{VaultConfig, VaultState},
};

/// One settable `VaultConfig` field and its new value (ADR 0026).
///
/// **Append-only.** Borsh encodes an enum by its variant index, so a variant
/// is never removed, reordered or given a different payload; a field added
/// later gets a new variant at the end (CI `idl-compat`, spec §14.4).
///
/// Not here, by design: the payments and treasury accounts
/// (`set_payments_account`, `set_treasury_account`, which inspect the token
/// account), the allowlist root (`set_allowlist_root`), roles and guardians
/// (the role instructions, ADR 0020), the pause flag (`pause` / `unpause`),
/// and the fields fixed at `initialize` (the mints, token program, decimals).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConfigParam {
    CoverageRatioBps(u16),
    FeeTakeBps(u16),
    FeatureFlags(u64),
    MutavCapitalWallet(Pubkey),
    MaxTvl(u64),
    MaxCoverPerGuarantee(u64),
    MaxClaimPerCall(u64),
    MaxClaimPerPeriod(u64),
    MinRequest(u64),
    MaxRequest(u64),
    MaxNavMoveBps(u16),
    StressBuffer(u64),
    MaxQueueWaitSecs(i64),
    MaxReinstateAge(i64),
}

impl ConfigParam {
    /// The `ConfigUpdated` field id of the field this param sets.
    pub fn field(&self) -> u16 {
        use ConfigParam::*;
        match self {
            CoverageRatioBps(_) => field::COVERAGE_RATIO_BPS,
            FeeTakeBps(_) => field::FEE_TAKE_BPS,
            FeatureFlags(_) => field::FEATURE_FLAGS,
            MutavCapitalWallet(_) => field::MUTAV_CAPITAL_WALLET,
            MaxTvl(_) => field::CAPS_MAX_TVL,
            MaxCoverPerGuarantee(_) => field::CAPS_MAX_COVER_PER_GUARANTEE,
            MaxClaimPerCall(_) => field::CAPS_MAX_CLAIM_PER_CALL,
            MaxClaimPerPeriod(_) => field::CAPS_MAX_CLAIM_PER_PERIOD,
            MinRequest(_) => field::CAPS_MIN_REQUEST,
            MaxRequest(_) => field::CAPS_MAX_REQUEST,
            MaxNavMoveBps(_) => field::MAX_NAV_MOVE_BPS,
            StressBuffer(_) => field::CAPS_STRESS_BUFFER,
            MaxQueueWaitSecs(_) => field::CAPS_MAX_QUEUE_WAIT_SECS,
            MaxReinstateAge(_) => field::CAPS_MAX_REINSTATE_AGE,
        }
    }

    /// Writes the value into `c`, recording a change in `ch` if it differs.
    pub fn apply(&self, c: &mut VaultConfig, ch: &mut ConfigChanges) {
        use ConfigParam::*;
        let id = self.field();
        let k = &mut c.caps;
        match *self {
            CoverageRatioBps(v) => ch.set(id, &mut c.coverage_ratio_bps, v),
            FeeTakeBps(v) => ch.set(id, &mut c.fee_take_bps, v),
            FeatureFlags(v) => ch.set(id, &mut c.feature_flags, v),
            MutavCapitalWallet(v) => ch.set(id, &mut c.mutav_capital_wallet, v),
            MaxTvl(v) => ch.set(id, &mut k.max_tvl, v),
            MaxCoverPerGuarantee(v) => ch.set(id, &mut k.max_cover_per_guarantee, v),
            MaxClaimPerCall(v) => ch.set(id, &mut k.max_claim_per_call, v),
            MaxClaimPerPeriod(v) => ch.set(id, &mut k.max_claim_per_period, v),
            MinRequest(v) => ch.set(id, &mut k.min_request, v),
            MaxRequest(v) => ch.set(id, &mut k.max_request, v),
            MaxNavMoveBps(v) => ch.set(id, &mut k.max_nav_move_bps, v),
            StressBuffer(v) => ch.set(id, &mut k.stress_buffer, v),
            MaxQueueWaitSecs(v) => ch.set(id, &mut k.max_queue_wait_secs, v),
            MaxReinstateAge(v) => ch.set(id, &mut k.max_reinstate_age, v),
        }
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct SetConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    /// Its cached `coverage_required` follows a change of `c`.
    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,

    /// The current treasury token account, to check the money flows of the
    /// resulting config (spec §2.1).
    #[account(address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The current payments token account, likewise.
    #[account(address = config.payments_account @ MutavError::InvalidPaymentsAccount)]
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,
}

/// Fields whose change needs a `refresh` in the same slot.
const NEEDS_REFRESH: [u16; 3] = [
    field::COVERAGE_RATIO_BPS,
    field::MAX_NAV_MOVE_BPS,
    field::CAPS_STRESS_BUFFER,
];

pub fn handle_set_config(ctx: Context<SetConfig>, params: Vec<ConfigParam>) -> Result<()> {
    require!(
        !params.is_empty() && params.len() <= MAX_CONFIG_PARAMS,
        MutavError::InvalidParameter
    );
    for (i, p) in params.iter().enumerate() {
        require!(
            params[..i].iter().all(|q| q.field() != p.field()),
            MutavError::DuplicateParam
        );
    }

    // Apply, then validate the whole result. Each field is set at most once,
    // so `ch` holds one entry per changed field and none for an unchanged
    // value.
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    for p in &params {
        p.apply(config, &mut ch);
    }
    validate_config(config)?;
    if ch.0.iter().any(|(id, _, _)| NEEDS_REFRESH.contains(id)) {
        require!(
            ctx.accounts.state.last_refresh_slot == Clock::get()?.slot,
            MutavError::RefreshRequired
        );
    }
    let vault_authority = vault_authority_key(&config.key(), config.authority_bump)?;
    validate_money_accounts(
        &config.reserve_mint,
        &ctx.accounts.treasury_account,
        &ctx.accounts.payments_account,
        &config.mutav_capital_wallet,
        &vault_authority,
        &config.operator,
    )?;
    // `VaultState.fulfil_halted` is cleared by `clear_fulfil_halt`, not here
    // (ADR 0015).

    // The cached `coverage_required` (spec §3.2) with the new `c`, as
    // `register_guarantee`, `file_claim`, `pay_claim` and `close_guarantee`
    // keep it. `mode` is left to `refresh` (see the module doc).
    let c = config.coverage_ratio_bps;
    let state = &mut ctx.accounts.state;
    state.coverage_required = coverage_required(state.remaining_cover_total, c, state.provisions)?;

    let config_key = ctx.accounts.config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::CONFIG_FIELDS;

    fn every_variant() -> Vec<ConfigParam> {
        use ConfigParam::*;
        vec![
            CoverageRatioBps(1),
            FeeTakeBps(2),
            FeatureFlags(3),
            MutavCapitalWallet(Pubkey::new_unique()),
            MaxTvl(5),
            MaxCoverPerGuarantee(6),
            MaxClaimPerCall(7),
            MaxClaimPerPeriod(8),
            MinRequest(9),
            MaxRequest(10),
            MaxNavMoveBps(11),
            StressBuffer(12),
            MaxQueueWaitSecs(13),
            MaxReinstateAge(14),
        ]
    }

    #[test]
    fn variant_indexes_are_append_only() {
        // Borsh tags: a reorder or removal breaks every stored proposal and
        // client. Pin each variant's tag to its field.
        let expect = [
            field::COVERAGE_RATIO_BPS,
            field::FEE_TAKE_BPS,
            field::FEATURE_FLAGS,
            field::MUTAV_CAPITAL_WALLET,
            field::CAPS_MAX_TVL,
            field::CAPS_MAX_COVER_PER_GUARANTEE,
            field::CAPS_MAX_CLAIM_PER_CALL,
            field::CAPS_MAX_CLAIM_PER_PERIOD,
            field::CAPS_MIN_REQUEST,
            field::CAPS_MAX_REQUEST,
            field::MAX_NAV_MOVE_BPS,
            field::CAPS_STRESS_BUFFER,
            field::CAPS_MAX_QUEUE_WAIT_SECS,
            field::CAPS_MAX_REINSTATE_AGE,
        ];
        for (tag, (p, id)) in every_variant().iter().zip(expect).enumerate() {
            let mut bytes = vec![];
            p.serialize(&mut bytes).unwrap();
            assert_eq!(bytes[0] as usize, tag, "{p:?}");
            assert_eq!(p.field(), id, "{p:?}");
        }
    }

    #[test]
    fn every_param_maps_to_a_mutable_field() {
        let vs = every_variant();
        assert!(vs.len() <= MAX_CONFIG_PARAMS);
        for (i, p) in vs.iter().enumerate() {
            let row = CONFIG_FIELDS.iter().find(|r| r.id == p.field()).unwrap();
            assert!(row.mutable, "{}", row.name);
            assert!(vs[..i].iter().all(|q| q.field() != p.field()));
        }
    }
}
