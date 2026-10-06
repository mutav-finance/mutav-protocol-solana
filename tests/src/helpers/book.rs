//! The guarantee book (spec §3.4–§3.7, §5.2–§5.4): PDAs, instruction
//! builders, account readers and state injection for the operator
//! instructions.

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize, InstructionData,
    ToAccountMetas,
};
use litesvm::types::TransactionResult;
use litesvm_token::MintTo;
use mutav::{
    constants::*,
    state::{AgencyExposure, FeeReceipt, Guarantee},
    RegisterGuaranteeArgs,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

use super::{Fixture, BRL};

/// A fresh 32-byte reference (guarantee id, agency id, hash).
pub fn unique_hash() -> [u8; 32] {
    Pubkey::new_unique().to_bytes()
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &mutav::ID).0
}

/// `Guarantee`: `["guarantee", config, id]`.
pub fn guarantee_pda(config: &Pubkey, id: &[u8; 32]) -> Pubkey {
    pda(&[GUARANTEE_SEED, config.as_ref(), id])
}

/// `AgencyExposure`: `["agency", config, agency_id]`.
pub fn agency_pda(config: &Pubkey, agency_id: &[u8; 32]) -> Pubkey {
    pda(&[AGENCY_SEED, config.as_ref(), agency_id])
}

/// `FeeReceipt`: `["fee", config, invoice_ref_hash]`.
pub fn fee_receipt_pda(config: &Pubkey, invoice_ref_hash: &[u8; 32]) -> Pubkey {
    pda(&[FEE_SEED, config.as_ref(), invoice_ref_hash])
}

/// Accounts of `contribute_fees` that tests vary.
#[derive(Clone, Copy, Debug)]
pub struct FeeAccounts {
    pub operator: Pubkey,
    pub source: Pubkey,
    pub reserve: Pubkey,
    pub treasury: Pubkey,
    pub reserve_mint: Pubkey,
    pub token_program: Pubkey,
}

/// Registration args with fresh `id` and `refs_hash`, rent R$2,000 and the
/// display multipliers of a 3× default / 6× exit guarantee.
pub fn guarantee_args(
    agency_id: [u8; 32],
    default_cover: u64,
    exit_cover: u64,
) -> RegisterGuaranteeArgs {
    RegisterGuaranteeArgs {
        id: unique_hash(),
        agency_id,
        refs_hash: unique_hash(),
        rent: 2_000 * BRL,
        default_multiplier_bps: 30_000,
        exit_multiplier_bps: 60_000,
        default_cover,
        exit_cover,
    }
}

/// `remaining_cover(g)` (spec §4).
pub fn remaining_cover(g: &Guarantee) -> u64 {
    (g.default_cover - g.default_paid) + (g.exit_cover - g.exit_paid)
}

impl Fixture {
    /// Credits `amount` BRS to the reserve: mints it into the `reserve` token
    /// account and adds it to the tracked `brs_balance`, as an inflow from an
    /// instruction built in a later task would (invariant 4 holds).
    pub fn fund_reserve(&mut self, amount: u64) {
        let payer = self.payer.insecure_clone();
        let (mint, reserve) = (self.reserve_mint, self.pdas.reserve);
        MintTo::new(&mut self.svm, &payer, &mint, &reserve, amount)
            .token_program_id(&self.token_program.clone())
            .send()
            .expect("mint BRS into reserve");
        let mut s = self.state();
        s.brs_balance += amount;
        self.write_state(&s);
    }

    /// Mints `amount` BRS into any token account (the test holds the mint
    /// authority).
    pub fn mint_brs(&mut self, to: &Pubkey, amount: u64) {
        let payer = self.payer.insecure_clone();
        let mint = self.reserve_mint;
        MintTo::new(&mut self.svm, &payer, &mint, to, amount)
            .token_program_id(&self.token_program.clone())
            .send()
            .expect("mint BRS");
    }

    /// A BRS token account owned by the operator holding `amount`: guarantee
    /// fees reach it via PIX → BRS off-chain (spec §5.3).
    pub fn operator_brs(&mut self, amount: u64) -> Pubkey {
        let op = self.operator.pubkey();
        let acc = self.token_account(&op);
        self.mint_brs(&acc, amount);
        acc
    }

    /// The default `contribute_fees` accounts for `source`.
    pub fn fee_accounts(&self, source: Pubkey) -> FeeAccounts {
        FeeAccounts {
            operator: self.operator.pubkey(),
            source,
            reserve: self.pdas.reserve,
            treasury: self.config().treasury_account,
            reserve_mint: self.reserve_mint,
            token_program: self.token_program,
        }
    }

    pub fn contribute_fees_ix(
        &self,
        a: FeeAccounts,
        invoice_ref_hash: [u8; 32],
        amount: u64,
    ) -> Instruction {
        let config = self.pdas.config;
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::ContributeFees {
                invoice_ref_hash,
                amount,
            }
            .data(),
            mutav::accounts::ContributeFees {
                operator: a.operator,
                config,
                state: self.pdas.state,
                fee_receipt: fee_receipt_pda(&config, &invoice_ref_hash),
                source: a.source,
                reserve: a.reserve,
                treasury_account: a.treasury,
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

    /// `contribute_fees` by the operator from a freshly funded source, with a
    /// fresh invoice. Returns the invoice hash.
    pub fn contribute(&mut self, amount: u64) -> (TransactionResult, [u8; 32]) {
        let source = self.operator_brs(amount);
        let invoice = unique_hash();
        let ix = self.contribute_fees_ix(self.fee_accounts(source), invoice, amount);
        let op = self.operator.insecure_clone();
        (self.send(ix, &op), invoice)
    }

    pub fn fee_receipt(&self, invoice_ref_hash: &[u8; 32]) -> FeeReceipt {
        let acc = self
            .svm
            .get_account(&fee_receipt_pda(&self.pdas.config, invoice_ref_hash))
            .expect("fee receipt");
        FeeReceipt::try_deserialize(&mut acc.data.as_slice()).expect("decode fee receipt")
    }

    /// Injects `shares` outstanding, as fulfilled deposits (Task 6) would
    /// leave them: `VaultState.shares_outstanding` and the share mint's
    /// supply both rise (invariant 5).
    pub fn inject_shares(&mut self, shares: u64) {
        let mut s = self.state();
        s.shares_outstanding += shares;
        self.write_state(&s);
        let mint = self.pdas.share_mint;
        let mut acc = self.svm.get_account(&mint).expect("share mint");
        let supply = u64::from_le_bytes(acc.data[36..44].try_into().unwrap()) + shares;
        acc.data[36..44].copy_from_slice(&supply.to_le_bytes());
        self.svm.set_account(mint, acc).expect("set share mint");
    }

    /// Share mint supply.
    pub fn share_supply(&self) -> u64 {
        let acc = self
            .svm
            .get_account(&self.pdas.share_mint)
            .expect("share mint");
        u64::from_le_bytes(acc.data[36..44].try_into().unwrap())
    }

    /// NAV per share (`NAV_SCALE`) computed from the current state with the
    /// spec §4 formulas, as `refresh` (Task 10) publishes it. No TESOURO in
    /// these tests.
    pub fn nav(&self) -> u64 {
        use mutav::solvency::{nav_per_share, net_assets};
        let s = self.state();
        assert_eq!(s.tesouro_units, 0);
        nav_per_share(
            net_assets(s.brs_balance, s.provisions),
            s.shares_outstanding,
        )
        .unwrap()
    }

    /// Token balance of a token account.
    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        let acc = self.svm.get_account(token_account).expect("token account");
        u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
    }

    pub fn register_guarantee_ix(
        &self,
        signer: &Pubkey,
        args: RegisterGuaranteeArgs,
    ) -> Instruction {
        let config = self.pdas.config;
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::RegisterGuarantee { args: args.clone() }.data(),
            mutav::accounts::RegisterGuarantee {
                operator: *signer,
                config,
                state: self.pdas.state,
                guarantee: guarantee_pda(&config, &args.id),
                agency_exposure: agency_pda(&config, &args.agency_id),
                payer: self.payer.pubkey(),
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn close_guarantee_ix(
        &self,
        signer: &Pubkey,
        id: [u8; 32],
        agency_id: [u8; 32],
    ) -> Instruction {
        let config = self.pdas.config;
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::CloseGuarantee { id }.data(),
            mutav::accounts::CloseGuarantee {
                operator: *signer,
                config,
                state: self.pdas.state,
                guarantee: guarantee_pda(&config, &id),
                agency_exposure: agency_pda(&config, &agency_id),
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `register_guarantee` signed by the operator.
    pub fn register(&mut self, args: RegisterGuaranteeArgs) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let ix = self.register_guarantee_ix(&op.pubkey(), args);
        self.send(ix, &op)
    }

    /// `close_guarantee` signed by the operator.
    pub fn close_guarantee(&mut self, id: [u8; 32], agency_id: [u8; 32]) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let ix = self.close_guarantee_ix(&op.pubkey(), id, agency_id);
        self.send(ix, &op)
    }

    /// Funds the reserve with exactly the cover and registers a guarantee
    /// (default leg only). Returns its args.
    pub fn funded_guarantee(
        &mut self,
        agency_id: [u8; 32],
        default_cover: u64,
    ) -> RegisterGuaranteeArgs {
        self.fund_reserve(default_cover);
        let args = guarantee_args(agency_id, default_cover, 0);
        self.register(args.clone()).expect("register_guarantee");
        args
    }

    pub fn guarantee(&self, id: &[u8; 32]) -> Guarantee {
        let acc = self
            .svm
            .get_account(&guarantee_pda(&self.pdas.config, id))
            .expect("guarantee");
        Guarantee::try_deserialize(&mut acc.data.as_slice()).expect("decode guarantee")
    }

    pub fn agency(&self, agency_id: &[u8; 32]) -> AgencyExposure {
        let acc = self
            .svm
            .get_account(&agency_pda(&self.pdas.config, agency_id))
            .expect("agency exposure");
        AgencyExposure::try_deserialize(&mut acc.data.as_slice()).expect("decode agency")
    }

    /// Serializes `g` over its account (discriminator included).
    pub fn write_guarantee(&mut self, g: &Guarantee) {
        use anchor_lang::Discriminator;
        let mut data = Guarantee::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(g, &mut data).unwrap();
        let addr = guarantee_pda(&self.pdas.config, &g.id);
        self.write_raw(&addr, &data);
    }

    /// Serializes `a` over its account (discriminator included).
    pub fn write_agency(&mut self, a: &AgencyExposure) {
        use anchor_lang::Discriminator;
        let mut data = AgencyExposure::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(a, &mut data).unwrap();
        let addr = agency_pda(&self.pdas.config, &a.agency_id);
        self.write_raw(&addr, &data);
    }

    /// Operator instructions for the pilot list, each valid in this order on
    /// a fresh fixture: contribute a fee, fund the reserve, register a
    /// guarantee, close it. Fresh ids on every call, so the list can be built
    /// many times.
    pub fn book_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let op = self.operator.insecure_clone();
        let cover = 10_000 * BRL;
        self.fund_reserve(cover);
        let args = guarantee_args(unique_hash(), cover, 0);
        let (id, agency) = (args.id, args.agency_id);
        let source = self.operator_brs(1_000 * BRL);
        let fee = self.contribute_fees_ix(self.fee_accounts(source), unique_hash(), 1_000 * BRL);
        vec![
            ("contribute_fees", fee, op.insecure_clone()),
            (
                "register_guarantee",
                self.register_guarantee_ix(&op.pubkey(), args),
                op.insecure_clone(),
            ),
            (
                "close_guarantee",
                self.close_guarantee_ix(&op.pubkey(), id, agency),
                op.insecure_clone(),
            ),
        ]
    }
}
