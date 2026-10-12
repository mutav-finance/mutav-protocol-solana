import { address } from "@solana/kit";
import { guardedEnv, readDepositQueue, readReserve, rpcFor } from "@/lib/server/chain";
import { associatedTokenAddress, ComposeError, composeInstructions, describeInstructions, isAdminKind, refuseOverlappingSetConfig, unsignedTransaction, withComputeUnitLimit } from "@/lib/server/compose";
import { errorResponse } from "@/lib/server/respond";
import { boundedBody } from "@/lib/server/relay";
import { assertMember, composeProposalCreate, readMultisig, vaultAddress } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";
import type { TxRequest } from "@/lib/tx-kinds";
import { MockChainError, mockEnabled } from "@/lib/server/mock";
import { tokenAmount } from "@/lib/server/investor";
import { baselineMemo, setConfigFields } from "@/lib/config-diff";
import { identifyMutavInstruction, MutavInstruction } from "@mutav-finance/mutav-protocol-solana";

export type BuildBody = {
  request: TxRequest;
  /** The connected wallet: fee payer, and the signer the program checks. */
  signer: string;
  /** Admin actions only: wrap in a Squads proposal (default), or sign directly (localnet only). */
  via?: "squads" | "direct";
};

/**
 * Compose an UNSIGNED transaction for the connected wallet to sign. Nothing
 * here signs: the response is wire bytes with empty signature slots.
 */
export async function POST(req: Request) {
  try {
    if (mockEnabled()) throw new MockChainError();
    const body = decode<BuildBody>(await boundedBody(req));
    const env = await guardedEnv();
    const signer = address(body.signer);
    const admin = isAdminKind(body.request);
    const viaSquads = admin && (body.via ?? "squads") === "squads";
    // Refuse what the env alone refuses before any chain read: a request
    // that will be refused costs no RPC.
    if (viaSquads && !env.squadsMultisig) throw new ComposeError("SQUADS_MULTISIG is not set: no Squads proposal can be built");
    if (admin && !viaSquads && env.cluster !== "localnet") {
      throw new ComposeError("direct admin signing is localnet-only; on devnet the admin is a Squads vault");
    }
    const reserve = await readReserve(env);
    const vault = viaSquads ? address(vaultAddress(env.squadsMultisig!)) : null;
    if (vault && reserve.config.admin !== vault) throw new ComposeError(`VaultConfig.admin ${reserve.config.admin} is not the Squads vault ${vault}`);
    // Only a deposit fill needs chain data beyond the reserve: the pending
    // queue from the head (no program-account scans, no capital events).
    // A proposal is built only for a multisig member (one account read, before the queue or proposal scans).
    if (vault) await assertMember(env, signer);
    const ledger = body.request.kind === "fulfil_deposits" ? { deposits: await readDepositQueue(env, reserve, body.request.count) } : undefined;
    // A redemption reads the signer's share balance: a holder needs no allowlist proof (ADR 0023).
    const ownerShares = body.request.kind === "request_redeem" ? await tokenAmount(env, await associatedTokenAddress(signer, address(reserve.addresses.shareMint))) : undefined;
    const ctx = { reserve, ledger, allowlist: env.allowlist, ownerShares, env };

    if (vault) {
      if (body.request.kind === "set_config") refuseOverlappingSetConfig((await readMultisig(env, reserve.now)).proposals);
      const inner = await composeInstructions(body.request, vault, ctx);
      // A set_config proposal records the values it was built against (A3 stale-carry check at execute).
      const setConfig = inner.find((ix) => ix.data && ix.data.length >= 8 && identifyMutavInstruction(ix.data) === MutavInstruction.SetConfig);
      let memo = `mutav ${body.request.kind}`;
      if (setConfig) {
        const baseline = baselineMemo(setConfigFields(new Uint8Array(setConfig.data!)), reserve.config);
        if (baseline === null) throw new ComposeError("this set_config changes too many fields to record their current values in the proposal memo (needed for the stale-carry check at execute): split it into smaller proposals");
        memo = baseline;
      }
      const { tx, index } = await composeProposalCreate(env, signer, inner, memo);
      return jsonResponse({ tx, proposalIndex: index, instructions: describeInstructions(inner, reserve.config), via: "squads" });
    }

    const ixs = await composeInstructions(body.request, signer, ctx);
    const { value } = await rpcFor(env).getLatestBlockhash({ commitment: "confirmed" }).send();
    // The wallet signs the limit with the instructions; `instructions` lists the MUTAV ones.
    const tx = unsignedTransaction(signer, withComputeUnitLimit(body.request, ixs), value);
    return jsonResponse({ tx, instructions: describeInstructions(ixs, reserve.config), via: "direct" });
  } catch (e) {
    return errorResponse(e);
  }
}
