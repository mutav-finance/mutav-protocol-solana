# MUTAV: demo video script (Colosseum Crypto World's Fair)

Draft, restructured 2026-10-11. It is a **recorded** demo: silent screen clips per beat, then a voiceover recorded to the cut. The visual storyboard is the companion file [`storyboard.html`](storyboard.html): self-contained, it prints one frame per page. This file and that one match.

- **Runtime:** 2:45 (limit 3:00).
- **Voiceover:** 303 words (Edit A) / 300 (Edit B), about 2:10 of speech at about 140 wpm.
- **Deadline:** Oct 12, 23:59 BRT. Hard stop for submission at 23:00.
- **Recorded on:** devnet at `reserve.mutav.finance`, PR #37 app code.

**Story:** one lease, end to end, and the chain is the proof. Ana needs a guarantor to rent in Passo Fundo, and her agency uses MUTAV. Her lease goes on Solana. A second lease is refused by the coverage gate. Her missed rent is claimed, paid, and its PIX settlement recorded. Anyone can verify it, and the flywheel grows the reserve.

**Wow moments:**
- (1) The refusal, at 0:45.
- (2) Rent unpaid, then claim filed, paid and settled in minutes, at 1:15.

**Binding rules:**
- Say "coverage gate" / "gated by required coverage", never "solvency".
- Say "guarantee fee", never "premium". MUTAV is "the guarantor", never insurance. Name no chain other than Solana.
- Ana is fictional, and so are the agency names and lease references. Say so in the production notes, not in the video.
- The PIX is *recorded* on-chain. No bank screens.
- The return is "modeled", never "APY".

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00–0:15 | Hook: Ana | F1–F2 |
| 0:15–0:45 | The lease goes on-chain | F3–F5 |
| 0:45–1:15 | **The refusal** | F6–F7 |
| 1:15–1:57 | **Rent goes unpaid: file → pay → settle** | F8–F10 |
| 1:57–2:27 | Anyone can verify · the flywheel | F11–F12 |
| 2:27–2:45 | Close | F13 |

## 2. Shot list

**F1 · 0:00–0:06 · title card (made in the editor)**
- **On screen:** "Passo Fundo · RS / Ana needs a guarantor" on the brand grid.
- **VO:** "Ana wants to rent an apartment in Passo Fundo."
- **Proof:** none.

**F2 · 0:06–0:15 · `/operator`, register_guarantee tab**
- **On screen:**
  - Lease reference `MTV-PF-0006` (opaque) and a fictional agency name.
  - Rent 1500, default 3×, exit 1×, which is R$6,000 of cover.
  - The PREVIEW turns green.
- **VO:** "She has no personal guarantor and no spare months of rent for a deposit. Her agency offers MUTAV as her guarantor."
- **Proof:** the bound box shows free capital R$1,000, read from chain.

**F3 · 0:15–0:27 · `/operator`**
- **On screen:**
  - Click **register_guarantee**. Cut the Phantom pop-up.
  - "Confirmed", the tx link, and the moved table: required 9,000 → 9,600 ▲, free 1,000 → 400 ▼, active 5 → 6 ▲.
- **VO:** "MUTAV's operator registers her lease on Solana: six thousand reais of cover. Forty-five hundred for unpaid rent, fifteen hundred to recover the property."
- **Proof:** the devnet tx signature.
- **Retake:** this consumes R$600 of free capital and the lease reference. `close_guarantee` VOID returns free capital to R$1,000. Then register with a new reference (`MTV-PF-0006b`); the closed lease stays on /reserve as a "closed" row.

**F4 · 0:27–0:38 · Solana Explorer**
- **On screen:** the tx, then the new `Guarantee` PDA: owner is the MUTAV program, plus an opaque id.
- **VO:** "On-chain, that's one account per lease, a PDA holding the cover and an opaque ID. Ana's name, CPF and address never leave MUTAV."
- **Proof:** an Explorer account page.
- **If the IDL isn't on-chain:** Explorer shows raw bytes, which still proves there's no personal data.

**F5 · 0:38–0:45 · `/reserve#coverage` (no wallet)**
- **On screen:** the metric cards and the new row.
- **VO:** "The public reserve updates at once: coverage required goes up, free capital goes down."

**F6 · 0:45–1:00 · `/operator`**
- **On screen:**
  - `MTV-PF-0007` with the same amounts.
  - Red PREVIEW: "Would be refused: InsufficientFreeCapital", required after R$10,200 against stable R$10,000, R$200 short.
- **VO:** "Now one more lease, the same size. The reserve must hold ten percent of all the cover it guarantees, and there isn't room. The preview replays the program's rule, and turns red."

**F7 · 1:00–1:15 · `/operator`**
- **On screen:**
  - Click **Send anyway**. Phantom may warn; confirm.
  - Status "Failed · InsufficientFreeCapital".
- **VO:** "We send it anyway. The program refuses it: InsufficientFreeCapital. That's the coverage gate. MUTAV can't sign a guarantee the reserve can't back."
- **Proof:** the program's error name from the simulation logs. There is **no Explorer link**, because the transaction never lands.
- **Retake:** repeatable without limit; nothing lands. *Optional:* if you want an Explorer link, send the same instruction once with `skipPreflight`; its logs show `InsufficientFreeCapital`.

**F8 · 1:15–1:27 · `/operator`, file_claim tab**
- **On screen:**
  - Ana's guarantee, leg default, R$3,000, notice `NTC-PF-0001`.
  - Moved table: provisions ▲, NAV ▼.
- **Retake:** one filing per notice, and Ana's default leg has only R$1,500 left, so a full redo of F8–F10 means a fresh claim on an R$18k guarantee (notice `NTC-PF-0002`). Each redo uses R$3,000 of that leg, R$3,000 of the R$20k per-period cap (about 6 redos at most) and R$3,000 of reserve, and adds a timeline row. If only the recording was bad, continue on the same claim.
- **VO:** "Months later, Ana's rent goes unpaid. The agency sends the claim. MUTAV files it, and a provision is booked before any money moves."

**F9 · 1:27–1:43 · `/operator`, pay_claim tab**
- **On screen:**
  - The bound box: R$10k per call, R$20k per period, "within the caps".
  - Click **pay_claim R$3,000**. Stable 10,000 → 7,000 ▼, required 9,600 → 9,300.
- **VO:** "MUTAV pays it from the reserve, only to its own payments account, and within a per-call cap the admin sets."
- **Record Take A; choose the line in the edit.** Also capture a 5 s clip right after the payment: click Refresh on `/reserve#health` (mode changes only on `refresh`), and the badge shows under-covered, R$9,300 against R$7,000.
  - **Edit A** uses that clip and the line: "This payment takes the reserve below its target. It's paid anyway: the coverage gate never blocks a claim."
  - **Edit B** drops the clip and uses: "The coverage gate never blocks a claim, even when the reserve dips below its target."
  - Optional on-chain Take B (never under target): see Appendix B.
- **Retake:** one payment per filing; a redo needs a fresh claim (see F8). Keep claims ≤ R$10k.

**F10 · 1:43–1:57 · `/operator` settle_payout tab → `/reserve#claims`**
- **On screen:** settle with the prefilled PIX id (only its SHA-256 goes on-chain). The timeline row shows Filed → Paid → Settled, with timestamps.
- **VO:** "The PIX to the agency is recorded on-chain with a hash of its receipt. Filed, paid and settled in minutes, where seguro-fiança can take up to thirty days." (Source: SUSEP Circular 621/2021, art. 43, as cited in the [litepaper](../litepaper.md).)
- **Caption:** "Devnet: PIX simulated · record on-chain".

**F11 · 1:57–2:10 · `/reserve#health` → `#accounts`**
- **On screen:** a smooth scroll down to "Every account" and its Explorer links. **Capture after the coverage restore**, so it reads healthy (R$12,960 against R$9,300) for both edits.
- **VO:** "None of this asks for trust. Every number here is read straight from the program's accounts, by anyone, with no wallet."

**F12 · 2:10–2:27 · `/reserve#flows` + flywheel overlay**
- **On screen:** the off-camera `contribute_fees 1200` is booked (R$960 to the reserve, R$240 take).
- **VO:** "Guarantee fees and Nora's issuer revenue on the BRS grow the reserve, and a bigger reserve backs more contracts. In our conservative pilot case, that's modeled at about twenty-one percent a year."
- **Caption, on screen the whole time the figure is spoken:** "Modeled ~21%/yr · conservative pilot case: Nora issuer revenue + guarantee fees, net of expected claims and MUTAV's take. A model, not a promise."

**F13 · 2:27–2:45 · tagline card**
- **On screen:** "A guarantor on the agency's side · Brazil's onchain rent guarantee", `reserve.mutav.finance`, `github.com/mutav-finance/mutav-protocol-solana`. Hold in silence to the end.
- **VO:** "MUTAV. A guarantor on the agency's side. Brazil's onchain rent guarantee. Open source, and live on devnet."

## 3. Devnet starting state (checked at c = 0.10)

**The numbers:**
- R$10,000 deposit, plus 5 guarantees × R$18,000 (rent 2,000 × 6 default + 3 exit). That's R$90,000 of cover, so R$9,000 required and **R$1,000 free**.
- Ana's R$6,000 lease needs R$600: it fits and leaves R$400.
- A second R$6,000 lease would need R$10,200 required against R$10,000: refused, R$200 short.
- Claim of R$3,000: stable 7,000, remaining cover 93,000, required 9,300. That's under-covered until the restore.

**Order:**
1. Deploy and `initialize` (upgrade Squads, 1 h lock), then `verify.ts`.
2. Vercel env.
3. Fund the capital wallet with ≥ R$15k BRS from the operator wallet (R$10k now, R$5k for the restore).
4. `set_allowlist_root` if needed (admin Squads 2-of-2, 5 min lock).
5. Capital wallet: `request_deposit 10000`, then Squads `fulfil_deposits`, then `claim_shares`.
6. Operator: register the 5 guarantees.
7. State check: 10,000 / 9,000 / 1,000 / 5 active.
8. No fees or claims before capturing F2–F10.

**Order of capture:**
1. Capture F2–F10 as silent screen clips, one per beat. Waits are cut in the edit.
2. Off-camera: `contribute_fees 1200`, then the **coverage restore**:
   - capital wallet `request_deposit 5000`;
   - Squads `fulfil_deposits` (2-of-2, 5 min lock);
   - capital wallet `claim_shares`;
   - any wallet sends `refresh`;
   - result: stable R$12,960, required R$9,300, free R$3,660, mode Normal.
3. Capture F11–F12.
4. Rough cut, record the VO to the cut, then fine-tune.

**Why the restore works** (`programs/mutav`, branch `feat/interfaces`):
- `fulfil_deposits` is allowed while under-covered: it is "the recapitalization path (ADR 0008)" (`capital/fulfil_deposits.rs:2-3`).
- Its only gates are pause and the fulfil halt (`:75-77`), plus the TVL cap (`:168-172`). `request_deposit` checks only pause (`capital/request_deposit.rs:76`).
- Mode changes only in `refresh` (`public/refresh.rs:105-110`), and `pay_claim` has no mode check (`operator/pay_claim.rs:3,157`). So send `refresh` after the restore.
- **Alternative without Squads:** `close_guarantee` RELEASED on two R$18k demo leases (not gated, not paused: `operator/close_guarantee.rs:1-2`). That gives R$5,700 required against R$7,960, then `refresh`. It shrinks the book to 4 active leases, so the deposit is preferred.

**What judges will see on `/reserve` afterwards:**
- **Health:** mode Normal, free capital R$3,660.
- **Ana's guarantee `5e1f…`:** active, default left R$1,500, exit left R$1,500, no open claims. Only an opaque id and agency hash.
- **One claim row:** R$3,000, filed → paid → settled minutes apart, with a PIX hash. The page doesn't say the PIX was simulated, so add "devnet: PIX settlement simulated; the record is real" to the submission text.
- **The 5 setup guarantees.**
- **Money flows:** deposits of R$10k and R$5k, one guarantee fee, one claim payment.
- **The refused lease:** leaves nothing.
- **Retake leftovers:** VOID-closed leases ("closed" rows) or extra claim rows. Keep them few, and mention them if present.

**The app can't do these on devnet:**
- The stress-buffer term: it's in config, but no rule in the PR #37 binary reads it.
- An Explorer link for the refusal.
- Claims above R$10k: they need `approve_claim`, which comes in Wave 2.
- A lease **term**: the Guarantee account stores only cover legs and `registered_at`, so the VO doesn't claim a term on-chain.
- Real Nora issuer income.
- A real PIX transfer: only the record is real.

The optional `skipPreflight` failing tx is only needed if you want an Explorer link for the refusal.

**Run sheet (BRT, Oct 12):**

| Time | What |
|---|---|
| Night of Oct 11 | Deploy and verify; setup steps 2–8 if devnet is live |
| By 10:00 | Setup done (if not ready by 12:00, record on localnet) |
| 10:00–12:00 | Capture F2–F10, plus the Refresh clip |
| 12:00–12:30 | Fee and coverage restore |
| 12:30–13:00 | Capture F11–F12 |
| 13:00–15:00 | Rough cut, then the VO |
| 15:00–18:00 | Fine-tune, captions; choose Edit A or B |
| 18:00 | Review |
| 19:00 | Export and upload unlisted |
| 20:00 | **Judge-ready check** of `/reserve` in a private window |
| 20:30 | Submit |
| 23:00 | Hard stop |

Recording setup, editing, export details and the risks table are in the HTML storyboard.

## Appendix B · optional Take B (stays covered on screen)

After capturing F6–F7 and before F8:
1. Capital wallet `request_deposit 5000`.
2. Squads `fulfil_deposits` (admin signers, 2-of-2, 5-minute lock, Execute), then `claim_shares`.
3. Stable becomes R$15,000. After the R$3,000 payment it's R$12,000 against R$9,300, still covered.
4. The restore is then not needed. Still send `refresh` and run the judge-ready check.

## 4. Open production decisions

1. Edit A or B is chosen in the edit from the same footage. Whether to also record the optional on-chain Take B (Appendix B).
2. Narrator, pronunciation of "MUTAV", and whether to use a face cam.
3. Scheduling of the admin Squads rounds (allowlist if needed, the R$10k fulfil, the R$5k restore): admin signers (2-of-2) approve each one.
4. Issuer income: leave it at R$0 on devnet, or simulate a sweep with a "simulated" caption.
