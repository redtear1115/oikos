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
      // hydrating localStorage on mount (WelcomeSoloCard / PartnerLeftCard dismissal), syncing
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
  {
    // #1194 moved every hand-written text field onto the `TextInput` /
    // `TextArea` primitives (44px, `--radius-bubble`, hairline, `--input-bg`,
    // 16px, ember focus ring). Nothing stopped the next hand-written
    // `<input>` from appearing, and the way that migration comes undone is
    // one field at a time, each looking fine on its own screen — the drift is
    // only visible when two sheets are opened side by side. This rule is the
    // ratchet (#1252).
    //
    // Only text-ish inputs are covered: `checkbox` / `radio` / `range` /
    // `file` / `hidden` / `color` and the button types have no primitive, so
    // writing them bare is correct. The `type` has to be a literal for the
    // selector to see it; a computed `type={x}` is flagged, which is the safe
    // side of the trade.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'][value.value=/^(checkbox|radio|range|file|hidden|color|submit|reset|button|image)$/]))",
          message:
            "Use <TextInput> from components/ui/TextInput instead of a bare <input> (#1194). Non-text inputs (checkbox/radio/range/file) are allowed; a genuinely special field goes in eslint.config.mjs's allow-list with a reason.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message:
            "Use <TextArea> from components/ui/TextArea instead of a bare <textarea> (#1194). A genuinely special field goes in eslint.config.mjs's allow-list with a reason.",
        },
      ],
    },
  },
  {
    // The deliberate exceptions, each for a reason the primitives can't serve:
    // - `components/ui/TextInput.tsx` / `TextArea.tsx`: the primitives.
    // - `AmountInput` / `SettlementForm`: the big numeric amount display —
    //   its own type scale and chrome, nothing like a 44px field.
    // - `DescriptionAutocomplete`: `role="combobox"` inside a popup shell that
    //   owns the border and the focus ring; a TextInput would double them.
    // - `MessageEditor`: borderless textarea inside an already-bordered card
    //   (#1194 decided a TextArea there would draw a second frame).
    files: [
      "components/ui/TextInput.tsx",
      "components/ui/TextArea.tsx",
      "app/(dashboard)/_components/AmountInput.tsx",
      "app/(dashboard)/dashboard/_components/SettlementForm.tsx",
      "app/(dashboard)/dashboard/_components/DescriptionAutocomplete.tsx",
      "app/(dashboard)/review/\\[month\\]/_components/MessageEditor.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
