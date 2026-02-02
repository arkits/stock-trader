/**
 * Gotify push notifications. Optional: the app runs fully without Gotify.
 * Omit GOTIFY_SERVER_URL / GOTIFY_APP_TOKEN to disable notifications.
 * API: https://gotify.net/docs/pushmsg
 * POST {server}/message?token={apptoken}
 * Body: multipart/form: title, message, priority (optional). Only message is required (v1.2.0+).
 */

export interface GotifyConfig {
  serverUrl: string;
  appToken: string;
}

export function getGotifyConfig(): GotifyConfig | null {
  const serverUrl = process.env.GOTIFY_SERVER_URL?.trim();
  const appToken = process.env.GOTIFY_APP_TOKEN?.trim();
  if (!serverUrl || !appToken) return null;
  const base = serverUrl.replace(/\/+$/, "");
  return { serverUrl: base, appToken };
}

export async function sendGotifyMessage(params: {
  config: GotifyConfig;
  title: string;
  message: string;
  priority?: number;
}): Promise<void> {
  const { config, title, message, priority = 5 } = params;
  const url = `${config.serverUrl}/message?token=${encodeURIComponent(config.appToken)}`;
  const form = new FormData();
  form.append("title", title);
  form.append("message", message);
  form.append("priority", String(priority));

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gotify error ${res.status}: ${text}`);
  }
}

/**
 * Send a trade notification to Gotify if configured. No-op if Gotify is not configured.
 */
export async function notifyTrade(params: {
  symbol: string;
  side: string;
  orderId: string;
}): Promise<void> {
  const config = getGotifyConfig();
  if (!config) return;

  const sideLabel = params.side.toLowerCase() === "buy" ? "Bought" : "Sold";
  const title = `Trade: ${sideLabel} ${params.symbol}`;
  const message = `Order ID: ${params.orderId}`;

  try {
    await sendGotifyMessage({
      config,
      title,
      message,
      priority: 7,
    });
  } catch (err) {
    console.error("[gotify] Failed to send trade notification:", err);
  }
}
