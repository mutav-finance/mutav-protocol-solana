import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "../server/env";
import { MainnetRefusedError } from "../cluster";

const ROOT = join(__dirname, "..", "..");

function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const SOURCES = ["app", "components", "lib"].flatMap((d) => files(join(ROOT, d), /\.(tsx?|css)$/));
/** A7: the static pages too (the simulator), and any other public HTML. */
const STATIC = files(join(ROOT, "public"), /\.html?$/);

/**
 * (Re)insurance vocabulary, yield-product framing, "sinistro" (A7), the reserve
 * called a "fund", and "solvency gate" in copy (it is the coverage gate, and
 * the code identifiers are now `coverage*` too; the regex needs a space or
 * hyphen, so an old name such as `solvencyFromAccounts` does not match).
 * "funds" (money) is fine.
 */
const BANNED = /\b(premiums?|(re)?insur(ance|ed|ers?)|polic(y|ies)|policyholders?|yield vault|sinistros?|fund|solvency[ -]gat(e|ed|es|ing))\b/i;
/** Standard HTTP header names (Referrer-Policy, Content-Security-Policy, …) are not UI copy. */
const HEADER_NAMES = /\b[A-Z][A-Za-z]*(-[A-Z][A-Za-z]*)*-Policy(-Report-Only)?\b/g;
const stripComments = (src: string) => src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");

describe("app rules", () => {
  it("never uses insurance or yield-product language in the UI", () => {
    const hits = SOURCES.filter((f) => BANNED.test(stripComments(readFileSync(f, "utf8")).replace(HEADER_NAMES, "")));
    expect(hits).toEqual([]);
  });

  it("never uses it in the static pages either (A7)", () => {
    expect(STATIC.length).toBeGreaterThan(0);
    const hits = STATIC.filter((f) => BANNED.test(readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "")));
    expect(hits).toEqual([]);
  });

  it("catches the words it is meant to catch", () => {
    for (const w of ["reinsurance", "Insurance", "insured", "insurers", "policy", "policies", "policyholder", "premium", "sinistro", "sinistros", "yield vault", "the fund", "SOLVENCY GATE", "solvency-gated"]) expect([w, BANNED.test(w)]).toEqual([w, true]);
    for (const w of ["guarantee fee", "claim payment", "reserve", "Referrer-Policy", "moves no funds", "funded", "solvencyFromAccounts", "coverage gate"]) expect([w, BANNED.test(w.replace(HEADER_NAMES, ""))]).toEqual([w, false]);
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
