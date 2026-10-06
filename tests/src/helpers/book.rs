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
    state::{AgencyExposure, Guarantee},
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
    /// a fresh fixture: fund the reserve, register a guarantee, close it.
    /// Fresh ids on every call, so the list can be built many times.
    pub fn book_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let op = self.operator.insecure_clone();
        let cover = 10_000 * BRL;
        self.fund_reserve(cover);
        let args = guarantee_args(unique_hash(), cover, 0);
        let (id, agency) = (args.id, args.agency_id);
        vec![
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
