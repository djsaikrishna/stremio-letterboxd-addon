"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import TransitionLink from "../components/TransitionLink";
import Footer from "../components/Footer";
import { openCheckout, CheckoutError } from "../../lib/billing";

const COMPARISON = [
  {
    feature: "Auto-sync",
    free: "Reinstall the addon after changes",
    supporter: "Already in Stremio and Nuvio",
  },
  {
    feature: "Persistent session",
    free: "Log in again, every time",
    supporter: "You're already in",
  },
];

const TOAST_DURATION = 4000;

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: "error" | "info";
}

export default function PricingPage() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (message: ReactNode, tone: ToastItem["tone"]) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => dismissToast(id), TOAST_DURATION);
  };

  const subscribe = async () => {
    setOpening(true);
    try {
      // Same tab, same JS context: /configure's poll picks up the in-memory
      // session and applies the supporter session once Polar confirms.
      await openCheckout(() => router.push("/configure?checkout=success"));
    } catch (err) {
      if (err instanceof CheckoutError && err.status === 401) {
        showToast(
          <>
            You&apos;re not logged in.{" "}
            <TransitionLink
              href="/configure"
              direction="down"
              className="text-white underline underline-offset-2 hover:text-zinc-300"
            >
              Log in
            </TransitionLink>
            , then come back here.
          </>,
          "info"
        );
      } else {
        showToast("Couldn't open the checkout right now. Try again in a moment.", "error");
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 pt-12 pb-24 sm:px-10 sm:pt-16 sm:pb-28">
        <TransitionLink
          href="/configure"
          direction="down"
          className="text-sm font-light text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <svg className="mr-1 -mt-0.5 inline-block h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </TransitionLink>

        <h1 className="mt-10 text-2xl font-semibold leading-tight tracking-tight sm:mt-14 sm:whitespace-nowrap sm:text-4xl">
          Auto-sync and a persistent session.
        </h1>
        <p className="mt-3 text-base font-light text-zinc-400 sm:whitespace-nowrap sm:text-lg">
          Everything else in Stremboxd stays free and open source.
        </p>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-12 sm:mt-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <section aria-labelledby="compare-heading" className="flex flex-col justify-center">
            <h2 id="compare-heading" className="sr-only">
              Free compared to supporter
            </h2>
            <div className="hidden grid-cols-[1fr_170px_190px] gap-x-6 border-b border-zinc-800 pb-6 text-xs text-zinc-500 sm:grid">
              <span>Feature</span>
              <span>Free</span>
              <span className="text-white">Supporter</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[1fr_170px_190px] sm:items-center sm:gap-x-6 sm:gap-y-0">
              {COMPARISON.map((row, index) => (
                <FeatureRow key={row.feature} row={row} first={index === 0} />
              ))}
            </div>
          </section>

          <div
            className="film-grain relative flex flex-col justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-7"
            aria-live="polite"
          >
            <p className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
              <span className="text-4xl font-semibold tracking-tight">9,99&nbsp;€</span>
              <span className="text-sm font-light text-zinc-500">/ year, or 3&nbsp;€ / month</span>
            </p>
            <p className="mt-4 text-sm font-light leading-relaxed text-zinc-400">
              Covers hosting and unlocks the two features.
            </p>

            <button
              type="button"
              onClick={subscribe}
              disabled={opening}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opening ? "Opening checkout..." : "Become a supporter"}
            </button>
            <p className="mt-3 text-xs font-light text-zinc-500">Cancel anytime, access lasts until the period ends.</p>
          </div>
        </div>

        <p className="mt-10 text-center text-sm font-light text-zinc-500 sm:mt-14">
          Questions about billing or cancelling? Answers in the{" "}
          <TransitionLink
            href="/faq"
            direction="up"
            className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200"
          >
            FAQ
          </TransitionLink>
          , under Supporter.
        </p>

      </div>

      <Footer />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[90] flex w-[min(92vw,360px)] flex-col gap-2.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-fade-in relative overflow-hidden rounded-xl border border-zinc-700/80 bg-black/95 px-4 py-3.5 shadow-2xl"
        >
          <span
            className={`absolute inset-y-0 left-0 w-0.5 ${toast.tone === "info" ? "bg-amber-500/80" : "bg-red-500/80"}`}
          />
          <div className="min-w-0 flex-1 pl-2 pr-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {toast.tone === "info" ? "Heads up" : "Error"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-100">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="absolute right-2.5 top-2.5 text-zinc-500 transition-colors hover:text-zinc-200"
            aria-label="Dismiss notification"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function FeatureRow({ row, first }: { row: (typeof COMPARISON)[number]; first: boolean }) {
  return (
    <>
      <h3
        className={`col-span-2 text-base font-medium text-zinc-200 sm:col-span-1 sm:border-b sm:border-zinc-900 sm:pb-8 ${
          first ? "" : "border-t border-zinc-900 pt-8 sm:border-t-0 sm:pt-0"
        }`}
      >
        {row.feature}
      </h3>
      <p className="text-sm font-light text-zinc-500 sm:border-b sm:border-zinc-900 sm:pb-8">{row.free}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-white sm:border-b sm:border-zinc-900 sm:pb-8">
        <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {row.supporter}
      </p>
    </>
  );
}
