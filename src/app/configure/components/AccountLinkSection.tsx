"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearAuthKey,
  createLinkCode as createStremioLinkCode,
  pollAuthKey,
  readAuthKey,
  storeAuthKey,
  type LinkCode as StremioLinkCode,
} from "../../../lib/stremio-sync";
import {
  clearSession,
  createLinkCode as createNuvioLinkCode,
  pollSession,
  readSession,
  type LinkCode as NuvioLinkCode,
} from "../../../lib/nuvio-sync";

type Provider = "stremio" | "nuvio";

interface AccountLinkSectionProps {
  stremioLinked: boolean;
  onStremioLinkedChange: (linked: boolean) => void;
  nuvioLinked: boolean;
  onNuvioLinkedChange: (linked: boolean) => void;
}

export function AccountLinkSection({
  stremioLinked,
  onStremioLinkedChange,
  nuvioLinked,
  onNuvioLinkedChange,
}: AccountLinkSectionProps) {
  const [pairing, setPairing] = useState<Provider | null>(null);
  const [stremioCode, setStremioCode] = useState<StremioLinkCode | null>(null);
  const [nuvioCode, setNuvioCode] = useState<NuvioLinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onStremioLinkedChangeRef = useRef(onStremioLinkedChange);
  onStremioLinkedChangeRef.current = onStremioLinkedChange;
  const onNuvioLinkedChangeRef = useRef(onNuvioLinkedChange);
  onNuvioLinkedChangeRef.current = onNuvioLinkedChange;

  useEffect(() => {
    mountedRef.current = true;
    onStremioLinkedChangeRef.current(readAuthKey() !== null);
    onNuvioLinkedChangeRef.current(readSession() !== null);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const startLinking = async (provider: Provider) => {
    setError(null);
    setPairing(provider);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (provider === "stremio") {
        const code = await createStremioLinkCode();
        setStremioCode(code);
        storeAuthKey(await pollAuthKey(code.code, controller.signal));
        onStremioLinkedChange(true);
      } else {
        const code = await createNuvioLinkCode();
        setNuvioCode(code);
        // Nuvio hands back a full session, so pollSession stores it itself.
        await pollSession(code, controller.signal);
        onNuvioLinkedChange(true);
      }
    } catch {
      // Unmounted mid-poll: the component is gone, nothing left to update.
      if (!mountedRef.current) return;
      // A cancel is a deliberate abort, not a failure worth an error message.
      if (!controller.signal.aborted) {
        setError("Linking failed or timed out. Request a new code and try again.");
      }
    } finally {
      if (mountedRef.current) {
        setPairing(null);
        setStremioCode(null);
        setNuvioCode(null);
      }
      abortRef.current = null;
    }
  };

  const cancelLinking = () => {
    abortRef.current?.abort();
  };

  const unlink = (provider: Provider) => {
    abortRef.current?.abort();
    setError(null);
    if (provider === "stremio") {
      clearAuthKey();
      onStremioLinkedChange(false);
    } else {
      clearSession();
      onNuvioLinkedChange(false);
    }
  };

  return (
    <div className="mt-7">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Accounts</h3>

      {stremioLinked && nuvioLinked ? null : (
        <p className="mt-1 text-[11px] text-zinc-500">
          Link once and your catalogs update without reinstalling the addon. Your keys stay in this browser and never
          reach our servers.
        </p>
      )}

      {stremioLinked && (
        <LinkedRow
          label="Stremio linked. Your saves now reach Stremio directly."
          onUnlink={() => unlink("stremio")}
        />
      )}

      {nuvioLinked && (
        <LinkedRow label="Nuvio linked. Your saves now reach Nuvio directly." onUnlink={() => unlink("nuvio")} />
      )}

      {pairing === "stremio" && stremioCode && (
        <div className="mt-3 flex flex-col gap-4 rounded-lg bg-zinc-800/35 px-3.5 py-3.5 sm:flex-row sm:items-center">
          {/* Stremio serves the QR image itself, so no client-side QR library is needed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stremioCode.qrcode}
            alt="QR code linking to Stremio"
            className="h-24 w-24 flex-shrink-0 self-start rounded bg-white p-1.5 sm:self-auto"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-zinc-500">
              Open{" "}
              <a
                href={stremioCode.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-white"
              >
                link.stremio.com
              </a>{" "}
              or scan the code, then enter:
            </p>
            <p className="ph-no-capture mt-1.5 font-mono text-2xl tracking-[0.3em] text-white">{stremioCode.code}</p>
            <WaitingRow onCancel={cancelLinking} />
          </div>
        </div>
      )}

      {pairing === "nuvio" && nuvioCode && (
        <div className="mt-3 rounded-lg bg-zinc-800/35 px-3.5 py-3.5">
          <p className="text-[11px] text-zinc-500">
            Open{" "}
            <a
              href={nuvioCode.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-2 transition-colors hover:text-white"
            >
              nuvio.tv/link
            </a>{" "}
            and confirm this code:
          </p>
          <p className="ph-no-capture mt-1.5 font-mono text-2xl tracking-[0.3em] text-white">{nuvioCode.code}</p>
          <WaitingRow onCancel={cancelLinking} />
        </div>
      )}

      {!stremioCode && !nuvioCode && !(stremioLinked && nuvioLinked) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!stremioLinked && pairing !== "nuvio" && (
            <LinkButton onClick={() => startLinking("stremio")} disabled={pairing === "stremio"}>
              {pairing === "stremio" ? "..." : "Link Stremio account"}
            </LinkButton>
          )}
          {!nuvioLinked && pairing !== "stremio" && (
            <LinkButton onClick={() => startLinking("nuvio")} disabled={pairing === "nuvio"}>
              {pairing === "nuvio" ? "..." : "Link Nuvio account"}
            </LinkButton>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function LinkedRow({ label, onUnlink }: { label: string; onUnlink: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-zinc-800/35 px-3.5 py-2.5">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
      <p className="min-w-0 flex-1 text-[13px] text-zinc-300">{label}</p>
      <button
        type="button"
        onClick={onUnlink}
        className="flex-shrink-0 text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
      >
        Unlink
      </button>
    </div>
  );
}

function WaitingRow({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[11px] text-zinc-500">Waiting for confirmation…</span>
      <span className="text-[11px] text-zinc-700">/</span>
      <button
        type="button"
        onClick={onCancel}
        className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
      >
        Cancel
      </button>
    </div>
  );
}

function LinkButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-[13px] text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
