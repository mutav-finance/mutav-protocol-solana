//! Token safety checks. Every check fails closed.
//!
//! The mint guard is adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/utils.rs`, `validate_asset_mint_extensions_from_acct_info`,
//! commit c359962), MIT License, Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: rejects every extension listed in spec §5.1 (PC-19), and a transfer
//! fee in either the older or the newer epoch configuration.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        default_account_state::DefaultAccountState, transfer_fee::TransferFeeConfig,
        BaseStateWithExtensions, ExtensionType, StateWithExtensions,
    },
    state::{AccountState, Mint},
};

use crate::errors::MutavError;

/// Rejects a Token-2022 reserve mint with `PermanentDelegate`, `TransferHook`,
/// a non-zero `TransferFee`, `NonTransferable` or `DefaultAccountState = Frozen`
/// (spec §5.1, PC-19). Classic SPL Token mints pass.
pub fn check_reserve_mint(mint: &AccountInfo) -> Result<()> {
    if *mint.owner != anchor_spl::token_2022::ID {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<Mint>::unpack(&data)?;
    for ext in state.get_extension_types()? {
        match ext {
            ExtensionType::PermanentDelegate
            | ExtensionType::TransferHook
            | ExtensionType::NonTransferable => {
                return err!(MutavError::UnsupportedMintExtension);
            }
            ExtensionType::TransferFeeConfig => {
                let cfg = state.get_extension::<TransferFeeConfig>()?;
                let older = u16::from(cfg.older_transfer_fee.transfer_fee_basis_points);
                let newer = u16::from(cfg.newer_transfer_fee.transfer_fee_basis_points);
                // Both epochs: a fee scheduled for the next epoch counts too.
                if older != 0 || newer != 0 {
                    return err!(MutavError::UnsupportedMintExtension);
                }
            }
            ExtensionType::DefaultAccountState => {
                let das = state.get_extension::<DefaultAccountState>()?;
                if das.state == AccountState::Frozen as u8 {
                    return err!(MutavError::UnsupportedMintExtension);
                }
            }
            _ => {}
        }
    }
    Ok(())
}
