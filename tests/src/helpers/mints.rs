//! Token-2022 mock BRS mints with extensions, for the mint guard tests.

use anchor_lang::prelude::Pubkey;
use anchor_spl::token_2022::spl_token_2022::{
    self as t22,
    extension::{
        default_account_state::instruction::initialize_default_account_state,
        transfer_fee::instruction::initialize_transfer_fee_config,
        transfer_hook::instruction::initialize as initialize_transfer_hook, ExtensionType,
    },
    state::{AccountState, Mint},
};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;

use super::{send_ixs, BRS_DECIMALS, TOKEN_2022_PROGRAM};

/// One Token-2022 mint extension to install.
#[derive(Clone, Copy, Debug)]
pub enum Ext {
    PermanentDelegate,
    TransferHook,
    /// `TransferFeeConfig` with this fee in basis points.
    TransferFee(u16),
    NonTransferable,
    /// `DefaultAccountState` with this state.
    DefaultState(AccountState),
    /// `ScaledUiAmount` with multiplier 1.0 (ADR 0017).
    ScaledUiAmount,
    /// `InterestBearingConfig` at 5% (ADR 0017).
    InterestBearing,
    /// `Pausable` (ADR 0017).
    Pausable,
}

impl Ext {
    fn ty(self) -> ExtensionType {
        match self {
            Ext::PermanentDelegate => ExtensionType::PermanentDelegate,
            Ext::TransferHook => ExtensionType::TransferHook,
            Ext::TransferFee(_) => ExtensionType::TransferFeeConfig,
            Ext::NonTransferable => ExtensionType::NonTransferable,
            Ext::DefaultState(_) => ExtensionType::DefaultAccountState,
            Ext::ScaledUiAmount => ExtensionType::ScaledUiAmount,
            Ext::InterestBearing => ExtensionType::InterestBearingConfig,
            Ext::Pausable => ExtensionType::Pausable,
        }
    }
}

/// A 6-dp Token-2022 mint with `exts`, mint authority = payer, freeze
/// authority = `freeze_authority`.
pub fn create_token2022_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    freeze_authority: &Pubkey,
    exts: &[Ext],
) -> Pubkey {
    let mint = Keypair::new();
    let types: Vec<ExtensionType> = exts.iter().map(|e| e.ty()).collect();
    let space = ExtensionType::try_calculate_account_len::<Mint>(&types).expect("mint len");
    let lamports = svm.minimum_balance_for_rent_exemption(space);

    let mut ixs = vec![solana_system_interface::instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        lamports,
        space as u64,
        &TOKEN_2022_PROGRAM,
    )];
    let p = &TOKEN_2022_PROGRAM;
    let m = &mint.pubkey();
    for ext in exts {
        ixs.push(match *ext {
            Ext::PermanentDelegate => {
                t22::instruction::initialize_permanent_delegate(p, m, &payer.pubkey()).unwrap()
            }
            Ext::TransferHook => {
                initialize_transfer_hook(p, m, Some(payer.pubkey()), Some(Pubkey::new_unique()))
                    .unwrap()
            }
            Ext::TransferFee(bps) => initialize_transfer_fee_config(
                p,
                m,
                Some(&payer.pubkey()),
                Some(&payer.pubkey()),
                bps,
                u64::MAX,
            )
            .unwrap(),
            Ext::NonTransferable => {
                t22::instruction::initialize_non_transferable_mint(p, m).unwrap()
            }
            Ext::DefaultState(state) => initialize_default_account_state(p, m, &state).unwrap(),
            Ext::ScaledUiAmount => t22::extension::scaled_ui_amount::instruction::initialize(
                p,
                m,
                Some(payer.pubkey()),
                1.0,
            )
            .unwrap(),
            Ext::InterestBearing => t22::extension::interest_bearing_mint::instruction::initialize(
                p,
                m,
                Some(payer.pubkey()),
                500,
            )
            .unwrap(),
            Ext::Pausable => {
                t22::extension::pausable::instruction::initialize(p, m, &payer.pubkey()).unwrap()
            }
        });
    }
    ixs.push(
        t22::instruction::initialize_mint2(
            p,
            m,
            &payer.pubkey(),
            Some(freeze_authority),
            BRS_DECIMALS,
        )
        .unwrap(),
    );
    send_ixs(svm, &ixs, &[payer, &mint]).expect("create Token-2022 mint");
    mint.pubkey()
}

/// A token account for a Token-2022 `mint`, sized for the account extensions
/// the mint requires.
pub fn create_token2022_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Pubkey {
    use anchor_spl::token_2022::spl_token_2022::{
        extension::{BaseStateWithExtensions, StateWithExtensions},
        state::Account,
    };
    let mint_data = svm.get_account(mint).expect("mint").data;
    let mint_state = StateWithExtensions::<Mint>::unpack(&mint_data).expect("unpack mint");
    let required = ExtensionType::get_required_init_account_extensions(
        &mint_state.get_extension_types().expect("ext types"),
    );
    let space = ExtensionType::try_calculate_account_len::<Account>(&required).expect("len");
    let account = Keypair::new();
    let ixs = vec![
        solana_system_interface::instruction::create_account(
            &payer.pubkey(),
            &account.pubkey(),
            svm.minimum_balance_for_rent_exemption(space),
            space as u64,
            &TOKEN_2022_PROGRAM,
        ),
        t22::instruction::initialize_account3(&TOKEN_2022_PROGRAM, &account.pubkey(), mint, owner)
            .unwrap(),
    ];
    send_ixs(svm, &ixs, &[payer, &account]).expect("create Token-2022 account");
    account.pubkey()
}
