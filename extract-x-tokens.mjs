// Extract X auth tokens from automation Chrome using raw CDP
import { readFileSync, writeFileSync } from "fs";

const CDP = "http://127.0.0.1:9222";

async function main() {
  console.log("🔍 连接自动化 Chrome...");

  // Get WebSocket URL
  let wsUrl;
  try {
    const ver = await fetch(CDP + "/json/version");
    if (!ver.ok) throw new Error("CDP not available");
    const data = await ver.json();
    wsUrl = data.webSocketDebuggerUrl;
    console.log("✅ Chrome 已连接: " + data.Browser);
  } catch (e) {
    console.log("❌ 无法连接自动化 Chrome。请先运行: bash launch-chrome.sh");
    console.log("   错误: " + e.message);
    process.exit(1);
  }

  // Use WebSocket to navigate and extract cookies
  const ws = new WebSocket(wsUrl);
  
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    setTimeout(() => reject(new Error("timeout")), 5000);
  });

  // Helper to send CDP commands
  function send(method, params = {}) {
    const id = Math.floor(Math.random() * 1000000);
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => {
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) resolve(msg.result);
      };
    });
  }

  try {
    // Create new page and navigate to X
    const target = await send("Target.createTarget", { url: "about:blank" });
    const targetId = target.targetId;
    console.log("🌐 打开 X...");

    // Connect to the new page
    const pageWsUrl = CDP.replace("http", "ws") + "/devtools/page/" + targetId;
    const pageWs = new WebSocket(pageWsUrl);
    
    await new Promise((resolve, reject) => {
      pageWs.onopen = resolve;
      pageWs.onerror = reject;
      setTimeout(() => reject(new Error("page ws timeout")), 5000);
    });

    function pageSend(method, params = {}) {
      const id = Math.floor(Math.random() * 1000000);
      pageWs.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => {
        pageWs.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === id) resolve(msg.result);
        };
      });
    }

    await pageSend("Page.enable");
    
    // Navigate to X
    const navResult = await pageSend("Page.navigate", { url: "https://x.com/home" });
    console.log("   导航中... frameId=" + (navResult.frameId || "?"));

    // Wait for page load
    await new Promise(r => setTimeout(r, 5000));

    // Get cookies
    await send("Network.enable");
    const allCookies = await send("Network.getCookies", { urls: ["https://x.com"] });
    const cookies = allCookies.cookies || [];

    const authToken = cookies.find(c => c.name === "auth_token");
    const ct0 = cookies.find(c => c.name === "ct0");

    if (!authToken || !ct0) {
      console.log("❌ 未找到 auth_token 或 ct0");
      console.log("   找到的 cookies: " + cookies.map(c => c.name).join(", "));
      console.log("   请确保在自动化 Chrome 中已登录 x.com");
      pageWs.close();
      ws.close();
      process.exit(1);
    }

    console.log("🔑 auth_token: " + authToken.value.substring(0, 30) + "...");
    console.log("🔑 ct0: " + ct0.value);

    // Read current config
    const configPath = new URL("./config.json", import.meta.url).pathname;
    let config = {};
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {}

    config.xCookies = {
      authToken: authToken.value,
      ct0: ct0.value,
      extractedAt: new Date().toISOString(),
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    console.log("");
    console.log("✅ Token 已保存到 config.json");
    console.log("   现在可以用 GitHub Actions 在 Mac 关机时自动发帖了！");
    console.log("⚠️  Token 有效期约 30-90 天，过期后重新运行: node extract-x-tokens.mjs");

    pageWs.close();
    ws.close();
  } catch (e) {
    console.error("错误:", e.message);
    ws.close();
    process.exit(1);
  }
}

main();
