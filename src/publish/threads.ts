import type { GeneratedPost } from "../generate/engine.js";
import type { Language } from "../config.js";

export async function postToThreads(
  text: string,
  accessToken: string,
  threadsUserId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!accessToken || !threadsUserId) {
    return {
      success: false,
      error: "Threads credentials not configured. Set THREADS_ACCESS_TOKEN and THREADS_USER_ID in .env"
    };
  }

  try {
    const createUrl = `https://graph.threads.net/v1.0/${threadsUserId}/threads`;
    const params = new URLSearchParams({
      text,
      media_type: "TEXT",
      access_token: accessToken,
    });

    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return { success: false, error: `Threads creation error ${createRes.status}: ${errBody}` };
    }

    const { id: creationId } = await createRes.json() as { id: string };

    const publishUrl = `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`;
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
      return { success: false, error: `Threads publish error ${publishRes.status}: ${errBody}` };
    }

    const { id: threadId } = await publishRes.json() as { id: string };
    return { success: true, id: threadId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function publishToThreadsPost(
  post: GeneratedPost,
  lang: Language,
  accessToken: string,
  threadsUserId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const text = post.texts[lang];
  if (!text) return { success: false, error: `No text for language: ${lang}` };

  const threadText = text.length > 500 ? text.substring(0, 490) + "..." : text;
  return postToThreads(threadText, accessToken, threadsUserId);
}
