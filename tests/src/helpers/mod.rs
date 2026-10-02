//! LiteSVM setup, mint factory and transaction helpers.

use std::path::PathBuf;

use anchor_lang::prelude::Pubkey;
use litesvm::{types::TransactionResult, LiteSVM};
use litesvm_token::CreateMint;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

/// Decimals of BRS (and of the mock BRS mint used in tests).
pub const BRS_DECIMALS: u8 = 6;

/// Path to a program built by `anchor build` (`target/deploy/<name>.so`).
pub fn program_so(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../target/deploy")
        .join(format!("{name}.so"))
}

/// A fresh LiteSVM with `mutav.so` deployed and a funded payer.
///
/// Panics with a clear message if `anchor build` has not been run.
pub fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let so = program_so("mutav");
    let bytes = std::fs::read(&so)
        .unwrap_or_else(|e| panic!("read {}: {e}. Run `anchor build` first.", so.display()));
    svm.add_program(mutav::ID, &bytes).expect("deploy mutav.so");

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000)
        .expect("airdrop");
    (svm, payer)
}

/// Create a BRS-like mint: 6 decimals, with a freeze authority (BRS issuers
/// can freeze accounts, so the program must handle frozen accounts).
///
/// Uses the classic SPL Token program; pass a Token-2022 mint through
/// `CreateMint::token_program_id` when a test needs it.
pub fn create_brs_mint(svm: &mut LiteSVM, payer: &Keypair, freeze_authority: &Pubkey) -> Pubkey {
    let mint_authority = payer.pubkey();
    CreateMint::new(svm, payer)
        .authority(&mint_authority)
        .freeze_authority(freeze_authority)
        .decimals(BRS_DECIMALS)
        .send()
        .expect("create BRS mint")
}

/// Sign with `signers` (first one pays) and send a single-instruction tx.
pub fn send_ix(
    svm: &mut LiteSVM,
    ix: anchor_lang::solana_program::instruction::Instruction,
    signers: &[&Keypair],
) -> TransactionResult {
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).expect("sign");
    svm.send_transaction(tx)
}
