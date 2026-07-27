import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const config = window.RITUAL_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

const signinView = document.getElementById("signin-view");
const appView = document.getElementById("app-view");
const signinForm = document.getElementById("signin-form");
const signinStatus = document.getElementById("signin-status");
const signedInAs = document.getElementById("signed-in-as");
const ritualList = document.getElementById("ritual-list");
const emptyState = document.getElementById("empty-state");
const tagline = document.getElementById("tagline");

tagline.textContent = `Pick a weekly ritual in ${config.neighborhood}. We'll form your pod once enough people are in.`;

function formatTime(startTime) {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function showSignIn() {
  signinView.hidden = false;
  appView.hidden = true;
}

function showApp() {
  signinView.hidden = true;
  appView.hidden = false;
}

async function ensureProfile(user) {
  await supabase
    .from("profiles")
    .upsert({ id: user.id, city: config.neighborhood }, { onConflict: "id" });
}

async function loadRituals(user) {
  const [{ data: rituals, error: ritualsError }, { data: counts }, { data: mySignups }] =
    await Promise.all([
      supabase
        .from("rituals")
        .select("id, ritual_type, day_of_week, start_time, min_pod_size, venues!inner(name, neighborhood)")
        .eq("venues.neighborhood", config.neighborhood),
      supabase.rpc("ritual_signup_counts"),
      supabase.from("ritual_signups").select("ritual_id").eq("user_id", user.id),
    ]);

  if (ritualsError) {
    ritualList.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = "Couldn't load rituals — try refreshing.";
    console.error(ritualsError);
    return;
  }

  const countByRitual = new Map((counts ?? []).map((c) => [c.ritual_id, Number(c.waiting_count)]));
  const joinedRitualIds = new Set((mySignups ?? []).map((s) => s.ritual_id));

  renderRituals(rituals ?? [], countByRitual, joinedRitualIds, user);
}

function renderRituals(rituals, countByRitual, joinedRitualIds, user) {
  ritualList.innerHTML = "";
  emptyState.hidden = rituals.length > 0;

  for (const ritual of rituals) {
    const count = countByRitual.get(ritual.id) ?? 0;
    const joined = joinedRitualIds.has(ritual.id);
    const needed = Math.max(0, ritual.min_pod_size - count);

    const li = document.createElement("li");
    li.className = "ritual-card";
    li.innerHTML = `
      <div class="details">
        <h3>${ritual.ritual_type}</h3>
        <p>${ritual.venues.name} · ${DAY_NAMES[ritual.day_of_week]}s at ${formatTime(ritual.start_time)}</p>
        <p class="count">${count} ${count === 1 ? "person" : "people"} in${needed > 0 ? ` · ${needed} more to launch` : " · ready to launch!"}</p>
      </div>
      <button data-ritual-id="${ritual.id}" class="${joined ? "joined" : ""}" ${joined ? "disabled" : ""}>
        ${joined ? "You're in ✓" : "I'm in"}
      </button>
    `;
    ritualList.appendChild(li);
  }

  ritualList.querySelectorAll("button:not(.joined)").forEach((button) => {
    button.addEventListener("click", () => joinRitual(button, user));
  });
}

async function joinRitual(button, user) {
  const ritualId = button.dataset.ritualId;
  button.disabled = true;
  button.textContent = "Joining…";

  const { error } = await supabase
    .from("ritual_signups")
    .insert({ ritual_id: ritualId, user_id: user.id });

  if (error && error.code !== "23505") {
    // 23505 = unique_violation (already signed up) — treat as success
    button.disabled = false;
    button.textContent = "I'm in";
    console.error(error);
    return;
  }

  await loadRituals(user);
}

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value;
  signinStatus.textContent = "Sending your link…";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });

  signinStatus.textContent = error
    ? `Something went wrong: ${error.message}`
    : "Check your email for a sign-in link.";
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    signedInAs.textContent = `Signed in as ${session.user.email}`;
    await ensureProfile(session.user);
    await loadRituals(session.user);
    showApp();
  } else {
    showSignIn();
  }
});

const { data: { session: initialSession } } = await supabase.auth.getSession();
if (initialSession?.user) {
  signedInAs.textContent = `Signed in as ${initialSession.user.email}`;
  await ensureProfile(initialSession.user);
  await loadRituals(initialSession.user);
  showApp();
} else {
  showSignIn();
}
