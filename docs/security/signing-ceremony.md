# Signing ceremony

Every Squads proposal on the admin or upgrade multisig (an upgrade, an admin instruction, a member or threshold change) goes through these steps. They exist because an approval on a Ledger is a blind signature: the device shows a hash, not the instructions, and a compromised browser can show one transaction while the wallet signs another. Verification moves off the browser, onto each member's own machine.

Adapted from the "Safe multisig signing on Solana" research report (2026-10-31), which combines the SEAL, Squads, SOS and solana-verify guidance. The upgrade path is [spec §14.5](../spec.md#145-upgrade-runbook); PR #114 adds the mandatory `verify-proposal` step there.

## Before the proposal exists

1. **Write and commit the intent.** Open a PR adding `governance/intents/<cluster>/<first 8 chars of the multisig>/<index>.json`: the multisig, the transaction index it will take, the instructions with decoded arguments and accounts, and for an upgrade the tag and expected executable hash. The other member reviews it. The proposal is created only after the PR is merged.
2. **For an upgrade, reproduce the build.** Each member runs `solana-verify build` at the tag on their own machine and records the hash. The buffer's authority is the upgrade **vault** PDA, not the multisig address.

## Create the proposal

3. **Create only.** One member, CI or the release workflow creates the vault or config transaction and its proposal, and does not approve in the same transaction. The wallet preview at this step shows only the Squads create instructions: it says nothing about what the proposal will do, so it proves nothing.
4. **Announce it** on two channels: the multisig and the transaction index in the signing chat, confirmed on a call. The governance watcher reports the new index on its next run ([governance watch](governance-watch.md)); confirm that alert reached every recipient.

## Each member, independently

5. **Verify on your own machine, with your own RPC provider.** Run `bun run verify-proposal` against the committed intent file ([`verify-proposal.md`](verify-proposal.md), lands with PR #114). It fetches the transaction at that index, checks it is owned by the Squads v4 program, decodes every inner instruction and diffs it against the intent; for an upgrade it also checks the buffer hash against your local build. Approve only on `MATCH` (exit code 0).
6. **Compare the digest out of band.** Read the printed transaction digest aloud on the call. Any mismatch stops the ceremony.
7. **Check for durable nonces.** No nonce account may name your key as authority (the watcher checks this every run; check it yourself before signing). Refuse any transaction whose first instruction is `AdvanceNonceAccount`.
8. **Approve through different interfaces.** One member approves in the Squads web app (bookmarked URL, domain checked, index matches the announcement); the other approves with the Squads CLI or a locally built client. Never approve from the interface that composed the proposal.
9. **Ledger only, approve only.** Sign with the hardware wallet. Never use "Approve + Execute". Never sign with a durable nonce.
10. **Post** "checked, approved, index N, digest X" in the signing chat.

**Stop rules, at any step:** a request to re-sign after a "failure"; unexplained urgency; a blind-signing prompt you did not expect; an unknown program ID; any nonce. Each one means stop and treat it as an incident ([incident response](incident-response.md)).

## During the time lock and after

11. When the time lock has passed, re-run `verify-proposal`, then execute as a separate step.
12. After an upgrade, check the deployed program hash against the verified build.
13. **Update the expected state.** In a PR, set `lastKnownTransactionIndex` to the executed index in `governance/expected-state.<cluster>.json` and change whatever the proposal changed (members, threshold, time lock, a role, a cap, the executable hash). Until it merges, the watcher keeps reporting the index. Do the same for a cancelled or rejected proposal (index only).
14. Reclaim rent and cancel stale proposals older than 7 days.

## Sources

- "Safe multisig signing on Solana" research report (2026-10-31), signing ceremony checklist
- [SEAL multisig best practices](https://frameworks.securityalliance.org/wallet-security/secure-multisig-best-practices), [Squads advanced security](https://docs.squads.so/main/additional-resources/advanced-security-best-practices.md)
- [Governance watch](governance-watch.md), [Governance and keys](governance-and-keys.md), [spec §14.5](../spec.md#145-upgrade-runbook)
