import "dotenv/config";
import { resolve } from "path";
import { homedir } from "os";

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || "sk-452f5d8752eb4c28afc92bdf575fbd92",
    baseURL: process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  x: {
    bearerToken: process.env.X_BEARER_TOKEN || "",
    apiKey: process.env.X_API_KEY || "",
    apiSecret: process.env.X_API_SECRET || "",
    accessToken: process.env.X_ACCESS_TOKEN || "",
    accessSecret: process.env.X_ACCESS_SECRET || "",
  },
  instagram: {
    username: process.env.INSTAGRAM_USERNAME || "",
    password: process.env.INSTAGRAM_PASSWORD || "",
  },
  threads: {
    accessToken: process.env.THREADS_ACCESS_TOKEN || "",
    userId: process.env.THREADS_USER_ID || "",
  },
  obsidian: {
    vaultPath:
      process.env.OBSIDIAN_VAULT_PATH ||
      resolve(homedir(), "Documents/Obsidian Vault/命理知识库"),
  },
  fallback: {
    outputPath:
      process.env.FALLBACK_OUTPUT_PATH ||
      resolve(homedir(), "Desktop/命理小时文案"),
  },
  timezone: "UTC",
  languages: ["zh", "en", "ja"] as const,
  postsPerDay: 24,
  zodiacsPerPost: 3,
};

export type Language = (typeof config.languages)[number];
