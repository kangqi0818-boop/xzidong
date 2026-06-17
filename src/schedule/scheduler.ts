import cron from "node-cron";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { config } from "../config.js";
import type { Language } from "../config.js";
import { getCurrentAstroSnapshot, selectNotableZodiacs, buildAstroContext, getHourEnergy } from "../astro/ephemeris.js";
import { buildTarotDeck, buildKnowledgeContext, getZodiacInfo, ZODIAC_SIGNS } from "../data/knowledge-base.js";
import { generateForDateAndZodiacs } from "../generate/engine.js";
import type { GeneratedPost } from "../generate/engine.js";
import { publishToXPost } from "../publish/x.js";
import { publishToInstagramPost } from "../publish/instagram.js";
import { publishToThreadsPost } from "../publish/threads.js";
import { savePostToDoc } from "../fallback/doc-writer.js";
import type { PublishResult } from "../fallback/doc-writer.js";

function drawTarotCards(count: number = 3) {
  const deck = buildTarotDeck();
  const drawn: typeof deck = [];
  const available = [...deck];

  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length);
    const card = available[idx];
    if (card) {
      drawn.push(card);
      available.splice(idx, 1);
    }
  }

  return drawn;
}

function selectHourlyZodiacs(): { hour: number; zodiacs: { name: string; nameZh: string }[] }[] {
  const hourlyData: { hour: number; zodiacs: { name: string; nameZh: string }[] }[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const hourCycle = hour % 4;
    const startIdx = hourCycle * 3;

    const zodiacs = ZODIAC_SIGNS.slice(startIdx, startIdx + 3)
      .map(z => ({ name: z.name, nameZh: z.nameZh }));

    hourlyData.push({ hour, zodiacs });
  }

  return hourlyData;
}

export async function publishPost(post: GeneratedPost): Promise<PublishResult[]> {
  const results: PublishResult[] = [];

  for (const lang of config.languages) {
    const xResult = await publishToXPost(post, lang, {
      apiKey: config.x.apiKey,
      apiSecret: config.x.apiSecret,
      accessToken: config.x.accessToken,
      accessSecret: config.x.accessSecret,
    });
    results.push({ platform: "X", lang, ...xResult });

    const igResult = await publishToInstagramPost(
      post, lang, config.instagram.username, config.instagram.password
    );
    results.push({ platform: "Instagram", lang, ...igResult });

    const thrResult = await publishToThreadsPost(
      post, lang, config.threads.accessToken, config.threads.userId
    );
    results.push({ platform: "Threads", lang, ...thrResult });
  }

  return results;
}

export async function runDailyGeneration(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting daily horoscope generation...`);

  console.log("Fetching astronomical data...");
  let astroSnapshot;
  try {
    astroSnapshot = await getCurrentAstroSnapshot();
  } catch (err) {
    console.error("Failed to fetch astro data, using fallback:", err);
    astroSnapshot = { timestamp: new Date().toISOString(), positions: [], moonPhase: { phase: "unknown", illumination: 0 } };
  }

  const astroContext = buildAstroContext(astroSnapshot);
  const hourlyZodiacs = selectHourlyZodiacs();
  const sampleZodiacs = hourlyZodiacs[0]?.zodiacs.map(z => getZodiacInfo(z.name)!).filter(Boolean) || [];
  const sampleTarot = drawTarotCards(3);
  const knowledgeContext = buildKnowledgeContext(sampleZodiacs, sampleTarot);

  console.log("Generating 24 posts...");
  const posts = await generateForDateAndZodiacs(
// @ts-ignore
    hourlyZodiacs,
    () => drawTarotCards(3),
    astroContext,
    knowledgeContext,
    getHourEnergy,
    (hour: any, status: any) => console.log(`  Hour ${hour}:00 — ${status}`),
  );

  console.log(`Generated ${posts.length} posts.`);

  for (let hour = 0; hour < 24; hour++) {
    const post = posts.find(p => p.id === String(hour));
    if (!post) continue;

    savePostToDoc(post, []);

    const cronExpr = `0 ${hour} * * *`;
    cron.schedule(cronExpr, async () => {
      console.log(`[${new Date().toISOString()}] Publishing hour ${hour}:00...`);
      const results = await publishPost(post);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      console.log(`  Published: ${successCount} OK, ${failCount} failed`);
      savePostToDoc(post, results);
    }, {
      timezone: config.timezone,
    });
  }

  console.log("All 24 hours scheduled. Posts also saved to fallback directory.");
  console.log(`Fallback path: ${config.fallback.outputPath}`);
}

export function archiveToObsidian(posts: GeneratedPost[]): void {
  const dateStr = new Date().toISOString().split("T")[0];
  const archivePath = resolve(config.obsidian.vaultPath, `05-案例库/每日运势_${dateStr}.md`);

  let md = `---
title: 每日运势存档 ${dateStr}
date: ${dateStr}
tags:
  - 案例库
  - 运势
  - 自动生成
---

# ${dateStr} 每日运势存档

> 共生成 ${posts.filter(p => !!p).length} 条运势帖（24条目标）

`;

  for (const post of posts) {
    if (!post) continue;
    md += `## ${post.date}\n\n`;
    md += `**星座**: ${post.zodiacs.map(z => `#${z}`).join(" ")}\n`;
    md += `**塔罗**: ${post.tarotCards.join(", ")}\n\n`;
    md += `### 中文\n${post.texts.zh}\n\n`;
    md += `### English\n${post.texts.en}\n\n`;
    md += `### 日本語\n${post.texts.ja}\n\n`;
    md += `---\n\n`;
  }

  writeFileSync(archivePath, md, "utf-8");
  console.log(`Archived to Obsidian: ${archivePath}`);
}

export async function runOnce(): Promise<GeneratedPost[]> {
  console.log("Running single generation cycle...");

  const astroSnapshot = await getCurrentAstroSnapshot().catch(err => {
    console.error("Astro fetch failed:", err);
    return { timestamp: new Date().toISOString(), positions: [], moonPhase: { phase: "unknown", illumination: 0 } };
  });

  const astroContext = buildAstroContext(astroSnapshot);
  const hourlyZodiacs = selectHourlyZodiacs();
  const sampleZodiacs = hourlyZodiacs[0]?.zodiacs.map(z => getZodiacInfo(z.name)!).filter(Boolean) || [];
  const sampleTarot = drawTarotCards(3);
  const knowledgeContext = buildKnowledgeContext(sampleZodiacs, sampleTarot);

  const testHours = [0, 6, 12];
  const testZodiacs = testHours
    .map(h => hourlyZodiacs[h])
    .filter((z): z is { hour: number; zodiacs: { name: string; nameZh: string }[] } => z !== undefined);

  const posts = await generateForDateAndZodiacs(
// @ts-ignore
    testZodiacs,
    () => drawTarotCards(3),
    astroContext,
    knowledgeContext,
    getHourEnergy,
    (hour: any, status: any) => console.log(`  Hour ${hour}:00 — ${status}`),
  );

  return posts;
}
