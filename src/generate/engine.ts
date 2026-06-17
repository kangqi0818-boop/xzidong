import OpenAI from "openai";
import { config } from "../config.js";
import type { Language } from "../config.js";

export interface GeneratedPost {
  id: string;
  date: string;
  zodiacs: string[];
  tarotCards: string[];
  texts: Record<Language, string>;
  preview: string;
}

function getClient(): OpenAI {
  const apiKey = config.openai.apiKey || process.env.DEEPSEEK_API_KEY || "";
  const baseURL = config.openai.baseURL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  return new OpenAI({ apiKey, baseURL });
}

function buildSystemPrompt(): string {
  const p = "You are a master astrologer blending Eastern and Western esoteric traditions.\nCreate compelling horoscope posts for specific zodiac signs on specific dates.\n\nContent includes:\n1. Daily Fortune\n2. Precautions\n3. Lucky Color with hex code\n4. Lucky Number (1-99)\n5. Key Prediction\n\nIntegrate Western astrology, Chinese metaphysics (Wuxing), Tarot, Chinese health wisdom.\nTone: mysterious yet approachable, poetic but specific. Rich emoji throughout.\n\nCRITICAL: Generate in THREE languages (zh, en, ja). Each culturally adapted.\nEnd each with an interactive question.\n3-5 short paragraphs per language, emoji-heavy.";
  return p;
}

function buildUserPrompt(
  date: string,
  zodiac: { name: string; nameZh: string },
  tarotCards: { name: string; nameZh: string; upright: string; reversed: string }[],
  astroContext: string,
  knowledgeContext: string
): string {
  const dayOfWeek = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long" });
  const cardsList = tarotCards.map((c, i) => "- Card " + (i + 1) + ": " + c.nameZh + " (" + c.name + ") - Upright: " + c.upright + " | Reversed: " + c.reversed).join("\n");

  return "## TASK\nGenerate a detailed daily horoscope post for " + zodiac.nameZh + " (" + zodiac.name + ") for " + date + " (" + dayOfWeek + ").\n\n## TAROT DRAW\n" + cardsList + "\n\n## ASTRONOMICAL DATA\n" + astroContext + "\n\n## KNOWLEDGE BASE REFERENCE\n" + knowledgeContext + "\n\n## CONTENT REQUIREMENTS\n- Fortune outlook\n- Precautions (2-3 specific things)\n- Lucky Color with hex code\n- Lucky Number (1-99)\n- A specific, memorable prediction\n- End with interactive question\n\n## OUTPUT FORMAT\nReturn valid JSON only:\n{\"zh\": \"...\", \"en\": \"...\", \"ja\": \"...\"}";
}

export async function generatePost(
  date: string,
  zodiac: { name: string; nameZh: string },
  tarotCards: { name: string; nameZh: string; upright: string; reversed: string }[],
  astroContext: string,
  knowledgeContext: string
): Promise<GeneratedPost> {
  const client = getClient();
  const userPrompt = buildUserPrompt(date, zodiac, tarotCards, astroContext, knowledgeContext);
  const model = config.openai.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
    max_tokens: 2500
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("API returned empty response");

  const parsed = JSON.parse(content) as Record<Language, string>;

  for (const lang of config.languages) {
    if (!parsed[lang] || parsed[lang].length < 50) {
      throw new Error("Missing or too short content for language: " + lang);
    }
  }

  const preview = parsed.en.substring(0, 120).replace(/\n/g, " ");

  return {
    id: date + "-" + zodiac.name,
    date,
    zodiacs: [zodiac.name],
    tarotCards: tarotCards.map(c => c.name),
    texts: parsed,
    preview
  };
}

export async function generateForDateAndZodiacs(
  date: string,
  zodiacs: { name: string; nameZh: string }[],
  astroContext: string,
  knowledgeContext: string,
  tarotDeck: { name: string; nameZh: string; upright: string; reversed: string }[],
  onProgress?: (zodiac: string, status: string) => void,
  signal?: AbortSignal
): Promise<GeneratedPost[]> {
  const posts: GeneratedPost[] = [];
  const deck = [...tarotDeck];

  for (const zodiac of zodiacs) {
    if (signal?.aborted) break;

    onProgress?.(zodiac.name, "generating");

    try {
      const tc: typeof tarotDeck = [];
      const av = [...deck];
      for (let i = 0; i < 3 && av.length > 0; i++) {
        const idx = Math.floor(Math.random() * av.length);
        tc.push(av[idx]);
        av.splice(idx, 1);
      }

      const post = await generatePost(date, zodiac, tc, astroContext, knowledgeContext);
      posts.push(post);
      onProgress?.(zodiac.name, "done");
    } catch (err: any) {
      onProgress?.(zodiac.name, "failed: " + err.message);
    }
  }

  return posts;
}
