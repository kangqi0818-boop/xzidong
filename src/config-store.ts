import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const CONFIG_FILE = resolve(process.cwd(), "config.json");

export interface AppConfig {
  openai: { apiKey: string; baseURL: string; model: string };
  x: { clientId: string; clientSecret: string; bearerToken: string; apiKey: string; apiSecret: string; accessToken: string; accessSecret: string };
  xCookies?: { authToken: string; ct0: string; apiBearer?: string; extractedAt?: string };
  instagram: { username: string; password: string };
  threads: { accessToken: string; userId: string };
}

const DEFAULT_CONFIG: AppConfig = {
  openai: { apiKey: "sk-452f5d8752eb4c28afc92bdf575fbd92", baseURL: "https://api.deepseek.com", model: "deepseek-chat" },
  x: { clientId: "dUloTDhaemFVWjI0YlhKSkxOMGg6MTpjaQ", clientSecret: "4FahN18rt5Gl3B_m-WC1JY7SQhWevZWJQuj3CUOnSSyiuN-39e", bearerToken: "AAAAAAAAAAAAAAAAAAAAAGRf7wEAAAAAdQSYq2mgtu2hD1oFsZzI5l%2BuR9o%3DrkQLVjxHtn7G3Xg9p1co8cwa6J4H25NWCTFjcBIAmmvSBxdTsu", apiKey: "ZPvl5KhYsBX4xskDtUVzNfnb5", apiSecret: "CZG8blxuLUs83ViazoM0hbc1PZelsrUxA8tWlH8YNG8PgwBta4", accessToken: "1889079565043290112-xTppYSFiX6p3MEjfBFizbOw0BB8nqL", accessSecret: "2nSlijpWT7hMBba2z2QG2xeGu2RmGlE2Hl8nVjs77tfZa" },
  instagram: { username: "", password: "" },
  threads: { accessToken: "", userId: "" },
};

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed) as AppConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
