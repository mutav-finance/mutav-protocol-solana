//! Issuer income (spec §3.14, §5.3a; ADR 0017): the income inbox, the
//! `sweep_income` builder, the `IncomeReceipt` reader.

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize, InstructionData,
    ToAccountMetas,
};
use litesvm::types::TransactionResult;
use mutav::{constants::*, state::IncomeReceipt};
use solana_keypair::Keypair;
use solana_signer::Signer;

use super::{income_inbox_address, unique_hash, Fixture};

/// A statement month used by the tests (`YYYYMM`).
pub const PERIOD: u32 = 202_610;

/// `IncomeReceipt`: `["income", config, income_ref_hash]`.
pub fn income_receipt_pda(config: &Pubkey, income_ref_hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[INCOME_SEED, config.as_ref(), income_ref_hash], &mutav::ID).0
}

/// Accounts of `sweep_income` that tests vary.
#[derive(Clone, Copy, Debug)]
pub struct IncomeAccounts {
    pub operator: Pubkey,
    pub income_inbox: Pubkey,
    pub reserve: Pubkey,
    pub vault_authority: Pubkey,
    pub reserve_mint: Pubkey,
    pub token_program: Pubkey,
}

impl Fixture {
    /// This reserve's income inbox.
    pub fn income_inbox(&self) -> Pubkey {
        income_inbox_address(
            &self.pdas.authority,
            &self.reserve_mint,
            &self.token_program,
        )
    }

    /// Nora pays `amount` BRS into the income inbox (a plain mint or
    /// transfer: the program does not see it).
    pub fn pay_income(&mut self, amount: u64) {
        let inbox = self.income_inbox();
        self.mint_brs(&inbox, amount);
    }

    /// The default `sweep_income` accounts.
    pub fn income_accounts(&self) -> IncomeAccounts {
        IncomeAccounts {
            operator: self.operator.pubkey(),
            income_inbox: self.income_inbox(),
            reserve: self.pdas.reserve,
            vault_authority: self.pdas.authority,
            reserve_mint: self.reserve_mint,
            token_program: self.token_program,
        }
    }

    pub fn sweep_income_ix(
        &self,
        a: IncomeAccounts,
        income_ref_hash: [u8; 32],
        period: u32,
        amount: u64,
    ) -> Instruction {
        let config = self.pdas.config;
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::SweepIncome {
                income_ref_hash,
                period,
                amount,
            }
            .data(),
            mutav::accounts::SweepIncome {
                operator: a.operator,
                config,
                state: self.pdas.state,
                income_receipt: income_receipt_pda(&config, &income_ref_hash),
                income_inbox: a.income_inbox,
                reserve: a.reserve,
                vault_authority: a.vault_authority,
                reserve_mint: a.reserve_mint,
                token_program: a.token_program,
                payer: self.payer.pubkey(),
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `sweep_income` of `amount` by the operator with a fresh statement
    /// reference. Returns the reference.
    pub fn sweep(&mut self, amount: u64) -> (TransactionResult, [u8; 32]) {
        let r = unique_hash();
        let ix = self.sweep_income_ix(self.income_accounts(), r, PERIOD, amount);
        let op = self.operator.insecure_clone();
        (self.send(ix, &op), r)
    }

    /// Nora pays `amount` and the operator sweeps it.
    pub fn pay_and_sweep(&mut self, amount: u64) -> [u8; 32] {
        self.pay_income(amount);
        let (res, r) = self.sweep(amount);
        res.expect("sweep_income");
        r
    }

    pub fn income_receipt(&self, income_ref_hash: &[u8; 32]) -> IncomeReceipt {
        let acc = self
            .svm
            .get_account(&income_receipt_pda(&self.pdas.config, income_ref_hash))
            .expect("income receipt");
        IncomeReceipt::try_deserialize(&mut acc.data.as_slice()).expect("decode income receipt")
    }

    /// The pilot-list entry for `sweep_income`: pays the inbox while the list
    /// is built.
    pub fn income_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let amount = 500 * super::BRL;
        self.pay_income(amount);
        let ix = self.sweep_income_ix(self.income_accounts(), unique_hash(), PERIOD, amount);
        vec![("sweep_income", ix, self.operator.insecure_clone())]
    }
}
