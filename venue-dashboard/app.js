import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STREAK_FLAG_THRESHOLD = 3; // matches the plan's "3+ consecutive weeks" bar

const config = window.RITUAL_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

const signinView = document.getElementById("signin-view");
const verifyView = document.getElementById("verify-view");
const appView = document.getElementById("app-view");

const signinForm = document.getElementById("signin-form");
const signinStatus = document.getElementById("signin-status");
const verifyForm = document.getElementById("verify-form");
const verifyStatus = document.getElementById("verify-status");

const venuePickerRow = document.getElementById("venue-picker-row");
const venuePicker = document.getElementById("venue-picker");
const noVenues = document.getElementById("no-venues");
const ritualStats = document.getElementById("ritual-stats");
const emptyState = document.getElementById("empty-state");

let pendingEmail = "";
let venues = [];

function formatTime(startTime) {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function show(view) {
  signinView.hidden = view !== "signin";
  verifyView.hidden = view !== "verify";
  appView.hidden = view !== "app";
}

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  signinStatus.textContent = "Sending…";

  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    signinStatus.textContent = `Something went wrong: ${error.message}`;
    return;
  }
  pendingEmail = email;
  signinStatus.textContent = "";
  show("verify");
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.getElementById("code").value.trim();
  verifyStatus.textContent = "Verifying…";

  const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token: code, type: "email" });
  if (error) {
    verifyStatus.textContent = error.message;
  }
  // On success, onAuthStateChange below picks it up.
});

async function loadVenues() {
  const { data, error } = await supabase.rpc("my_venues");
  if (error) {
    noVenues.hidden = false;
    noVenues.textContent = `Couldn't load your venues: ${error.message}`;
    return;
  }

  venues = data ?? [];
  if (venues.length === 0) {
    noVenues.hidden = false;
    return;
  }

  noVenues.hidden = true;
  venuePickerRow.hidden = venues.length < 2;
  venuePicker.innerHTML = venues
    .map((v) => `<option value="${v.venue_id}">${v.name}${v.neighborhood ? ` · ${v.neighborhood}` : ""}</option>`)
    .join("");

  await loadStats(venues[0].venue_id);
}

venuePicker.addEventListener("change", () => loadStats(venuePicker.value));

async function loadStats(venueId) {
  const { data, error } = await supabase.rpc("venue_dashboard_stats", { p_venue_id: venueId });

  if (error) {
    ritualStats.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = `Couldn't load stats: ${error.message}`;
    return;
  }

  const rituals = data ?? [];
  emptyState.hidden = rituals.length > 0;
  ritualStats.innerHTML = rituals.map(renderRitualCard).join("");
}

function renderRitualCard(ritual) {
  const avgStreak = Number(ritual.avg_current_streak);
  const hasPods = Number(ritual.member_count) > 0;
  const flagged = hasPods && avgStreak < STREAK_FLAG_THRESHOLD;

  return `
    <li class="ritual-card${flagged ? " flagged" : ""}">
      <h3>${ritual.ritual_type}</h3>
      <p class="venue-time">${DAY_NAMES[ritual.day_of_week]}s at ${formatTime(ritual.start_time)}</p>
      <div class="stat-grid">
        <div class="stat">
          <div class="value">${ritual.waiting_count}</div>
          <div class="label">Waiting</div>
        </div>
        <div class="stat">
          <div class="value">${ritual.active_pod_count}</div>
          <div class="label">Active pods</div>
        </div>
        <div class="stat">
          <div class="value">${ritual.member_count}</div>
          <div class="label">Members</div>
        </div>
        <div class="stat streak">
          <div class="value">${avgStreak.toFixed(1)}</div>
          <div class="label">Avg streak</div>
        </div>
        <div class="stat">
          <div class="value">${ritual.checkins_last_4_weeks}</div>
          <div class="label">Check-ins / 4wk</div>
        </div>
      </div>
      ${flagged ? `<p class="flag-note">Below 3 weeks of average attendance — that's usually a ritual/venue-fit problem, not a scheduling one.</p>` : ""}
    </li>
  `;
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    show("app");
    await loadVenues();
  } else {
    show("signin");
  }
});

const {
  data: { session: initialSession },
} = await supabase.auth.getSession();
if (initialSession?.user) {
  show("app");
  await loadVenues();
} else {
  show("signin");
}
