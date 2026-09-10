const LINK_API = "https://link.stremio.com/api/v2";

export interface LinkCode {
  code: string;
  link: string;
  qrcode: string;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

interface ApiEnvelope<T> {
  result?: T;
  error?: { message?: string; code?: number };
}

async function getEnvelope<T>(url: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Stremio request failed with status ${response.status}`);
  }
  return (await response.json()) as ApiEnvelope<T>;
}

export async function createLinkCode(): Promise<LinkCode> {
  const envelope = await getEnvelope<LinkCode>(`${LINK_API}/create`);
  if (!envelope.result) {
    throw new Error(envelope.error?.message ?? "Could not create a Stremio link code");
  }
  const { code, link, qrcode } = envelope.result;
  return { code, link, qrcode };
}

export async function pollAuthKey(
  code: string,
  signal: AbortSignal,
  options: PollOptions = {},
): Promise<string> {
  const intervalMs = options.intervalMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal.aborted) throw new Error("Stremio linking aborted");

    const envelope = await getEnvelope<{ authKey?: string }>(
      `${LINK_API}/read?code=${encodeURIComponent(code)}`,
    );
    const authKey = envelope.result?.authKey;
    if (authKey) return authKey;

    if (Date.now() >= deadline) throw new Error("Stremio linking timed out");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
