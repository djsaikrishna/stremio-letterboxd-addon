import { sleepOrAbort } from "./stremio-sync";

const DISCOVERY_URL = "https://api.nuvio.tv/.well-known/nuvio";
const LINK_PAGE = "https://nuvio.tv/link";
const DEVICE_NAME = "Stremboxd";
const MAX_POLL_ATTEMPTS = 120;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;
// Nuvio inherits addons from the first profile, so writing there covers every
// profile that has not opted out of the primary set.
const PRIMARY_PROFILE_INDEX = 1;

export interface LinkCode {
  code: string;
  link: string;
  deviceCode: string;
  nonce: string;
  pollIntervalMs: number;
}

export type SyncResult = "synced" | "unauthorized";

interface Backend {
  url: string;
  key: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface AddonRow {
  url: string;
  name: string | null;
  enabled: boolean | null;
  sort_order: number | null;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Signals that Nuvio rejected our credentials, so the caller can drop the
// stored session instead of surfacing a generic failure.
class UnauthorizedError extends Error {}

let backendPromise: Promise<Backend> | null = null;

async function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      const response = await fetch(DISCOVERY_URL);
      if (!response.ok) {
        throw new Error(`Nuvio request failed with status ${response.status}`);
      }
      const body = (await response.json()) as { backend_url?: string; publishable_key?: string };
      if (!body.backend_url || !body.publishable_key) {
        throw new Error("Nuvio returned an invalid backend description");
      }
      return { url: body.backend_url.replace(/\/+$/, ""), key: body.publishable_key };
    })().catch((error: unknown) => {
      // Let the next call retry instead of caching the failure forever.
      backendPromise = null;
      throw error;
    });
  }
  return backendPromise;
}

async function post<T>(path: string, payload: unknown, accessToken?: string): Promise<T> {
  const backend = await getBackend();
  const response = await fetch(`${backend.url}${path}`, {
    method: "POST",
    headers: {
      apikey: backend.key,
      Authorization: `Bearer ${accessToken ?? backend.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error(`Nuvio request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

function toSession(body: TokenResponse): Session {
  if (!body.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error("Nuvio returned an invalid session");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

// Nuvio shows the code as ABC-DEF, so the pairing screen and this page match.
function formatUserCode(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return normalized.length <= 3 ? normalized : `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

async function getAccessToken(): Promise<string> {
  const session = readSession();
  if (!session) throw new UnauthorizedError();
  // Refresh a minute early so a slow save does not race the expiry.
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;

  const backend = await getBackend();
  const response = await fetch(`${backend.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: backend.key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (response.status === 401 || response.status === 403) throw new UnauthorizedError();
  if (!response.ok) {
    throw new Error(`Nuvio token refresh failed with status ${response.status}`);
  }

  const refreshed = toSession((await response.json()) as TokenResponse);
  storeSession(refreshed);
  return refreshed.accessToken;
}

export async function syncAddon(manifestUrl: string): Promise<SyncResult> {
  try {
    const accessToken = await getAccessToken();
    const backend = await getBackend();

    const response = await fetch(
      `${backend.url}/rest/v1/addons?select=url,name,enabled,sort_order&profile_id=eq.${PRIMARY_PROFILE_INDEX}&order=sort_order.asc`,
      { headers: { apikey: backend.key, Authorization: `Bearer ${accessToken}` } },
    );
    if (response.status === 401 || response.status === 403) throw new UnauthorizedError();
    if (!response.ok) {
      throw new Error(`Nuvio request failed with status ${response.status}`);
    }

    const rows = (await response.json()) as AddonRow[];
    // Guard: the push below replaces the whole profile, so a malformed read
    // must never be written back or it would wipe every addon on the account.
    if (!Array.isArray(rows)) {
      throw new Error("Could not read the Nuvio addon list");
    }

    // Nuvio stores only the manifest URL and refetches the manifest itself, so
    // an addon that is already there picks up preference changes on its own.
    if (rows.some((row) => row.url === manifestUrl)) return "synced";

    const next = [
      ...rows.map((row, i) => ({
        url: row.url,
        name: row.name ?? "",
        enabled: row.enabled ?? true,
        sort_order: i,
      })),
      { url: manifestUrl, name: DEVICE_NAME, enabled: true, sort_order: rows.length },
    ];

    await post(
      "/rest/v1/rpc/sync_push_addons",
      {
        p_profile_id: PRIMARY_PROFILE_INDEX,
        p_addons: next,
        p_origin_client_id: readClientId(),
      },
      accessToken,
    );

    return "synced";
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      clearSession();
      return "unauthorized";
    }
    throw error;
  }
}

export async function createLinkCode(): Promise<LinkCode> {
  const nonce = crypto.randomUUID();
  const sessions = await post<
    Array<{
      device_code?: string;
      user_code?: string;
      verification_uri_complete?: string;
      poll_interval_seconds?: number;
    }>
  >("/rest/v1/rpc/start_device_login_session", {
    p_device_nonce: nonce,
    p_redirect_base_url: LINK_PAGE,
    p_device_name: DEVICE_NAME,
    p_device_type: "web",
  });

  const session = sessions?.[0];
  if (!session?.device_code || !session.user_code || !session.verification_uri_complete) {
    throw new Error("Could not create a Nuvio link code");
  }

  return {
    code: formatUserCode(session.user_code),
    link: session.verification_uri_complete,
    deviceCode: session.device_code,
    nonce,
    pollIntervalMs: Math.min(Math.max(session.poll_interval_seconds ?? 3, 2), 10) * 1000,
  };
}

export async function pollSession(linkCode: LinkCode, signal: AbortSignal): Promise<void> {
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleepOrAbort(linkCode.pollIntervalMs, signal);
    if (signal.aborted) throw new Error("Nuvio linking aborted");

    let status: string;
    try {
      const results = await post<Array<{ status?: string }>>("/rest/v1/rpc/poll_tv_login_session", {
        p_code: linkCode.deviceCode,
        p_device_nonce: linkCode.nonce,
      });
      const reported = results?.[0]?.status;
      if (!reported) throw new Error("Nuvio returned an invalid pairing status");
      status = reported.trim().toLowerCase();
    } catch (error) {
      if (signal.aborted) throw new Error("Nuvio linking aborted");
      // A single dropped poll is not fatal; a run of them is.
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) throw error;
      continue;
    }
    consecutiveFailures = 0;

    if (status === "approved") {
      storeSession(await exchange(linkCode));
      return;
    }
    if (status !== "pending") throw new Error("Nuvio linking expired");
  }

  throw new Error("Nuvio linking timed out");
}

async function exchange(linkCode: LinkCode): Promise<Session> {
  const body = await post<TokenResponse>("/functions/v1/tv-logins-exchange", {
    code: linkCode.deviceCode,
    device_nonce: linkCode.nonce,
  });
  return toSession(body);
}

export const SESSION_STORAGE_KEY = "configure:nuvio-session";
const CLIENT_ID_STORAGE_KEY = "configure:nuvio-client-id";

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.accessToken || !session.refreshToken) return null;
    return session;
  } catch {
    // Private mode, blocked storage or corrupt JSON: no account is linked.
    return null;
  }
}

export function storeSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Linking still works for this session, it just will not be remembered.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

// Nuvio tags every write with a stable client id so its other devices can tell
// our pushes apart from their own.
function readClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (stored) return stored;
    const generated = `stremboxd-web-${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `stremboxd-web-${crypto.randomUUID().replace(/-/g, "")}`;
  }
}
