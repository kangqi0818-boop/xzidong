// GitHub Actions posting script — runs on schedule without browser
// Uses X auth cookies to post via X's internal API

// Get tokens from environment (GitHub Secrets) or local config
const AUTH_TOKEN = process.env.X_AUTH_TOKEN || "";
const CT0 = process.env.X_CT0 || "";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

// X's internal GraphQL API for creating tweets
const CREATE_TWEET_URL = "https://x.com/i/api/graphql/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet";

// X web app Bearer token (shared across all X web clients)
const X_WEB_BEARER = process.env.X_WEB_BEARER || 
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

// ─── Post helper ──────────────────────────────────────
async function postTweet(text: string): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!AUTH_TOKEN || !CT0) {
    return { success: false, error: "Missing X_AUTH_TOKEN or X_CT0 environment variables" };
  }

  const body = JSON.stringify({
    variables: {
      tweet_text: text,
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
    },
    features: {
      interactive_text_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_text_conversations_enabled: false,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
      vibe_api_enabled: false,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_media_interstitial_enabled: true,
      responsive_web_media_download_video_enabled: false,
      responsive_web_enhance_cards_enabled: false,
    },
    queryId: "a1p9RWpkYKBjWv_I3WzS-A",
  });

  try {
    const res = await fetch(CREATE_TWEET_URL, {
      method: "POST",
      headers: {
        "Authorization": X_WEB_BEARER,
        "Content-Type": "application/json",
        "Cookie": `auth_token=${AUTH_TOKEN}; ct0=${CT0}`,
        "X-Csrf-Token": CT0,
        "X-Twitter-Auth-Type": "OAuth2Session",
        "X-Twitter-Active-User": "yes",
        "X-Twitter-Client-Language": "en",
        "Origin": "https://x.com",
        "Referer": "https://x.com/home",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body,
    });

    const respText = await res.text();
    
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(respText);
        errMsg = errJson.errors?.[0]?.message || errMsg;
      } catch {}
      return { success: false, error: errMsg };
    }

    try {
      const data = JSON.parse(respText);
      const tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
      return { success: true, id: tweetId };
    } catch {
      return { success: false, error: "Parse error: " + respText.substring(0, 200) };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log("🚀 GitHub Actions — Horoscope Auto-Post");
  console.log("Time:", new Date().toISOString());

  if (!AUTH_TOKEN || !CT0) {
    console.log("❌ 未配置 X_AUTH_TOKEN 或 X_CT0");
    console.log("   请在 GitHub 仓库 Settings → Secrets → Actions 中添加:");
    console.log("   - X_AUTH_TOKEN: 你的 X auth_token cookie");
    console.log("   - X_CT0: 你的 X ct0 cookie");
    console.log("   - DEEPSEEK_API_KEY: (可选) DeepSeek API Key");
    console.log("");
    console.log("   如何获取 cookies:");
    console.log("   1. 打开 Chrome，登录 x.com");
    console.log("   2. F12 → Application → Cookies → x.com");
    console.log("   3. 复制 auth_token 和 ct0 的值");
    process.exit(1);
  }

  const hour = parseInt(process.env.POST_HOUR || "-1");
  const currentHour = new Date().getUTCHours();
  const targetHour = hour >= 0 ? hour : currentHour;

  console.log(`📅 Target hour: ${targetHour}:00 UTC`);

  // In GitHub Actions, we need to either generate content or use pre-generated
  // For MVP: post a simple test message
  // Full integration: generate content using DeepSeek, then post
  
  // Try loading local generated posts if available
  let text = "";
  try {
    const { readFileSync } = await import("fs");
    const configPath = "./config.json";
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    
    // Check if we have pre-generated posts
    const postsPath = "./generated-posts.json";
    try {
      const posts = JSON.parse(readFileSync(postsPath, "utf-8"));
      const post = posts.find((p: any) => p.hour === targetHour);
      if (post && post.texts?.en) {
        text = post.texts.en;
        console.log("✅ Found pre-generated post for hour " + targetHour);
      }
    } catch {
      console.log("No pre-generated posts file, generating...");
    }
  } catch {}

  if (!text) {
    // Generate a simple post
    text = `🔮 Hourly Horoscope — ${targetHour}:00 UTC\n\nStay tuned for your daily cosmic guidance! ✨`;
    console.log("ℹ️  Using default post (no pre-generated content found)");
  }

  console.log("📤 Posting to X...");
  const result = await postTweet(text);

  if (result.success) {
    console.log(`✅ Posted! Tweet ID: ${result.id || "unknown"}`);
    process.exit(0);
  } else {
    console.log(`❌ Failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
