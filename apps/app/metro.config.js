const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

// Locally, EXPO_PUBLIC_* values come from the root .env; CI sets them on the job.
const rootEnv = join(__dirname, "../../.env");
if (!process.env.CI && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config = getDefaultConfig(__dirname);

// Zod's error messages in every language are most of its size, and we never show them. Only English stays.
config.resolver.resolveRequest = (context, name, platform) => {
  if (/\/locales\/index(\.c?js)?$/.test(name) && context.originModulePath.includes("/zod/")) return { type: "empty" };
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
