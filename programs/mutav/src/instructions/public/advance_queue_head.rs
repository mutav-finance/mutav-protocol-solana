//! `advance_queue_head(queue, max)` (spec §5.8; ADR 0026). Anyone. Moves no
//! funds. Never paused.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::QueueHeadsAdvanced,
    instructions::capital::{deposit_request_address, load_slot, redeem_request_address, Slot},
    state::{DepositRequest, RedeemRequest, VaultConfig, VaultState},
};

/// Remaining accounts: request PDAs of `queue` (`QUEUE_DEPOSIT` or
/// `QUEUE_REDEEM`) from its head, in `seq` order, at most `max` read. An
/// account that is not the queue's next seq is ignored: the crank moves no
/// funds, so a wrong list only wastes the caller's fee.
#[event_cpi]
#[derive(Accounts)]
pub struct AdvanceQueueHead<'info> {
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

/// Moves the head of `queue` over dead seqs (the spec §5.8 skip proof): a
/// closed request, a filled redemption or a fulfilled deposit. It stops at
/// the first live request, which is never skipped, or at the tail. An
/// unknown `queue` is `InvalidParameter`.
pub fn handle_advance_queue_head(ctx: Context<AdvanceQueueHead>, queue: u8, max: u8) -> Result<()> {
    let config_key = ctx.accounts.config.key();
    let state = &ctx.accounts.state;
    let (mut head, next) = match queue {
        QUEUE_DEPOSIT => (state.deposit_head, state.next_deposit_seq),
        QUEUE_REDEEM => (state.redeem_head, state.next_redeem_seq),
        _ => return err!(MutavError::InvalidParameter),
    };
    let address = |seq| match queue {
        QUEUE_DEPOSIT => deposit_request_address(&config_key, seq),
        _ => redeem_request_address(&config_key, seq),
    };

    let mut at = address(head);
    for info in ctx.remaining_accounts.iter().take(max as usize) {
        if head >= next {
            break;
        }
        if *info.key != at {
            continue;
        }
        let dead = match queue {
            QUEUE_DEPOSIT => match load_slot::<DepositRequest>(info, &at)? {
                Slot::Closed => true,
                Slot::Open(r) => {
                    require!(r.is_supported(), MutavError::UnsupportedVersion);
                    require!(r.seq == head, MutavError::QueueOrderViolation);
                    r.status == DEPOSIT_FULFILLED
                }
            },
            _ => match load_slot::<RedeemRequest>(info, &at)? {
                Slot::Closed => true,
                Slot::Open(r) => {
                    require!(r.is_supported(), MutavError::UnsupportedVersion);
                    require!(r.seq == head, MutavError::QueueOrderViolation);
                    r.status != REDEEM_PENDING
                }
            },
        };
        if !dead {
            break;
        }
        head += 1;
        at = address(head);
    }

    let state = &mut ctx.accounts.state;
    match queue {
        QUEUE_DEPOSIT => state.deposit_head = head,
        _ => state.redeem_head = head,
    }
    emit_cpi!(QueueHeadsAdvanced {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        redeem_head: state.redeem_head,
        deposit_head: state.deposit_head,
    });
    Ok(())
}
