// ============================================================
// stripeWebhook — Stripe calls this directly (no user JWT, so it
// must verify the request itself via the signature header rather
// than trusting anything in the body).
//
// Keeps `payments` in sync with the subscription's real status, and
// grants a one-time $10 Stripe account credit to whoever referred a
// user the first time that user's checkout completes. The credit is
// best-effort: if the referrer has never started a checkout of their
// own, they have no Stripe customer to credit yet, and the reward is
// skipped rather than queued — see admin/README.md.
// ============================================================

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.2";
import { stripe } from "../_shared/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const REFERRAL_CREDIT_CENTS = 1000;

async function grantReferralCreditIfDue(supabase: SupabaseClient, referredUserId: string) {
  const { data: referral } = await supabase
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", referredUserId)
    .eq("reward_granted", false)
    .maybeSingle();

  if (!referral) return;

  const { data: referrerProfile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", referral.referrer_id)
    .maybeSingle();

  const referrerCustomerId = referrerProfile?.stripe_customer_id as string | null | undefined;
  if (referrerCustomerId && stripe) {
    try {
      await stripe.customers.createBalanceTransaction(referrerCustomerId, {
        amount: -REFERRAL_CREDIT_CENTS,
        currency: "usd",
        description: "Referral reward — a friend you invited just joined",
      });
    } catch (error) {
      console.error("Failed to grant referral credit", error);
    }
  }

  await supabase.from("referrals").update({ reward_granted: true }).eq("id", referral.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!stripe || !webhookSecret) {
    return new Response("Payments aren't configured", { status: 501 });
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook signature verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const ritualId = session.metadata?.ritual_id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (userId && ritualId) {
        await supabase
          .from("payments")
          .update({
            status: "active",
            stripe_subscription_id: subscriptionId ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("ritual_id", ritualId);

        await grantReferralCreditIfDue(supabase, userId);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const status =
        subscription.status === "active" ? "active" : subscription.status === "past_due" ? "past_due" : "canceled";
      const periodEnd = subscription.items.data[0]?.current_period_end;
      const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      await supabase
        .from("payments")
        .update({ status, current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscription.id);
      break;
    }

    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
