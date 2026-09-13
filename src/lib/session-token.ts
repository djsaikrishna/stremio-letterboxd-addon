// Deliberately not persisted anywhere (no localStorage, no cookie): a
// non-entitled user's session lives only in this module for the lifetime of
// the tab, so a refresh loses it — matching the pre-persistent-session
// behavior for anyone who has not subscribed. See CONTEXT.md → "Persistent session".
let inMemoryToken: string | null = null;

export function setInMemorySessionToken(token: string | null): void {
  inMemoryToken = token;
}

export function getInMemorySessionToken(): string | null {
  return inMemoryToken;
}

export function authHeaders(): Record<string, string> {
  return inMemoryToken ? { Authorization: `Bearer ${inMemoryToken}` } : {};
}
