#!/usr/bin/env bash
# Fails when a directory (default: clients/js/src) uses secret-key or signing
# APIs. The client composes instructions and transactions; the caller signs
# (CLAUDE.md, "No signing-key code"). Run in CI on every PR.
#
#   bash scripts/check-no-keys.sh [dir]
set -euo pipefail

dir="${1:-$(dirname "$0")/../clients/js/src}"

patterns=(
  # Key material in, signer out.
  'createKeyPairSignerFrom[A-Za-z]*'
  'createKeyPairFrom[A-Za-z]*'
  'createSignerFromKeyPair'
  'generateKeyPair(Signer)?'
  'fromSecretKey'
  'Keypair\.fromSeed'
  'secretKey'
  'privateKey'
  # Signing.
  '\bsignTransaction[A-Za-z]*'
  'partiallySignTransaction[A-Za-z]*'
  'signAndSendTransaction[A-Za-z]*'
  '\bsignBytes\b'
  # Seeds, mnemonics and key files.
  'mnemonic'
  'bip39'
  'seedPhrase'
  'process\.env\b[^;]*(KEY|SECRET|SEED|MNEMONIC|PRIVATE)'
  'id\.json'
  '-keypair\.json'
  'readFileSync'
)

regex="$(IFS='|'; echo "${patterns[*]}")"
if matches="$(grep -rnIiE "$regex" "$dir" --include='*.ts' --include='*.js' --include='*.mjs' --include='*.cjs')"; then
  echo "$matches"
  echo "::error::forbidden secret-key or signing API in $dir (CLAUDE.md: the client composes, the caller signs)"
  exit 1
fi
echo "check-no-keys: $dir is clean"
