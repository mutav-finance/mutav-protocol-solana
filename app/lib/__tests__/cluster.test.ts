import { describe, expect, it } from "vitest";
import { assertGenesis, assertRpcUrl, DEVNET_GENESIS, explorerUrl, MAINNET_GENESIS, MainnetRefusedError, parseCluster, redactUrl, redactUrls, walletChain } from "../cluster";

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

describe("A4 genesis and URL checks", () => {
  it("no longer exempts a mainnet host because the URL says devnet", () => {
    expect(() => assertRpcUrl("https://mainnet.helius-rpc.com/?tag=devnet", "devnet")).toThrow(MainnetRefusedError);
    expect(() => assertRpcUrl("https://api.solana.com", "devnet")).toThrow(MainnetRefusedError);
    expect(assertRpcUrl("https://devnet.helius-rpc.com/?api-key=abc", "devnet")).toBe("https://devnet.helius-rpc.com/?api-key=abc");
  });
  it("refuses monikers and non-http URLs", () => {
    expect(() => assertRpcUrl("devnet", "devnet")).toThrow(/not a URL/);
    expect(() => assertRpcUrl("ws://api.devnet.solana.com", "devnet")).toThrow(/http/);
  });
  it("checks the genesis hash against the cluster", () => {
    expect(() => assertGenesis(MAINNET_GENESIS, "devnet", "https://x.example/k")).toThrow(MainnetRefusedError);
    expect(() => assertGenesis(MAINNET_GENESIS, "localnet", "http://127.0.0.1:8899")).toThrow(MainnetRefusedError);
    expect(() => assertGenesis("Abc", "devnet", "https://x.example")).toThrow(/is not devnet/);
    expect(() => assertGenesis(DEVNET_GENESIS, "devnet", "https://x.example")).not.toThrow();
    expect(() => assertGenesis(DEVNET_GENESIS, "localnet", "http://127.0.0.1:8899")).toThrow(/public cluster/);
    expect(() => assertGenesis("LocalGenesis111", "localnet", "http://127.0.0.1:8899")).not.toThrow();
  });
});

describe("A5 redaction", () => {
  it("cuts URLs to protocol and host", () => {
    expect(redactUrl("https://solana-devnet.g.alchemy.com/v2/SECRETKEY")).toBe("https://solana-devnet.g.alchemy.com");
    const out = redactUrls("fetch failed for https://devnet.helius-rpc.com/?api-key=SECRET: 401");
    expect(out).not.toMatch(/SECRET/);
    expect(out).toMatch(/^fetch failed for https:\/\/devnet\.helius-rpc\.com/);
    expect(() => assertRpcUrl("https://mainnet.helius-rpc.com/?api-key=SECRET", "devnet")).toThrow(/^(?!.*SECRET)/);
  });
});
