// ============================================================
// createCheckoutSession — starts a Stripe subscription checkout
// for the caller, for one ritual.
//
// Auth: the caller's own JWT (same pattern as sendPush) — never
// accepts a target user_id from the request body. Looks up (or
// lazily creates) a Stripe customer for the caller, persisting it to
// profiles.stripe_customer_id so later checkouts reuse it. Refuses
// to run if the ritual has no price_cents set — a ritual stays
// unmonetized until an admin explicitly prices it (see schema.sql).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.2";
import { stripe } from "../_shared/stripe.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appScheme = Deno.env.get("APP_SCHEME") ?? "ritualpods";

interface CreateCheckoutBody {
  ritual_id?: unknown;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!stripe) {
    return new Response(JSON.stringify({ error: "Payments aren't configured yet" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: CreateCheckoutBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ritualId = body.ritual_id;
  if (typeof ritualId !== "string") {
    return new Response(JSON.stringify({ error: "ritual_id (string) is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // From here on, use the service role — regular authenticated users
  // have no write access to profiles.stripe_customer_id or payments.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: ritual, error: ritualError } = await admin
    .from("rituals")
    .select("id, ritual_type, price_cents, stripe_price_id")
    .eq("id", ritualId)
    .maybeSingle();

  if (ritualError) {
    return new Response(JSON.stringify({ error: ritualError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!ritual || !ritual.price_cents) {
    return new Response(JSON.stringify({ error: "This ritual isn't monetized yet" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData.user.email ?? undefined,
      name: (profile?.full_name as string | null) ?? undefined,
      metadata: { user_id: userData.user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userData.user.id);
  }

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = ritual.stripe_price_id
    ? { price: ritual.stripe_price_id as string, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: ritual.price_cents as number,
          recurring: { interval: "month" },
          product_data: { name: `${ritual.ritual_type} pod membership` },
        },
      };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userData.user.id,
      line_items: [lineItem],
      metadata: { user_id: userData.user.id, ritual_id: ritualId },
      subscription_data: { metadata: { user_id: userData.user.id, ritual_id: ritualId } },
      success_url: `${appScheme}://membership?status=success`,
      cancel_url: `${appScheme}://membership?status=cancel`,
    });

    await admin.from("payments").upsert(
      {
        user_id: userData.user.id,
        ritual_id: ritualId,
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        status: "incomplete",
      },
      { onConflict: "user_id,ritual_id" }
    );

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("createCheckoutSession failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
