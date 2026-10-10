//! `advance_queue_heads(max)` (spec §5.8). Anyone. Moves no funds. Never
//! paused.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::QueueHeadsAdvanced,
    instructions::capital::{deposit_request_address, load_slot, redeem_request_address, Slot},
    state::{DepositRequest, RedeemRequest, VaultConfig, VaultState},
};

/// Remaining accounts: request PDAs from `redeem_head` (redeem queue) and
/// from `deposit_head` (deposit queue), at most `max`, each queue in `seq`
/// order. The two queues may be interleaved; each account is matched against
/// the next seq of either queue.
#[event_cpi]
#[derive(Accounts)]
pub struct AdvanceQueueHeads<'info> {
    #[account(constraint = config.is_supported() @ MutavError::UnsupportedVersion)]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,
}

pub fn handle_advance_queue_heads(ctx: Context<AdvanceQueueHeads>, max: u8) -> Result<()> {
    // Never paused; moves no funds.
    let config_key = ctx.accounts.config.key();
    let state = &ctx.accounts.state;
    let (redeem_next, deposit_next) = (state.next_redeem_seq, state.next_deposit_seq);
    let (mut redeem, mut deposit) = (state.redeem_head, state.deposit_head);
    // `true` once a queue reached a live request (never skipped) or its tail.
    let (mut redeem_done, mut deposit_done) = (redeem >= redeem_next, deposit >= deposit_next);
    let mut redeem_at = None;
    let mut deposit_at = None;

    for info in ctx.remaining_accounts.iter().take(max as usize) {
        if redeem_done && deposit_done {
            break;
        }
        if !redeem_done && redeem_at.is_none() {
            redeem_at = Some(redeem_request_address(&config_key, redeem));
        }
        if !deposit_done && deposit_at.is_none() {
            deposit_at = Some(deposit_request_address(&config_key, deposit));
        }

        if !redeem_done && redeem_at == Some(*info.key) {
            let dead = match load_slot::<RedeemRequest>(info, info.key)? {
                Slot::Closed => true,
                Slot::Open(r) => {
                    require!(r.is_supported(), MutavError::UnsupportedVersion);
                    require!(r.seq == redeem, MutavError::QueueOrderViolation);
                    r.status != REDEEM_PENDING
                }
            };
            if dead {
                redeem += 1;
                redeem_at = None;
                redeem_done = redeem >= redeem_next;
            } else {
                redeem_done = true;
            }
        } else if !deposit_done && deposit_at == Some(*info.key) {
            let dead = match load_slot::<DepositRequest>(info, info.key)? {
                Slot::Closed => true,
                Slot::Open(r) => {
                    require!(r.is_supported(), MutavError::UnsupportedVersion);
                    require!(r.seq == deposit, MutavError::QueueOrderViolation);
                    r.status == DEPOSIT_FULFILLED
                }
            };
            if dead {
                deposit += 1;
                deposit_at = None;
                deposit_done = deposit >= deposit_next;
            } else {
                deposit_done = true;
            }
        }
        // Any other account is not the next seq of either queue: ignored.
    }

    let state = &mut ctx.accounts.state;
    state.redeem_head = redeem;
    state.deposit_head = deposit;
    emit_cpi!(QueueHeadsAdvanced {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        redeem_head: redeem,
        deposit_head: deposit,
    });
    Ok(())
}
