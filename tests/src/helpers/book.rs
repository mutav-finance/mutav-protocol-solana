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
    state::{ClaimFiling, FeeReceipt, Guarantee, Payout},
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

/// `FeeReceipt`: `["fee", config, invoice_ref_hash]`.
pub fn fee_receipt_pda(config: &Pubkey, invoice_ref_hash: &[u8; 32]) -> Pubkey {
    pda(&[FEE_SEED, config.as_ref(), invoice_ref_hash])
}

/// `ClaimFiling`: `["claim", guarantee, notice_ref_hash]`.
pub fn claim_pda(guarantee: &Pubkey, notice_ref_hash: &[u8; 32]) -> Pubkey {
    pda(&[CLAIM_SEED, guarantee.as_ref(), notice_ref_hash])
}

/// `Payout`: `["payout", guarantee, notice_ref_hash]`.
pub fn payout_pda(guarantee: &Pubkey, notice_ref_hash: &[u8; 32]) -> Pubkey {
    pda(&[PAYOUT_SEED, guarantee.as_ref(), notice_ref_hash])
}

/// One claim: the guarantee (id and agency), leg, amount and notice.
#[derive(Clone, Copy, Debug)]
pub struct Claim {
    pub id: [u8; 32],
    pub agency_id: [u8; 32],
    pub leg: u8,
    pub amount: u64,
    pub notice: [u8; 32],
}

impl Claim {
    /// A default-leg claim on `g` with a fresh notice.
    pub fn on(g: &RegisterGuaranteeArgs, amount: u64) -> Self {
        Self {
            id: g.id,
            agency_id: g.agency_id,
            leg: LEG_DEFAULT,
            amount,
            notice: unique_hash(),
        }
    }

    pub fn leg(mut self, leg: u8) -> Self {
        self.leg = leg;
        self
    }

    pub fn amount(mut self, amount: u64) -> Self {
        self.amount = amount;
        self
    }
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
                payer: self.payer.pubkey(),
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn close_guarantee_ix(&self, signer: &Pubkey, id: [u8; 32]) -> Instruction {
        let config = self.pdas.config;
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::CloseGuarantee { id }.data(),
            mutav::accounts::CloseGuarantee {
                operator: *signer,
                config,
                state: self.pdas.state,
                guarantee: guarantee_pda(&config, &id),
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
    pub fn close_guarantee(&mut self, id: [u8; 32]) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let ix = self.close_guarantee_ix(&op.pubkey(), id);
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

    /// Serializes `g` over its account (discriminator included).
    pub fn write_guarantee(&mut self, g: &Guarantee) {
        use anchor_lang::Discriminator;
        let mut data = Guarantee::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(g, &mut data).unwrap();
        let addr = guarantee_pda(&self.pdas.config, &g.id);
        self.write_raw(&addr, &data);
    }

    pub fn file_claim_ix(&self, signer: &Pubkey, c: Claim) -> Instruction {
        let config = self.pdas.config;
        let guarantee = guarantee_pda(&config, &c.id);
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::FileClaim {
                leg: c.leg,
                amount: c.amount,
                notice_ref_hash: c.notice,
            }
            .data(),
            mutav::accounts::FileClaim {
                operator: *signer,
                config,
                state: self.pdas.state,
                guarantee,
                claim_filing: claim_pda(&guarantee, &c.notice),
                payer: self.payer.pubkey(),
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `pay_claim` to `payments` (normally `config.payments_account`).
    pub fn pay_claim_ix(&self, signer: &Pubkey, c: Claim, payments: &Pubkey) -> Instruction {
        let config = self.pdas.config;
        let guarantee = guarantee_pda(&config, &c.id);
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::PayClaim {
                leg: c.leg,
                amount: c.amount,
                notice_ref_hash: c.notice,
            }
            .data(),
            mutav::accounts::PayClaim {
                operator: *signer,
                config,
                state: self.pdas.state,
                guarantee,
                claim_filing: claim_pda(&guarantee, &c.notice),
                payout: payout_pda(&guarantee, &c.notice),
                reserve: self.pdas.reserve,
                payments_account: *payments,
                vault_authority: self.pdas.authority,
                reserve_mint: self.reserve_mint,
                token_program: self.token_program,
                payer: self.payer.pubkey(),
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn settle_payout_ix(
        &self,
        signer: &Pubkey,
        c: Claim,
        pix_e2e_hash: [u8; 32],
    ) -> Instruction {
        let config = self.pdas.config;
        let guarantee = guarantee_pda(&config, &c.id);
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::SettlePayout {
                notice_ref_hash: c.notice,
                pix_e2e_hash,
            }
            .data(),
            mutav::accounts::SettlePayout {
                operator: *signer,
                config,
                guarantee,
                payout: payout_pda(&guarantee, &c.notice),
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `file_claim` signed by the operator.
    pub fn file_claim(&mut self, c: Claim) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let ix = self.file_claim_ix(&op.pubkey(), c);
        self.send(ix, &op)
    }

    /// `pay_claim` to the configured payments account, signed by the operator.
    pub fn pay_claim(&mut self, c: Claim) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let payments = self.config().payments_account;
        let ix = self.pay_claim_ix(&op.pubkey(), c, &payments);
        self.send(ix, &op)
    }

    /// `settle_payout` signed by the operator.
    pub fn settle_payout(&mut self, c: Claim, pix_e2e_hash: [u8; 32]) -> TransactionResult {
        let op = self.operator.insecure_clone();
        let ix = self.settle_payout_ix(&op.pubkey(), c, pix_e2e_hash);
        self.send(ix, &op)
    }

    pub fn claim_filing(&self, c: &Claim) -> ClaimFiling {
        let g = guarantee_pda(&self.pdas.config, &c.id);
        let acc = self
            .svm
            .get_account(&claim_pda(&g, &c.notice))
            .expect("claim filing");
        ClaimFiling::try_deserialize(&mut acc.data.as_slice()).expect("decode claim filing")
    }

    pub fn payout(&self, c: &Claim) -> Payout {
        let g = guarantee_pda(&self.pdas.config, &c.id);
        let acc = self
            .svm
            .get_account(&payout_pda(&g, &c.notice))
            .expect("payout");
        Payout::try_deserialize(&mut acc.data.as_slice()).expect("decode payout")
    }

    /// Serializes `x` over the claim filing of `c`.
    pub fn write_claim_filing(&mut self, c: &Claim, x: &ClaimFiling) {
        use anchor_lang::Discriminator;
        let mut data = ClaimFiling::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(x, &mut data).unwrap();
        let g = guarantee_pda(&self.pdas.config, &c.id);
        self.write_raw(&claim_pda(&g, &c.notice), &data);
    }

    /// Serializes `x` over the payout of `c`.
    pub fn write_payout(&mut self, c: &Claim, x: &Payout) {
        use anchor_lang::Discriminator;
        let mut data = Payout::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(x, &mut data).unwrap();
        let g = guarantee_pda(&self.pdas.config, &c.id);
        self.write_raw(&payout_pda(&g, &c.notice), &data);
    }

    /// Operator instructions for the pilot list, each valid in this order on
    /// a fresh fixture: contribute a fee, register a guarantee (on a reserve
    /// funded while building the list), file a claim on it, pay it, settle
    /// the payout, close the guarantee. Fresh ids on every call, so the list can be built
    /// many times.
    pub fn book_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let op = self.operator.insecure_clone();
        let cover = 10_000 * BRL;
        self.fund_reserve(cover);
        let args = guarantee_args(unique_hash(), cover, 0);
        let id = args.id;
        let source = self.operator_brs(1_000 * BRL);
        let fee = self.contribute_fees_ix(self.fee_accounts(source), unique_hash(), 1_000 * BRL);
        let claim = Claim::on(&args, 1_000 * BRL);
        let payments = self.config().payments_account;
        vec![
            ("contribute_fees", fee, op.insecure_clone()),
            (
                "register_guarantee",
                self.register_guarantee_ix(&op.pubkey(), args),
                op.insecure_clone(),
            ),
            (
                "file_claim",
                self.file_claim_ix(&op.pubkey(), claim),
                op.insecure_clone(),
            ),
            (
                "pay_claim",
                self.pay_claim_ix(&op.pubkey(), claim, &payments),
                op.insecure_clone(),
            ),
            (
                "settle_payout",
                self.settle_payout_ix(&op.pubkey(), claim, unique_hash()),
                op.insecure_clone(),
            ),
            (
                "close_guarantee",
                self.close_guarantee_ix(&op.pubkey(), id),
                op.insecure_clone(),
            ),
        ]
    }
}
