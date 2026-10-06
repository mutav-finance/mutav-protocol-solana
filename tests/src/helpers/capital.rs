//! Investor capital (spec §3.8, §3.10, §5.5, §5.8): the allowlist Merkle tree,
//! investors, PDAs, instruction builders, account readers and the queue
//! invariants (spec §4, 4–5 and 8–11).

use anchor_lang::{
    prelude::{AccountMeta, Pubkey},
    solana_program::instruction::Instruction,
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::types::TransactionResult;
use mutav::{
    allowlist,
    constants::*,
    state::{DepositRequest, HolderState, RedeemRequest},
};
use solana_keypair::Keypair;
use solana_signer::Signer;

use super::{create_token_account, Fixture, TOKEN_PROGRAM};

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &mutav::ID).0
}

/// `DepositRequest`: `["deposit", config, seq]`.
pub fn deposit_pda(config: &Pubkey, seq: u64) -> Pubkey {
    pda(&[DEPOSIT_SEED, config.as_ref(), &seq.to_le_bytes()])
}

/// `RedeemRequest`: `["redeem", config, seq]`.
pub fn redeem_pda(config: &Pubkey, seq: u64) -> Pubkey {
    pda(&[REDEEM_SEED, config.as_ref(), &seq.to_le_bytes()])
}

/// `HolderState`: `["holder", config, owner]`.
pub fn holder_pda(config: &Pubkey, owner: &Pubkey) -> Pubkey {
    pda(&[HOLDER_SEED, config.as_ref(), owner.as_ref()])
}

/// A Merkle tree over wallets, with the program's encoding
/// (`mutav::allowlist`): levels are built pairwise, an odd node is carried up.
pub struct Allowlist {
    pub wallets: Vec<Pubkey>,
    levels: Vec<Vec<[u8; 32]>>,
}

impl Allowlist {
    pub fn new(wallets: &[Pubkey]) -> Self {
        assert!(!wallets.is_empty());
        let mut levels = vec![wallets.iter().map(allowlist::leaf).collect::<Vec<_>>()];
        while levels.last().unwrap().len() > 1 {
            let prev = levels.last().unwrap();
            let next = prev
                .chunks(2)
                .map(|p| {
                    if p.len() == 2 {
                        allowlist::node(&p[0], &p[1])
                    } else {
                        p[0]
                    }
                })
                .collect();
            levels.push(next);
        }
        Self {
            wallets: wallets.to_vec(),
            levels,
        }
    }

    pub fn root(&self) -> [u8; 32] {
        self.levels.last().unwrap()[0]
    }

    /// The proof of `wallet`; empty for a wallet not in the tree.
    pub fn proof(&self, wallet: &Pubkey) -> Vec<[u8; 32]> {
        let Some(mut i) = self.wallets.iter().position(|w| w == wallet) else {
            return vec![];
        };
        let mut out = vec![];
        for level in &self.levels[..self.levels.len() - 1] {
            let sib = i ^ 1;
            if sib < level.len() {
                out.push(level[sib]);
            }
            i /= 2;
        }
        out
    }
}

/// An investor wallet with a BRS token account and a share token account.
pub struct Investor {
    pub key: Keypair,
    pub brs: Pubkey,
    pub shares: Pubkey,
}

impl Investor {
    pub fn pubkey(&self) -> Pubkey {
        self.key.pubkey()
    }
}

impl Fixture {
    /// Sets the allowlist root (admin) to a tree over `wallets`.
    pub fn allowlist(&mut self, wallets: &[Pubkey]) -> Allowlist {
        let tree = Allowlist::new(wallets);
        let admin = self.admin.insecure_clone();
        let ix = self.set_allowlist_root_ix(&admin.pubkey(), tree.root());
        self.send(ix, &admin).expect("set_allowlist_root");
        tree
    }

    /// A funded wallet (SOL for rent) holding `brs` BRS, with an empty share
    /// account.
    pub fn investor_with(&mut self, key: Keypair, brs: u64) -> Investor {
        self.svm
            .airdrop(&key.pubkey(), 10_000_000_000)
            .expect("airdrop");
        let brs_acc = self.token_account(&key.pubkey());
        if brs > 0 {
            self.mint_brs(&brs_acc, brs);
        }
        let payer = self.payer.insecure_clone();
        let share_mint = self.pdas.share_mint;
        let shares = create_token_account(
            &mut self.svm,
            &payer,
            &share_mint,
            &key.pubkey(),
            &TOKEN_PROGRAM,
        );
        Investor {
            key,
            brs: brs_acc,
            shares,
        }
    }

    pub fn investor(&mut self, brs: u64) -> Investor {
        self.investor_with(Keypair::new(), brs)
    }

    /// Sends `ix` signed (and paid) by the investor alone.
    pub fn send_as(&mut self, ix: Instruction, signer: &Keypair) -> TransactionResult {
        super::send_ix(&mut self.svm, ix, &[signer])
    }

    fn capital_ix(&self, data: Vec<u8>, metas: Vec<AccountMeta>) -> Instruction {
        Instruction::new_with_bytes(mutav::ID, &data, metas)
    }

    pub fn request_deposit_ix(
        &self,
        owner: &Pubkey,
        source: &Pubkey,
        assets: u64,
        proof: Vec<[u8; 32]>,
    ) -> Instruction {
        let config = self.pdas.config;
        let seq = self.state().next_deposit_seq;
        self.capital_ix(
            mutav::instruction::RequestDeposit { assets, proof }.data(),
            mutav::accounts::RequestDeposit {
                owner: *owner,
                config,
                state: self.pdas.state,
                deposit_request: deposit_pda(&config, seq),
                holder_state: holder_pda(&config, owner),
                source: *source,
                pending_deposits: self.pdas.pending_deposits,
                reserve_mint: self.reserve_mint,
                token_program: self.token_program,
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn cancel_deposit_ix(&self, owner: &Pubkey, seq: u64, destination: &Pubkey) -> Instruction {
        let config = self.pdas.config;
        self.capital_ix(
            mutav::instruction::CancelDeposit {}.data(),
            mutav::accounts::CancelDeposit {
                owner: *owner,
                config,
                state: self.pdas.state,
                deposit_request: deposit_pda(&config, seq),
                destination: *destination,
                pending_deposits: self.pdas.pending_deposits,
                vault_authority: self.pdas.authority,
                reserve_mint: self.reserve_mint,
                token_program: self.token_program,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `fulfil_deposits` with the request PDAs of `seqs` as remaining
    /// accounts.
    pub fn fulfil_deposits_ix(&self, signer: &Pubkey, count: u8, seqs: &[u64]) -> Instruction {
        let config = self.pdas.config;
        let mut metas = mutav::accounts::FulfilDeposits {
            admin: *signer,
            config,
            state: self.pdas.state,
            pending_deposits: self.pdas.pending_deposits,
            reserve: self.pdas.reserve,
            vault_authority: self.pdas.authority,
            reserve_mint: self.reserve_mint,
            token_program: self.token_program,
            event_authority: self.pdas.event_authority,
            program: mutav::ID,
        }
        .to_account_metas(None);
        metas.extend(
            seqs.iter()
                .map(|s| AccountMeta::new(deposit_pda(&config, *s), false)),
        );
        self.capital_ix(mutav::instruction::FulfilDeposits { count }.data(), metas)
    }

    pub fn claim_shares_ix(&self, owner: &Pubkey, seq: u64, owner_shares: &Pubkey) -> Instruction {
        let config = self.pdas.config;
        self.capital_ix(
            mutav::instruction::ClaimShares {}.data(),
            mutav::accounts::ClaimShares {
                owner: *owner,
                config,
                deposit_request: deposit_pda(&config, seq),
                holder_state: holder_pda(&config, owner),
                share_mint: self.pdas.share_mint,
                owner_shares: *owner_shares,
                vault_authority: self.pdas.authority,
                share_token_program: TOKEN_PROGRAM,
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn request_redeem_ix(
        &self,
        owner: &Pubkey,
        owner_shares: &Pubkey,
        shares: u64,
        proof: Vec<[u8; 32]>,
    ) -> Instruction {
        let config = self.pdas.config;
        let seq = self.state().next_redeem_seq;
        self.capital_ix(
            mutav::instruction::RequestRedeem { shares, proof }.data(),
            mutav::accounts::RequestRedeem {
                owner: *owner,
                config,
                state: self.pdas.state,
                redeem_request: redeem_pda(&config, seq),
                owner_shares: *owner_shares,
                pending_redemptions: self.pdas.pending_redemptions,
                share_mint: self.pdas.share_mint,
                share_token_program: TOKEN_PROGRAM,
                system_program: anchor_lang::solana_program::system_program::ID,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn cancel_redeem_ix(&self, owner: &Pubkey, seq: u64, owner_shares: &Pubkey) -> Instruction {
        let config = self.pdas.config;
        self.capital_ix(
            mutav::instruction::CancelRedeem {}.data(),
            mutav::accounts::CancelRedeem {
                owner: *owner,
                config,
                state: self.pdas.state,
                redeem_request: redeem_pda(&config, seq),
                owner_shares: *owner_shares,
                pending_redemptions: self.pdas.pending_redemptions,
                vault_authority: self.pdas.authority,
                share_mint: self.pdas.share_mint,
                share_token_program: TOKEN_PROGRAM,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `fulfil_redeems` with the request PDAs of `seqs` as remaining accounts.
    pub fn fulfil_redeems_ix(
        &self,
        signer: &Pubkey,
        count: u8,
        max_assets: u64,
        seqs: &[u64],
    ) -> Instruction {
        let config = self.pdas.config;
        let mut metas = mutav::accounts::FulfilRedeems {
            admin: *signer,
            config,
            state: self.pdas.state,
            reserve: self.pdas.reserve,
            claims: self.pdas.claims,
            pending_redemptions: self.pdas.pending_redemptions,
            share_mint: self.pdas.share_mint,
            vault_authority: self.pdas.authority,
            reserve_mint: self.reserve_mint,
            token_program: self.token_program,
            share_token_program: TOKEN_PROGRAM,
            event_authority: self.pdas.event_authority,
            program: mutav::ID,
        }
        .to_account_metas(None);
        metas.extend(
            seqs.iter()
                .map(|s| AccountMeta::new(redeem_pda(&config, *s), false)),
        );
        self.capital_ix(
            mutav::instruction::FulfilRedeems { count, max_assets }.data(),
            metas,
        )
    }

    pub fn claim_assets_ix(&self, owner: &Pubkey, seq: u64, destination: &Pubkey) -> Instruction {
        let config = self.pdas.config;
        self.capital_ix(
            mutav::instruction::ClaimAssets {}.data(),
            mutav::accounts::ClaimAssets {
                owner: *owner,
                config,
                state: self.pdas.state,
                redeem_request: redeem_pda(&config, seq),
                destination: *destination,
                claims: self.pdas.claims,
                vault_authority: self.pdas.authority,
                reserve_mint: self.reserve_mint,
                token_program: self.token_program,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `advance_queue_heads(max)` with the redeem PDAs of `redeem_seqs`, then
    /// the deposit PDAs of `deposit_seqs`, as remaining accounts.
    pub fn advance_queue_heads_ix(
        &self,
        max: u8,
        redeem_seqs: &[u64],
        deposit_seqs: &[u64],
    ) -> Instruction {
        let config = self.pdas.config;
        let mut metas = mutav::accounts::AdvanceQueueHeads {
            config,
            state: self.pdas.state,
            event_authority: self.pdas.event_authority,
            program: mutav::ID,
        }
        .to_account_metas(None);
        metas.extend(
            redeem_seqs
                .iter()
                .map(|s| AccountMeta::new_readonly(redeem_pda(&config, *s), false)),
        );
        metas.extend(
            deposit_seqs
                .iter()
                .map(|s| AccountMeta::new_readonly(deposit_pda(&config, *s), false)),
        );
        self.capital_ix(mutav::instruction::AdvanceQueueHeads { max }.data(), metas)
    }

    // -- one-call flows ------------------------------------------------------

    /// `request_deposit` by `inv` with its proof from `list`. Returns the seq.
    pub fn request_deposit(
        &mut self,
        inv: &Investor,
        list: &Allowlist,
        assets: u64,
    ) -> (TransactionResult, u64) {
        let seq = self.state().next_deposit_seq;
        let ix =
            self.request_deposit_ix(&inv.pubkey(), &inv.brs, assets, list.proof(&inv.pubkey()));
        (self.send_as(ix, &inv.key), seq)
    }

    /// `fulfil_deposits` by the admin over `seqs`.
    pub fn fulfil_deposits(&mut self, count: u8, seqs: &[u64]) -> TransactionResult {
        let admin = self.admin.insecure_clone();
        let ix = self.fulfil_deposits_ix(&admin.pubkey(), count, seqs);
        self.send(ix, &admin)
    }

    pub fn claim_shares(&mut self, inv: &Investor, seq: u64) -> TransactionResult {
        let ix = self.claim_shares_ix(&inv.pubkey(), seq, &inv.shares);
        self.send_as(ix, &inv.key)
    }

    pub fn cancel_deposit(&mut self, inv: &Investor, seq: u64) -> TransactionResult {
        let ix = self.cancel_deposit_ix(&inv.pubkey(), seq, &inv.brs);
        self.send_as(ix, &inv.key)
    }

    /// Request, fulfil and claim a deposit of `assets`. Returns the shares.
    pub fn deposit(&mut self, inv: &Investor, list: &Allowlist, assets: u64) -> u64 {
        let (res, seq) = self.request_deposit(inv, list, assets);
        res.expect("request_deposit");
        let head = self.state().deposit_head;
        let seqs: Vec<u64> = (head..=seq).collect();
        self.fulfil_deposits(seqs.len() as u8, &seqs)
            .expect("fulfil_deposits");
        let shares = self.deposit_request(seq).expect("request").shares_out;
        self.claim_shares(inv, seq).expect("claim_shares");
        shares
    }

    /// `request_redeem` by `inv` with its proof from `list`. Returns the seq.
    pub fn request_redeem(
        &mut self,
        inv: &Investor,
        list: &Allowlist,
        shares: u64,
    ) -> (TransactionResult, u64) {
        let seq = self.state().next_redeem_seq;
        let ix = self.request_redeem_ix(
            &inv.pubkey(),
            &inv.shares,
            shares,
            list.proof(&inv.pubkey()),
        );
        (self.send_as(ix, &inv.key), seq)
    }

    /// `fulfil_redeems` by the admin over `seqs`.
    pub fn fulfil_redeems(
        &mut self,
        count: u8,
        max_assets: u64,
        seqs: &[u64],
    ) -> TransactionResult {
        let admin = self.admin.insecure_clone();
        let ix = self.fulfil_redeems_ix(&admin.pubkey(), count, max_assets, seqs);
        self.send(ix, &admin)
    }

    pub fn cancel_redeem(&mut self, inv: &Investor, seq: u64) -> TransactionResult {
        let ix = self.cancel_redeem_ix(&inv.pubkey(), seq, &inv.shares);
        self.send_as(ix, &inv.key)
    }

    pub fn claim_assets(&mut self, inv: &Investor, seq: u64) -> TransactionResult {
        let ix = self.claim_assets_ix(&inv.pubkey(), seq, &inv.brs);
        self.send_as(ix, &inv.key)
    }

    pub fn advance_queue_heads(
        &mut self,
        max: u8,
        redeem_seqs: &[u64],
        deposit_seqs: &[u64],
    ) -> TransactionResult {
        let ix = self.advance_queue_heads_ix(max, redeem_seqs, deposit_seqs);
        let payer = self.payer.insecure_clone();
        self.send(ix, &payer)
    }

    // -- readers -------------------------------------------------------------

    pub fn deposit_request(&self, seq: u64) -> Option<DepositRequest> {
        let acc = self.svm.get_account(&deposit_pda(&self.pdas.config, seq))?;
        if acc.data.is_empty() {
            return None;
        }
        Some(DepositRequest::try_deserialize(&mut acc.data.as_slice()).expect("decode deposit"))
    }

    pub fn redeem_request(&self, seq: u64) -> Option<RedeemRequest> {
        let acc = self.svm.get_account(&redeem_pda(&self.pdas.config, seq))?;
        if acc.data.is_empty() {
            return None;
        }
        Some(RedeemRequest::try_deserialize(&mut acc.data.as_slice()).expect("decode redeem"))
    }

    pub fn holder(&self, owner: &Pubkey) -> Option<HolderState> {
        let acc = self
            .svm
            .get_account(&holder_pda(&self.pdas.config, owner))?;
        if acc.data.is_empty() {
            return None;
        }
        Some(HolderState::try_deserialize(&mut acc.data.as_slice()).expect("decode holder"))
    }

    /// Serializes `r` over the redeem request of its seq.
    pub fn write_redeem_request(&mut self, r: &RedeemRequest) {
        use anchor_lang::Discriminator;
        let mut data = RedeemRequest::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(r, &mut data).unwrap();
        let addr = redeem_pda(&self.pdas.config, r.seq);
        self.write_raw(&addr, &data);
    }

    /// Serializes `r` over the deposit request of its seq.
    pub fn write_deposit_request(&mut self, r: &DepositRequest) {
        use anchor_lang::Discriminator;
        let mut data = DepositRequest::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(r, &mut data).unwrap();
        let addr = deposit_pda(&self.pdas.config, r.seq);
        self.write_raw(&addr, &data);
    }

    /// Asserts the capital invariants of spec §4 over every request ever
    /// created: 4 (token balances cover the tracked amounts), 5 (shares
    /// outstanding), 8, 9 and 11 (redemption queue).
    pub fn assert_capital_invariants(&self, at: &str) {
        let s = self.state();
        let mut unclaimed_shares = 0u64;
        let mut pending_assets = 0u64;
        for seq in 0..s.next_deposit_seq {
            if let Some(r) = self.deposit_request(seq) {
                if r.status == DEPOSIT_FULFILLED {
                    unclaimed_shares += r.shares_out;
                } else {
                    pending_assets += r.assets;
                }
            }
        }
        let (mut remaining, mut claimable) = (0u64, 0u64);
        for seq in 0..s.next_redeem_seq {
            if let Some(r) = self.redeem_request(seq) {
                remaining += r.shares_remaining;
                claimable += r.assets_claimable;
                if r.status != REDEEM_CANCELLED {
                    assert_eq!(
                        r.shares_filled + r.shares_remaining,
                        r.shares_requested,
                        "{at}: invariant 11, seq {seq}"
                    );
                }
            }
        }
        assert_eq!(
            pending_assets, s.pending_deposits_total,
            "{at}: pending deposits"
        );
        assert_eq!(remaining, s.pending_redeem_shares, "{at}: invariant 8");
        assert_eq!(claimable, s.claimable_assets_total, "{at}: invariant 9");
        assert_eq!(
            self.share_supply() + unclaimed_shares,
            s.shares_outstanding,
            "{at}: invariant 5"
        );
        assert!(
            self.balance(&self.pdas.reserve) >= s.brs_balance,
            "{at}: inv 4 reserve"
        );
        assert!(
            self.balance(&self.pdas.pending_deposits) >= s.pending_deposits_total,
            "{at}: inv 4 pending_deposits"
        );
        assert!(
            self.balance(&self.pdas.claims) >= s.claimable_assets_total,
            "{at}: inv 4 claims"
        );
        assert!(
            self.balance(&self.pdas.pending_redemptions) >= s.pending_redeem_shares,
            "{at}: inv 4 pending_redemptions"
        );
    }
}

impl Fixture {
    /// Capital instructions for the pilot list, each valid in this order
    /// after `book_instructions`: request two deposits, cancel one, fulfil,
    /// claim the shares, request two redemptions, cancel one, fulfil, claim
    /// the assets, crank the heads, refresh. Building the list allowlists a fresh
    /// investor (by injecting the root) and, if the reserve holds BRS but no
    /// shares (funding injected by `book_instructions`), injects shares at
    /// NAV 1.0 so the deposit buys a normal amount.
    pub fn capital_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let s = self.state();
        if s.shares_outstanding == 0 && s.brs_balance > 0 {
            self.inject_shares(s.brs_balance);
        }
        let inv = self.investor(10_000 * super::BRL);
        let tree = Allowlist::new(&[inv.pubkey()]);
        let mut c = self.config();
        c.investor_allowlist_root = tree.root();
        self.write_config(&c);

        let s = self.state();
        let (d0, r0) = (s.next_deposit_seq, s.next_redeem_seq);
        let (d1, r1) = (d0 + 1, r0 + 1);
        let owner = inv.pubkey();
        let proof = tree.proof(&owner);
        let admin = self.admin.pubkey();
        let k = || inv.key.insecure_clone();

        let mut deposit =
            self.request_deposit_ix(&owner, &inv.brs, 3_000 * super::BRL, proof.clone());
        let mut deposit2 = deposit.clone();
        // The builders read `next_*_seq` now; the second request takes the
        // next seq.
        let config = self.pdas.config;
        deposit.accounts[3].pubkey = deposit_pda(&config, d0);
        deposit2.accounts[3].pubkey = deposit_pda(&config, d1);
        deposit2.data = mutav::instruction::RequestDeposit {
            assets: 1_000 * super::BRL,
            proof: proof.clone(),
        }
        .data();
        let mut redeem = self.request_redeem_ix(&owner, &inv.shares, 1_100 * super::BRL, proof);
        let mut redeem2 = redeem.clone();
        redeem.accounts[3].pubkey = redeem_pda(&config, r0);
        redeem2.accounts[3].pubkey = redeem_pda(&config, r1);

        vec![
            ("request_deposit", deposit, k()),
            ("request_deposit", deposit2, k()),
            (
                "cancel_deposit",
                self.cancel_deposit_ix(&owner, d1, &inv.brs),
                k(),
            ),
            (
                "fulfil_deposits",
                self.fulfil_deposits_ix(&admin, 2, &[d0, d1]),
                self.admin.insecure_clone(),
            ),
            (
                "claim_shares",
                self.claim_shares_ix(&owner, d0, &inv.shares),
                k(),
            ),
            ("request_redeem", redeem, k()),
            ("request_redeem", redeem2, k()),
            (
                "cancel_redeem",
                self.cancel_redeem_ix(&owner, r1, &inv.shares),
                k(),
            ),
            (
                "fulfil_redeems",
                self.fulfil_redeems_ix(&admin, 2, u64::MAX, &[r0, r1]),
                self.admin.insecure_clone(),
            ),
            (
                "claim_assets",
                self.claim_assets_ix(&owner, r0, &inv.brs),
                k(),
            ),
            (
                "advance_queue_heads",
                self.advance_queue_heads_ix(4, &[r0, r1], &[d0, d1]),
                self.payer.insecure_clone(),
            ),
            ("refresh", self.refresh_ix(&[]), self.payer.insecure_clone()),
        ]
    }
}

impl Fixture {
    /// `refresh` (spec §5.8), with `payouts` as `(guarantee, payout)` pairs of
    /// remaining accounts (Task 10).
    pub fn refresh_ix(&self, payouts: &[(Pubkey, Pubkey)]) -> Instruction {
        let mut metas = mutav::accounts::Refresh {
            config: self.pdas.config,
            state: self.pdas.state,
            reserve: self.pdas.reserve,
            pending_deposits: self.pdas.pending_deposits,
            pending_redemptions: self.pdas.pending_redemptions,
            claims: self.pdas.claims,
            event_authority: self.pdas.event_authority,
            program: mutav::ID,
        }
        .to_account_metas(None);
        for (g, p) in payouts {
            metas.push(AccountMeta::new_readonly(*g, false));
            metas.push(AccountMeta::new(*p, false));
        }
        Instruction::new_with_bytes(mutav::ID, &mutav::instruction::Refresh {}.data(), metas)
    }

    /// `clear_fulfil_halt` (spec §5.1; ADR 0015) signed by `signer`.
    pub fn clear_fulfil_halt_ix(&self, signer: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            mutav::ID,
            &mutav::instruction::ClearFulfilHalt {}.data(),
            mutav::accounts::ClearFulfilHalt {
                admin: *signer,
                config: self.pdas.config,
                state: self.pdas.state,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `clear_fulfil_halt` signed by the admin.
    pub fn clear_fulfil_halt(&mut self) -> TransactionResult {
        let admin = self.admin.insecure_clone();
        let ix = self.clear_fulfil_halt_ix(&admin.pubkey());
        self.send(ix, &admin)
    }

    /// `refresh` sent by a fresh, unrelated signer (it is permissionless).
    pub fn refresh(&mut self) -> TransactionResult {
        self.refresh_with(&[])
    }

    /// `refresh` passing the payouts of `claims` (their guarantee and payout
    /// accounts).
    pub fn refresh_with(&mut self, claims: &[super::Claim]) -> TransactionResult {
        let anyone = Keypair::new();
        self.svm
            .airdrop(&anyone.pubkey(), 1_000_000_000)
            .expect("airdrop");
        let config = self.pdas.config;
        let pairs: Vec<(Pubkey, Pubkey)> = claims
            .iter()
            .map(|c| {
                let g = super::guarantee_pda(&config, &c.id);
                (g, super::payout_pda(&g, &c.notice))
            })
            .collect();
        let ix = self.refresh_ix(&pairs);
        super::send_ix(&mut self.svm, ix, &[&anyone])
    }
}
