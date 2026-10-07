import { describe, expect, it } from "vitest";
import { assertRpcUrl, explorerUrl, MainnetRefusedError, parseCluster, walletChain } from "../cluster";

describe("parseCluster", () => {
  it("accepts localnet and devnet", () => {
    expect(parseCluster("localnet")).toBe("localnet");
    expect(parseCluster(" Devnet ")).toBe("devnet");
    expect(parseCluster(undefined)).toBe("devnet");
  });
  it("refuses mainnet in any spelling", () => {
    for (const v of ["mainnet", "mainnet-beta", "MAINNET"]) expect(() => parseCluster(v)).toThrow(MainnetRefusedError);
  });
  it("refuses unknown clusters", () => {
    expect(() => parseCluster("testnet")).toThrow(/localnet" or "devnet/);
  });
});

describe("assertRpcUrl", () => {
  it("refuses mainnet RPCs", () => {
    expect(() => assertRpcUrl("https://api.mainnet-beta.solana.com", "devnet")).toThrow(MainnetRefusedError);
    expect(() => assertRpcUrl("https://solana-mainnet.g.alchemy.com/v2/x", "devnet")).toThrow(MainnetRefusedError);
  });
  it("matches the URL to the cluster", () => {
    expect(assertRpcUrl("http://127.0.0.1:8899", "localnet")).toBe("http://127.0.0.1:8899");
    expect(assertRpcUrl("https://api.devnet.solana.com", "devnet")).toBe("https://api.devnet.solana.com");
    expect(() => assertRpcUrl("https://api.devnet.solana.com", "localnet")).toThrow(/not local/);
    expect(() => assertRpcUrl("http://localhost:8899", "devnet")).toThrow(/is local/);
  });
});

describe("explorer links", () => {
  it("uses the devnet cluster param", () => {
    expect(explorerUrl("tx", "abc", "devnet")).toBe("https://explorer.solana.com/tx/abc?cluster=devnet");
  });
  it("points localnet at the local RPC", () => {
    expect(explorerUrl("address", "X", "localnet", "http://127.0.0.1:8899")).toBe(
      "https://explorer.solana.com/address/X?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899",
    );
  });
  it("maps wallet chains", () => {
    expect(walletChain("devnet")).toBe("solana:devnet");
    expect(walletChain("localnet")).toBe("solana:localnet");
  });
});
