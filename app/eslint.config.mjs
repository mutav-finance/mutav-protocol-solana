import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Build interactive controls from components/ui/* (themed to brand tokens),
  // not raw <button>/<input>. The primitives themselves are exempt.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use the <Button> primitive from @/components/ui/button instead of a raw <button>.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use the <Input> primitive from @/components/ui/input instead of a raw <input>.",
        },
      ],
    },
  },
  // No keys in the app: nothing under app/, components/ or lib/ may build a
  // signer from secret bytes. Wallets sign. (scripts/ is localnet-only tooling.)
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@solana/kit",
              importNames: ["createKeyPairSignerFromBytes", "createKeyPairSignerFromPrivateKeyBytes", "createKeyPairFromBytes", "generateKeyPairSigner"],
              message: "No keys in the app: the connected wallet signs.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
