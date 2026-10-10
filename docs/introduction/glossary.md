# Glossary

Terms used across the MUTAV docs, grouped by topic. Code names are in `monospace`. Amounts are in BRL (R$); on-chain they are BRS base units at 6 decimals, with 1 BRS valued at R$1.

## Brazilian legal and market terms

| Term | Meaning |
|---|---|
| Agency (*imobiliária*) | The real-estate agency that runs the lease, offers MUTAV's guarantee, collects the guarantee fee with the rent, pays MUTAV one bill a month and sends payment requests. Agencies never sign on-chain. |
| *Caução* | A cash deposit given as a lease guarantee. Capped at three months' rent. |
| Claims tail | A period after the lease ends, or after an exoneration takes effect, during which claims may still be filed. Planned with the fuller fiança lifecycle; its length is open (spec §12, Q35). |
| *Exoneração* (exoneration) | The fiador's exit from a guarantee once a lease runs for an indefinite term, after a statutory notice. Planned with the fuller fiança lifecycle. |
| Fiador | The guarantor in a fiança. MUTAV is an institutional fiador. |
| Fiança | A personal guarantee of a lease under Brazilian law (Lei 8.245/91, art. 37 II; Código Civil arts. 818 ff.). A *fiança onerosa* is a paid fiança. |
| Lei do Inquilinato | Lei 8.245/91, Brazil's residential lease law. It allows one guarantee per lease. |
| Limited fiança | A fiança with a fixed R$ ceiling (CC 823). Each MUTAV guarantee is one. |
| Payment request (*pedido de pagamento*) | The agency's request to MUTAV, on the landlord's behalf, after the tenant defaults. MUTAV reviews it off-chain and files a claim on-chain. |
| Pix | Brazil's instant payment system. MUTAV pays agencies by Pix. The program stores a hash of the Pix end-to-end ID. |
| *Principal pagador* | MUTAV waives the right to make the landlord pursue the tenant first (CC 827–828). |
| *Quitação* | The landlord's receipt that discharges a payment. The agency gives it under the landlord's mandate. Recorded on-chain later, with the fuller fiança lifecycle. |
| *Valor afiançado* | The R$ ceiling of one fiança: default cover plus exit cover. It includes interest, penalties and court costs. |

## Guarantees and claims

| Term | Meaning |
|---|---|
| Bank-first payment | MUTAV pays the agency by Pix from its own bank account first, and the reserve then reimburses MUTAV's payments account through `pay_claim`. Keeps payments on time while an approval waits or a reserve account is frozen. |
| Claim | A payment request booked on-chain by the operator with `file_claim` (a `ClaimFiling` account). Each claim is one event, such as one month's rent or one exit payment. The same account records its payment and settlement. Status: `FILED`, `PAID`, `WITHDRAWN` or `SETTLED`. |
| Claim amendment | The operator changes a filed claim's amount with `amend_claim`. Lowering it releases the difference; raising it books more, up to the leg's unprovisioned cover. Amending to 0 withdraws the claim. Any approval resets. |
| Claim approval | `approve_claim`, a reserve-admin action. Needed when a claim is above `max_claim_per_call`. It binds the exact amount that may leave the reserve. It does not judge whether the claim is valid. |
| Claim payment | `pay_claim`: BRS sent from the reserve to MUTAV's payments account. It pays exactly the filed provision. Never refused by the solvency gate or a pause. |
| Claim withdrawal | The operator releases a filed claim's whole provision with `amend_claim` to 0. The claim becomes `WITHDRAWN`. |
| Re-file (`refile_claim`) | The operator files a `WITHDRAWN` claim again on the same notice. It starts from scratch: provision, filing time and any approval are reset. |
| Close (`close_guarantee`) | The operator ends a guarantee with a reason: `VOID` (nothing paid, no open claim) or `RELEASED` (no open claim). Releases the remaining cover. The account stays readable. |
| Cover | The R$ ceiling a guarantee can pay, split into two legs. Covers never change after registration. |
| Default leg / exit leg | The two sub-limits of one guarantee's cover: rent and charges in arrears (default), and the tenant's debts at the end of the lease (exit). |
| Guarantee | One lease's fiança, recorded as a `Guarantee` account by `register_guarantee`. Holds the agency ID, rent, cover per leg, amounts paid and status. |
| Guarantee fee | What the tenant pays each month for the fiança, with the rent. Booked on-chain per agency bill with `contribute_fees`. Net of MUTAV's take, it enters the reserve and raises NAV. Never mints shares. |
| Provision | The amount of a filed, unpaid claim. It lowers NAV at once and is always held in full in coverage required. |
| Reinstate (`reinstate_guarantee`) | The operator undoes a close, within an admin-set maximum age (`max_reinstate_age`). Used to correct a wrongful close. |
| Remaining cover | Cover not yet paid on a guarantee, summed over both legs. |
| Settlement (`settle_payout`) | The operator records that MUTAV paid the agency, with the Pix end-to-end hash. |
| Sliding claim window | The limit on total claim payments (`max_claim_per_period`) over any 31-day window, kept as 31 daily totals. A payment goes through only if the last 31 days plus this payment stay within the cap, so no 30-day span exceeds it. Approved payments count toward it. |
| Unprovisioned cover | Remaining cover minus provisions: cover that could still be claimed. |

## Reserve and economics

| Term | Meaning |
|---|---|
| Backstop | MUTAV's own BRS, booked into the reserve by the admin with receipt kind `BACKSTOP`. It mints no shares, so it raises NAV for every holder. Used to recapitalise the reserve. |
| BRS | A BRL stablecoin on Solana issued by Nora. The reserve's only asset in v1. Classic SPL token, 6 decimals. |
| Coverage ratio (`c`) | The share of all remaining cover the reserve must hold. Program floor 0.10, program maximum 1.0. Devnet value 0.10. |
| Coverage required | What the reserve must hold: `max(c × remaining cover, provisions + min(stress buffer, unprovisioned cover))`. Gates new guarantees and redemptions, never claim payments. |
| Fee take | MUTAV's share of each guarantee fee (`fee_take_bps`), sent straight to the treasury account. Program maximum 30%. Devnet value 20%. |
| Free capital | Stable assets above coverage required. Backs new guarantees and redemptions. |
| Income inbox | The account where Nora pays issuer income. Untracked. Its money counts toward nothing until the operator books it with `sweep_income`. |
| Internal accounting | The program tracks the amounts it moved, not raw token balances. A direct transfer into a reserve account does not move NAV. |
| Issuer income | Nora's monthly partnership revenue, paid in BRS to the income inbox and booked with `sweep_income`. Reported apart from guarantee fees. Never enters the coverage math. BRS itself bears no interest. |
| NAV per share | Net assets divided by shares outstanding. Computed on-chain. Every capital fill is priced at the NAV of that fill. |
| NAV-move guard | Halts capital fills when the share value moves by more than `max_nav_move_bps` without a booked inflow to explain it. Only the admin clears the halt. |
| Net assets | Stable assets minus provisions. |
| Payments account | MUTAV's BRS token account that receives claim payments. Whitelisted by the admin. Not owned by the operator. |
| Reserve | The BRS held by the `mutav` program to back the guarantees. Operational infrastructure, not a yield product. |
| `ReserveUnderwater` | The refusal of deposit fills while net assets are 0 with shares outstanding, so new money never pays for old losses. Recovery is a MUTAV backstop. |
| Settlement floor | The minimum share of stable assets held in BRS. 100% in v1. |
| Solvency gate | The check that refuses a new guarantee or a redemption fill if the reserve could not back coverage required afterwards. It never applies to claim payments. |
| Stable assets | Tracked BRS in the reserve (plus any future priced asset). Excludes pending deposits and money owed to redeemers. A frozen reserve counts as 0. |
| Stress buffer | An admin-set R$ amount for the claims that could be filed next, held on top of provisions. Sized from the book, for example the three largest rents plus one exit payment. Devnet value R$19k. |
| Treasury account | MUTAV's BRS token account that receives the fee take. Not part of the reserve. |
| Under-coverage | Stable assets below coverage required. New guarantees and redemptions stop; claims keep being paid. Public label: "reserve below target; MUTAV backstop active". |
| Unsolicited money | BRS or other tokens that arrived outside a booking path. Held in a separate `unsolicited` account. The admin returns it to the original sender (within 30 days of a request) or books it (receipt kind `UNSOLICITED`). Dust below R$10 is booked directly; that threshold is an off-chain runbook value. |

## Capital

| Term | Meaning |
|---|---|
| Allowlist | The on-chain Merkle root of wallets allowed to request deposits. KYC is done off-chain. |
| Capital provider | A wallet that holds reserve shares. During the pilot, only MUTAV's own capital wallet. The app route is `/investor`. |
| Deposit / redemption queue | First-in, first-out queues of capital requests. Each request is its own account. The reserve admin fills them in order. |
| Exit fallback | After a maximum queue wait (`max_queue_wait_secs`), anyone can fill the head redemption under the same rules. The parameter is reserved and off for devnet; it is built before outside capital. |
| Full exit | Redeeming every share a wallet holds. Allowed below `min_request`, from the owner's canonical share account only. |
| Open exit | Any wallet that already holds shares can redeem, even after removal from the allowlist. |
| Cancel deposit (`cancel_deposit`) | The owner, or the admin, cancels a pending deposit. The BRS goes back to the owner's own BRS account, and the queue moves on. |
| Reserve share | An SPL token for a pro-rata share of net assets. Minted on deposit fills, burned on redemption fills. |
| Whole fills | The pilot fills each request in full or not at all. Partial fills at the queue head are planned. |

## Roles and governance

| Term | Meaning |
|---|---|
| Anyone | Any signer. May run the permissionless cranks `refresh`, `advance_queue_head` and `skim`. |
| Guardian | One of up to three keys, appointed by the admin in one step, that can only pause. Cannot revoke, unpause or change anything. Devnet: 1 guardian. With the first adapter upgrade, guardians may also take the risk-reducing adapter actions of ADR 0027. |
| Operator | MUTAV's hot key that runs contracts, agencies and the whole guarantee and claim cycle. Every operator registry action can be reversed by another operator action. Only `pay_claim` is irreversible, and it is bounded by the admin's caps. |
| Operator-compromise recovery | Freeze (the pauser revokes the operator), appoint a new operator, reconcile the platform's records with on-chain events, and correct with ordinary operator actions. |
| Pause | Stops only capital flows and new guarantees. Never stops claims and never traps holders' money. Only the admin unpauses. |
| Pauser | A separate key for emergencies. Can `pause` and `revoke_operator`, with no time lock. |
| Reserve admin | A Squads v4 multisig that looks after the reserve's financial health and security through ceilings: caps, coverage ratio, stress buffer, roles, accounts, the allowlist, capital fills, claim approvals above the per-call cap, unsolicited money, unpause. It does not judge contracts. |
| Squads | A multisig program on Solana. Its vault address is the reserve admin and, through a second multisig, the upgrade authority. |
| Time lock | The delay between approval and execution of a multisig proposal. Devnet: 5 minutes for the admin multisig, 1 hour for the upgrade multisig. Real pilot: 24 hours and 7 days. |
| Two-step handover | A new operator, pauser or admin key must accept its role before it takes effect, so a typo can't appoint a dead address. Pending handovers expire after 72 hours, and revoking the operator clears the pending operator and pauser keys. |
| Two multisigs | The admin multisig (short time lock) and the upgrade multisig (long time lock), with the same members. |

## Solana terms

| Term | Meaning |
|---|---|
| Account | A piece of on-chain state. The program's accounts hold the reserve's configuration, state, guarantees, claims and requests. |
| ATA | Associated token account: the default token account of a wallet for a given mint. |
| Carve | Turning bytes at the front of an account's reserved space into a new field without changing the account size. |
| CPI | Cross-program invocation: one program calling another, for example the token program. |
| Instruction | A call into a program, such as `register_guarantee` or `pay_claim`. |
| Layout freeze | From the devnet deploy, v1 account layouts change only through carves or new accounts. |
| Mint | The account that defines a token, such as BRS or the reserve share. |
| PDA | Program-derived address: an address owned by a program and derived from fixed seeds. |
| Upgrade authority | The key allowed to replace the program's code. For MUTAV, the upgrade multisig vault. |
| Vault authority | The PDA that owns every reserve token account and the share mint. It signs every outbound transfer. |

## Sources

- [Specification §2 Roles and keys](../spec.md#2-roles-and-keys), [§2.2 MUTAV as fiador](../spec.md#22-mutav-as-fiador-off-chain-duties-adr-0012), [§3 Accounts](../spec.md#3-accounts), [§4 Invariants and formulas](../spec.md#4-invariants-and-formulas), [§8 Caps](../spec.md#8-caps), [§12 Open questions](../spec.md#12-open-questions)
- [Litepaper, Appendix A Glossary](../litepaper.md#a-glossary)
- Program code: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs), [`programs/mutav/src/state/`](../../programs/mutav/src/state/), [`programs/mutav/src/math.rs`](../../programs/mutav/src/math.rs), [`programs/mutav/src/solvency.rs`](../../programs/mutav/src/solvency.rs)
- Lei 8.245/91: <https://www.planalto.gov.br/ccivil_03/leis/l8245.htm>
- Código Civil: <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm>
- Solana documentation (accounts, PDAs, CPI): <https://solana.com/docs/core>
- Squads v4: <https://github.com/Squads-Protocol/v4>

## Decisions

- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0007: MUTAV's fee take goes directly to the treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0008: One capital flow for everyone; FIFO deposits; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0015: Admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below 1.0](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- ADR 0019: v1 layout for the devnet release
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed; guardian emergency actions decided)
