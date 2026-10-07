# Fork tests (Surfpool)

Run on demand, never in the default CI. Surfpool forks devnet: it reads devnet accounts lazily over RPC and runs every transaction locally. Nothing is sent to devnet.

```sh
anchor build
bun tests-fork/happy-path.ts --program-keypair ~/.config/solana/mutav/mutav-keypair.json
```

`--program-keypair` must be the keypair of the declared program id (`8scC79jk…`), kept outside the repo. The script passes the path to `solana program deploy` and does nothing else with it. Signers are throwaway in-memory keys. BRS balances come from Surfpool's `surfnet_setTokenAccount` cheatcode, because nobody can mint real BRS.

The script starts Surfpool on port 38899 in a temp directory and always stops it.

## `happy-path.ts` (plan Task 13, cut to one happy path)

1. Read Nora's devnet BRS mint `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` through the fork. The script checks that it is classic SPL Token with 6 dp.
2. Deploy the program and run `initialize` with the real mint, which passes the mint guard.
3. Deposit → `fulfil_deposits` → `claim_shares`.
4. `register_guarantee` → `contribute_fees` → `file_claim` → `pay_claim` → `settle_payout`.

**Built later** (plan, Rescheduled section):

- admin fulfil through a Squads proposal, including a partial head fill;
- `allocate` / `deallocate` through a proposal (adapters);
- the no-op upgrade through a timelocked proposal, followed by decoding every live account.

The manual trigger is `.github/workflows/fork.yml`.
