"use client";

import Script from "next/script";
import { useState } from "react";
import TransitionLink from "../components/TransitionLink";
import { getInMemorySessionToken } from "../../lib/session-token";
import { startCheckout } from "../../lib/billing";

export default function PricingPage() {
  const [loadingVariant, setLoadingVariant] = useState<"monthly" | "yearly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The in-memory token only exists after a login in this same tab; a fresh
  // visit (e.g. from a Reddit link) has neither it nor a persistent cookie
  // to check without an extra request, so this is a same-tab convenience
  // check, not full auth — the backend re-verifies on POST /billing/checkout.
  const hasSessionHint = getInMemorySessionToken() !== null;

  const subscribe = async (variant: "monthly" | "yearly") => {
    setError(null);
    setLoadingVariant(variant);
    try {
      await startCheckout(variant);
    } catch {
      setError("Could not start checkout. Please try again.");
    } finally {
      setLoadingVariant(null);
    }
  };

  return (
    <>
      <Script src="https://app.lemonsqueezy.com/js/lemon.js" strategy="afterInteractive" />
      <main className="mx-auto max-w-2xl px-6 py-16 text-zinc-200">
        <h1 className="text-2xl font-semibold text-white">Stremboxd Supporter</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Unlocks auto-sync (your Stremio/Nuvio addon updates itself when you save preferences) and a persistent
          session (no need to log back in every visit).
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <PlanCard
            title="Yearly"
            price="9,99€/year"
            highlight
            disabled={loadingVariant !== null}
            loading={loadingVariant === "yearly"}
            onSubscribe={() => subscribe("yearly")}
          />
          <PlanCard
            title="Monthly"
            price="2€/month"
            disabled={loadingVariant !== null}
            loading={loadingVariant === "monthly"}
            onSubscribe={() => subscribe("monthly")}
          />
        </div>

        {!hasSessionHint && (
          <p className="mt-6 text-sm text-zinc-500">
            You need to be logged in to subscribe.{" "}
            <TransitionLink
              href="/configure"
              direction="down"
              className="text-zinc-300 underline underline-offset-2 hover:text-white"
            >
              Log in on the configure page
            </TransitionLink>{" "}
            first, then come back here.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </main>
    </>
  );
}

function PlanCard({
  title,
  price,
  highlight,
  disabled,
  loading,
  onSubscribe,
}: {
  title: string;
  price: string;
  highlight?: boolean;
  disabled: boolean;
  loading: boolean;
  onSubscribe: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${highlight ? "border-white/40 bg-zinc-800/50" : "border-zinc-700 bg-zinc-800/20"}`}
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">{title}</h2>
      <p className="mt-1 text-xl font-semibold text-white">{price}</p>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={disabled}
        className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "..." : "Subscribe"}
      </button>
    </div>
  );
}
