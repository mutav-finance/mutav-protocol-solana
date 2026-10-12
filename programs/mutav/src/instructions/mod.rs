//! Instruction handlers, grouped by caller role.

pub mod admin;
pub mod capital;
pub mod operator;
pub mod public;
pub mod reserve;

pub use admin::*;
pub use capital::*;
pub use operator::*;
pub use public::*;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};

use crate::constants::AUTHORITY_SEED;

/// `transfer_checked` of `amount` out of a token account the vault authority
/// owns (`from`), signed by the vault authority PDA of `config` with its
/// stored bump. Each caller passes its own constraint-checked `from`, `mint`
/// and `to`; this only builds the CPI.
#[allow(clippy::too_many_arguments)]
pub(crate) fn vault_transfer<'info>(
    token_program: Pubkey,
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    config: &Pubkey,
    authority_bump: u8,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let authority_seeds: &[&[u8]] = &[AUTHORITY_SEED, config.as_ref(), &[authority_bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            token_program,
            TransferChecked {
                from,
                mint,
                to,
                authority: vault_authority,
            },
            &[authority_seeds],
        ),
        amount,
        decimals,
    )
}
