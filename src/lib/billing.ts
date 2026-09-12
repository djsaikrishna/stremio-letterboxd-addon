import { authHeaders } from "./session-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://api.stremboxd.com";

/**
 * Thrown by openCheckout() when the backend refuses to create a checkout.
 * Carries the HTTP status so callers can tell "not logged in" (401) apart
 * from any other failure worth a generic retry message.
 */
export class CheckoutError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Could not start checkout (status ${status})`);
    this.name = "CheckoutError";
    this.status = status;
  }
}

/**
 * Opens the Polar checkout as an overlay on the current page. The JS context
 * is kept, so the in-memory session token survives the payment. `onSuccess`
 * runs instead of Polar's own redirect.
 */
export async function openCheckout(onSuccess: () => void): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/billing/checkout`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new CheckoutError(response.status);
  }

  const { url } = (await response.json()) as { url: string };

  // Loaded on click only: the checkout bundle stays out of every page load.
  const { PolarEmbedCheckout } = await import("@polar-sh/checkout/embed");
  const checkout = await PolarEmbedCheckout.create(url, { theme: "dark" });
  checkout.addEventListener("success", (event) => {
    event.preventDefault();
    onSuccess();
  });
}
