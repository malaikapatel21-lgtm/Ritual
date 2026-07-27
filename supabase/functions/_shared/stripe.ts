// ============================================================
// Shared Stripe client. Exported as `null` when STRIPE_SECRET_KEY
// isn't configured so callers can degrade gracefully (a 501
// "payments aren't configured" response) instead of crashing —
// same pattern as ANTHROPIC_API_KEY in matchPods.
// ============================================================

import Stripe from "npm:stripe@22.3.2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
