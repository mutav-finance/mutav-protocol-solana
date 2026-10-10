//! Random sequences of `register_guarantee`, `file_claim`, `pay_claim` and
//! `close_guarantee` with several open filings per leg (spec §4 invariants
//! 2 and 3, §5.4; ADR 0014). After every step the on-chain book must match a
//! model rebuilt from the accounts.

use mutav::{constants::*, errors::MutavError, state::Guarantee};
use mutav_tests::helpers::*;

/// Deterministic xorshift, so a failure names a reproducible seed and step.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// `(cover, paid, provision)` of `leg`.
fn leg(g: &Guarantee, leg: u8) -> (u64, u64, u64) {
    match leg {
        LEG_DEFAULT => (g.default_cover, g.default_paid, g.provision_default),
        _ => (g.exit_cover, g.exit_paid, g.provision_exit),
    }
}

struct Book {
    agencies: Vec<[u8; 32]>,
    /// Active guarantees: (id, agency).
    active: Vec<([u8; 32], [u8; 32])>,
    /// Open filings, with their filed provision.
    open: Vec<(Claim, u64)>,
}

impl Book {
    fn assert_matches(&self, f: &Fixture, ctx: &str) {
        let s = f.state();

        // provisions = Σ open ClaimFiling.provision (invariant 3), read back
        // from the filings themselves.
        let mut sum_prov = 0u64;
        for (c, p) in &self.open {
            let filing = f.claim_filing(c);
            assert_eq!(filing.status, CLAIM_FILED, "{ctx}: filing status");
            assert_eq!(filing.provision, *p, "{ctx}: filing provision");
            sum_prov += filing.provision;
        }
        assert_eq!(s.provisions, sum_prov, "{ctx}: state.provisions");

        let mut total = 0u64;
        for (id, _) in &self.active {
            let g = f.guarantee(id);
            for l in [LEG_DEFAULT, LEG_EXIT] {
                let (cover, paid, prov) = leg(&g, l);
                // Invariant 2, per leg.
                assert!(paid <= cover, "{ctx}: paid > cover on leg {l}");
                assert!(
                    prov <= cover - paid,
                    "{ctx}: provision > remaining on leg {l}"
                );
                let filed: u64 = self
                    .open
                    .iter()
                    .filter(|(c, _)| c.id == *id && c.leg == l)
                    .map(|(_, p)| p)
                    .sum();
                assert_eq!(prov, filed, "{ctx}: leg {l} provision vs open filings");
            }
            let n_open = self.open.iter().filter(|(c, _)| c.id == *id).count();
            assert_eq!(g.open_claims as usize, n_open, "{ctx}: open_claims");
            total += remaining_cover(&g);
        }
        assert_eq!(
            s.remaining_cover_total, total,
            "{ctx}: remaining_cover_total"
        );
    }
}

fn run(seed: u64, steps: usize) {
    let mut f = Fixture::new();
    f.fund_reserve(1_000_000 * BRL);
    let mut rng = Rng(seed);
    let mut book = Book {
        agencies: (0..3).map(|_| unique_hash()).collect(),
        active: Vec::new(),
        open: Vec::new(),
    };
    let mut now = clock(&f.svm).unix_timestamp.max(1_750_000_000);
    // Past the 31-day claim window (ADR 0019).
    let period = 31 * 86_400;

    for step in 0..steps {
        let ctx = format!("seed {seed:#x} step {step}");
        match rng.below(10) {
            // Register: covers ≤ R$5k per leg keep every bound under the
            // per-call cap.
            0 | 1 if book.active.len() < 6 => {
                let ag = book.agencies[rng.below(3) as usize];
                let d = (1 + rng.below(5_000)) * BRL;
                let e = rng.below(5_000) * BRL;
                let args = guarantee_args(ag, d, e);
                f.register(args.clone())
                    .unwrap_or_else(|e| panic!("{ctx} register: {:?}", e.err));
                book.active.push((args.id, ag));
            }
            // Close a guarantee with no open filing.
            2 => {
                let closable: Vec<usize> = (0..book.active.len())
                    .filter(|&i| book.open.iter().all(|(c, _)| c.id != book.active[i].0))
                    .collect();
                if let Some(&i) = closable.get(rng.below(closable.len().max(1) as u64) as usize) {
                    let (id, _) = book.active.swap_remove(i);
                    f.close_guarantee(id)
                        .unwrap_or_else(|e| panic!("{ctx} close: {:?}", e.err));
                }
            }
            // File: any amount in the leg's unprovisioned cover.
            3..=5 if !book.active.is_empty() => {
                let (id, ag) = book.active[rng.below(book.active.len() as u64) as usize];
                let l = rng.below(2) as u8;
                let (cover, paid, prov) = leg(&f.guarantee(&id), l);
                let unprov = cover - paid - prov;
                if unprov > 0 {
                    let amount = 1 + rng.below(unprov);
                    let c = Claim {
                        id,
                        agency_id: ag,
                        leg: l,
                        amount,
                        notice: unique_hash(),
                    };
                    f.file_claim(c)
                        .unwrap_or_else(|e| panic!("{ctx} file: {:?}", e.err));
                    book.open.push((c, amount));
                }
            }
            // Pay an open filing: partial, exact provision, over the
            // provision within the ADR 0014 bound, or one above the bound.
            _ if !book.open.is_empty() => {
                let i = rng.below(book.open.len() as u64) as usize;
                let (c, p) = book.open[i];
                let (cover, paid, prov) = leg(&f.guarantee(&c.id), c.leg);
                let unprov = cover - paid - prov;
                let bound = p + unprov;
                // A fresh period per payment keeps the period cap out of play.
                now += period;
                set_time(&mut f.svm, now);
                let (amount, ok) = match rng.below(4) {
                    0 => (1 + rng.below(p), true),
                    1 => (p, true),
                    2 => (p + rng.below(unprov + 1), true),
                    _ => (bound + 1, false),
                };
                let res = f.pay_claim(c.amount(amount));
                if ok {
                    res.unwrap_or_else(|e| panic!("{ctx} pay {amount}/{bound}: {:?}", e.err));
                    book.open.swap_remove(i);
                } else {
                    assert_mutav_err(res, MutavError::ExceedsRemainingCover);
                }
            }
            _ => {}
        }
        book.assert_matches(&f, &ctx);
    }

    // Liveness (ADR 0014): every open filing can still be paid its
    // provision, and then every guarantee can close.
    while let Some((c, p)) = book.open.pop() {
        now += period;
        set_time(&mut f.svm, now);
        f.pay_claim(c.amount(p))
            .unwrap_or_else(|e| panic!("seed {seed:#x} drain: {:?}", e.err));
        book.assert_matches(&f, "drain");
    }
    for (id, _) in std::mem::take(&mut book.active) {
        f.close_guarantee(id)
            .unwrap_or_else(|e| panic!("seed {seed:#x} final close: {:?}", e.err));
    }
    let s = f.state();
    assert_eq!((s.provisions, s.remaining_cover_total), (0, 0));
}

#[test]
fn filing_and_paying_keep_the_book_consistent() {
    for seed in [0x9e37_79b9, 0x85eb_ca6b, 0xc2b2_ae35, 0x27d4_eb2f] {
        run(seed, 80);
    }
}
