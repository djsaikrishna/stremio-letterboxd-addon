"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearAuthKey,
  createLinkCode,
  pollAuthKey,
  readAuthKey,
  storeAuthKey,
  type LinkCode,
} from "../../../lib/stremio-sync";

interface StremioLinkSectionProps {
  onLinkedChange: (linked: boolean) => void;
}

export function StremioLinkSection({ onLinkedChange }: StremioLinkSectionProps) {
  const [isLinked, setIsLinked] = useState(false);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const linked = readAuthKey() !== null;
    setIsLinked(linked);
    onLinkedChange(linked);
    return () => abortRef.current?.abort();
  }, [onLinkedChange]);

  const startLinking = async () => {
    setError(null);
    setIsLinking(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const code = await createLinkCode();
      setLinkCode(code);
      const authKey = await pollAuthKey(code.code, controller.signal);
      storeAuthKey(authKey);
      setLinkCode(null);
      setIsLinked(true);
      onLinkedChange(true);
    } catch {
      setError("Linking failed or timed out. Request a new code and try again.");
      setLinkCode(null);
    } finally {
      setIsLinking(false);
      abortRef.current = null;
    }
  };

  const unlink = () => {
    abortRef.current?.abort();
    clearAuthKey();
    setLinkCode(null);
    setIsLinked(false);
    onLinkedChange(false);
  };

  return (
    <div className="mt-7">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Stremio Account</h3>

      {isLinked ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-zinc-400">
            Linked — your changes are applied to Stremio automatically when you save.
          </p>
          <button
            type="button"
            onClick={unlink}
            className="cursor-pointer text-[13px] text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
          >
            Unlink
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[13px] text-zinc-500">
            Link your Stremio account once and your catalogues update without reinstalling the addon. Your Stremio key
            stays in this browser and is never sent to our servers.
          </p>

          {linkCode ? (
            <div className="mt-4 flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={linkCode.qrcode} alt="Stremio linking QR code" className="h-24 w-24 rounded bg-white p-1" />
              <div>
                <p className="text-[13px] text-zinc-400">
                  Open{" "}
                  <a
                    href={linkCode.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-200 underline underline-offset-2"
                  >
                    link.stremio.com
                  </a>{" "}
                  and enter this code:
                </p>
                <p className="mt-2 font-mono text-2xl tracking-[0.3em] text-white">{linkCode.code}</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startLinking}
              disabled={isLinking}
              className="mt-3 cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLinking ? "Preparing code..." : "Link Stremio account"}
            </button>
          )}

          {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
