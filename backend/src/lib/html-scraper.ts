import { spawn } from 'node:child_process';
import { assertAllowedUrl } from './url-allowlist.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Letterboxd/Cloudflare blocks Node's fetch (undici) on several paths via TLS
// fingerprinting, so we shell out to curl which uses a different TLS stack.
async function curlFetch(url: string, accept = 'text/html,*/*;q=0.8'): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'curl',
      [
        '-sL',
        '--max-time', '8',
        '-H', `User-Agent: ${BROWSER_USER_AGENT}`,
        '-H', `Accept: ${accept}`,
        '-H', 'Accept-Language: en-US,en;q=0.9',
        '-w', '\n%{http_code}',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let data = '';
    proc.stdout.on('data', (c) => { data += c.toString(); });
    proc.on('close', () => {
      const idx = data.lastIndexOf('\n');
      if (idx === -1) return resolve(null);
      const code = data.slice(idx + 1).trim();
      if (code !== '200') return resolve(null);
      resolve(data.slice(0, idx));
    });
    proc.on('error', () => resolve(null));
  });
}

const BOXD_SHORTLINK_REGEX = /https?:\/\/boxd\.it\/([A-Za-z0-9]+)/;
const LIST_SHORTLINK_TAG_REGEX = /<link[^>]+rel="shortlink"[^>]+href="https?:\/\/boxd\.it\/([A-Za-z0-9]+)"/;
const LIST_SHORTLINK_TAG_ALT_REGEX = /href="https?:\/\/boxd\.it\/([A-Za-z0-9]+)"[^>]*rel="shortlink"/;
// Current markup (2026-09): the list sidebar's "like/share" widget carries
// the list's own LID. Both attributes live on the same <section>, so either
// one alone is a reliable source of truth for the page's own list.
const LIST_IDENTIFIER_REGEX = /data-list-identifier='([^']+)'/;
const LIST_BOXDIT_URL_REGEX = /data-list-boxdit-url="https?:\/\/boxd\.it\/([A-Za-z0-9]+)"/;
// Legacy markup, kept in case Letterboxd reverts or A/B tests the page.
const LIST_LIKEABLE_IDENTIFIER_REGEX =
  /data-likeable-identifier='([^']+)'/;

export async function fetchPageHtml(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = assertAllowedUrl(url, { allowHttp: true });
  } catch {
    return null;
  }
  return curlFetch(parsed.toString());
}

export function extractBoxdShortlinkId(html: string): string | null {
  return html.match(BOXD_SHORTLINK_REGEX)?.[1] ?? null;
}

function decodeHtmlAttrEntities(value: string): string {
  return value.replace(/&#034;/g, '"').replace(/&quot;/g, '"');
}

export function extractListIdFromListPage(html: string): string | null {
  const shortlinkId =
    html.match(LIST_SHORTLINK_TAG_REGEX)?.[1] ??
    html.match(LIST_SHORTLINK_TAG_ALT_REGEX)?.[1];
  if (shortlinkId) return shortlinkId;

  const identifierMatch = html.match(LIST_IDENTIFIER_REGEX);
  if (identifierMatch) {
    const decoded = decodeHtmlAttrEntities(identifierMatch[1]!);
    try {
      const parsed = JSON.parse(decoded) as { type?: string; lid?: string };
      if (parsed.type === 'list' && parsed.lid) return parsed.lid;
    } catch { /* ignore parse errors */ }
  }

  const boxditUrlMatch = html.match(LIST_BOXDIT_URL_REGEX);
  if (boxditUrlMatch) return boxditUrlMatch[1]!;

  const likeableMatch = html.match(LIST_LIKEABLE_IDENTIFIER_REGEX);
  if (likeableMatch) {
    const decoded = decodeHtmlAttrEntities(likeableMatch[1]!);
    try {
      const parsed = JSON.parse(decoded) as { type?: string; lid?: string };
      if (parsed.type === 'list' && parsed.lid) return parsed.lid;
    } catch { /* ignore parse errors */ }
  }

  return null;
}
