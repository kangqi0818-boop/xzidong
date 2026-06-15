// GitHub Actions posting script — runs on schedule without browser
// Uses X auth cookies to post via X's internal API

const AUTH_TOKEN = process.env.X_AUTH_TOKEN || "";
const CT0 = process.env.X_CT0 || "";

// X's internal GraphQL API for creating tweets
const CREATE_TWEET_URL = "https://x.com/i/api/graphql/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet";

const X_WEB_BEARER = process.env.X_WEB_BEARER || 
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

async function postTweet(text: string): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!AUTH_TOKEN || !CT0) {
    return { success: false, error: "Missing X_AUTH_TOKEN or X_CT0" };
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
      vibe_api_enabled: true,
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
      rweb_video_timestamps_enabled: false,
      premium_content_enabled: true,
    },
    // Premium long-form tweet support
    fieldToggles: {
      article: false,
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
    console.log("  HTTP Status:", res.status);
    console.log("  Response preview:", respText.substring(0, 300));
    
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(respText);
        errMsg = errJson.errors?.[0]?.message || errJson.error || errMsg;
      } catch {}
      return { success: false, error: errMsg };
    }

    try {
      const data = JSON.parse(respText);

      // Try multiple possible paths for the tweet ID
      let tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;

      if (!tweetId) {
        // Try alternative response format
        tweetId = data?.data?.create_tweet?.tweet_results?.result?.tweet?.rest_id;
      }
      if (!tweetId) {
        // Try legacy format
        tweetId = data?.rest_id || data?.id_str || data?.id;
      }

      if (tweetId) {
        return { success: true, id: tweetId };
      }

      // No tweet ID found - dump full response for debugging
      console.log("  FULL RESPONSE:", respText.substring(0, 500));
      
      // Check if there's an error in the response
      if (data.errors && data.errors.length > 0) {
        return { success: false, error: data.errors[0].message || "API error" };
      }
      
      return { success: false, error: "Response OK but no tweet ID found" };
    } catch (parseErr: any) {
      return { success: false, error: "JSON parse error: " + parseErr.message };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log("🚀 GitHub Actions — Horoscope Auto-Post");
  console.log("  Time:", new Date().toISOString());

  if (!AUTH_TOKEN || !CT0) {
    console.log("❌ Missing X_AUTH_TOKEN or X_CT0");
    process.exit(1);
  }

  const hour = parseInt(process.env.POST_HOUR || "-1");
  const currentHour = new Date().getUTCHours();
  const targetHour = hour >= 0 ? hour : currentHour;

  console.log("  Target hour:", targetHour + ":00 UTC");

  // Try loading pre-generated posts
  let text = "";
  try {
    const { readFileSync } = await import("fs");
    const postsRaw = readFileSync("./generated-posts.json", "utf-8");
    const { posts } = JSON.parse(postsRaw);
    if (posts && posts.length > 0) {
      const post = posts.find((p: any) => p.hour === targetHour);
      if (post?.texts?.en) {
        // Post English only, truncate to X safe limit
        let rawText = post.texts.en;
        // Remove the date header line for X (it's format metadata)
        rawText = rawText.replace(/^📅[\s\S]*?\n\n/, "");
        text = rawText;
        if (text.length > 250) {
          console.log("  ⚠️  Post too long (" + text.length + " chars), truncating to 250");
          text = text.substring(0, 247) + "...";
        }
        console.log("  ✅ Found post for hour " + targetHour + " (" + (post.zodiacs || []).join(", ") + " | " + text.length + " chars)");
      }
    }
  } catch {}

  if (!text) {
    text = `🔮 Hourly Horoscope — ${targetHour}:00 UTC\n\n✨ Your cosmic energy update for this hour. Stay aligned! ✨`;
    console.log("  ℹ️  Using default post");
  }

  console.log("  📤 Posting (" + text.length + " chars)...");
  const result = await postTweet(text);

  if (result.success) {
    console.log("  ✅ SUCCESS! Tweet ID:", result.id);
    process.exit(0);
  } else {
    console.log("  ❌ FAILED:", result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
