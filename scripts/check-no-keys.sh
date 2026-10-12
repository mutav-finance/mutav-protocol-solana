#!/usr/bin/env bash
# Fails when source under the given directories (default: clients/js/src)
# uses secret-key, key-file or signing APIs. The client composes instructions
# and transactions; the caller signs (CLAUDE.md, "No signing-key code"). Run
# in CI on every PR over clients/js/src, app/ and scripts/.
#
#   bash scripts/check-no-keys.sh [--allowlist <file>] [dir ...]
#
# The allowlist names the known exceptions, one per line, paths relative to
# the repository root:
#
#   <path glob>            every hit in the matching files is allowed
#   <path glob> <regex>    only hits whose line matches <regex> (grep -iE);
#                          the line must hold no other forbidden pattern
#                          once the <regex> matches are removed
#
# '#' starts a comment. Keep each entry as narrow as it can be and say why.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
allowlist=""
dirs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --allowlist)
      allowlist="${2:?--allowlist needs a file}"
      shift 2
      ;;
    *)
      dirs+=("$1")
      shift
      ;;
  esac
done
[ ${#dirs[@]} -eq 0 ] && dirs=("$repo/clients/js/src")

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
  'subtle\.(sign|importKey)\b'
  'tweetnacl'
  'nacl\.sign'
  '@noble/(ed25519|curves)'
  # Signing.
  '\bsignTransaction[A-Za-z]*'
  'partiallySignTransaction[A-Za-z]*'
  'signAndSendTransaction[A-Za-z]*'
  '\bsignBytes\b'
  '\bsignMessages?\b'
  # Seeds, mnemonics, key files and secrets from the environment.
  'mnemonic'
  'bip39'
  'seedPhrase'
  'process\.env\b[^;]*(KEY|SECRET|SEED|MNEMONIC|PRIVATE)'
  'process\.env\b[^;]*(_SK\b|\bSK_|KEYPAIR|SIGNER)'
  'Bun\.env'
  'import\.meta\.env'
  'id\.json'
  '-keypair\.json'
  '\breadFile(Sync)?\b'
  'Bun\.file\('
)

regex="$(IFS='|'; echo "${patterns[*]}")"

globs=()
res=()
if [ -n "$allowlist" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    read -r glob re <<<"$line" || true
    [ -z "${glob:-}" ] && continue
    globs+=("$glob")
    res+=("${re:-}")
  done <"$allowlist"
fi

# strip <regex> <text>: <text> with every case-insensitive match removed.
strip() {
  local re="$1" rem="$2" m
  shopt -s nocasematch
  while [[ "$rem" =~ $re ]]; do
    m="${BASH_REMATCH[0]}"
    [ -z "$m" ] && break
    rem="${rem/"$m"/}"
  done
  shopt -u nocasematch
  printf '%s' "$rem"
}

# A hit is allowed when a glob-only entry names its file, or when the regex
# entries for its file match the line and, with every allowed match removed,
# nothing forbidden is left (an allowed API cannot hide a second one).
allowed() { # $1 = repo-relative path, $2 = line content
  local i rem="$2" matched=0
  [ ${#globs[@]} -eq 0 ] && return 1
  for i in "${!globs[@]}"; do
    # shellcheck disable=SC2053 # glob match on purpose
    [[ "$1" == ${globs[$i]} ]] || continue
    [ -z "${res[$i]}" ] && return 0
    if grep -qiE -- "${res[$i]}" <<<"$rem"; then
      matched=1
      rem="$(strip "${res[$i]}" "$rem")"
    fi
  done
  [ "$matched" -eq 1 ] && ! grep -qiE -- "$regex" <<<"$rem"
}

hits=()
for d in "${dirs[@]}"; do
  abs="$(cd "$d" && pwd)"
  while IFS= read -r m; do
    [ -z "$m" ] && continue
    path="${m%%:*}"
    rest="${m#*:}"
    content="${rest#*:}"
    rel="${path#"$repo"/}"
    allowed "$rel" "$content" || hits+=("$rel:${rest}")
  done < <(grep -rnIiE "$regex" "$abs" \
    --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' \
    --include='*.js' --include='*.jsx' --include='*.mjs' --include='*.cjs' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist || true)
done

if [ ${#hits[@]} -gt 0 ]; then
  printf '%s\n' "${hits[@]}"
  echo "::error::forbidden secret-key or signing API in ${dirs[*]} (CLAUDE.md: the client composes, the caller signs)"
  exit 1
fi
echo "check-no-keys: ${dirs[*]} clean"
