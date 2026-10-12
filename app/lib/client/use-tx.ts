"use client";
import { useCallback, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import type { TxRequest } from "../tx-kinds";
import { decodeProgramError, errorText } from "../tx-error";
import { ApiError, getJson, postJson } from "./api";
import { CLUSTER } from "./env";
import { NOT_SEEN_HINT_SECS, notSeenText, transportFor, walletSendError } from "./transport";

const st90 = (cluster: string) => `not confirmed on ${cluster} after 90 s`;

export type TxPhase = "idle" | "building" | "signing" | "sending" | "confirming" | "confirmed" | "failed";

export type TxInstructionInfo = { program: string; accounts: { address: string; writable: boolean; signer: boolean }[] };

export type TxState = {
  phase: TxPhase;
  signature: string | null;
  error: string | null;
  /** The program error's name when the failure is a program refusal (see lib/tx-error). */
  errorName: string | null;
  logs: string[] | null;
  instructions: TxInstructionInfo[] | null;
  proposalIndex: bigint | null;
};

const IDLE: TxState = { phase: "idle", signature: null, error: null, errorName: null, logs: null, instructions: null, proposalIndex: null };

/**
 * Compose (server) → sign and send → confirm (server read). `build` returns
 * the unsigned transaction; by default it is /api/tx/build for `req`. On
 * devnet the wallet signs and sends through its own RPC; on localnet the
 * wallet signs and the localnet-only relay sends (see lib/client/transport).
 */
export function useTx(onConfirmed?: (signature: string) => void) {
  const { address, signTransaction, signAndSendTransaction } = useWallet();
  const [state, setState] = useState<TxState>(IDLE);

  const runWith = useCallback(
    async (
      build: () => Promise<{ tx: string; instructions?: TxInstructionInfo[]; proposalIndex?: bigint }>,
      /** The refusal the preview predicts ("Send anyway"): named when the wallet's own simulation rejects without a decodable code. */
      predicted?: string | null,
    ) => {
      let walletRejected = false;
      try {
        setState({ ...IDLE, phase: "building" });
        const built = await build();
        setState((s) => ({ ...s, phase: "signing", instructions: built.instructions ?? null, proposalIndex: built.proposalIndex ?? null }));
        let signature: string;
        if (transportFor(CLUSTER) === "wallet-send") {
          try {
            signature = await signAndSendTransaction(built.tx);
          } catch (e) {
            // Wallets bury the program error in .cause/.error/.data/.logs; keep all of it for the decoder and Details.
            const message = walletSendError(errorText(e) || (e as Error)?.message || String(e), CLUSTER);
            walletRejected = message !== "The wallet declined the request.";
            throw new Error(message);
          }
        } else {
          const signed = await signTransaction(built.tx);
          setState((s) => ({ ...s, phase: "sending" }));
          signature = (await postJson<{ signature: string }>("/api/tx/send", { tx: signed })).signature;
        }
        setState((s) => ({ ...s, phase: "confirming", signature }));
        for (let i = 0; i < 90; i++) {
          const st = await getJson<{ status: string; err?: unknown }>(`/api/tx/status?sig=${encodeURIComponent(signature)}`);
          if (st.status === "failed") throw new Error(`transaction failed: ${JSON.stringify(st.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
          if (st.status === "confirmed" || st.status === "finalized") {
            setState((s) => ({ ...s, phase: "confirmed", error: null }));
            onConfirmed?.(signature);
            return signature;
          }
          // Still unseen: the wallet may have sent it to another cluster.
          if (i === NOT_SEEN_HINT_SECS && st.status === "pending") setState((s) => ({ ...s, error: notSeenText(CLUSTER, NOT_SEEN_HINT_SECS) }));
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error(st90(CLUSTER));
      } catch (e) {
        const logs = e instanceof ApiError ? e.logs : null;
        const message = (e as Error).message;
        const errorName = decodeProgramError(message, logs) ?? (walletRejected && predicted ? predicted : null);
        setState((s) => ({ ...s, phase: "failed", error: message, errorName, logs }));
        return null;
      }
    },
    [signTransaction, signAndSendTransaction, onConfirmed],
  );

  const run = useCallback(
    (request: TxRequest, via?: "squads" | "direct", predicted?: string | null) => {
      if (!address) {
        setState({ ...IDLE, phase: "failed", error: "Connect a wallet first." });
        return Promise.resolve(null);
      }
      return runWith(() => postJson("/api/tx/build", { request, signer: address, via }), predicted);
    },
    [address, runWith],
  );

  return { state, run, runWith, reset: () => setState(IDLE) };
}
