import { mkdirSync, writeFileSync, existsSync } from "fs";
import { config } from "../config.js";
import type { Language } from "../config.js";
import type { GeneratedPost } from "../generate/engine.js";

export interface PublishResult {
  platform: string;
  lang: Language;
  success: boolean;
  id?: string;
  error?: string;
}

export function savePostToDoc(
  post: GeneratedPost,
  results: PublishResult[],
  timestamp?: string,
): string {
  const outDir = config.fallback.outputPath;
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const now = timestamp || new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `运势_${post.hour.toString().padStart(2, "0")}时_${now}.doc`;

  const failedResults = results.filter(r => !r.success);
  const successResults = results.filter(r => r.success);

  let rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 \\fswiss Helvetica;}{\\f1 \\fnil MS Mincho;}}
\\pard\\f0\\fs28\\b HOUR: ${post.hour}:00\\b0\\par
\\pard\\f0\\fs24\\b Zodiacs:\\b0 ${post.zodiacs.join(", ")}\\par
\\pard\\f0\\fs24\\b Tarot:\\b0 ${post.tarotCards.join(", ")}\\par
\\par
\\pard\\f0\\fs26\\b ====== PUBLISH RESULTS ======\\b0\\par
\\par
\\pard\\f0\\fs24\\b Successful:\\b0\\par
`;

  for (const r of successResults) {
    rtf += `\\pard\\f0\\fs22 - [${r.platform}][${r.lang}] OK (id: ${r.id || "N/A"})\\par\n`;
  }

  if (failedResults.length > 0) {
    rtf += `\\par\\pard\\f0\\fs24\\b Failed:\\b0\\par\n`;
    for (const r of failedResults) {
      const safeError = (r.error || "unknown").replace(/[\\{}]/g, "").substring(0, 200);
      rtf += `\\pard\\f0\\fs22 - [${r.platform}][${r.lang}] FAILED: ${safeError}\\par\n`;
    }
  }

  rtf += `\\par\\pard\\f0\\fs26\\b ====== CONTENT ======\\b0\\par\\par\n`;

  for (const lang of config.languages) {
    const text = post.texts[lang] || "";
    const langLabel: Record<string, string> = { zh: "Chinese", en: "English", ja: "Japanese" };
    rtf += `\\pard\\f0\\fs24\\b [${langLabel[lang]}]\\b0\\par\n`;
    const escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\n/g, "\\par\n");
    rtf += `\\pard\\f0\\fs22 ${escaped}\\par\\par\n`;
  }

  rtf += `}`;

  const filePath = `${outDir}/${fileName}`;
  writeFileSync(filePath, rtf, "utf-8");

  return filePath;
}

export function saveAllPostsToDoc(
  posts: GeneratedPost[],
  allResults: Map<number, PublishResult[]>,
): string[] {
  const files: string[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);

  for (const post of posts) {
    const results = allResults.get(post.hour) || [];
    const filePath = savePostToDoc(post, results, timestamp);
    files.push(filePath);
  }

  return files;
}
