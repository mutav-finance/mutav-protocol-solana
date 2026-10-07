//! `fulfil_deposits(count)` (spec §5.5). Admin. Strict FIFO from
//! `deposit_head`, priced at the NAV at fulfil. Allowed in under-coverage: it
//! is the recapitalization path (ADR 0008).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::DepositsFulfilled,
    instructions::capital::{deposit_request_address, load_slot, store, Slot},
    instructions::operator::solvency_snapshot,
    math::{conversion_nav, shares_for},
    state::{DepositRequest, VaultConfig, VaultState},
};

/// Remaining accounts: the `DepositRequest` PDAs from `deposit_head`, in
/// `seq` order, writable.
#[event_cpi]
#[derive(Accounts)]
pub struct FulfilDeposits<'info> {
    pub admin: Signer<'info>,

    #[account(
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = admin.key() == config.admin @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,

    #[account(mut, seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()], bump)]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns both token accounts; signs the move.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidMint)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_fulfil_deposits(ctx: Context<FulfilDeposits>, count: u8) -> Result<()> {
    let config = &ctx.accounts.config;
    let state = &ctx.accounts.state;

    // Rules, in the spec's order. Under-coverage is allowed (ADR 0008).
    require!(!config.paused, MutavError::Paused);
    // TODO(plan: claim notices deferred) — no pilot instruction raises
    // `pending_notices` yet, so this gate always passes; it stays in place for
    // `flag_claim_notice`.
    require!(state.pending_notices == 0, MutavError::ClaimNoticePending);
    require!(!state.fulfil_halted, MutavError::FulfilHalted);
    let before = solvency_snapshot(config, state)?;

    let config_key = config.key();
    let now = Clock::get()?.unix_timestamp;
    let next_seq = state.next_deposit_seq;
    let mut seq = state.deposit_head;
    let mut shares_outstanding = state.shares_outstanding;
    let mut net_assets = before.net_assets;
    let (mut fills, mut total_assets, mut total_shares) = (0u8, 0u64, 0u64);
    let (mut from_seq, mut to_seq, mut batch_nav) = (0u64, 0u64, 0u64);

    for info in ctx.remaining_accounts.iter() {
        if seq >= next_seq || fills >= count {
            break;
        }
        let expected = deposit_request_address(&config_key, seq);
        if let Slot::Open(mut r) = load_slot::<DepositRequest>(info, &expected)? {
            require!(r.is_supported(), MutavError::UnsupportedVersion);
            require!(r.seq == seq, MutavError::QueueOrderViolation);
            if r.status == DEPOSIT_PENDING {
                // Priced at the NAV at fulfil, after the earlier fills.
                let nav = conversion_nav(shares_outstanding, net_assets)?;
                let shares = shares_for(r.assets, shares_outstanding, net_assets)?;
                r.shares_out = shares;
                r.nav_at_fulfil = nav;
                r.fulfilled_at = now;
                r.status = DEPOSIT_FULFILLED;
                store(info, &r)?;

                if fills == 0 {
                    from_seq = seq;
                    batch_nav = nav;
                }
                to_seq = seq;
                fills += 1;
                total_assets = total_assets
                    .checked_add(r.assets)
                    .ok_or(MutavError::MathOverflow)?;
                total_shares = total_shares
                    .checked_add(shares)
                    .ok_or(MutavError::MathOverflow)?;
                net_assets = net_assets
                    .checked_add(r.assets)
                    .ok_or(MutavError::MathOverflow)?;
                shares_outstanding = shares_outstanding
                    .checked_add(shares)
                    .ok_or(MutavError::MathOverflow)?;
            }
            // A fulfilled (unclaimed) request is dead for the queue.
        }
        // A closed seq passes the skip proof.
        seq += 1;
    }

    // TVL cap on the whole batch.
    let tvl_after = (before.stable_assets as u128) + (total_assets as u128);
    require!(
        tvl_after <= config.caps.max_tvl as u128,
        MutavError::TvlCapExceeded
    );

    if total_assets > 0 {
        require!(
            !ctx.accounts.pending_deposits.is_frozen() && !ctx.accounts.reserve.is_frozen(),
            MutavError::ReserveFrozen
        );
        let authority_seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            config_key.as_ref(),
            &[config.authority_bump],
        ];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.pending_deposits.to_account_info(),
                    mint: ctx.accounts.reserve_mint.to_account_info(),
                    to: ctx.accounts.reserve.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[authority_seeds],
            ),
            total_assets,
            ctx.accounts.reserve_mint.decimals,
        )?;
    }

    let state = &mut ctx.accounts.state;
    state.brs_balance = state
        .brs_balance
        .checked_add(total_assets)
        .ok_or(MutavError::MathOverflow)?;
    state.pending_deposits_total = state
        .pending_deposits_total
        .checked_sub(total_assets)
        .ok_or(MutavError::MathOverflow)?;
    state.shares_outstanding = shares_outstanding;
    state.deposit_head = seq;

    if fills > 0 {
        emit_cpi!(DepositsFulfilled {
            config: config_key,
            ts: now,
            from_seq,
            to_seq,
            assets: total_assets,
            shares: total_shares,
            nav: batch_nav,
        });
    }
    Ok(())
}
