import type { GeneratedPost } from "../generate/engine.js";
import type { Language } from "../config.js";

export async function postToInstagram(
  text: string,
  accessToken: string,
  instagramAccountId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!accessToken || !instagramAccountId) {
    return {
      success: false,
      error: "Instagram credentials not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID in .env"
    };
  }

  try {
    const createUrl = `https://graph.facebook.com/v19.0/${instagramAccountId}/media`;
    const params = new URLSearchParams({
      caption: text,
      access_token: accessToken,
    });

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return { success: false, error: `IG media creation error ${createRes.status}: ${errBody}` };
    }

    const { id: creationId } = await createRes.json() as { id: string };

    const publishUrl = `https://graph.facebook.com/v19.0/${instagramAccountId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    });

    if (!publishRes.ok) {
      const errBody = await publishRes.text();
      return { success: false, error: `IG publish error ${publishRes.status}: ${errBody}` };
    }

    const { id: mediaId } = await publishRes.json() as { id: string };
    return { success: true, id: mediaId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function publishToInstagramPost(
  post: GeneratedPost,
  lang: Language,
  accessToken: string,
  instagramAccountId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const text = post.texts[lang];
  if (!text) return { success: false, error: `No text for language: ${lang}` };

  const caption = text.length > 2200 ? text.substring(0, 2190) + "..." : text;
  return postToInstagram(caption, accessToken, instagramAccountId);
}
