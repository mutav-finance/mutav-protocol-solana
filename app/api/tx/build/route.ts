import { address } from "@solana/kit";
import { readLedger, readReserve, rpcFor } from "@/lib/server/chain";
import { ComposeError, composeInstructions, describeInstructions, isAdminKind, unsignedTransaction } from "@/lib/server/compose";
import { serverEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/respond";
import { composeProposalCreate, vaultAddress } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";
import type { TxRequest } from "@/lib/tx-kinds";

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
    const body = decode<BuildBody>(await req.text());
    const env = serverEnv();
    const signer = address(body.signer);
    const reserve = await readReserve(env);
    const ledger = body.request.kind === "refresh" ? await readLedger(env, reserve) : undefined;
    const ctx = { reserve, ledger, allowlist: env.allowlist, env };

    if (isAdminKind(body.request) && (body.via ?? "squads") === "squads") {
      if (!env.squadsMultisig) throw new ComposeError("SQUADS_MULTISIG is not set: no Squads proposal can be built");
      const vault = address(vaultAddress(env.squadsMultisig));
      if (reserve.config.admin !== vault) throw new ComposeError(`VaultConfig.admin ${reserve.config.admin} is not the Squads vault ${vault}`);
      const inner = await composeInstructions(body.request, vault, ctx);
      const { tx, index } = await composeProposalCreate(env, signer, inner, `mutav ${body.request.kind}`);
      return jsonResponse({ tx, proposalIndex: index, instructions: describeInstructions(inner), via: "squads" });
    }
    if (isAdminKind(body.request) && env.cluster !== "localnet") {
      throw new ComposeError("direct admin signing is localnet-only; on devnet the admin is a Squads vault");
    }

    const ixs = await composeInstructions(body.request, signer, ctx);
    const { value } = await rpcFor(env).getLatestBlockhash({ commitment: "confirmed" }).send();
    const tx = unsignedTransaction(signer, ixs, value);
    return jsonResponse({ tx, instructions: describeInstructions(ixs), via: "direct" });
  } catch (e) {
    return errorResponse(e);
  }
}
