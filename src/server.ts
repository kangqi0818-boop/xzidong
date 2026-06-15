import express from "express";
import cors from "cors";
import cron from "node-cron";
import { createHash, randomBytes } from "crypto";
import { resolve } from "path";
import { loadConfig, saveConfig, AppConfig } from "./config-store.js";
import { getCurrentAstroSnapshot, buildAstroContext, getHourEnergy } from "./astro/ephemeris.js";
import { buildTarotDeck, buildKnowledgeContext, getZodiacInfo, ZODIAC_SIGNS } from "./data/knowledge-base.js";
import { generatePost, GeneratedPost } from "./generate/engine.js";
import { publishToInstagramPost } from "./publish/instagram.js";
import { publishToThreadsPost } from "./publish/threads.js";
import { savePostToDoc, PublishResult } from "./fallback/doc-writer.js";
import { postViaBrowser, loginToX, isLoggedIn, deleteViaBrowser } from "./publish/x-browser.js";
import { postToXWithCookies } from "./publish/x-api.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(resolve(process.cwd(), "public")));

let generatedPosts: GeneratedPost[] = [];
let generationLog: { time: string; hour: number; status: string }[] = [];
let abortController: AbortController | null = null;
let isPaused = false, isGenerating = false;
let targetDate = "";
let cronJobs: Map<number, cron.ScheduledTask> = new Map();
let autoPostEnabled = false;
let autoPostLog: { time: string; hour: number; platform: string; status: string }[] = [];
let pkceVerifier: string | null = null;
let pkceState: string | null = null;
let publishedTweets: Map<number, string> = new Map(); // hour -> tweetUrl

function todayStr() { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; }
function dateHeader(hour: number, od?: string) { return `📅 ${od||todayStr()} ${String(hour).padStart(2,"0")}:00（UTC）\n\n`; }
function clearCronJobs() { for (const [, j] of cronJobs) j.stop(); cronJobs.clear(); autoPostEnabled = false; }

function scheduleAutoPost() {
  clearCronJobs();
  if (generatedPosts.length === 0) return;
  autoPostEnabled = true; autoPostLog = [];
  for (const post of generatedPosts) {
    const h = post.hour;
    try {
      const job = cron.schedule(`0 ${h} * * *`, async () => {
        const n = new Date(); const nd = `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`;
        if (targetDate && nd !== targetDate) return;
        try {
          let r = await postViaBrowser(post.texts.en).catch(() => ({ success: false, error: "browser-unavailable" }));
          // Fallback: try cookie-based API if browser fails
          if (!r.success) {
            r = await postToXWithCookies(post.texts.en);
          }
          if (r.success && (r as any).tweetUrl) publishedTweets.set(post.hour, (r as any).tweetUrl);
          autoPostLog.push({ time: new Date().toISOString(), hour: h, platform: "X", status: r.success ? "ok" : "fail:" + (r.error || "unknown") });
        } catch (e: any) { autoPostLog.push({ time: new Date().toISOString(), hour: h, platform: "X", status: "err:" + (e.message || "") }); }
      }, { timezone: "UTC" });
      cronJobs.set(h, job);
    } catch (e: any) { autoPostLog.push({ time: new Date().toISOString(), hour: h, platform: "X", status: "cron:" + e.message }); }
  }
  autoPostLog.push({ time: new Date().toISOString(), hour: -1, platform: "X", status: "已安排 " + cronJobs.size + " 条 (浏览器)" });
}

// ─── OAuth 2.0 PKCE ────────────────────────────────────
function base64URL(b: Buffer): string { return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""); }

app.get("/api/x/auth", (_req, res) => {
  const cfg = loadConfig();
  if (!cfg.x.clientId) return res.status(400).json({ error: "Client ID not set" });
  const verifier = base64URL(randomBytes(32)); const state = base64URL(randomBytes(16));
  pkceVerifier = verifier; pkceState = state;
  const challenge = base64URL(createHash("sha256").update(verifier).digest());
  const authUrl = "https://x.com/i/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: cfg.x.clientId, redirect_uri: "http://localhost:3456/api/x/callback", scope: "tweet.read tweet.write users.read offline.access", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  res.json({ url: authUrl });
});

app.get("/api/x/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(`<html><body style="background:#0f0f1a;color:#f87171;font-family:sans-serif;text-align:center;padding:40px;"><h2>授权失败</h2><p>${error}</p></body></html>`);
  if (state !== pkceState || !pkceVerifier) return res.send(`<html><body style="background:#0f0f1a;color:#f87171;font-family:sans-serif;text-align:center;padding:40px;"><h2>State 不匹配</h2></body></html>`);
  const cfg = loadConfig();
  try {
    const tr = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: code as string, grant_type: "authorization_code", client_id: cfg.x.clientId, redirect_uri: "http://localhost:3456/api/x/callback", code_verifier: pkceVerifier }).toString() });
    const td = await tr.json() as any;
    if (td.error) return res.send(`<html><body style="background:#0f0f1a;color:#f87171;font-family:sans-serif;text-align:center;padding:40px;"><h2>Token 失败</h2><p>${td.error}</p></body></html>`);
    cfg.x.bearerToken = td.access_token; saveConfig(cfg);
    pkceVerifier = null; pkceState = null;
    res.send(`<html><body style="background:#0f0f1a;color:#4ade80;font-family:sans-serif;text-align:center;padding:40px;"><h2>授权成功</h2><script>setTimeout(function(){window.close();},2000);</script></body></html>`);
  } catch (e: any) { res.send(`<html><body style="background:#0f0f1a;color:#f87171;text-align:center;padding:40px;"><h2>错误</h2><p>${e.message}</p></body></html>`); }
});

// ─── Browser login ─────────────────────────────────────
app.get("/api/x/browser-status", async (_req, res) => {
  try { const li = await isLoggedIn(); res.json({ loggedIn: li, method: "browser" }); }
  catch (e: any) { res.json({ loggedIn: false, error: e.message }); }
});

app.post("/api/x/login", async (_req, res) => {
  res.json({ status: "opening", message: "浏览器正在打开..." });
  loginToX().then(r => console.log("[X Login]", r.success ? "OK" : "Failed: " + r.error));
});

// ─── Config ────────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  const c = loadConfig(); function mask(s: string) { return s ? "••••"+s.slice(-4) : ""; }
  res.json({ ...c, openai: { ...c.openai, apiKey: mask(c.openai.apiKey) }, x: { clientId: c.x.clientId?"••••"+c.x.clientId.slice(-4):"", clientSecret: c.x.clientSecret?"••••":"", bearerToken: mask(c.x.bearerToken), apiKey: mask(c.x.apiKey), apiSecret: c.x.apiSecret?"••••":"", accessToken: mask(c.x.accessToken), accessSecret: c.x.accessSecret?"••••":"" }, instagram: { username: c.instagram.username, password: c.instagram.password?"••••":"" }, threads: { accessToken: mask(c.threads.accessToken), userId: c.threads.userId } });
});

app.post("/api/config", (req, res) => {
  const b = req.body as Partial<AppConfig>; const c = loadConfig();
  function u(nv: string|undefined, ov: string) { return (nv && !nv.startsWith("••••")) ? nv : ov; }
  saveConfig({ openai: { apiKey: u(b.openai?.apiKey,c.openai.apiKey), baseURL: b.openai?.baseURL||c.openai.baseURL, model: b.openai?.model||c.openai.model }, x: { clientId: c.x.clientId, clientSecret: c.x.clientSecret, bearerToken: u(b.x?.bearerToken,c.x.bearerToken), apiKey: u(b.x?.apiKey,c.x.apiKey), apiSecret: u(b.x?.apiSecret,c.x.apiSecret), accessToken: u(b.x?.accessToken,c.x.accessToken), accessSecret: u(b.x?.accessSecret,c.x.accessSecret) }, instagram: { username: b.instagram?.username||c.instagram.username, password: u(b.instagram?.password,c.instagram.password) }, threads: { accessToken: u(b.threads?.accessToken,c.threads.accessToken), userId: b.threads?.userId||c.threads.userId } });
  res.json({ ok: true });
});

// ─── Generate ──────────────────────────────────────────
async function runGeneration() {
  const cfg = loadConfig();
  process.env.DEEPSEEK_API_KEY = cfg.openai.apiKey; process.env.DEEPSEEK_BASE_URL = cfg.openai.baseURL; process.env.DEEPSEEK_MODEL = cfg.openai.model;
  isGenerating = true; isPaused = false; abortController = new AbortController(); const signal = abortController.signal;
  try {
    generationLog = []; generatedPosts = [];
    const astroSnapshot = await getCurrentAstroSnapshot(targetDate).catch(() => ({ timestamp: new Date().toISOString(), positions: [], moonPhase: { phase: "unknown", illumination: 0 } }));
    const astroCtx = buildAstroContext(astroSnapshot);
    const hz: { hour: number; zodiacs: { name: string; nameZh: string }[] }[] = [];
    for (let h = 0; h < 24; h++) { const cy = h % 4; hz.push({ hour: h, zodiacs: ZODIAC_SIGNS.slice(cy*3,cy*3+3).map(z => ({ name: z.name, nameZh: z.nameZh })) }); }
    const deck = buildTarotDeck(); const kctx = buildKnowledgeContext(hz[0].zodiacs.map(z => getZodiacInfo(z.name)!).filter(Boolean), []);
    for (let h = 0; h < 24; h++) {
      while (isPaused && !signal.aborted) await new Promise(r => setTimeout(r, 500));
      if (signal.aborted) { generationLog.push({ time: new Date().toISOString(), hour: h, status: "stopped" }); break; }
      generationLog.push({ time: new Date().toISOString(), hour: h, status: "generating" });
      try {
        const av = [...deck]; const tc: typeof deck = [];
        for (let i = 0; i < 3 && av.length > 0; i++) { const idx = Math.floor(Math.random()*av.length); tc.push(av[idx]); av.splice(idx,1); }
        const post = await generatePost(h, hz[h].zodiacs, tc, astroCtx, kctx, getHourEnergy(h));
        const hdr = dateHeader(h, targetDate); post.texts.zh = hdr + post.texts.zh; post.texts.en = hdr + post.texts.en; post.texts.ja = hdr + post.texts.ja;
        generatedPosts.push(post); generationLog.push({ time: new Date().toISOString(), hour: h, status: "done" });
      } catch (e: any) { generationLog.push({ time: new Date().toISOString(), hour: h, status: "failed: " + e.message }); }
    }
    for (const p of generatedPosts) savePostToDoc(p, []);
    scheduleAutoPost();
  } catch (e) { console.error(e); }
  finally { isGenerating = false; isPaused = false; abortController = null; }
}

app.post("/api/generate", async (req, res) => {
  if (!loadConfig().openai.apiKey) return res.status(400).json({ error: "请先设置 DeepSeek API Key" });
  if (isGenerating) return res.status(409).json({ error: "已有任务在运行" });
  targetDate = req.body?.date || todayStr();
  res.json({ status: "started", date: targetDate }); runGeneration();
});
app.post("/api/generate/pause", (_req, res) => { if (!isGenerating) return res.json({ ok: true }); isPaused = !isPaused; res.json({ ok: true, paused: isPaused }); });
app.post("/api/generate/stop", (_req, res) => { if (abortController) { abortController.abort(); isGenerating = false; isPaused = false; } res.json({ ok: true }); });
app.get("/api/generate/status", (_req, res) => { res.json({ total: 24, completed: generatedPosts.length, log: generationLog, isGenerating, isPaused, date: targetDate }); });

app.post("/api/autopost/start", (_req, res) => {
  if (generatedPosts.length === 0) return res.status(400).json({ error: "没有已生成的运势，请先生成" });
  scheduleAutoPost();
  res.json({ ok: true, scheduledCount: cronJobs.size, targetDate });
});
app.post("/api/autopost/stop", (_req, res) => { clearCronJobs(); res.json({ ok: true }); });
app.get("/api/autopost/status", (_req, res) => {
  const sched: { hour: number; date: string }[] = [];
  for (const [h] of cronJobs) sched.push({ hour: h, date: targetDate });
  res.json({ enabled: autoPostEnabled, scheduledCount: cronJobs.size, scheduled: sched, log: autoPostLog.slice(-20), targetDate });
});

app.get("/api/posts", (_req, res) => {
  res.json({ date: targetDate || todayStr(), posts: generatedPosts.map(p => ({ hour: p.hour, zodiacs: p.zodiacs, tarotCards: p.tarotCards, zh: p.texts.zh?.substring(0,100)+"...", en: p.texts.en?.substring(0,100)+"...", ja: p.texts.ja?.substring(0,100)+"..." })) });
});
app.get("/api/posts/:hour", (req, res) => {
  const post = generatedPosts.find(p => p.hour === parseInt(req.params.hour));
  if (!post) return res.status(404).json({ error: "Not found" }); res.json(post);
});
// ─── Export posts for GitHub Actions ──────────────────
app.get("/api/posts/export/github", (_req, res) => {
  const payload = {
    generatedAt: new Date().toISOString(),
    targetDate,
    posts: generatedPosts.map(p => ({
      hour: p.hour,
      zodiacs: p.zodiacs,
      tarotCards: p.tarotCards,
      texts: p.texts,
    })),
  };
  res.json(payload);
});

app.delete("/api/posts/:hour", async (req, res) => {
  const hour = parseInt(req.params.hour); const idx = generatedPosts.findIndex(p => p.hour === hour);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  // Also delete from X if published
  const tweetUrl = publishedTweets.get(hour);
  let xDeleted = false;
  if (tweetUrl) {
    try {
      const dr = await deleteViaBrowser(tweetUrl);
      xDeleted = dr.success;
    } catch {}
  }
  generatedPosts.splice(idx, 1); publishedTweets.delete(hour);
  res.json({ ok: true, xDeleted });
});

// ─── Publish (browser) ─────────────────────────────────
app.post("/api/publish/:hour", async (req, res) => {
  const post = generatedPosts.find(p => p.hour === parseInt(req.params.hour));
  if (!post) return res.status(404).json({ error: "先点击「生成运势」" });
  const cfg = loadConfig(); const results: PublishResult[] = [];

  let br = await postViaBrowser(post.texts.en).catch(() => ({ success: false, error: "browser-unavailable" }));
  if (!br.success) {
    br = await postToXWithCookies(post.texts.en);
  }
  if (br.success && (br as any).tweetUrl) publishedTweets.set(post.hour, (br as any).tweetUrl);
  results.push({ platform: "X", lang: "en", ...br });

  if (cfg.instagram.username) { const r = await publishToInstagramPost(post, "en", cfg.instagram.username, cfg.instagram.password); results.push({ platform: "Instagram", lang: "en", ...r }); }
  if (cfg.threads.accessToken) { const r = await publishToThreadsPost(post, "en", cfg.threads.accessToken, cfg.threads.userId); results.push({ platform: "Threads", lang: "en", ...r }); }

  savePostToDoc(post, results);
  res.json({ results, ok: results.filter((r: PublishResult) => r.success).length, fail: results.filter((r: PublishResult) => !r.success).length });
});

app.get("/", (_req, res) => { res.sendFile(resolve(process.cwd(), "public/index.html")); });
app.listen(process.env.PORT || 3456, () => { console.log("🔮 http://localhost:" + (process.env.PORT||3456)); });
