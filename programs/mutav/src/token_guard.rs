//! Token safety checks. Every check fails closed.
//!
//! The mint guard's structure follows `validate_asset_mint_extensions_from_acct_info`
//! in `solana-foundation/vault` (MIT), extended and rewritten for MUTAV (see
//! docs/provenance.md). Design notes: rejects every extension listed in spec §5.1 (PC-19, ADR 0017), and
//! a transfer fee in either the older or the newer epoch configuration.

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
/// a non-zero `TransferFee`, `NonTransferable`, `DefaultAccountState = Frozen`
/// (spec §5.1, PC-19), `ScaledUiAmount`, `InterestBearingConfig` or `Pausable`
/// (ADR 0017). Classic SPL Token mints pass.
///
/// The last three change what a balance means, or whether it can move,
/// without changing the raw `u64` amounts the program tracks: yield paid as a
/// balance multiplier would never reach NAV and would break valuation at par.
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
            | ExtensionType::NonTransferable
            | ExtensionType::ScaledUiAmount
            | ExtensionType::InterestBearingConfig
            | ExtensionType::Pausable => {
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
