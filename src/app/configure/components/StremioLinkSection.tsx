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
  linked: boolean;
  onLinkedChange: (linked: boolean) => void;
}

export function StremioLinkSection({ linked: isLinked, onLinkedChange }: StremioLinkSectionProps) {
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onLinkedChangeRef = useRef(onLinkedChange);
  onLinkedChangeRef.current = onLinkedChange;

  useEffect(() => {
    mountedRef.current = true;
    onLinkedChangeRef.current(readAuthKey() !== null);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

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
      onLinkedChange(true);
    } catch {
      // Unmounted mid-poll: the component is gone, nothing left to update.
      if (!mountedRef.current) return;
      setLinkCode(null);
      // A cancel is a deliberate abort, not a failure worth an error message.
      if (!controller.signal.aborted) {
        setError("Linking failed or timed out. Request a new code and try again.");
      }
    } finally {
      if (mountedRef.current) setIsLinking(false);
      abortRef.current = null;
    }
  };

  const cancelLinking = () => {
    abortRef.current?.abort();
  };

  const unlink = () => {
    abortRef.current?.abort();
    clearAuthKey();
    setLinkCode(null);
    setError(null);
    onLinkedChange(false);
  };

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Stremio Account</h3>
        {isLinked && (
          <button
            type="button"
            onClick={unlink}
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
          >
            Unlink
          </button>
        )}
      </div>

      {isLinked ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-zinc-800/35 px-3.5 py-2.5">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
          <p className="text-[13px] text-zinc-300">
            Linked. Your saves now reach Stremio directly.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-zinc-500">
            Link once and your catalogs update without reinstalling the addon. Your Stremio key stays in this browser
            and never reaches our servers.
          </p>

          {linkCode ? (
            <div className="mt-3 flex flex-col gap-4 rounded-lg bg-zinc-800/35 px-3.5 py-3.5 sm:flex-row sm:items-center">
              {/* Stremio serves the QR image itself, so no client-side QR library is needed. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={linkCode.qrcode}
                alt="QR code linking to Stremio"
                className="h-24 w-24 flex-shrink-0 self-start rounded bg-white p-1.5 sm:self-auto"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-zinc-500">
                  Open{" "}
                  <a
                    href={linkCode.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-white"
                  >
                    link.stremio.com
                  </a>{" "}
                  or scan the code, then enter:
                </p>
                <p className="ph-no-capture mt-1.5 font-mono text-2xl tracking-[0.3em] text-white">{linkCode.code}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">Waiting for confirmation…</span>
                  <span className="text-[11px] text-zinc-700">/</span>
                  <button
                    type="button"
                    onClick={cancelLinking}
                    className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startLinking}
              disabled={isLinking}
              className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLinking ? "..." : "Link Stremio account"}
            </button>
          )}

          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
