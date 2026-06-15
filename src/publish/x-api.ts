// Post to X using internal/web API (no browser needed)
// Uses auth_token + ct0 cookies extracted from real Chrome
// Can run on GitHub Actions, VPS, etc. — anywhere without a browser

import { loadConfig } from "../config-store.js";

interface XCookiePost {
  success: boolean;
  id?: string;
  error?: string;
}

// X's internal GraphQL endpoint for creating tweets
const CREATE_TWEET_URL = "https://x.com/i/api/graphql/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet";

// X API Bearer token (used by the web app, different from dev API)
const X_WEB_BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

function getCSRFToken(): string {
  // Generate a valid CSRF token (X checks format but any valid token works)
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function postToXWithCookies(text: string): Promise<XCookiePost> {
  const config = loadConfig();
  const cookies = config.xCookies;

  if (!cookies || !cookies.authToken || !cookies.ct0) {
    return { success: false, error: "未配置 X Cookie。请运行 npx tsx extract-x-tokens.ts" };
  }

  try {
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

    const headers: Record<string, string> = {
      "Authorization": X_WEB_BEARER,
      "Content-Type": "application/json",
      "Cookie": `auth_token=${cookies.authToken}; ct0=${cookies.ct0}`,
      "X-Csrf-Token": cookies.ct0,
      "X-Twitter-Auth-Type": "OAuth2Session",
      "X-Twitter-Active-User": "yes",
      "X-Twitter-Client-Language": "en",
      "Origin": "https://x.com",
      "Referer": "https://x.com/home",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    };

    if (cookies.apiBearer) {
      headers["Authorization"] = `Bearer ${cookies.apiBearer}`;
    }

    const res = await fetch(CREATE_TWEET_URL, {
      method: "POST",
      headers,
      body,
    });

    const respText = await res.text();

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(respText);
        if (errJson.errors?.[0]?.message) {
          errMsg = errJson.errors[0].message;
        }
      } catch {}
      return { success: false, error: errMsg };
    }

    try {
      const data = JSON.parse(respText);
      const tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
      if (tweetId) {
        return { success: true, id: tweetId };
      }
      return { success: false, error: "无法解析推文ID: " + respText.substring(0, 200) };
    } catch {
      return { success: true }; // Posted but couldn't parse ID
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Delete tweet using X's internal API
export async function deleteXPostWithCookies(tweetId: string): Promise<XCookiePost> {
  const config = loadConfig();
  const cookies = config.xCookies;

  if (!cookies || !cookies.authToken || !cookies.ct0) {
    return { success: false, error: "未配置 X Cookie" };
  }

  try {
    const url = `https://x.com/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet`;

    const body = JSON.stringify({
      variables: {
        tweet_id: tweetId,
        dark_request: false,
      },
      queryId: "VaenaVgh5q5ih7kvyVjgtg",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": X_WEB_BEARER,
        "Content-Type": "application/json",
        "Cookie": `auth_token=${cookies.authToken}; ct0=${cookies.ct0}`,
        "X-Csrf-Token": cookies.ct0,
        "X-Twitter-Auth-Type": "OAuth2Session",
        "Origin": "https://x.com",
        "Referer": `https://x.com/user/status/${tweetId}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    const respText = await res.text();

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${respText.substring(0, 200)}` };
    }

    try {
      const data = JSON.parse(respText);
      const deleted = data?.data?.delete_tweet?.tweet_results?.result?.rest_id === tweetId;
      return { success: deleted };
    } catch {
      return { success: true };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
