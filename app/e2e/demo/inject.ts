/**
 * Init scripts injected into every page of a capture context (TEST-ONLY):
 *
 * 1. a wallet-standard wallet, "MUTAV demo · <role>", whose signing features
 *    call the Node-side signer (signer.ts) through an exposed binding: the
 *    page never sees key material;
 * 2. a visible cursor overlay that moves smoothly between clicks, so the
 *    footage shows a pointer (headless Chromium paints none).
 *
 * Both functions are serialized by Playwright and run in the page; they must
 * stay self-contained (no imports, no closures over module scope).
 */

export type WalletInit = { role: string; address: string; publicKey: number[]; binding: string };

/** Registers the test wallet with the wallet-standard registry. */
export function installTestWallet(init: WalletInit) {
  const w = window as unknown as Record<string, unknown>;
  if (w.__mutavDemoWallet) return;
  const call = w[init.binding] as (method: string, b64: string) => Promise<string>;
  const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const chains = ["solana:localnet", "solana:devnet"] as const;
  const featureNames = ["solana:signTransaction", "solana:signAndSendTransaction", "solana:signMessage"];
  const account = Object.freeze({
    address: init.address,
    publicKey: new Uint8Array(init.publicKey),
    chains,
    features: featureNames,
    label: `demo ${init.role}`,
  });
  const listeners: Record<string, ((p: unknown) => void)[]> = { change: [] };
  let connected = false;
  const icon =
    "data:image/svg+xml;base64," +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#111"/><path d="M7 23V9l9 9 9-9v14" fill="none" stroke="#E8A020" stroke-width="3"/></svg>');
  const wallet = {
    version: "1.0.0",
    name: `MUTAV demo · ${init.role}`,
    icon,
    chains,
    get accounts() {
      return connected ? [account] : [];
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          connected = true;
          listeners.change!.forEach((l) => l({ accounts: [account] }));
          return { accounts: [account] };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          connected = false;
          listeners.change!.forEach((l) => l({ accounts: [] }));
        },
      },
      "standard:events": {
        version: "1.0.0",
        on: (event: string, l: (p: unknown) => void) => {
          (listeners[event] ??= []).push(l);
          return () => (listeners[event] = listeners[event]!.filter((x) => x !== l));
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs: { transaction: Uint8Array }[]) =>
          Promise.all(inputs.map(async (i) => ({ signedTransaction: fromB64(await call("signTransaction", toB64(i.transaction))) }))),
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async (...inputs: { transaction: Uint8Array }[]) =>
          Promise.all(inputs.map(async (i) => ({ signature: fromB64(await call("signAndSendTransaction", toB64(i.transaction))) }))),
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (...inputs: { message: Uint8Array }[]) =>
          Promise.all(inputs.map(async (i) => ({ signedMessage: i.message, signature: fromB64(await call("signMessage", toB64(i.message))) }))),
      },
    },
  };
  w.__mutavDemoWallet = wallet;
  const callback = ({ register }: { register: (x: unknown) => void }) => register(wallet);
  try {
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback }));
  } catch {
    /* registry not loaded yet: app-ready below */
  }
  window.addEventListener("wallet-standard:app-ready", (e) => callback((e as CustomEvent).detail));
}

/** A smooth pointer overlay: window.__demoCursor.{moveTo,click,hide,show}. Position survives navigations (sessionStorage). */
export function installCursor() {
  const w = window as unknown as Record<string, unknown>;
  const mount = () => {
    if (document.getElementById("__demo_cursor") || !document.body) return;
    const saved = (() => {
      try {
        return JSON.parse(sessionStorage.getItem("__demoCursorPos") ?? "null") as { x: number; y: number } | null;
      } catch {
        return null;
      }
    })();
    let pos = saved ?? { x: innerWidth * 0.6, y: innerHeight * 0.55 };
    const el = document.createElement("div");
    el.id = "__demo_cursor";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;will-change:transform;transition:transform 0ms;";
    el.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 28 28" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><path d="M4 2 L4 22 L9.2 17.3 L12.6 25 L16 23.5 L12.7 15.9 L20 15.6 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement("div");
    ring.style.cssText =
      "position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border:2px solid #E8A020;border-radius:50%;z-index:2147483646;pointer-events:none;opacity:0;transform:scale(.3);";
    (document.body ?? document.documentElement).append(ring, el);
    const place = (ms: number) => {
      el.style.transition = `transform ${ms}ms cubic-bezier(.22,.61,.36,1)`;
      el.style.transform = `translate(${pos.x - 4}px, ${pos.y - 2}px)`;
      try {
        sessionStorage.setItem("__demoCursorPos", JSON.stringify(pos));
      } catch {
        /* fine */
      }
    };
    place(0);
    w.__demoCursor = {
      moveTo: (x: number, y: number, ms: number) =>
        new Promise<void>((r) => {
          pos = { x, y };
          place(ms);
          setTimeout(r, ms);
        }),
      click: () => {
        ring.style.left = `${pos.x}px`;
        ring.style.top = `${pos.y}px`;
        ring.animate(
          [
            { opacity: 0.9, transform: "scale(.3)" },
            { opacity: 0, transform: "scale(1.15)" },
          ],
          { duration: 450, easing: "ease-out" },
        );
        el.animate([{ transform: el.style.transform + " scale(1)" }, { transform: el.style.transform + " scale(.86)" }, { transform: el.style.transform + " scale(1)" }], { duration: 180 });
      },
      pos: () => pos,
      hide: () => (el.style.visibility = "hidden"),
      show: () => (el.style.visibility = "visible"),
    };
  };
  if (document.body) mount();
  document.addEventListener("DOMContentLoaded", mount);
  // Hydration can replace the document's children: re-mount if the overlay goes.
  setInterval(mount, 300);
}
