"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TransitionLink from "../components/TransitionLink";
import Footer from "../components/Footer";
import { openCheckout, CheckoutError } from "../../lib/billing";

const COMPARISON = [
  {
    feature: "Auto-sync",
    free: ["Change your catalogs", "Reinstall the addon"],
    supporter: ["Change your catalogs", "Already in Stremio and Nuvio"],
  },
  {
    feature: "Persistent session",
    free: ["Open the configure page", "Log in again, every time"],
    supporter: ["Open the configure page", "You're already in"],
  },
];

type ViewState = "idle" | "opening" | "unauthenticated" | "error";

export default function PricingPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("idle");

  const subscribe = async () => {
    setView("opening");
    try {
      // Same tab, same JS context: /configure's poll picks up the in-memory
      // session and applies the supporter session once Polar confirms.
      await openCheckout(() => router.push("/configure?checkout=success"));
      setView("idle");
    } catch (err) {
      setView(err instanceof CheckoutError && err.status === 401 ? "unauthenticated" : "error");
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-2xl px-4 pt-10 pb-16 sm:pt-16">
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

        <h1 className="mt-8 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Two things, for 9,99&nbsp;€ a&nbsp;year.
        </h1>
        <p className="mt-4 max-w-lg text-lg font-light text-zinc-400 sm:text-xl">
          Everything else in Stremboxd stays free and open source.
        </p>

        <section aria-labelledby="compare-heading" className="mt-12">
          <h2 id="compare-heading" className="sr-only">
            Free compared to supporter
          </h2>
          <div className="grid grid-cols-2 gap-x-3 px-4 pb-2 text-sm text-zinc-500 sm:gap-x-6 sm:px-5">
            <span>Free</span>
            <span className="text-white">Supporter</span>
          </div>
          <div className="flex flex-col gap-3">
            {COMPARISON.map((row) => (
              <div key={row.feature} className="rounded-xl bg-zinc-900/50 p-4 sm:p-5">
                <h3 className="text-base font-medium text-zinc-200">{row.feature}</h3>
                <div className="mt-3 grid grid-cols-2 gap-x-3 sm:gap-x-6">
                  <Flow steps={row.free} />
                  <Flow steps={row.supporter} done />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="price-heading" className="mt-12">
          <h2 id="price-heading" className="sr-only">
            Price
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-5xl font-semibold tracking-tight">
              9,99&nbsp;€<span className="text-lg font-light text-zinc-500"> / year</span>
            </p>
            <p className="text-sm font-light text-zinc-500">or 3&nbsp;€ / month</p>
          </div>
          <p className="mt-4 max-w-lg text-base font-light leading-relaxed text-zinc-400">
            Stremboxd runs on servers that cost me about 20&nbsp;€ a month. The subscription pays for them, and you get
            two features in return. The yearly plan works out to less than a euro a month.
          </p>
        </section>

        <div className="film-grain relative mt-10 overflow-hidden rounded-2xl bg-zinc-900 p-5 sm:p-7" aria-live="polite">
          <p className="text-sm text-zinc-500">Stremboxd supporter</p>
          <p className="mt-1 text-lg font-medium text-white">Activates as soon as you pay.</p>
          <p className="mt-1 text-sm font-light text-zinc-400">
            Pick yearly or monthly in the checkout. Cancel anytime, you keep the features until the end of the period.
          </p>
          <button
            type="button"
            onClick={subscribe}
            disabled={view === "opening"}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {view === "opening" ? "Opening checkout..." : view === "error" ? "Try again" : "Become a supporter"}
          </button>

          {view === "unauthenticated" && (
            <p className="mt-4 text-sm text-zinc-300">
              Log in first, so the subscription is tied to your account.{" "}
              <TransitionLink
                href="/configure"
                direction="down"
                className="text-white underline underline-offset-2 hover:text-zinc-300"
              >
                Log in on the configure page
              </TransitionLink>
              , then come back here.
            </p>
          )}

          {view === "error" && (
            <p className="mt-4 text-sm text-red-400">Couldn&apos;t open the checkout right now. Try again in a moment.</p>
          )}
        </div>

        <p className="mt-10 text-sm font-light text-zinc-500">
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

      <Footer absolute={false} />
    </div>
  );
}

function Flow({ steps, done }: { steps: string[]; done?: boolean }) {
  const [trigger, outcome] = steps;
  return (
    <div className="text-sm leading-snug">
      <p className="font-light text-zinc-500">{trigger}</p>
      <svg
        className={`my-1.5 h-3.5 w-3.5 ${done ? "text-zinc-400" : "text-zinc-700"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      <p className={done ? "flex items-start gap-1.5 font-medium text-white" : "font-light text-zinc-400"}>
        {done && (
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {outcome}
      </p>
    </div>
  );
}
