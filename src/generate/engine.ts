import OpenAI from "openai";
import { config } from "../config.js";
import type { Language } from "../config.js";

export interface GeneratedPost {
  hour: number;
  zodiacs: string[];
  tarotCards: string[];
  texts: Record<Language, string>;
}

function getClient(): OpenAI {
  const apiKey = config.openai.apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseURL = config.openai.baseURL || process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.deepseek.com";
  return new OpenAI({ apiKey, baseURL });
}

function buildSystemPrompt(): string {
  return `You are a master astrologer and content creator blending Eastern and Western esoteric traditions. 
You create compelling, viral-ready daily horoscope posts that combine:
- Western astrology (zodiac signs, planetary transits, houses)
- Chinese metaphysics (五行/Wuxing, 天干地支, 时辰系统)
- Tarot (both Major and Minor Arcana)
- Chinese health wisdom (穴位/acupoints, 食疗/diet therapy, 季节养生/seasonal wellness)

Your tone: mysterious yet approachable, poetic but not vague, specific enough to feel personal.
Use rich emoji throughout for visual rhythm. Each post must be self-contained and shareable.

CRITICAL RULES:
- Generate in THREE languages: Chinese (zh), English (en), Japanese (ja)
- Each language version should be culturally adapted, not literal translation
- Chinese: Use 繁体/简体 mixed naturally, reference 五行/时辰 naturally
- English: Western-friendly but with authentic Eastern wisdom woven in
- Japanese: Honorific-aware, reference 和風 aesthetics
- End each post with an interactive question to drive engagement
- Include relevant emoji clusters at the end for visual appeal
- Total length per post: 2-4 short paragraphs, emoji-heavy but substantive`;
}

function buildUserPrompt(
  hour: number,
  zodiacs: { name: string; nameZh: string }[],
  tarotCards: { name: string; nameZh: string; upright: string; reversed: string }[],
  astroContext: string,
  knowledgeContext: string,
  hourEnergy: string,
): string {
  return `## TASK
Generate ONE horoscope post for hour ${hour}:00 (UTC). 
The post should focus on these 3 zodiac signs, weaving in the tarot draws and real astronomical data.

## SELECTED ZODIACS
${zodiacs.map(z => `- ${z.nameZh} (${z.name})`).join("\n")}

## TAROT DRAWS (random)
${tarotCards.map((c, i) => `- Card ${i+1}: ${c.nameZh} (${c.name}) — Upright: ${c.upright} | Reversed: ${c.reversed}`).join("\n")}

## HOUR ENERGY
${hourEnergy}

## REAL ASTRONOMICAL DATA
${astroContext}

## KNOWLEDGE BASE REFERENCE
${knowledgeContext}

## OUTPUT FORMAT
Return valid JSON only, no markdown, no backticks:

{
  "zh": "中文文案...",
  "en": "English post...",
  "ja": "日本語の投稿..."
}

Each language field contains the complete post for that language.`;
}

export async function generatePost(
  hour: number,
  zodiacs: { name: string; nameZh: string }[],
  tarotCards: { name: string; nameZh: string; upright: string; reversed: string }[],
  astroContext: string,
  knowledgeContext: string,
  hourEnergy: string,
): Promise<GeneratedPost> {
  const client = getClient();
  const userPrompt = buildUserPrompt(
    hour, zodiacs, tarotCards, astroContext, knowledgeContext, hourEnergy
  );

  const model = config.openai.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("API returned empty response");

  const parsed = JSON.parse(content) as Record<Language, string>;

  for (const lang of config.languages) {
    if (!parsed[lang] || parsed[lang].length < 50) {
      throw new Error(`Missing or too short content for language: ${lang}`);
    }
  }

  return {
    hour,
    zodiacs: zodiacs.map(z => z.name),
    tarotCards: tarotCards.map(c => c.name),
    texts: parsed,
  };
}

export async function generateAllPosts(
  hourlyZodiacs: { hour: number; zodiacs: { name: string; nameZh: string }[] }[],
  hourlyTarot: (hour: number) => { name: string; nameZh: string; upright: string; reversed: string }[],
  astroContext: string,
  knowledgeContext: string,
  hourEnergyFn: (hour: number) => string,
  onProgress?: (hour: number, status: string) => void,
): Promise<GeneratedPost[]> {
  const posts: GeneratedPost[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const zodiacsForHour = hourlyZodiacs.find(h => h.hour === hour)?.zodiacs || hourlyZodiacs[0].zodiacs;
    const tarotForHour = hourlyTarot(hour);

    onProgress?.(hour, "generating");

    try {
      const post = await generatePost(
        hour, zodiacsForHour, tarotForHour,
        astroContext, knowledgeContext, hourEnergyFn(hour)
      );
      posts.push(post);
      onProgress?.(hour, "done");
    } catch (err: any) {
      onProgress?.(hour, `failed: ${err.message}`);
    }
  }

  return posts;
}
