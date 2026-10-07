import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "../server/env";
import { MainnetRefusedError } from "../cluster";

const ROOT = join(__dirname, "..", "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

const SOURCES = ["app", "components", "lib"].flatMap((d) => files(join(ROOT, d)));

describe("app rules", () => {
  it("never uses insurance or yield-product language in the UI", () => {
    const banned = /\b(premiums?|insurance|insured|insurer|policy|policies|policyholders?|yield vault)\b/i;
    const hits = SOURCES.filter((f) => banned.test(readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
    expect(hits).toEqual([]);
  });

  it("never builds a signer from secret bytes in app code", () => {
    const keyApis = /createKeyPairSignerFromBytes|createKeyPairFromBytes|fromSecretKey|Keypair\.from|secretKey/;
    expect(SOURCES.filter((f) => keyApis.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("refuses a mainnet server config", () => {
    expect(() => serverEnv({ NEXT_PUBLIC_CLUSTER: "mainnet-beta" })).toThrow(MainnetRefusedError);
    expect(() => serverEnv({ NEXT_PUBLIC_CLUSTER: "devnet", RPC_URL: "https://api.mainnet-beta.solana.com" })).toThrow(MainnetRefusedError);
    expect(serverEnv({ NEXT_PUBLIC_CLUSTER: "localnet" }).rpcUrl).toBe("http://127.0.0.1:8899");
  });
});
