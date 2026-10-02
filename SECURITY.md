# Security policy

## Status

The MUTAV reserve program is **unaudited and pre-pilot**. It is under active development for a capped pilot with real money and real guarantees. Do not deposit funds you are not prepared to lose, and do not rely on any deployment that is not listed in this repository's README.

## Reporting a vulnerability

Email **security@mutav.finance** with:

- a description of the issue and its impact;
- steps or a proof of concept to reproduce it (devnet or a local validator only);
- the commit or deployed program ID you tested.

> **Note:** the `security@mutav.finance` address still needs to be set up (the domain currently has no MX record). Until it is live, open a [private security advisory](https://github.com/mutav-finance/mutav-protocol-solana/security/advisories/new) on GitHub instead.

Please do not open a public issue for a vulnerability, and do not test against mainnet deployments or other people's funds. We will acknowledge a report as soon as we can and keep you informed while we fix it. There is no bug bounty at this stage.

## Scope

In scope:

- the `mutav` program (`programs/mutav`) and the adapter programs and crates in `programs/`;
- the TypeScript client in `clients/js` (`@mutav-finance/mutav-protocol-solana`), for issues such as wrong PDA derivation or instruction encoding;
- the deploy and release scripts and workflows in this repository.

Out of scope:

- the MUTAV platform, operator automation and web apps (`mutav-finance/mutav-app`);
- third-party programs and tokens (BRS / Nora Finance, TESOURO / Etherfuse, Squads), except where this program integrates with them unsafely;
- issues that require a compromised admin multisig.

## Key handling

This repository contains no keys. The operator key is held in KMS by mutav-app, and admin and upgrade authority is a Squads multisig. If you find a key or secret committed here, report it as a vulnerability.
