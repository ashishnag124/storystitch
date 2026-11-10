import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const BROWSER_ONLY = [
  "createImageBitmap",
  "document",
  "history",
  "localStorage",
  "location",
  "matchMedia",
  "navigator",
  "OffscreenCanvas",
  "Path2D",
  "sessionStorage",
  "window",
  "Worker",
];

export default defineConfig([
  globalIgnores(["**/dist", "**/dist-*", "**/.turbo", "**/.expo"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["apps/app/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Shared screens run on iOS too, so anything browser-only goes in a *.web.ts(x) file.
    files: ["apps/app/**/*.{ts,tsx}"],
    // The end-to-end tests run in Node and the browser, never on iOS.
    ignores: ["**/*.web.{ts,tsx}", "apps/app/e2e/**", "apps/app/playwright.config.ts"],
    rules: {
      "no-restricted-globals": ["error", ...BROWSER_ONLY.map((name) => ({ name, message: "Browser-only: move this to a *.web.ts(x) file." }))],
      "no-restricted-syntax": [
        "error",
        { selector: "JSXOpeningElement[name.name=/^[a-z]/]", message: "HTML elements are browser-only: use React Native components, or a *.web.tsx file." },
      ],
    },
  },
]);
