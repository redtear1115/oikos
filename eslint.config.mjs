import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist-generated service worker bundle (minified Workbox runtime).
    "public/sw.js",
  ]),
  {
    rules: {
      // The `react-hooks/set-state-in-effect` rule (added in eslint-plugin-react-hooks v6)
      // flags any setState() call inside a useEffect body. Many of our intentional
      // patterns trip it: prefilling sheet form state when `open` toggles true,
      // hydrating localStorage on mount (Dashboard SoloBanner dismissal), syncing
      // server-rendered props into client-only animation state (BalanceHero), and
      // reseeding draft filter state when the FilterSheet (re-)opens. Each of these
      // is "syncing internal state to an external prop/system change" — exactly the
      // case the React docs themselves cite as a legitimate use of useEffect.
      // We've reviewed every callsite; opting out project-wide.
      "react-hooks/set-state-in-effect": "off",
      // Allow underscore-prefix to mark intentionally-unused destructure / args / vars.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
