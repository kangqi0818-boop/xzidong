// X Browser Publisher — connects to REAL Chrome via CDP to bypass bot detection
// Requires: Chrome launched with --remote-debugging-port=9222
// Run: bash launch-chrome.sh  (or double-click in Finder)

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";

chromium.use(StealthPlugin());

const CDP_URL = "http://127.0.0.1:9222";
const X_URL = "https://x.com";

// ─── Check if CDP Chrome is available ──────────────────
async function isCDPAvailable(): Promise<boolean> {
  try {
    const res = await fetch(CDP_URL + "/json/version");
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Ensure Chrome with CDP is running ──────────────
async function ensureCDPChrome(): Promise<void> {
  if (await isCDPAvailable()) return;

  // Try to launch Chrome with debugging port
  const cmd = `open -a "Google Chrome" --args --remote-debugging-port=9222`;

  try {
    execSync(cmd, { stdio: "ignore" });
    // Wait for CDP to be ready
    for (let i = 0; i < 20; i++) {
      if (await isCDPAvailable()) return;
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch {
    // Chrome might already be open without CDP
  }

  throw new Error(
    "Chrome 调试端口未启动。请手动操作：\n" +
    "  1. 完全退出 Chrome（Cmd+Q）\n" +
    "  2. 终端执行: open -a 'Google Chrome' --args --remote-debugging-port=9222\n" +
    "  3. 确保 Chrome 中已登录 X (x.com)"
  );
}

// ─── Connect to real Chrome via CDP ────────────────────
async function connectToChrome() {
  await ensureCDPChrome();

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  return { browser, context };
}

// ─── Check if already logged into X ──────────────────
export async function isLoggedIn(): Promise<boolean> {
  try {
    if (!(await isCDPAvailable())) return false;

    const { browser } = await connectToChrome();
    const page = await browser.contexts()[0].newPage();

    await page.goto(X_URL + "/home", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const url = page.url();
    const loggedIn = url.includes("/home") && !url.includes("/login");
    await page.close();
    return loggedIn;
  } catch {
    return false;
  }
}

// ─── Post via real Chrome ──────────────────────────
export async function postViaBrowser(text: string): Promise<{
  success: boolean;
  tweetUrl?: string;
  error?: string;
}> {
  try {
    const { browser } = await connectToChrome();
    const context = browser.contexts()[0];
    const page = await context.newPage();

    // Navigate to home
    await page.goto(X_URL + "/home", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(3000);

    // Check login
    const currentUrl = page.url();
    if (!currentUrl.includes("/home") || currentUrl.includes("/login")) {
      await page.close();
      return {
        success: false,
        error: "Chrome 中未登录 X，请先在 Chrome 中访问 x.com 登录",
      };
    }

    // X 新版 UI：找到发帖框并点击
    const composerSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[role="textbox"][aria-label*="Post"]',
      '[role="textbox"][aria-label*="发帖"]',
      'div[aria-label="Post text"]',
      'a[href="/compose/post"]',
    ];

    let clicked = false;
    for (const sel of composerSelectors) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        await el.click();
        await page.waitForTimeout(1000);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // 键盘快捷键打开发帖弹窗
      await page.keyboard.press("KeyN");
      await page.waitForTimeout(1000);
    }

    // Find the editor
    await page.waitForTimeout(500);

    // Try multiple strategies to find and fill the text box
    let filled = false;
    const editorSelectors = [
      '[role="textbox"][data-testid*="tweetTextarea"]',
      '[role="textbox"]:focus',
      '[contenteditable="true"]',
    ];

    for (const sel of editorSelectors) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        try {
          await el.fill(text);
          filled = true;
          break;
        } catch {
          // Try type instead
          try {
            await el.click();
            await page.keyboard.type(text, { delay: 5 });
            filled = true;
            break;
          } catch {}
        }
      }
    }

    if (!filled) {
      await page.close();
      return {
        success: false,
        error: "找不到发帖输入框（X 页面结构可能已更新）",
      };
    }

    await page.waitForTimeout(1000);

    // Click Post button
    const postBtnSelectors = [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'button[aria-label*="Post"]',
      'button:has-text("Post")',
    ];

    let posted = false;
    for (const sel of postBtnSelectors) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        try {
          const disabled = await btn.getAttribute("disabled");
          if (disabled !== null || disabled === "") continue;
        } catch {}
        await btn.click();
        posted = true;
        break;
      }
    }

    if (!posted) {
      // Fallback: Cmd+Enter to submit
      await page.keyboard.press("Meta+Enter");
      await page.waitForTimeout(2000);
      posted = true;
    }

    await page.waitForTimeout(3000);

    // Try to get the tweet URL
    let tweetUrl: string | undefined;
    try {
      const finalUrl = page.url();
      if (finalUrl.includes("/status/")) {
        tweetUrl = finalUrl;
      }
    } catch {}

    await page.close();
    return { success: true, tweetUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Delete Post via browser ──────────────────────
export async function deleteViaBrowser(tweetUrl: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (!(await isCDPAvailable())) {
      return { success: false, error: "Chrome 调试端口未连接。请先运行 launch-chrome.sh" };
    }

    const { browser } = await connectToChrome();
    const context = browser.contexts()[0];
    const page = await context.newPage();

    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click "More" (three dots) menu on the tweet
    const moreBtn = page.locator('[data-testid="caret"], [aria-label="More"], button[aria-haspopup="menu"]').first();
    if ((await moreBtn.count()) > 0) {
      await moreBtn.click();
      await page.waitForTimeout(1000);

      // Click "Delete" in the menu
      const deleteBtn = page.locator('[role="menuitem"]:has-text("Delete"), [role="menuitem"]:has-text("删除")').first();
      if ((await deleteBtn.count()) > 0) {
        await deleteBtn.click();
        await page.waitForTimeout(1000);

        // Confirm deletion
        const confirmBtn = page.locator('[data-testid="confirmationSheetConfirm"], button:has-text("Delete"), button:has-text("删除")').first();
        if ((await confirmBtn.count()) > 0) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    }

    await page.close();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Schedule post at specific UTC time ────────────
// Used by the scheduler — the actual timing is in server.ts cron

// ─── Login helper ──────────────────────────────────
export async function loginToX(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // First check if already logged in
    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      console.log("[X Login] Already logged in!");
      return { success: true };
    }

    if (!(await isCDPAvailable())) {
      console.log("[X Login] Launching Chrome with debug port...");
      await ensureCDPChrome();
    }

    const { browser } = await connectToChrome();
    const context = browser.contexts()[0];
    const page = await context.newPage();

    await page.goto(X_URL + "/login", { waitUntil: "domcontentloaded" });
    console.log("[X Login] Chrome 已打开 X 登录页 — 请在浏览器中登录");
    console.log("[X Login] 登录成功后会自动检测");

    // Wait up to 5 minutes for login
    for (let i = 0; i < 100; i++) {
      await page.waitForTimeout(3000);
      try {
        const url = page.url();
        if (url === X_URL + "/home" || url.startsWith(X_URL + "/home")) {
          await page.close();
          console.log("[X Login] ✅ 登录成功！已保存在你的 Chrome 中");
          return { success: true };
        }
      } catch {}
    }

    await page.close();
    return { success: false, error: "登录超时（5分钟）" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
