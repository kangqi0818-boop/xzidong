import { config } from "./config.js";
import { runDailyGeneration, runOnce, archiveToObsidian, publishPost } from "./schedule/scheduler.js";

const args = process.argv.slice(2);
const mode = args[0] || "schedule";

async function main() {
  if (!config.openai.apiKey || config.openai.apiKey === "sk-xxx") {
    console.error("❌ OPENAI_API_KEY not configured. Copy .env.example to .env and fill in your keys.");
    process.exit(1);
  }

  console.log("🔮 命理运势生成系统 v1.0");
  console.log(`📂 Obsidian vault: ${config.obsidian.vaultPath}`);
  console.log(`💾 Fallback path: ${config.fallback.outputPath}`);
  console.log(`🌍 Languages: ${config.languages.join(", ")}`);
  console.log(`🤖 Model: ${config.openai.model}`);
  console.log("");

  switch (mode) {
    case "generate-only": {
      console.log("Mode: Generate only (no publish)");
      const posts = await runOnce();
      console.log(`\nGenerated ${posts.length} posts:`);
      for (const post of posts) {
        console.log(`\n=== Hour ${post.hour}:00 ===`);
        console.log(`Zodiacs: ${post.zodiacs.join(", ")}`);
        console.log(`Tarot: ${post.tarotCards.join(", ")}`);
        console.log(`\n[zh]\n${post.texts.zh}`);
        console.log(`\n[en]\n${post.texts.en}`);
        console.log(`\n[ja]\n${post.texts.ja}`);
      }
      break;
    }

    case "publish-only": {
      console.log("Mode: Publish only (no generation) — TBD");
      break;
    }

    case "once": {
      console.log("Mode: Generate + publish one cycle");
      const posts = await runOnce();
      for (const post of posts) {
        console.log(`Publishing hour ${post.hour}:00 — ${post.zodiacs.join(", ")}`);
        const results = await publishPost(post);
        const ok = results.filter(r => r.success).length;
        const fail = results.filter(r => !r.success).length;
        console.log(`  OK: ${ok}, Failed: ${fail}`);
      }
      archiveToObsidian(posts);
      break;
    }

    case "schedule":
    default: {
      console.log("Mode: Schedule 24h cycle");
      await runDailyGeneration();
      console.log("\n✅ System running. Posts will publish at each hour (Tokyo time).");
      console.log("Press Ctrl+C to stop.");
      break;
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
