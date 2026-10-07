"use client";
import { useCallback, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import type { TxRequest } from "../tx-kinds";
import { ApiError, getJson, postJson } from "./api";

export type TxPhase = "idle" | "building" | "signing" | "sending" | "confirming" | "confirmed" | "failed";

export type TxInstructionInfo = { program: string; accounts: { address: string; writable: boolean; signer: boolean }[] };

export type TxState = {
  phase: TxPhase;
  signature: string | null;
  error: string | null;
  logs: string[] | null;
  instructions: TxInstructionInfo[] | null;
  proposalIndex: bigint | null;
};

const IDLE: TxState = { phase: "idle", signature: null, error: null, logs: null, instructions: null, proposalIndex: null };

/** Map a program error to its name when the logs carry one. */
function programError(message: string, logs: string[] | null): string {
  const named = logs?.map((l) => /Error Code: (\w+)/.exec(l)?.[1]).find(Boolean);
  return named ? `${named} — ${message}` : message;
}

/**
 * Compose (server) → sign (wallet) → relay (server) → confirm. `build` returns
 * the unsigned transaction to sign; by default it is /api/tx/build for `req`.
 */
export function useTx(onConfirmed?: () => void) {
  const { address, signTransaction } = useWallet();
  const [state, setState] = useState<TxState>(IDLE);

  const runWith = useCallback(
    async (build: () => Promise<{ tx: string; instructions?: TxInstructionInfo[]; proposalIndex?: bigint }>) => {
      try {
        setState({ ...IDLE, phase: "building" });
        const built = await build();
        setState((s) => ({ ...s, phase: "signing", instructions: built.instructions ?? null, proposalIndex: built.proposalIndex ?? null }));
        const signed = await signTransaction(built.tx);
        setState((s) => ({ ...s, phase: "sending" }));
        const { signature } = await postJson<{ signature: string }>("/api/tx/send", { tx: signed });
        setState((s) => ({ ...s, phase: "confirming", signature }));
        for (let i = 0; i < 90; i++) {
          const st = await getJson<{ status: string; err?: unknown }>(`/api/tx/status?sig=${signature}`);
          if (st.status === "failed") throw new Error(`transaction failed: ${JSON.stringify(st.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
          if (st.status === "confirmed" || st.status === "finalized") {
            setState((s) => ({ ...s, phase: "confirmed" }));
            onConfirmed?.();
            return signature;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error("not confirmed after 90 s");
      } catch (e) {
        const logs = e instanceof ApiError ? e.logs : null;
        setState((s) => ({ ...s, phase: "failed", error: programError((e as Error).message, logs), logs }));
        return null;
      }
    },
    [signTransaction, onConfirmed],
  );

  const run = useCallback(
    (request: TxRequest, via?: "squads" | "direct") => {
      if (!address) {
        setState({ ...IDLE, phase: "failed", error: "Connect a wallet first." });
        return Promise.resolve(null);
      }
      return runWith(() => postJson("/api/tx/build", { request, signer: address, via }));
    },
    [address, runWith],
  );

  return { state, run, runWith, reset: () => setState(IDLE) };
}
