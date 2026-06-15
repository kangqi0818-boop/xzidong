// 一键 X 登录 — 用你的真实 Chrome
// 前置条件: 先运行 bash launch-chrome.sh
// 用法: npx tsx login-x.ts

import { loginToX, isLoggedIn } from "./src/publish/x-browser.js";

console.log("🔍 正在检查 Chrome 调试端口...");

try {
  const alreadyLoggedIn = await isLoggedIn();
  if (alreadyLoggedIn) {
    console.log("✅ X 已登录！可以直接在 Web UI 中发帖。");
    process.exit(0);
  }
} catch {
  console.log("⚠️  Chrome 调试端口未检测到");
  console.log("   请先运行: bash launch-chrome.sh");
  console.log("   然后在 Chrome 中手动访问 x.com 登录");
  process.exit(1);
}

console.log("🌐 Chrome 已连接，但 X 未登录");
console.log("   请在 Chrome 中访问 https://x.com 手动登录");
console.log("   登录后无需再运行本脚本");
process.exit(1);
