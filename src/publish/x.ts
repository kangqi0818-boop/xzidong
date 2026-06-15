import type { GeneratedPost } from "../generate/engine.js";
import type { Language } from "../config.js";

const X_API_BASE = "https://api.x.com/2/tweets";

// ─── OAuth 1.0a signature (for legacy OAuth 1.0a tokens) ──
async function oauth1Signature(
  method: string, url: string,
  apiKey: string, apiSecret: string,
  accessToken: string, accessSecret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const sortedKeys = Object.keys(oauthParams).sort();
  const paramStr = sortedKeys
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(oauthParams[k] || ""))
    .join("&");

  const sigBase = method.toUpperCase() + "&" + encodeURIComponent(url) + "&" + encodeURIComponent(paramStr);
  const signingKey = encodeURIComponent(apiSecret) + "&" + encodeURIComponent(accessSecret);

  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const msgData = encoder.encode(sigBase);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  oauthParams["oauth_signature"] = sigB64;

  return "OAuth " + sortedKeys
    .filter(k => k !== "oauth_signature")
    .concat(["oauth_signature"])
    .map(k => encodeURIComponent(k) + `="` + encodeURIComponent(oauthParams[k] || "") + `"`)
    .join(", ");
}

// ─── Build auth header ─────────────────────────────────
async function buildAuthHeader(credentials: {
  bearerToken?: string;
  apiKey?: string; apiSecret?: string;
  accessToken?: string; accessSecret?: string;
}): Promise<string> {
  // Prefer Bearer token (OAuth 2.0 / X API v2 standard)
  if (credentials.bearerToken) {
    return `Bearer ${credentials.bearerToken}`;
  }

  // Fall back to OAuth 1.0a
  if (credentials.apiKey && credentials.apiSecret && credentials.accessToken && credentials.accessSecret) {
    return oauth1Signature(
      "POST", X_API_BASE,
      credentials.apiKey, credentials.apiSecret,
      credentials.accessToken, credentials.accessSecret,
    );
  }

  throw new Error("No X auth credentials: set either Bearer Token or OAuth 1.0a keys");
}

// ─── Create Post ───────────────────────────────────────
export async function postToX(
  text: string,
  credentials: {
    bearerToken?: string;
    apiKey?: string; apiSecret?: string;
    accessToken?: string; accessSecret?: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const authHeader = await buildAuthHeader(credentials);
    const body = JSON.stringify({ text });

    const res = await fetch(X_API_BASE, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body,
    });

    const respBody = await res.text();

    if (!res.ok) {
      let errMsg = respBody;
      try {
        const errJson = JSON.parse(respBody);
        errMsg = errJson.detail || errJson.title || errJson.error || respBody;
      } catch {}
      return { success: false, error: `X API ${res.status}: ${errMsg}` };
    }

    const data = JSON.parse(respBody) as { data: { id: string; text: string } };
    return { success: true, id: data.data.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Delete Post ───────────────────────────────────────
export async function deleteXPost(
  tweetId: string,
  credentials: {
    bearerToken?: string;
    apiKey?: string; apiSecret?: string;
    accessToken?: string; accessSecret?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${X_API_BASE}/${tweetId}`;
    let authHeader: string;

    if (credentials.bearerToken) {
      authHeader = `Bearer ${credentials.bearerToken}`;
    } else if (credentials.apiKey && credentials.apiSecret && credentials.accessToken && credentials.accessSecret) {
      authHeader = await oauth1Signature("DELETE", url, credentials.apiKey, credentials.apiSecret, credentials.accessToken, credentials.accessSecret);
    } else {
      throw new Error("No X auth credentials");
    }

    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": authHeader },
    });

    const respBody = await res.text();

    if (!res.ok) {
      let errMsg = respBody;
      try { const errJson = JSON.parse(respBody); errMsg = errJson.detail || errJson.title || respBody; } catch {}
      return { success: false, error: `X API ${res.status}: ${errMsg}` };
    }

    const data = JSON.parse(respBody) as { data: { deleted: boolean } };
    return { success: data.data?.deleted ?? true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Publish helper ────────────────────────────────────
export async function publishToXPost(
  post: GeneratedPost,
  lang: Language,
  credentials: {
    bearerToken?: string;
    apiKey?: string; apiSecret?: string;
    accessToken?: string; accessSecret?: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const text = post.texts[lang];
  if (!text) return { success: false, error: `No text for language: ${lang}` };

  let postText = text;
  if (postText.length > 25000) {
    postText = postText.substring(0, 24950) + "...";
  }

  return postToX(postText, credentials);
}
