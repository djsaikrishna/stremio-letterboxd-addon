"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
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

  // Send Back to wherever the user came from, not a hardcoded page.
  // document.referrer doesn't work here since TransitionLink navigates via
  // router.push — history length is the only reliable signal we have.
  const goBack = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.documentElement.dataset.transition = "down";

    const navigate = () => {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    };

    if (document.startViewTransition) {
      document.startViewTransition(navigate);
    } else {
      navigate();
    }
  };

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
      <a
        href="/"
        onClick={goBack}
        className="absolute left-4 top-4 z-10 text-sm font-light text-zinc-500 transition-colors hover:text-zinc-200 sm:left-6 sm:top-6"
      >
        <svg className="mr-1 -mt-0.5 inline-block h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </a>

      <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col justify-center gap-12 px-6 py-16 sm:px-10">
        <section>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:whitespace-nowrap sm:text-4xl">
            Auto-sync and a persistent session.
          </h1>
          <p className="mt-3 max-w-2xl text-base font-light leading-relaxed text-zinc-400 sm:text-lg">
            Everything else in Stremboxd stays free and open source. This covers hosting.{" "}
            <span className="text-white">Think of it as a tip, not a subscription.</span>
          </p>
        </section>

        <section aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="sr-only">
            Free compared to supporter
          </h2>
          <div className="hidden grid-cols-[200px_1fr_1fr] gap-x-8 border-b border-zinc-800 pb-3 text-xs text-zinc-500 sm:grid">
            <span>Feature</span>
            <span>Free</span>
            <span className="text-white">Supporter</span>
          </div>
          <div>
            {COMPARISON.map((row, index) => (
              <FeatureRow key={row.feature} row={row} first={index === 0} />
            ))}
          </div>
        </section>

        <section
          className="film-grain relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 px-8 py-8"
          aria-live="polite"
        >
          <p className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
            <span className="text-3xl font-semibold tracking-tight">9,99&nbsp;€</span>
            <span className="text-sm font-light text-zinc-500">/ year, or 3&nbsp;€ / month</span>
          </p>

          <button
            type="button"
            onClick={subscribe}
            disabled={opening}
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {opening ? "Opening checkout..." : "Become a supporter"}
          </button>
        </section>

        <p className="text-center text-sm font-light text-zinc-500">
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
    <div
      className={`grid grid-cols-1 gap-2.5 py-5 sm:grid-cols-[200px_1fr_1fr] sm:items-center sm:gap-x-8 sm:gap-y-0 sm:border-b sm:border-zinc-900 sm:py-6 ${
        first ? "" : "border-t border-zinc-900 sm:border-t-0"
      }`}
    >
      <h3 className="text-base font-medium text-zinc-200">{row.feature}</h3>

      <div className="flex items-start gap-3 text-sm font-light text-zinc-500 sm:block sm:whitespace-nowrap">
        <span className="w-20 shrink-0 text-xs text-zinc-600 sm:hidden">Free</span>
        <span>{row.free}</span>
      </div>

      <div className="flex items-start gap-3 text-sm font-medium text-white sm:flex sm:items-center sm:gap-1.5 sm:whitespace-nowrap">
        <span className="w-20 shrink-0 text-xs font-light text-zinc-600 sm:hidden">Supporter</span>
        <svg className="hidden h-3.5 w-3.5 shrink-0 text-zinc-400 sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <span>{row.supporter}</span>
      </div>
    </div>
  );
}
