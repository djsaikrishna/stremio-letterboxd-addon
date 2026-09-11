import { authHeaders } from "./session-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://api.stremboxd.com";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: { Url: { Open: (url: string) => void } };
  }
}

export async function startCheckout(variant: "monthly" | "yearly"): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/billing/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ variant }),
  });

  if (!response.ok) {
    throw new Error("Could not start checkout");
  }

  const { checkoutUrl } = (await response.json()) as { checkoutUrl: string };

  window.createLemonSqueezy?.();
  window.LemonSqueezy?.Url.Open(checkoutUrl);
}
