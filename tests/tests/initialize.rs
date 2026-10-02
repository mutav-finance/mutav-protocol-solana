//! Smoke test: deploy `mutav.so`, call `initialize`, read back `VaultConfig`.

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{instruction::Instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use mutav::{constants::CONFIG_SEED, state::VaultConfig, InitializeArgs};
use mutav_tests::helpers::{create_brs_mint, send_ix, setup, BRS_DECIMALS};
use solana_program_pack::Pack;
use solana_signer::Signer;

#[test]
fn initialize_creates_vault_config() {
    let (mut svm, payer) = setup();

    let freeze_authority = Pubkey::new_unique();
    let reserve_mint = create_brs_mint(&mut svm, &payer, &freeze_authority);

    // Mint shape the protocol assumes for BRS.
    let mint_acc = svm.get_account(&reserve_mint).expect("mint exists");
    let mint = litesvm_token::spl_token::state::Mint::unpack(&mint_acc.data).expect("unpack mint");
    assert_eq!(mint.decimals, BRS_DECIMALS);
    assert_eq!(mint.freeze_authority, Some(freeze_authority).into());

    let (config, bump) =
        Pubkey::find_program_address(&[CONFIG_SEED, reserve_mint.as_ref()], &mutav::ID);
    let args = InitializeArgs {
        admin: Pubkey::new_unique(),
        operator: Pubkey::new_unique(),
        pauser: Pubkey::new_unique(),
    };

    let ix = Instruction::new_with_bytes(
        mutav::ID,
        &mutav::instruction::Initialize { args: args.clone() }.data(),
        mutav::accounts::Initialize {
            payer: payer.pubkey(),
            reserve_mint,
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send_ix(&mut svm, ix, &[&payer]).expect("initialize");

    let acc = svm.get_account(&config).expect("config exists");
    assert_eq!(acc.owner, mutav::ID);
    let cfg = VaultConfig::try_deserialize(&mut acc.data.as_slice()).expect("deserialize");
    assert_eq!(cfg.admin, args.admin);
    assert_eq!(cfg.operator, args.operator);
    assert_eq!(cfg.pauser, args.pauser);
    assert_eq!(cfg.reserve_mint, reserve_mint);
    assert_eq!(cfg.bump, bump);
    assert_eq!(cfg._reserved, [0u8; 128]);
}
