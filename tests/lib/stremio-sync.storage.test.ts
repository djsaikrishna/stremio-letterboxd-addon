import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  AUTH_KEY_STORAGE_KEY,
  readAuthKey,
  storeAuthKey,
  clearAuthKey,
} from "../../src/lib/stremio-sync";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("auth key storage", () => {
  it("returns null when nothing is stored", () => {
    expect(readAuthKey()).toBeNull();
  });

  it("stores and reads back the key", () => {
    storeAuthKey("auth-123");
    expect(localStorage.getItem(AUTH_KEY_STORAGE_KEY)).toBe("auth-123");
    expect(readAuthKey()).toBe("auth-123");
  });

  it("clears the key", () => {
    storeAuthKey("auth-123");
    clearAuthKey();
    expect(readAuthKey()).toBeNull();
  });

  it("returns null instead of throwing when storage is unavailable", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(readAuthKey()).toBeNull();
  });

  it("does not throw when writing to unavailable storage", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => storeAuthKey("auth-123")).not.toThrow();
  });
});
