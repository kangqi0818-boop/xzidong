// Extract X auth tokens from automation Chrome
// Run: npx tsx extract-x-tokens.ts
// Saves tokens to config.json for GitHub Actions / cloud usage

import { chromium } from "playwright";
import { loadConfig, saveConfig } from "./src/config-store.js";

async function main() {
  console.log("🔍 连接自动化 Chrome...");
  
  let browser;
  try {
    const cdpVer = await fetch("http://127.0.0.1:9222/json/version").then(r => r.json());
    browser = await chromium.connect(cdpVer.webSocketDebuggerUrl);
  } catch (e: any) {
    console.log("❌ 无法连接自动化 Chrome。请先运行: bash launch-chrome.sh");
    console.log("   错误: " + e.message);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  
  // Open X home
  console.log("🌐 打开 X...");
  const page = await context.newPage();
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(4000);

  // Check login
  const url = page.url();
  if (url.includes("/login") || !url.includes("/home")) {
    console.log("❌ X 未登录！请在自动化 Chrome 中登录 x.com");
    console.log("   登录后重新运行: npx tsx extract-x-tokens.ts");
    await page.close();
    process.exit(1);
  }
  console.log("✅ X 已登录");

  // Extract cookies
  const cookies = await context.cookies("https://x.com");
  const authToken = cookies.find((c: any) => c.name === "auth_token");
  const ct0 = cookies.find((c: any) => c.name === "ct0");

  if (!authToken || !ct0) {
    console.log("❌ 未找到 auth_token 或 ct0 cookie");
    console.log("   找到的 cookies: " + cookies.map((c: any) => c.name).join(", "));
    await page.close();
    process.exit(1);
  }

  // Also get the API bearer token from X's internal state
  let apiBearer = "";
  try {
    const scriptContent = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        if (s.textContent && s.textContent.includes("Bearer")) {
          const match = s.textContent.match(/["']Bearer\s+([A-Za-z0-9%\-_]+)["']/);
          if (match) return match[1];
        }
      }
      return null;
    });
    if (scriptContent) apiBearer = scriptContent;
  } catch {}

  console.log("🔑 auth_token: " + authToken.value.substring(0, 30) + "...");
  console.log("🔑 ct0: " + ct0.value);
  if (apiBearer) console.log("🔑 API Bearer: " + apiBearer.substring(0, 30) + "...");

  // Save to config
  const config = loadConfig();
  config.xCookies = {
    authToken: authToken.value,
    ct0: ct0.value,
    apiBearer: apiBearer || "",
    extractedAt: new Date().toISOString(),
  };

  saveConfig(config);
  console.log("");
  console.log("✅ Token 已保存到 config.json");
  console.log("   现在可以用 GitHub Actions 或 VPS 在 Mac 关机时自动发帖了！");
  console.log("");
  console.log("⚠️  Token 有效期约 30-90 天，过期后重新运行本脚本即可");

  await page.close();
}

main().catch(console.error);
