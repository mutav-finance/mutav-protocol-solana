# Verify a proposal before you approve it

Every member of the admin and upgrade multisigs runs `verify-proposal` on their own machine before approving a Squads proposal. It closes audit #2 findings NEW-R3-1, NEW-R3-2, S9 and S14 ([report](../reviews/2026-10-internal-audit-2.md)).

**Why it is needed.** Squads `proposal_approve` commits to the multisig and the transaction index only. The wallet cannot show more: a Ledger blind-signs every Squads instruction, and Phantom, Solflare and Backpack show an unknown-program call. The member's approval means whatever the `VaultTransaction` or `ConfigTransaction` account at that index holds. A script on the page that builds the transaction can also change what the page shows. This tool reads that account from an RPC the member picks, decodes it, and compares it with an intent file the members reviewed in a repo PR before the proposal existed.

## The rules

1. **Intent first.** Every proposal has an intent file, reviewed and merged in a PR **before** the proposal is created.
2. **Two interfaces.** One interface composes, a second one approves. Build or create the proposal in the reserve app (or CI), then run this check from a clean clone and approve from another frontend: the Squads app or the Squads CLI on your own machine. Never approve in the interface that built the bytes.
3. **MATCH or nothing.** Approve only after `verify-proposal` prints `MATCH` and exits 0. Any `MISMATCH`, an error, or a warning you cannot explain stops the ceremony.
4. **Compare the digest.** Read the transaction digest aloud to the other member on a call (a second channel). Both runs must print the same digest.
5. **Approve only.** Never use "Approve + Execute". Execute is a separate step after the time lock, after re-running the check.
6. **Never sign with a durable nonce.** Never sign a member transaction (create, approve, execute) that uses a durable nonce: it stays valid indefinitely and can be replayed after the context has changed. Refuse any prompt whose first instruction is `AdvanceNonceAccount`. The check fails, whatever the intent says, on any System nonce instruction inside the vault message.

## Write the intent

Intent files live at

```
governance/intents/<cluster>/<first 8 characters of the multisig address>/<index>.json
```

for example `governance/intents/devnet/5842jNQd/12.json`. The index is the Squads transaction index the proposal will get (the multisig's `transaction_index` + 1 at creation). If another proposal takes the index first, rename the file in a new PR.

The format is validated by [`scripts/release/lib/intent.ts`](../../scripts/release/lib/intent.ts) (the `Intent` type and `parseIntent`). Unknown keys are refused. Examples, not tied to real proposals: [`set-config-max-tvl.json`](../../governance/intents/examples/set-config-max-tvl.json) (a vault transaction) and [`set-time-lock.json`](../../governance/intents/examples/set-time-lock.json) (a Squads config transaction).

| Key | Meaning |
|---|---|
| `version` | `"mutav-proposal-intent/v1"` |
| `cluster` | `"devnet"` or `"localnet"`. Mainnet is not supported. |
| `multisig`, `index` | The multisig address and the transaction index. Both must equal `--multisig` and `--index`. |
| `title`, `notes` | What the proposal does and why, in words. |
| `mutavProgramId` | The MUTAV program the instructions call. Defaults to the declared ID `8scC79…`; set it to the deployed ID on devnet ([`deployments/devnet.json`](../../deployments/devnet.json)). |
| `minTimeLockSecs` | Required: the time-lock floor (ADR 0020). The multisig's current time lock and the new value of any `SetTimeLock` action must be at or above it. Devnet and localnet: 300 (admin multisig) or 3600 (upgrade multisig); real pilot: 86400 (admin) or 604800 (upgrade). |
| `transaction.kind` | `"vault"` or `"config"`. |
| `transaction.vaultIndex`, `ephemeralSigners` | Vault transactions: the vault index (0) and the number of ephemeral signers (default 0). |
| `transaction.instructions` | Vault transactions: the instructions, **in order**. |
| `transaction.actions` | Config transactions: the Squads config actions, in order, each `{ "name", "args" }` (`AddMember { newMember, permissions }`, `RemoveMember { oldMember }`, `ChangeThreshold { newThreshold }`, `SetTimeLock { newTimeLock }`, `AddSpendingLimit { … }`, `RemoveSpendingLimit { spendingLimit }`, `SetRentCollector { newRentCollector }`). |
| `upgrade` | Program upgrades: `programId`, `buffer`, `spill` and `expectedHash` (the `solana-verify get-executable-hash` of the release build). |

Each instruction is `{ "program", "name", "args", "accounts", "remainingAccounts" }`:

- `program` is `mutav`, `loader` (BPF Loader Upgradeable), `system`, `spl-token`, `token-2022`, `ata` or `compute-budget`. MUTAV instructions use program names (`set_config`); native ones use their Rust variant names (`Upgrade`, `TransferChecked`, `SetComputeUnitLimit`).
- `args` and `accounts` use the names the report prints (the Codama client's names for MUTAV, e.g. `treasuryAccount`). Write the intent by hand from the change you mean to make, not by copying the report of the proposal you are checking.
- Values are exact. u64 values may be written as numbers or strings (`"5000000000"`); bytes are hex. Every named account must be listed.
- Two placeholders: `"$vault"` is the multisig's vault at `vaultIndex` (exact, derived); `"$any"` is allowed only for payer accounts (`ata.Create.payer`, `ata.CreateIdempotent.payer`, `loader.ExtendProgram.payer`, `loader.ExtendProgramChecked.payer`). Any message signer must still be the vault.
- An instruction the tool cannot decode (for example the Program Metadata IDL write or the verify-PDA write in an upgrade) is listed as `{ "program": "raw", "programId", "dataSha256", "accounts": [{ "address", "signer", "writable" }], "reason" }`. The flags are the message's (the vault, as payer, is always a writable signer). Anything raw that the intent does not list this way is a mismatch. Raw entries are for unknown programs, and for an instruction of System, SPL Token, Token-2022, ATA or Compute Budget whose kind the tool does not decode (for example System `CreateAccountWithSeed`). A raw entry for the BPF Loader Upgradeable or the MUTAV program is refused. An instruction of a decoded kind whose data or accounts do not decode exactly (short data, extra trailing bytes the runtime would ignore, missing accounts), and any loader or MUTAV instruction that does not decode, always fails: it cannot be pinned by hash.

For an upgrade, the intent lists the loader `Upgrade` (and `ExtendProgramChecked` first if the program grows) with every account, and the `upgrade` block repeats the program, buffer and spill. An upgrade intent may not also hold a loader `SetAuthority`, `SetAuthorityChecked` or `Close` (audit S9).

## Run the check

From a clean clone at `main`, on your own machine:

```
bun install --frozen-lockfile
bun run verify-proposal --cluster devnet --rpc <your RPC URL> \
  --multisig <multisig> --index <n> --intent governance/intents/devnet/<ms>/<n>.json
```

Use an RPC URL you chose, **from a different provider than the other members use**. A malicious or compromised RPC can serve a benign-looking transaction account to everyone who reads through it; the digest comparison over a second channel only catches that when the members read through different providers. The tool refuses mainnet (by `--cluster`, by the URL and by the genesis hash), reads only from the RPC (never from the reserve app's API) and signs nothing.

For an upgrade, first reproduce the build at the signed release tag, as the release workflow does ([`release.yml`](../../.github/workflows/release.yml)):

```
git checkout <tag>
solana-verify build --library-name mutav --base-image <VERIFY_BASE_IMAGE from release.yml>
solana-verify get-executable-hash target/deploy/mutav.so
```

then add `--so target/deploy/mutav.so`. Without `--so` an upgrade always fails.

## What it checks

- The multisig is owned by Squads v4, has no config authority (spec §14.5 step 8) and meets `minTimeLockSecs`; no `SetTimeLock` action goes below it.
- The account at the index is a `VaultTransaction` or `ConfigTransaction` of that multisig and index, of the kind the intent expects.
- Vault transactions: the vault index and ephemeral signers match; no address lookup tables; every message signer is the vault (or one of its ephemeral signers); every instruction is decoded and compared with the intent in order. Differences are listed one by one (extra, missing, reordered, other args, other accounts).
- Every MUTAV and loader instruction, and every decoded kind of the native programs, decodes exactly (no trailing bytes); otherwise the check fails, whatever the intent says.
- Upgrades (S9, S14): every loader instruction (selected by program id) decodes cleanly; one `Upgrade` naming the intent's program, its ProgramData, the buffer, the spill and the vault as authority; the buffer is owned by the loader with the vault as authority, ProgramData's upgrade authority is the vault; the buffer's program bytes hash (solana-verify style: sha256 with trailing zero bytes trimmed) to the intent's `expectedHash` **and** to your `--so`; and the buffer contains the 32 bytes of the target program ID, so it was built with the right `declare_id!`.
- The proposal: status, approvals against the threshold, who approved, and when it becomes executable. A stale, rejected, cancelled or executed proposal is a warning: it can no longer be approved.

Every instruction is printed with every argument and account and a risk flag (`CRITICAL`: authority or code change; `HIGH`: moves money or changes reserve rules; `CAUTION`: worth a second look).

## What MATCH means

`MATCH` (exit code 0) means: the transaction account at that index, as your RPC serves it at `confirmed`, holds exactly the instructions or config actions of the intent, with the same arguments, accounts and order, and for an upgrade the buffer is your own reproduced build. It does not mean the change is a good idea; that was decided when the intent PR was reviewed. It also says nothing about the member transaction that carries your approval: the tool reads the proposal, not what your wallet is asked to sign, so whether that outer transaction uses a durable nonce (rule 6) is for you to check in the wallet prompt.

`MISMATCH` (exit code 1) lists each difference. Do not approve. Exit code 2 means the check could not run (bad arguments, an invalid intent, a refused cluster).

After approving, post "checked, approved, index N, digest X" in the signing channel. Re-run the check before executing.
