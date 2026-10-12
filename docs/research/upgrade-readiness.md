# Upgrade readiness: adding partial fills and instant exit to a live reserve

> **Research date:** 2026-10-02 (researched 2026-10-01 and 2026-10-02). **Curated:** 2026-10-10. Prior research by the MUTAV team, kept as written except for the edits noted in the [research index](README.md). Notes headed *Since this research* record later decisions. Not legal or investment advice.

Researched for the pilot build of `mutav-protocol-solana` (Anchor 1.2.0). Scope: how to ship the pilot so that **phase 2 (instant exit)** can be switched on later through a Squads-timelocked program upgrade, **with no account migration**, and what that means for `VaultConfig`, `VaultState` and `RedeemRequest`.

Legend: **[V]** = verified in source code (pinned commit linked) or official docs. **[I]** = inference or recommendation.

Companion pages: [OnRe comparable](onre-comparable.md) (OnRe's instant-exit curve and partial-fill mechanics) and [Redemption economics](redemption-economics.md). This page covers only the upgrade-safety side.

> **Since this research:** the layout rules on this page were accepted in [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) and are in spec [§14 Upgrade readiness](../spec.md#14-upgrade-readiness). For the v1 freeze the founders then removed pilot-unused state (the exit parameters, the buffer earmark, the partial-fill request fields, `HolderState`, the inline adapter slots) and kept room for each in padding, so it returns as a carve ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The final v1 padding sizes are recorded in ADR 0019 (v1 layout for the devnet release).

---

## 0. TL;DR

1. **Stay on Borsh `#[account]` with fixed-size types only.** Anchor 1.2 deserializes `#[account]` structs with `AnchorDeserialize::deserialize` on the bytes after the discriminator. Trailing bytes are ignored, and the decoder does not have to consume the whole buffer. Splitting `_reserved: [u8; N]` into `new_field: T, _reserved: [u8; N − size_of(T)]` therefore reads the same bytes on a live account, and the new fields come out as zero. **[V]** This only holds if every field is fixed-size, so `Option`, `Vec`, `String` and enums with data are banned in these accounts.
2. **"Zero means off" is the design rule that removes the need for migrations.** Every phase-2 field must have a zero value that is the correct pilot behaviour: `0` = disabled / uncapped / empty, `Pubkey::default()` = unset, enum variant 0 = the safe default. Kamino and OnRe both follow this rule (§2). **[V]** If a field cannot meet it, it needs a `version` bump plus a one-shot admin initializer, which is a migration. Avoid that.
3. **Padding sizes.** The cost is trivial (about 6,960 lamports per byte (unverified), so 512 bytes ≈ 0.0036 SOL). Size the padding at **at least 3× the known phase-2 need**:
   - `VaultConfig`: `_reserved: [u8; 512]`. Phase 2 needs about 110 bytes.
   - `VaultState`: `_reserved: [u8; 256]`. Phase 2 needs about 80 bytes.
   - `RedeemRequest` and `DepositRequest`: `_reserved: [u8; 64]` each.
   - Every other program-owned account: `_reserved: [u8; 64]`.
4. **These fields are real fields from day one**, not padding, because pilot code paths read them:
   - `VaultConfig.feature_flags: u64`, `VaultConfig.mutav_capital_wallet: Pubkey` and `VaultState.buffer_earmark: u64`.
   - The partial-fill fields on `RedeemRequest`.
   - `free_capital = sat(stable_assets − coverage_required − buffer_earmark)` is in the audited pilot math, and the earmark is 0 in the pilot.

   > **Since this research:** `feature_flags` stays and fails closed. The buffer earmark and the partial-fill request fields were removed from v1; the padding test reserves their bytes, so they return as carves ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The pilot fills whole requests ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

5. **Feature flags reject unknown bits.** The pilot binary's `set_config` rejects any `feature_flags` bit outside `SUPPORTED_FEATURES` (`FeatureNotSupported`). Turning on instant exit therefore takes **two timelocked proposals**: (a) the program upgrade, then (b) `set_config` to flip the bit, after an observation period. This follows Kamino's "ship dark, enable by flag" pattern. **[V]**
6. **Rollback safety.** Code must update account structs **in place**. It must never rebuild a struct from scratch, because that would wipe `_reserved`. Done this way, the pilot binary preserves phase-2 bytes it does not understand, so rolling back from phase 2 to the pilot is safe. No new enum variants go into shared accounts. A test injects random bytes into `_reserved` and asserts that every instruction leaves them unchanged.
7. **Upgrade path.** Steps, in order:
   - Run `solana-verify build` in x86 CI.
   - Write the buffer and set the buffer authority to the Squads vault.
   - Compare the buffer hash with the local executable hash.
   - Create one Squads vault transaction that bundles: BPF Loader Upgradeable `Upgrade`, the Program Metadata IDL write, and the solana-verify PDA write.
   - Approve it. The **timelock counts from the moment the proposal is approved**: Squads v4 checks `now − approved_ts ≥ time_lock`, and `MAX_TIME_LOCK` is 3 months. **[V]**
   - Execute, run `solana-verify remote submit-job`, and only then propose the flag flip.
8. **Squads v4's timelock applies to the whole multisig.** It delays every admin vault transaction, including `fulfil_redeems`. **[V]** Decide whether the upgrade authority and the operations admin stay on one multisig or split into two (feeds spec §12 Q15). **[I]**

   > **Since this research:** spec §12 Q15 is closed with two multisigs with the same members: an admin multisig (`VaultConfig.admin`, short time lock) and an upgrade multisig (program upgrade authority, long time lock). Time locks are 5 minutes and 1 hour on devnet, and 24 hours and 7 days on the real pilot and mainnet ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)). The upgrade time lock must be at least `max_queue_wait_secs`, so holders can leave before an upgrade executes ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)).

---

## 1. What the 2026 toolchain actually does (verified)

### 1.1 Anchor 1.2 `#[account]` (de)serialization

Source: [`lang/attribute/account/src/lib.rs` @ v1.2.0](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/attribute/account/src/lib.rs#L253-L300) (released 2026-09-04; `borsh = "1.5.7"`). **[V]**

```rust
fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
    let mut data: &[u8] = &buf[#disc.len()..];
    AnchorDeserialize::deserialize(&mut data)          // NOT try_from_slice: trailing bytes are fine
        .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize.into())
}
```

What this means for upgrades:

| Situation | Behaviour | Safe? |
|---|---|---|
| Account longer than the struct (extra trailing bytes) | Ignored | Yes |
| `_reserved: [u8; N]` split into `x: u64, _reserved: [u8; N−8]` | The same bytes are read; `x` decodes the first 8 reserved bytes | Yes, if those bytes are zero (or the value you expect) |
| `bool` carved from padding | Borsh 1.x **errors** on any byte other than 0 or 1 | Only if the padding is guaranteed zero. Prefer `u8` flags (Kamino and OnRe do) **[V]** |
| Fieldless enum carved from padding | Byte 0 = first variant; an unknown byte errors | Yes, if variant 0 is the safe default |
| `Option<T>` | 1-byte tag, then `T` **only when `Some`**. Every later field's offset shifts | **No.** Breaks `memcmp` filters and fixed offsets. Use sentinels instead |
| `Vec`/`String` | Length-prefixed and variable | **No.** OnRe had to fix exactly this when it switched `request_id` to a `String`: [commit `9aa6fc0f` "preserve redemption request account size"](https://github.com/onre-finance/onre-sol/commit/9aa6fc0f) **[V]** |
| Reordering or retyping existing fields | Every later offset moves; live accounts decode as garbage | **Never.** See OnRe [commit `0d9c88f9` "Preserve upgrade account layouts"](https://github.com/onre-finance/onre-sol/commit/0d9c88f9): dev-branch reordering of `max_mint_amount` and `request_counter` had to be reverted to the deployed order **[V]** |
| Renaming a field | On-chain bytes are the same; the IDL and client field names change | Yes on-chain (OnRe renamed `redemption_admin` → `worker` in place). Regenerate the client |
| Renaming an account **struct** | The discriminator is `sha256("account:<Name>")[..8]`, so every live account fails `AccountDiscriminatorMismatch` | **Never**, unless you pin `#[account(discriminator = …)]`. Anchor 1.2 also rejects all-zero discriminators (CHANGELOG 1.2.0) |
| Retiring a field | Keep the bytes in place, renamed to `_deprecated_*` or `gap` | OnRe keeps `gap: u64` and klend keeps `padding_deprecated_asset_tier` **[V]** |

On write, Anchor's `exit` re-serializes the whole struct over the account data. If the serialized length exceeds the allocation, it fails with `AccountDidNotSerialize`. A fixed-size layout always serializes to exactly `8 + INIT_SPACE` bytes. **[V]**

**Zero-init guarantee:**
- Anchor `init` creates the account through the System Program, so its data starts zeroed. **[V]**
- Realloc growth is also zero-filled: `AccountInfo::resize` runs `sol_memset(&mut data[old_len..], 0, len_increase)` ([anza-xyz/solana-sdk `account-info/src/lib.rs`](https://github.com/anza-xyz/solana-sdk/blob/fc89c122394e003d05b52aca81a6fb8ba5a8d306/account-info/src/lib.rs#L155-L185)). **[V]**
- The program has to keep the padding zero itself. It must initialise `_reserved: [0; N]` and never write to it.

**Stack:** a Borsh `Account<T>` is decoded into a stack value, and the SBF stack frame is 4 KiB. With adapters, caps and the padding, `VaultConfig` was estimated at about 1.45 KB, so take it as `Box<Account<'info, VaultConfig>>` in every instruction context. OnRe boxes `State` for the same reason ([`prop_amm/config.rs`](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/config.rs)). **[V]/[I]**

**Why not zero-copy for MUTAV:**
- Kamino (klend, kvault) and Drift's big accounts are `#[account(zero_copy)]` / `repr(C)` with `const_assert` sizes. **[V]**
- Zero-copy forbids `bool` and needs explicit alignment padding.
- Its client-side `try_deserialize_unchecked` uses `bytemuck::pod_read_unaligned`, which **panics unless the buffer length matches exactly** (same file, L233-L236). Any resize of a zero-copy account therefore breaks old clients outright.
- MUTAV's accounts are small (under 2 KB) and written rarely, so Borsh with disciplined padding is simpler and enough. **[I]**

### 1.2 Realloc rules (fallback only)

Source: [`lang/syn/src/codegen/accounts/constraints.rs` @ v1.2.0, `generate_constraint_realloc`](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/syn/src/codegen/accounts/constraints.rs#L434-L496). **[V]**

- Growth per instruction is capped at `MAX_PERMITTED_DATA_INCREASE` (10,240 bytes) above the size at instruction entry (`AccountReallocExceedsLimit`). The runtime enforces the same bound in `resize` (`InvalidRealloc`). The maximum account size is 10 MiB.
- Reallocating the same account twice in one instruction is blocked (`AccountDuplicateReallocs`).
- The payer tops up rent through a System Program transfer. On shrink, the excess goes back to the payer.
- `realloc::zero` is still parsed, but codegen always calls `resize`, which zero-fills on growth.
- Anchor 1.x adds `Migration<'info, From, To>` for typed schema migrations, used together with `realloc` ([`lang/src/accounts/migration.rs` @ v1.2.0](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/src/accounts/migration.rs); CHANGELOG #4060). **[V]**

**Why realloc is not the plan:**
- A realloc touches one account per instruction. That works for the singletons (`VaultConfig`, `VaultState`) through an admin `migrate_*` instruction.
- It does **not** work for per-user accounts that are live at upgrade time, such as pending `RedeemRequest`s, because the protocol does not control when they are next touched.
- So per-request accounts must already carry their phase-2 fields or padding. Realloc stays an emergency fallback for singletons only. **[I]**

Drift is the one reference program that uses `realloc` in production, and only for a growing `Vec` cache (`AmmCache`, `realloc::zero = false`, [`admin.rs` L5542-L5544](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/instructions/admin.rs#L5542)). Its fixed-layout accounts rely on padding. **[V]**

### 1.3 New PDAs after an upgrade

- New account types (new discriminator) and new seed prefixes need no migration: the new binary creates them with `init`, payer = admin or user. **[V]**
  - OnRe added `PropAmmPairState` (its own `reserved: [u8; 284]`) as a per-pair PDA after launch ([`prop_amm/config.rs`](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/config.rs#L22-L46)).
  - Drift moved new mode-specific config out of the nearly exhausted `State` padding (`padding: [u8; 8]`) into separate PDAs such as `HighLeverageModeConfig` and `ProtectedMakerModeConfig` ([`state/`](https://github.com/drift-labs/protocol-v2/tree/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state)). **[V]**
- **Optional accounts** (code that runs before the PDA exists): OnRe's `load_optional_pda_account` returns `None` when the address is system-owned with empty data, and errors if it holds data ([`utils/account_init.rs`](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/utils/account_init.rs)). It also creates PDAs with SIMD-0312 `create_account_allow_prefund`, so prefunding the address cannot block creation. **[V]** Anchor's own `init` handles prefunded addresses (allocate and assign).
- **MUTAV rule:** reserve seed prefixes for phase 2 **in the spec now** so that no pilot PDA collides with them later: `"exit_buffer"`, `"exit_limit"`, `"instant_exit"`. **[I]**

### 1.4 Program size

- An upgrade fails if the new `.so` does not fit in the existing ProgramData account.
- `ExtendProgram` remains **permissionless**. SIMD-0164, the permissioned variant, was not approved. [SIMD-0431](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0431-minimum-extend-program-size.md) (under review) would add a 10 KiB minimum extension size. `ExtendProgramChecked`, which requires the authority, is slated for removal on mainnet. **[V]**
- So extend from any wallet with `solana program extend <PROGRAM_ID> <BYTES>` **before** executing the upgrade proposal, and check the size in the runbook. **[V]/[I]**
- An upgraded program becomes visible from the **next slot**. Transactions in the same slot still run the old binary. **[V]** (loader delay-visibility rule)

### 1.5 IDL and client compatibility

- Since Anchor 1.0, **the IDL lives in a Program Metadata account** and is written by the program's upgrade authority (`anchor idl init|upgrade`, or `program-metadata upload idl`). Anchor removed its legacy IDL instructions (CHANGELOG #3798, [Anchor v1.2.0 CHANGELOG](https://github.com/solana-foundation/anchor/blob/v1.2.0/CHANGELOG.md)). **[V]**
- With Squads as the authority, the IDL write must be **inside the same Squads proposal**. [`squads-program-action`](https://github.com/solana-developers/squads-program-action) bundles the program upgrade, the IDL buffer (Anchor or program-metadata) and the verify PDA into one vault transaction. **[V]**

Compatibility rules for MUTAV's Codama client (`@mutav-finance/mutav-protocol-solana`):

| Change | Old clients (mutav-app on the previous version) | Rule |
|---|---|---|
| New instruction | Unaffected. The discriminator is `sha256("global:<name>")[..8]` | Additive; publish as a minor version |
| Changing args or accounts of an existing instruction | **Break.** They encode the wrong data or account metas | **Never.** Add a `_v2` instruction (OnRe has `take_offer_v2`) |
| Account fields carved from `_reserved` | Size and offsets unchanged; old decoders see the bytes as `_reserved`. `dataSize` and `memcmp` filters still match | Safe; regenerate |
| New account type | Unknown to old clients and ignored | Safe |
| New event type | Old indexers must **skip unknown discriminators** | Requirement on the mutav-app indexer **now** |
| Changing an existing event's fields | Breaks decoders | Never; add a new event |
| Error codes | Anchor numbers them by enum order (6000 + index) | **Append-only.** Never insert in the middle |
| Account struct size | Changes break `getProgramAccounts` `dataSize` filters and zero-copy decoders | Keep sizes constant; padding absorbs growth |

**CI rule [I]:** an `idl-compat` job diffs `target/idl/mutav.json` against the last released IDL (tag). It fails if:
- an existing instruction's args or accounts changed;
- an account type's byte size changed;
- an existing field's offset or type changed;
- an error was renumbered;
- an existing event changed.

This sits alongside the Codama "regenerate, no diff" check in the [plan](../plan.md).

> **Since this research:** the `idl-compat` check also enforces append-only variants of the sparse `set_config(Vec<ConfigParam>)` enum, and dead errors and events were renumbered once before the freeze, append-only after it ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### 1.6 Squads v4 upgrade proposal and timelock

Source: [Squads-Protocol/v4 @ af94153](https://github.com/Squads-Protocol/v4/tree/af94153ff77a28b6effe46b9c94baaa93742b48c/programs/squads_multisig_program/src). **[V]**

- `Multisig.time_lock: u32` means "how many seconds must pass between transaction voting settlement and execution". `MAX_TIME_LOCK = 3 × 30 × 24 × 60 × 60` (3 months) (`state/multisig.rs` L9, L28).
- Enforcement: `vault_transaction_execute.rs` L69-L73 runs `require!(now − approved.timestamp ≥ multisig.time_lock, TimeLockNotReleased)`. **The clock starts at approval, not at creation.**
- `AddMember`, `RemoveMember`, `ChangeThreshold` and `SetTimeLock` make active proposals stale. Proposals that were approved before going stale can still be executed (code comment). A threshold change therefore does **not** cancel an already-approved upgrade. To kill one, members must explicitly reject or cancel it. [Squads docs](https://docs.squads.so/main/development/typescript/instructions/create-config-transaction). **[V]**
- **The timelock covers the whole multisig.** Spec §2 made the admin multisig both the upgrade authority and the signer of `fulfil_deposits` / `fulfil_redeems` / `allocate`. All of those inherit the same delay. **[V]** Options **[I]**:
  - (a) Keep one multisig with a moderate timelock (for example 24 h). Fulfils are priced at the NAV at execution, so the delay only postpones them.
  - (b) Split into two multisigs: an `upgrade` multisig as program upgrade authority (timelock 72 h to 7 d) and an `admin` multisig as `VaultConfig.admin` (shorter timelock).

  This feeds spec §12 Q15 and needs an ADR. Either way, `pause` stays with the pauser key and has no timelock. It is the emergency brake while an upgrade or rollback waits out the timelock.

> **Since this research:** option (b) was chosen, with admin and upgrade time locks of 24 hours and 7 days on the real pilot ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)). Because a fill proposal executes after the admin time lock, each fill now carries `nav_bounds (min, max)` composed at proposal time and refuses outside them ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). Besides the pauser, up to three guardians appointed by the admin may pause at once ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

### 1.7 Verified builds

- `solana-verify` 0.5.2 (2026-09-21) deprecated the `--remote` flag. The flow is now:
  1. `solana-verify build`: deterministic, Docker, run on x86 CI.
  2. `solana-verify get-executable-hash target/deploy/mutav.so`.
  3. `solana-verify get-buffer-hash <BUFFER>`: must match step 2 **before** anyone approves.
  4. `solana-verify export-pda-tx <repo-url> --program-id … --uploader <SQUADS_VAULT>`: put the result into the Squads proposal.
  5. After execution, `solana-verify get-program-hash <PROGRAM_ID>` and `solana-verify remote submit-job --program-id …` (queues OtterSec's verifier; explorers show "verified").

  Sources: [solana.com verified builds](https://solana.com/docs/programs/verified-builds), [solana-verifiable-build](https://github.com/solana-foundation/solana-verifiable-build), [verify-squads example](https://github.com/solana-developers/verify-squads). **[V]**
- Once the buffer authority is the Squads vault, nobody can rewrite the buffer between approval and execution except through Squads. **[V]**

---

## 2. How established programs do it (code citations)

| Program | Pattern | Evidence |
|---|---|---|
| **OnRe `onre-sol`** (Anchor 1.1.2, Borsh `#[account]`) | A `reserved: [u8; N]` tail on every account; fields carved in place; a dead field kept as `gap: u64`; `u8` flag instead of `bool` (`disabled: u8`); **`tests/layout_compatibility.rs`** serializes `Legacy*` structs and decodes them with the current type | `State.reserved` went 96 → 56 when `max_mint_amount` (8) and `main_offer` (32) were added. `RedemptionOffer.reserved` went 109 → 104 for `vault_target_bps` (2), `disabled` (1) and `fee_basis_points_prop_amm_sell` (2). `RedemptionRequest.fulfilled_amount` was carved for partial fills, and the test pins `8 + INIT_SPACE == 216`. [state.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/state.rs), [redemption_offer_state.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_offer_state.rs), [layout_compatibility.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/tests/layout_compatibility.rs) **[V]** |
| **Kamino klend** (zero-copy) | `version: u64` first field; padding blocks per sub-struct (`reserve_liquidity_padding [u64;150]`, `config_padding [u64;112]`, tail `padding`); `const_assert_eq!(RESERVE_SIZE, size_of::<Reserve>())` and `% 8 == 0`; per-feature `u8` flags on `LendingMarket` (`withdraw_ticket_issuance_enabled`, `…_redemption_enabled`, `…_cancellation_enabled`, `borrow_order_creation_enabled`, `…_execution_enabled`) | **A FIFO withdraw queue was added to live reserves out of padding**: release 1.14.0 ([`4fb7a098d5`](https://github.com/Kamino-Finance/klend/commit/4fb7a098d5), 2026-02-26) turned `padding: [u64; 207]` into `withdraw_queue: WithdrawQueue { queued_collateral_amount, next_issued_ticket_sequence_number, next_withdrawable_ticket_sequence_number }` (24 B) + `padding: [u64; 204]`. Per-user `WithdrawTicket` is a **new** PDA with `end_padding: [u64; 40]` and a pinned size of 512. [reserve.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/reserve.rs#L18-L36), [lending_market.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/lending_market.rs#L15-L70), [withdraw_ticket.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/withdraw_ticket.rs) **[V]** |
| **Kamino kvault** (zero-copy) | Large padding (`padding_1: [PodU128; 256]`, `padding_3: [PodU128; 230]`); size asserted at 62,544; **zero-means-legacy semantics**: `deposit_cap` "`0` means uncapped (for backward compatibility)"; `permissioning_authority` "default disables it" | [vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/74c4dc5433e8da4b89e2c6aa167b3548e1b55167/libs/kvault-interface/src/state/vault_state.rs#L94-L126) **[V]** |
| **Drift protocol-v2** | Borsh `State` with `feature_bit_flags: u8` + `lp_pool_feature_bit_flags: u8` bitmasks, and only `padding: [u8; 8]` left; zero-copy `SpotMarket` with `padding: [u8; 40]` and `SIZE` consts; new features moved into **new config PDAs** once padding ran low | [state.rs L19-L46, L147-L162](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state/state.rs#L19-L46), [high_leverage_mode_config.rs](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state/high_leverage_mode_config.rs) **[V]** |

Lessons for MUTAV **[I]**:
- OnRe proves the Borsh variant works on a live Anchor program and gives the test pattern to copy.
- Kamino proves a **FIFO redemption queue with sequence numbers can be bolted onto a live reserve from padding**. It also shows that per-feature enable flags let a feature ship dark.
- Drift shows what happens when padding is undersized: the protocol has to spread config across extra PDAs. Size generously.

---

## 3. Requirements for MUTAV's layouts

### 3.1 Rules for every program-owned account

- **R1.** The first two bytes after the discriminator are `version: u8` (layout version, pilot = `1`) and `bump: u8`. `version` changes **only** for a real migration, meaning a field whose zero value is not a valid default. Phase 2 is designed so that it needs **no** version bump.
- **R2.** Only fixed-size types: integers, `Pubkey`, `[u8; N]`, fixed arrays of fixed structs, and fieldless enums stored as `u8`. **No `Option`, `Vec`, `String`, or enums with data.** Use sentinels instead: `Pubkey::default()` means unset and `0` means disabled.
- **R3.** Every new or carved field must decode from zero to the pilot behaviour ("zero means off"). Flags are `u8` or bits in a `u64`, never `bool`.
- **R4.** `_reserved` is last. It is initialised to `[0; N]` and never read or written by logic. Fields are carved **from the front** of `_reserved`.
- **R5.** Append-only field order. Never reorder, retype or delete: retired fields become `_deprecated_<name>`. Never rename account structs, or pin `#[account(discriminator = …)]` if you must.
- **R6.** Code updates accounts **in place** (`config.field = x`). It never builds a fresh struct over an existing account, so unknown `_reserved` bytes written by a newer binary survive a rollback.
- **R7.** Size pins:
  - `const _: () = assert!(8 + VaultConfig::INIT_SPACE == VAULT_CONFIG_SIZE);` for each account, with the constant committed.
  - A test that the serialized length equals the allocation.
- **R8.** Large accounts are boxed in contexts (`Box<Account<'info, VaultConfig>>`).

> **Since this research:** rules R1 to R8 were adopted in [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (spec §14.2). Before the freeze, v1 dropped the pilot-unused fields and renumbered dead errors once, so the append-only rule applies from the freeze onwards ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### 3.2 `VaultConfig` (seeds `["config", reserve_mint]`)

**Real fields proposed for the pilot** (in the pilot IDL and read by pilot code):

| Field | Type | Pilot value | Why now |
|---|---|---|---|
| `version` | `u8` | `1` | R1 |
| `feature_flags` | `u64` | `0` | Bit 0 `INSTANT_EXIT`; other bits reserved. Pilot `set_config` rejects `flags & !SUPPORTED_FEATURES` with `FeatureNotSupported`, and pilot `SUPPORTED_FEATURES = 0`. Bitmask as in Drift. One word covers the whole roadmap |
| `mutav_capital_wallet` | `Pubkey` | MUTAV's allowlisted capital wallet | Instant exit must bar it. Disclosing it on-chain from day one also serves transparency. A `[Pubkey; 2]` makes room for a rotation |
| `min_partial_fill` | `u64` (inside `Caps`) | To be decided (spec §12) | Partial fills ship in the pilot and need a floor so the admin cannot be griefed into dust fills |

> **Since this research:** `min_partial_fill` (named `min_fill_assets` in [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)) left v1 with whole fills; it returns as a carve with partial fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

**Phase-2 fields reserved in padding** (layout frozen in the spec as `InstantExitParams`, carved from the front of `_reserved`). The parameter set mirrors OnRe's Prop AMM (see the [OnRe comparable](onre-comparable.md)):

| Field | Type | Bytes | Zero means |
|---|---|---|---|
| `exit_peg_haircut_bps` | `u16` | 2 | No base haircut. Enable-time validation requires > 0 |
| `exit_curve_exponent_scaled` | `u32` | 4 | Invalid; enable rejected |
| `exit_wall_sensitivity_scaled` | `u32` | 4 | Invalid; enable rejected |
| `exit_epoch_secs` | `i64` | 8 | Invalid; enable rejected |
| `exit_cadence_threshold` | `u32` | 4 | Cadence term off |
| `exit_cadence_wave_scaled` | `u32` | 4 | Cadence term off |
| `exit_flat_fee_bps` | `u16` | 2 | None |
| `exit_min_fee` | `u64` | 8 | None |
| `buffer_target_bps` | `u16` | 2 | Earmark target 0 |
| `buffer_max` | `u64` | 8 | Earmark cap 0 (no buffer) |
| `exit_max_per_tx` | `u64` | 8 | 0 = no instant exit possible |
| `exit_max_per_epoch` | `u64` | 8 | 0 = no instant exit possible |
| `exit_min_amount` | `u64` | 8 | No floor |
| `exit_max_price_age_secs` | `i64` | 8 | Use `price.max_staleness_secs` |
| `exit_allowlist_root` | `[u8; 32]` | 32 | Use `investor_allowlist_root` |
| **Total** | | **110** | |

**Sizing:** `_reserved: [u8; 512]`. That is 4.6× the known phase-2 need and leaves about 400 bytes for later features: share classes, granular pause bits, an on-chain timelock (spec §12 Q15). The whole account comes to about 1.45 KB including the spec's `adapters`, `caps` and `price` blocks (exact figure from `INIT_SPACE`), with rent of about 0.011 SOL. **[I]**

**Note:** the rule "a zero cap means no instant exit" makes a half-configured enable fail closed even if the flag is set. Enabling `INSTANT_EXIT` additionally validates:
- every "invalid when zero" parameter is set;
- `mutav_capital_wallet != default`;
- `buffer_max > 0`.

> **Since this research:** ADR 0011 settled the instant-exit parameter set as `ExitParams` with a split-proof integral haircut instead of OnRe's wall and cadence terms (see [Redemption economics](redemption-economics.md)). ADR 0026 then removed `ExitParams`, the global TESOURO `PriceParams` and the inline `adapters[8]` from v1. Asset prices move to per-adapter state, and `adapter_count` plus a bitmap are carved at 0 ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). New carves before the freeze include pending role and admin keys with their expiry, `guardians`, `max_reinstate_age` and `max_queue_wait_secs` (ADR 0019).

### 3.3 `VaultState` (seeds `["state", config]`)

**Real field proposed for the pilot:**

| Field | Type | Pilot value | Why now |
|---|---|---|---|
| `buffer_earmark` | `u64` | always `0` (no pilot instruction can raise it) | The audited pilot formula already includes it: `free_capital = max(0, stable_assets − coverage_required − buffer_earmark)`. Earmarked BRS stays inside `stable_assets` and `net_assets`, so it reduces only the surplus that can leave through the queue, not NAV or coverage |

**Pilot invariants that involve the earmark** (implemented and tested in the pilot, with the earmark injected through LiteSVM `set_account`):
- **I-E1.** `buffer_earmark ≤ brs_balance`.
- **I-E2.** `pay_claim` **ignores the earmark** (never gated) and clamps it afterwards: `buffer_earmark = min(buffer_earmark, brs_balance)`. Because the never-gated path is final from the pilot onwards, phase 2 does not need to re-audit `pay_claim`.
- **I-E3.** In under-coverage, `buffer_earmark` cannot increase. Phase 2's funding instruction will be gated on `free_capital`, but the pilot also asserts this rule.
- **I-E4.** `register_guarantee`, `fulfil_redeems` and `allocate` all use the earmark-aware `free_capital`. A test with a non-zero injected earmark shows that redemption capacity shrinks by exactly the earmark.
- The TS math mirror in the Codama client includes the earmark from day one.

> **Since this research:** in [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md), `pay_claim` neither reads nor writes the earmark (no clamp); only instructions that already read `free_capital` store the ratchet. The earmark was then removed from v1 and returns as a carve with instant exit ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The `stable_assets` cache was also removed; it is computed at every gate.

**Phase-2 fields reserved in padding** (`InstantExitState`, carved from the front):

| Field | Type | Bytes |
|---|---|---|
| `exit_epoch_start` | `i64` | 8 |
| `exit_curr_value` | `u64` | 8 |
| `exit_prev_net_value` | `u64` | 8 |
| `exit_curr_count` | `u32` | 4 |
| `unprovisioned_claims` | `u32` | 4 |
| `instant_exit_assets_total` | `u64` | 8 |
| `instant_exit_shares_total` | `u64` | 8 |
| `instant_exit_haircut_total` | `u64` | 8 |
| `buffer_funded_total` | `u64` | 8 |
| `buffer_released_total` | `u64` | 8 |
| `last_instant_exit_ts` | `i64` | 8 |
| **Total** | | **80** |

**Sizing:** `_reserved: [u8; 256]` (3.2×). `VaultState` is written by almost every instruction, so it is kept smaller than the config. Benchmark the Borsh cost with Mollusk. **[I]**

**Open definition:** the gate "auto-disabled while an unprovisioned claim is pending" needs an on-chain meaning. On-chain, a claim is either filed (provisioned) or does not exist. **[I]** Proposal: a phase-2 operator instruction `notice_claim(guarantee, notice_ref_hash)` increments `unprovisioned_claims`, and `file_claim` or `withdraw_notice` decrements it. The counter is reserved now so that the definition does not force a layout change later. This needs an ADR together with the instant-exit design.

> **Since this research:** ADR 0011 defined it as a `ClaimNotice` account and `pending_notices`, gating both queues and instant exit. The counter left v1 ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)); the claim-notice gate is built together with the cooldown exit, before any outside capital ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md); spec [§3.12 `ClaimNotice`](../spec.md#312-claimnotice)). `VaultState` also carries the 31 daily claim buckets of [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md).

### 3.4 `RedeemRequest` (seeds `["redeem", config, seq]`)

Partial fills were planned for the pilot, so these were proposed as **real fields**. This is the strongest case for real fields over padding, because requests pending at upgrade time cannot be migrated (§1.2).

| Field | Type | Notes |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `owner` | `Pubkey` | |
| `seq` | `u64` | Strict FIFO position |
| `shares` | `u64` | Requested (escrowed) |
| `shares_filled` | `u64` | Cumulative. `remaining = shares − shares_filled`, still escrowed. OnRe's `fulfilled_amount` |
| `assets_out` | `u64` | Cumulative BRS moved to `claims` across fills, each at the NAV of its own fill |
| `assets_claimed` | `u64` | Lets the owner `claim_assets` what has been filled so far while the head stays partially filled |
| `fills` | `u16` | |
| `nav_at_last_fill` | `u64` | |
| `requested_at`, `last_fill_at` | `i64`, `i64` | |
| `status` | `u8` enum `{Pending=0, PartiallyFilled=1, Fulfilled=2}` | Variant 0 is the default; no new variants in phase 2 |
| `_reserved` | `[u8; 64]` | Phase-2 candidates: `instant_exit_shares: u64` (if a holder may convert the unfilled remainder to an instant exit), `exit_fee_paid: u64` |

- The body is about 107 bytes, plus 64 of padding and the 8-byte discriminator: about 179 bytes. That is about 0.0021 SOL of rent, refunded on close.
- The account closes only when `shares_filled == shares` **and** `assets_claimed == assets_out`, or on cancel (which returns `shares − shares_filled` and any unclaimed assets).
- `DepositRequest` gets the same `version`/`bump`/`_reserved: [u8; 64]` treatment.

> **Since this research:** the founders chose the other side of this trade-off for v1. The pilot fills whole requests, the partial-fill fields left v1, and the request padding holds their bytes so partial fills arrive as a carve in the first upgrade after the hackathon ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The carve reads 0 as unset, so requests created before that upgrade decode as unfilled.

### 3.5 Other accounts

- `Guarantee`, `ClaimFiling`, `Payout`, `AgencyExposure` and `FeeReceipt` each get `version`, `bump` and `_reserved: [u8; 64]`. Their volume is low and the cost is negligible.
- `AdapterEntry` (inline in config) gets `_reserved: [u8; 16]`, because `MAX_ADAPTERS × entry` is fixed in the config layout.

> **Since this research:** `Payout` merged into `ClaimFiling` ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)); the per-agency cap and `AgencyExposure` were removed ([ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)); `FeeReceipt` became `IncomeReceipt` with a kind, and the inline adapter entries were removed ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). `Guarantee` and `ClaimFiling` padding was sized so the guarantee and claim lifecycles of [ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) fit without a migration (ADR 0019).

### 3.6 New accounts phase 2 may create (no migration)

| PDA | Seeds | Created by | Purpose |
|---|---|---|---|
| (optional) exit buffer token account | `["exit_buffer", config]` | admin `init_exit_buffer` after the upgrade | Only if the earmark becomes a separate token account. **Recommended: keep the earmark as accounting inside `reserve`.** That means no extra freeze-exposed account and no new token-account invariant. **[I]** |
| (optional) per-holder rate limit | `["exit_limit", config, owner]` | `init` by the holder in the first `instant_exit` (payer = holder) | Per-wallet epoch caps, if the global caps prove insufficient |
| (fallback) `InstantExitConfig` | `["instant_exit", config]` | admin | Used if padding ever runs out (the Drift pattern). Code must treat it as optional (OnRe `load_optional_pda_account`) |

### 3.7 Pause, gates and spec text to update

The spec should name `instant_exit` now even though the instruction does not exist yet. Then the pilot's documented semantics already cover it:
- **Pause:** in the "stopped" list.
- **Under-coverage:** frozen automatically.
- **Price safety:** fails on a stale price, measured against `exit_max_price_age_secs`.
- **Gates:** also refused when `fulfil_halted`, when `unprovisioned_claims > 0`, when `owner == mutav_capital_wallet`, or when the holder is not allowlisted.

**Caveat [I]:** barring by wallet is weak if shares are freely transferable. MUTAV could move shares to another allowlisted wallet. Either the allowlist excludes MUTAV-controlled wallets other than `mutav_capital_wallet`, or the share mint's transferability is restricted. This is a design point for the instant-exit ADR, not a layout issue.

> **Since this research:** mainnet shares are to be transfer-restricted at the token level, with the mechanism chosen before the mainnet `initialize` and exit kept open for holders; devnet keeps classic SPL shares ([open questions](../meta/open-questions.md)).

---

## 4. Tests to write in the pilot

1. **Layout golden test** (OnRe pattern). `tests/layout/v1.rs` keeps frozen copies of the v1 structs (`VaultConfigV1`, `VaultStateV1`, `RedeemRequestV1`, …). For each one, assert:
   - (a) `8 + INIT_SPACE` equals the committed constant;
   - (b) v1 bytes decode with the current type, and every carved field reads zero;
   - (c) a field-offset table matches, computed by serializing sentinel values. This catches reordering.
2. **Golden fixtures.** At devnet launch, and again at mainnet launch, dump the live accounts (`solana account <addr> --output json`) into `tests/fixtures/layout/v1/` and decode them in CI. Phase 2's PR must still decode them.
3. **Padding preservation.** For every instruction, inject random bytes into `_reserved` with LiteSVM `set_account`, run it, and assert the bytes are unchanged (rollback safety, R6).
4. **Padding zero at init.** After `initialize`, `register_guarantee`, `request_redeem`, … assert `_reserved` is all zero.
5. **Feature flag fail-closed.** `set_config` with the `INSTANT_EXIT` bit fails `FeatureNotSupported`, and so does any undefined bit.
6. **Earmark invariants I-E1 to I-E4** with an injected earmark, plus the existing property test that `pay_claim` is never refused (fuzz the earmark too).
7. **Partial fills.**
   - The head is filled in pieces up to `free_capital`.
   - A batch stops after a partial head fill and never skips it.
   - Each piece is priced at its own NAV.
   - Fills below `min_partial_fill` are rejected unless they complete the request.
   - `cancel_redeem` returns `shares − shares_filled`.
   - The request closes only when fully filled and claimed.
8. **IDL compat CI job** (§1.5). It has nothing to compare against until the first release, so it starts from the first tagged IDL.

> **Since this research:** with the earmark and partial fills out of v1, tests 6 and 7 move to the upgrades that add them. The padding test also asserts that each account's `_reserved` is at least the carve its later features need ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), ADR 0019).

---

## 5. Upgrade runbook (phase 2: enabling instant exit on a live reserve)

**Before the PR merges**
1. ADR for instant exit (economics, gates, curve parameters, the `unprovisioned_claims` definition) plus a spec update in the same PR (repo rule).
2. Code:
   - carve `InstantExitParams` / `InstantExitState` from the front of `_reserved`;
   - add `instant_exit`, `quote_instant_exit` (view), `fund_buffer` / `release_buffer` (admin, gated on `free_capital`) and `notice_claim`;
   - set `SUPPORTED_FEATURES |= INSTANT_EXIT`.
   - **No change** to existing instruction args, accounts, events or error order.
3. CI green:
   - layout golden tests, including the fixtures from live accounts;
   - padding-preservation test;
   - `idl-compat`;
   - Codama regenerated with no diff;
   - the full LiteSVM suite;
   - Mollusk CU benchmarks (`refresh`, `pay_claim`, `fulfil_redeems`, `instant_exit`).
4. Audit or review the diff. The never-gated `pay_claim` path should show **no diff** (I-E2 was final in the pilot).
5. Publish the client as a **minor** version. mutav-app upgrades its indexer and decoders first: they must tolerate the new events and new fields before the program changes.

**Rehearsal**

6. Surfpool fork of the live cluster:
   - deploy the new `.so` over the forked program (`surfnet_setProgramAuthority` lets the test take the authority);
   - run the `tests-fork` suite against **real** accounts;
   - check that pending `RedeemRequest`s still decode, cancel, fill and claim.
7. Run the full flow on devnet with the same Squads configuration (threshold and timelock), end to end through `apps/admin`.

**Build and buffer**

8. Run `solana-verify build` in the x86 release workflow, then record `solana-verify get-executable-hash target/deploy/mutav.so`.
9. `solana program show <PROGRAM_ID>`: if the ProgramData length is smaller than the new `.so`, run `solana program extend <PROGRAM_ID> <BYTES>` (permissionless).
10. `solana program write-buffer target/deploy/mutav.so`, then `solana program set-buffer-authority <BUFFER> --new-buffer-authority <SQUADS_VAULT>`.
11. `solana-verify get-buffer-hash <BUFFER>` must equal step 8. Put both hashes, the git tag and the commit in the proposal memo.
12. Write the IDL buffer (`program-metadata` write-buffer) and run `solana-verify export-pda-tx <repo> --program-id <PROGRAM_ID> --uploader <SQUADS_VAULT>`.

**Proposal**

13. Create **one** Squads vault transaction with `squads-program-action` or the Squads UI "Programs → Add upgrade". It contains:
    - BPF Loader Upgradeable `Upgrade` (programdata, program, buffer, spill, sysvars, authority = vault);
    - the Program Metadata IDL write;
    - the verify-PDA write.
14. Each signer independently reproduces the hash from the tag (`solana-verify build` locally → `get-executable-hash`) and checks it against `get-buffer-hash` before approving.
15. Approve. The timelock starts at the approval timestamp. During the window, MUTAV announces the upgrade publicly (transparency page plus the commit link). If something looks wrong, members reject or cancel the proposal. The pauser can `pause` at any time without a timelock.

**Execute and verify**

16. Execute after `time_lock`. The program is live from the next slot.
17. `solana-verify get-program-hash <PROGRAM_ID>` = step 8; `solana-verify remote submit-job --program-id <PROGRAM_ID>`; confirm explorers show "verified".
18. Smoke checks, read-only and permissionless:
    - `refresh` succeeds;
    - `VaultConfig`/`VaultState` decode with the new client and every phase-2 field reads 0;
    - `buffer_earmark == 0`;
    - instant exit is refused with `FeatureDisabled`.

**Enable (separate, later proposals)**

19. After an observation period with the code live but the feature off, propose `set_config`:
    - instant-exit parameters with conservative caps (`exit_max_per_tx`, `exit_max_per_epoch` small);
    - `exit_allowlist_root`, if one is used.
20. Separate proposal: `fund_buffer(amount)` from `free_capital`, up to `buffer_max`.
21. Separate proposal: set the `INSTANT_EXIT` bit. Each step goes through the timelock.
22. Monitor the events. Raise the caps gradually by further proposals.

**Rollback**

- **Fast path:** the pauser runs `pause` (no timelock), which stops instant exit along with the other capital flows. Then an admin proposal clears the `INSTANT_EXIT` bit.
- **Slow path:** a Squads upgrade proposal back to the previous verified `.so`, also timelocked. Keep the previous buffer's artefact and hash in the release notes.
- **Prerequisites:**
  - The phase-2 binary added no enum variants to shared accounts.
  - The pilot binary preserves `_reserved` bytes (test 3).
  - `buffer_earmark` was released to 0 first (`release_buffer`), so that the pilot's earmark-aware `free_capital` does not hold surplus back invisibly.
- PDAs created in phase 2 stay as inert, rent-holding accounts under the old binary.

> **Since this research:** the runbook is in spec §14.5 and §14.6. The upgrade proposal now goes through the separate upgrade multisig (7-day time lock on the real pilot), which must be at least `max_queue_wait_secs` once the cooldown exit is on, so a holder who disagrees with an upgrade can leave before it executes ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). ADR 0011 also requires each approval to check that the multisig's `config_authority` is unset and to decode every instruction in the vault transaction ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

---

## 6. Changes proposed for the pilot repository

| Where | Change |
|---|---|
| `programs/mutav/src/state/config.rs` | Add `version: u8` as the first field. Add `feature_flags: u64` and `mutav_capital_wallet: Pubkey`. Grow `_reserved` to 512. Add a size `const` assert. Use `Box<Account<…>>` in contexts |
| `state/state.rs` (new) | Add `buffer_earmark: u64` and `_reserved: [u8; 256]` |
| `state/request.rs` (new) | The partial-fill fields and `_reserved: [u8; 64]` from §3.4 |
| `coverage.rs` / `math.rs` | Earmark-aware `free_capital`; clamp in `pay_claim` (I-E2) |
| `constants.rs` | `features::INSTANT_EXIT = 1 << 0`; `SUPPORTED_FEATURES = 0`; reserved seed prefixes `"exit_buffer"`, `"exit_limit"`, `"instant_exit"` |
| `errors.rs` | `FeatureNotSupported`, `FeatureDisabled` (append-only from now on) |
| `docs/spec.md` | §3: rules R1 to R8, the new fields and the reserved phase-2 layouts. §4: earmark-aware `free_capital` and I-E1 to I-E4. §5.1: `set_config` feature-flag rule and pause list naming `instant_exit`. §5.5: partial fills. §12: Q15 single vs split multisig; `min_partial_fill` value; `unprovisioned_claims` definition |
| `docs/decisions/` | ADR "Upgrade-ready layouts and feature flags" (rules R1 to R8, padding sizes, two-step enable, rollback rule). ADR "Partial fills at the head of the redemption queue". The instant-exit ADR comes later, with phase 2 |
| `docs/plan.md` | Version, flags, padding sizes, layout and padding tests; earmark math; partial fills; an event-coverage test including "indexer tolerates unknown events"; the `idl-compat` job; a release workflow with the verify hash comparison, the bundled Squads proposal and the extend check; a fork test decoding real accounts |
| mutav-app indexer | Skip unknown event discriminators; decode accounts by discriminator, not by `dataSize` alone |

> **Since this research:** the two ADRs became [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) (partial fills) and [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (upgrade readiness, together with the instant-exit design). The earmark, the `pay_claim` clamp and the partial-fill fields were later taken out of v1 ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The final v1 layout is recorded in ADR 0019.

---

## 7. Open points (as of the research)

1. **One or two multisigs** (upgrade vs admin) and their timelock values. Feeds spec §12 Q15.
2. **The definition and operator flow behind `unprovisioned_claims`.**
3. **Earmark form:** accounting-only inside `reserve` (recommended) or a separate token account.
4. **How to make the MUTAV-wallet bar effective** when shares are transferable.
5. **`min_partial_fill` value.**
6. **Whether a partial-fill kill switch is wanted.** If so, define `feature_flags` bit 1 `PARTIAL_FILLS_DISABLED`; zero means on.
7. **Not verified here:** live Borsh CU cost of the 512/256-byte padding. Measure with Mollusk.
8. **SIMD-0431 activation status** on mainnet at upgrade time. Re-check before step 9.

> **Since this research:** point 1 is closed with two multisigs ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)). Point 2 became the `ClaimNotice` gate, built with the cooldown exit ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md), [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). Point 3 was settled as accounting inside `reserve` ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). Point 4 moves to transfer-restricted mainnet shares ([open questions](../meta/open-questions.md)). Point 5 waits for partial fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

## Sources

- [Anchor v1.2.0 `lang/attribute/account/src/lib.rs`](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/attribute/account/src/lib.rs#L253-L300)
- [Anchor v1.2.0 `generate_constraint_realloc`](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/syn/src/codegen/accounts/constraints.rs#L434-L496)
- [Anchor v1.2.0 `lang/src/accounts/migration.rs`](https://github.com/solana-foundation/anchor/blob/v1.2.0/lang/src/accounts/migration.rs)
- [Anchor v1.2.0 CHANGELOG](https://github.com/solana-foundation/anchor/blob/v1.2.0/CHANGELOG.md)
- [anza-xyz/solana-sdk `account-info/src/lib.rs` (resize zero-fill)](https://github.com/anza-xyz/solana-sdk/blob/fc89c122394e003d05b52aca81a6fb8ba5a8d306/account-info/src/lib.rs#L155-L185)
- [SIMD-0431 minimum extend program size](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0431-minimum-extend-program-size.md)
- [squads-program-action](https://github.com/solana-developers/squads-program-action)
- [Squads v4 program source @ af94153](https://github.com/Squads-Protocol/v4/tree/af94153ff77a28b6effe46b9c94baaa93742b48c/programs/squads_multisig_program/src)
- [Squads docs: config transactions](https://docs.squads.so/main/development/typescript/instructions/create-config-transaction)
- [solana.com verified builds](https://solana.com/docs/programs/verified-builds)
- [solana-verifiable-build](https://github.com/solana-foundation/solana-verifiable-build)
- [verify-squads example](https://github.com/solana-developers/verify-squads)
- OnRe `onre-sol`: [commit `9aa6fc0f`](https://github.com/onre-finance/onre-sol/commit/9aa6fc0f), [commit `0d9c88f9`](https://github.com/onre-finance/onre-sol/commit/0d9c88f9), [state.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/state.rs), [redemption_offer_state.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_offer_state.rs), [layout_compatibility.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/tests/layout_compatibility.rs), [prop_amm/config.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/config.rs), [utils/account_init.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/utils/account_init.rs)
- Kamino klend: [commit `4fb7a098d5`](https://github.com/Kamino-Finance/klend/commit/4fb7a098d5), [reserve.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/reserve.rs#L18-L36), [lending_market.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/lending_market.rs#L15-L70), [withdraw_ticket.rs](https://github.com/Kamino-Finance/klend/blob/a08760976f51a3a58c4a0c6ea27b4a0e565bca79/libs/klend-interface/src/state/withdraw_ticket.rs)
- Kamino kvault: [vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/74c4dc5433e8da4b89e2c6aa167b3548e1b55167/libs/kvault-interface/src/state/vault_state.rs#L94-L126)
- Drift protocol-v2: [state.rs](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state/state.rs#L19-L46), [high_leverage_mode_config.rs](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state/high_leverage_mode_config.rs), [state/ directory](https://github.com/drift-labs/protocol-v2/tree/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/state), [admin.rs realloc](https://github.com/drift-labs/protocol-v2/blob/13e8e9b8d614f3b62e3a65a8c372c819e6529aeb/programs/drift/src/instructions/admin.rs#L5542)
- [Specification §14 Upgrade readiness](../spec.md#14-upgrade-readiness)
- [Redemption economics](redemption-economics.md) and [OnRe comparable](onre-comparable.md)

## Decisions

- [ADR 0010: Partial fills at the head of the redemption queue](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0011: Phase-2 instant exit, earmark-aware solvency and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0018: BRS-only pilot reserve; assets expand through adapters](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing (proposed)](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)
- ADR 0019: v1 layout for the devnet release (recorded with the layout change)
