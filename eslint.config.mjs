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
  {
    // `no-html-link-for-pages` stays ON project-wide (an `<a>` to an internal
    // app route is usually a real mistake a future edit could make), and is
    // only waived for the files below, where the `<a>` is deliberate:
    // - Settings footer links to bare `/terms` / `/privacy`: those paths only
    //   exist because the locale middleware (proxy.ts) resolves them, and a
    //   full navigation avoids `<Link />` prefetching legal pages nobody opens.
    // - invite/[token] error page's `/dashboard` link: a full page load re-runs
    //   middleware auth, so an unauthenticated visitor lands on sign-in instead
    //   of a client-side transition into a layout that will bounce them anyway.
    files: [
      "app/(dashboard)/settings/_components/SettingsContent.tsx",
      // Brackets are glob character classes, so the dynamic segment needs escaping.
      "app/invite/\\[token\\]/page.tsx",
    ],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
