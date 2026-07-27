import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const config = window.RITUAL_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

const signinView = document.getElementById("signin-view");
const verifyView = document.getElementById("verify-view");
const notAdminView = document.getElementById("not-admin-view");
const appView = document.getElementById("app-view");

const signinForm = document.getElementById("signin-form");
const signinStatus = document.getElementById("signin-status");
const verifyForm = document.getElementById("verify-form");
const verifyStatus = document.getElementById("verify-status");

let pendingEmail = "";
let venues = [];
let rituals = [];
let editingVenueId = null;
let editingRitualId = null;
let selectedSignupIds = new Set();

function show(view) {
  signinView.hidden = view !== "signin";
  verifyView.hidden = view !== "verify";
  notAdminView.hidden = view !== "not-admin";
  appView.hidden = view !== "app";
}

function formatTime(startTime) {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function randomCheckInCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------

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

async function signOut() {
  await supabase.auth.signOut();
}
document.getElementById("sign-out-btn").addEventListener("click", signOut);
document.getElementById("app-sign-out-btn").addEventListener("click", signOut);

async function handleSession(session) {
  if (!session?.user) {
    show("signin");
    return;
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) {
    show("not-admin");
    return;
  }

  show("app");
  await Promise.all([loadOverview(), loadVenues(), loadRituals(), loadBilling(), loadGrowth()]);
}

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

const {
  data: { session: initialSession },
} = await supabase.auth.getSession();
await handleSession(initialSession);

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------

for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.addEventListener("click", () => {
    for (const b of document.querySelectorAll(".tab-btn")) b.classList.remove("active");
    btn.classList.add("active");
    for (const panel of document.querySelectorAll(".tab-panel")) panel.hidden = true;
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
  });
}

// ---------------------------------------------------------------
// Overview
// ---------------------------------------------------------------

async function loadOverview() {
  const { data, error } = await supabase.rpc("admin_overview");
  const tbody = document.getElementById("overview-body");
  const empty = document.getElementById("overview-empty");

  if (error) {
    tbody.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load overview: ${error.message}`;
    return;
  }

  const rows = data ?? [];
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr>
          <td>${r.ritual_type}</td>
          <td>${r.venue_name}</td>
          <td>${r.neighborhood ?? ""}</td>
          <td>${DAY_NAMES[r.day_of_week]}s at ${formatTime(r.start_time)}</td>
          <td>${r.waiting_count}</td>
          <td>${r.active_pod_count}</td>
          <td>${r.member_count}</td>
          <td>${Number(r.avg_current_streak).toFixed(1)}</td>
        </tr>
      `,
    )
    .join("");
}

// ---------------------------------------------------------------
// Venues
// ---------------------------------------------------------------

async function loadVenues() {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, address, city, neighborhood")
    .order("neighborhood", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    document.getElementById("venues-list").innerHTML = `<li class="status">Couldn't load venues: ${error.message}</li>`;
    return;
  }

  venues = data ?? [];
  renderVenues();
  renderVenuePicker();
}

function renderVenues() {
  const list = document.getElementById("venues-list");
  list.innerHTML = venues
    .map((v) => {
      if (v.id === editingVenueId) {
        return `
          <li class="record-item" data-id="${v.id}">
            <form class="edit-form venue-edit-form" data-id="${v.id}">
              <input class="edit-name" value="${v.name}" placeholder="Name" required />
              <input class="edit-address" value="${v.address ?? ""}" placeholder="Address" />
              <input class="edit-city" value="${v.city}" placeholder="City" required />
              <input class="edit-neighborhood" value="${v.neighborhood ?? ""}" placeholder="Neighborhood" />
              <button type="submit">Save</button>
              <button type="button" class="cancel-edit">Cancel</button>
            </form>
          </li>
        `;
      }
      return `
        <li class="record-item" data-id="${v.id}">
          <span class="record-label">${v.name}${v.neighborhood ? ` · ${v.neighborhood}` : ""} (${v.city})</span>
          <span class="record-actions">
            <button type="button" class="edit-venue-btn" data-id="${v.id}">Edit</button>
            <button type="button" class="delete-venue-btn" data-id="${v.id}">Delete</button>
          </span>
        </li>
      `;
    })
    .join("");

  for (const btn of list.querySelectorAll(".edit-venue-btn")) {
    btn.addEventListener("click", () => {
      editingVenueId = btn.dataset.id;
      renderVenues();
    });
  }
  for (const btn of list.querySelectorAll(".delete-venue-btn")) {
    btn.addEventListener("click", () => deleteVenue(btn.dataset.id));
  }
  for (const form of list.querySelectorAll(".venue-edit-form")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveVenue(form);
    });
    form.querySelector(".cancel-edit").addEventListener("click", () => {
      editingVenueId = null;
      renderVenues();
    });
  }
}

function renderVenuePicker() {
  const picker = document.getElementById("ritual-venue");
  picker.innerHTML = venues
    .map((v) => `<option value="${v.id}">${v.name}${v.neighborhood ? ` · ${v.neighborhood}` : ""}</option>`)
    .join("");
}

document.getElementById("venue-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("venue-form-status");
  const name = document.getElementById("venue-name").value.trim();
  const address = document.getElementById("venue-address").value.trim();
  const city = document.getElementById("venue-city").value.trim();
  const neighborhood = document.getElementById("venue-neighborhood").value.trim();

  const { error } = await supabase.from("venues").insert({
    name,
    address: address || null,
    city,
    neighborhood: neighborhood || null,
  });

  if (error) {
    status.textContent = `Couldn't add venue: ${error.message}`;
    return;
  }

  status.textContent = "Venue added.";
  event.target.reset();
  await loadVenues();
});

async function saveVenue(form) {
  const id = form.dataset.id;
  const { error } = await supabase
    .from("venues")
    .update({
      name: form.querySelector(".edit-name").value.trim(),
      address: form.querySelector(".edit-address").value.trim() || null,
      city: form.querySelector(".edit-city").value.trim(),
      neighborhood: form.querySelector(".edit-neighborhood").value.trim() || null,
    })
    .eq("id", id);

  if (error) {
    alert(`Couldn't save venue: ${error.message}`);
    return;
  }

  editingVenueId = null;
  await loadVenues();
  await loadOverview();
}

async function deleteVenue(id) {
  if (!confirm("Delete this venue? Its rituals will be deleted too.")) return;
  const { error } = await supabase.from("venues").delete().eq("id", id);
  if (error) {
    alert(`Couldn't delete venue: ${error.message}`);
    return;
  }
  await loadVenues();
  await loadRituals();
  await loadOverview();
}

// ---------------------------------------------------------------
// Rituals
// ---------------------------------------------------------------

async function loadRituals() {
  const { data, error } = await supabase
    .from("rituals")
    .select("id, venue_id, ritual_type, day_of_week, start_time, min_pod_size, max_pod_size, check_in_code, venues(name)")
    .order("day_of_week", { ascending: true });

  if (error) {
    document.getElementById("rituals-list").innerHTML = `<li class="status">Couldn't load rituals: ${error.message}</li>`;
    return;
  }

  rituals = data ?? [];
  renderRituals();
  renderMatchRitualPicker();
}

function renderRituals() {
  const list = document.getElementById("rituals-list");
  list.innerHTML = rituals
    .map((r) => {
      const venueName = r.venues?.name ?? "(unknown venue)";
      if (r.id === editingRitualId) {
        const venueOptions = venues
          .map((v) => `<option value="${v.id}"${v.id === r.venue_id ? " selected" : ""}>${v.name}</option>`)
          .join("");
        const dayOptions = DAY_NAMES
          .map((name, i) => `<option value="${i}"${i === r.day_of_week ? " selected" : ""}>${name}</option>`)
          .join("");
        return `
          <li class="record-item" data-id="${r.id}">
            <form class="edit-form ritual-edit-form" data-id="${r.id}">
              <select class="edit-venue">${venueOptions}</select>
              <input class="edit-type" value="${r.ritual_type}" placeholder="Type" required />
              <select class="edit-day">${dayOptions}</select>
              <input class="edit-time" type="time" value="${r.start_time.slice(0, 5)}" required />
              <input class="edit-min" type="number" min="1" value="${r.min_pod_size}" />
              <input class="edit-max" type="number" min="1" value="${r.max_pod_size}" />
              <button type="submit">Save</button>
              <button type="button" class="cancel-edit">Cancel</button>
            </form>
          </li>
        `;
      }
      return `
        <li class="record-item" data-id="${r.id}">
          <span class="record-label">
            ${r.ritual_type} @ ${venueName} — ${DAY_NAMES[r.day_of_week]}s at ${formatTime(r.start_time)}
            <span class="code-pill">${r.check_in_code}</span>
          </span>
          <span class="record-actions">
            <button type="button" class="edit-ritual-btn" data-id="${r.id}">Edit</button>
            <button type="button" class="regen-code-btn" data-id="${r.id}">Regenerate code</button>
            <button type="button" class="delete-ritual-btn" data-id="${r.id}">Delete</button>
          </span>
        </li>
      `;
    })
    .join("");

  for (const btn of list.querySelectorAll(".edit-ritual-btn")) {
    btn.addEventListener("click", () => {
      editingRitualId = btn.dataset.id;
      renderRituals();
    });
  }
  for (const btn of list.querySelectorAll(".delete-ritual-btn")) {
    btn.addEventListener("click", () => deleteRitual(btn.dataset.id));
  }
  for (const btn of list.querySelectorAll(".regen-code-btn")) {
    btn.addEventListener("click", () => regenerateCheckInCode(btn.dataset.id));
  }
  for (const form of list.querySelectorAll(".ritual-edit-form")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveRitual(form);
    });
    form.querySelector(".cancel-edit").addEventListener("click", () => {
      editingRitualId = null;
      renderRituals();
    });
  }
}

function renderMatchRitualPicker() {
  const picker = document.getElementById("match-ritual");
  const previous = picker.value;
  picker.innerHTML = rituals
    .map((r) => `<option value="${r.id}">${r.ritual_type} @ ${r.venues?.name ?? "?"}</option>`)
    .join("");
  if (previous && rituals.some((r) => r.id === previous)) {
    picker.value = previous;
  } else if (rituals.length > 0) {
    loadWaitingList(picker.value);
  }
}

document.getElementById("ritual-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("ritual-form-status");

  const venueId = document.getElementById("ritual-venue").value;
  const ritualType = document.getElementById("ritual-type").value.trim();
  const dayOfWeek = Number(document.getElementById("ritual-day").value);
  const startTime = document.getElementById("ritual-time").value;
  const minSize = Number(document.getElementById("ritual-min").value) || 4;
  const maxSize = Number(document.getElementById("ritual-max").value) || 8;

  const priceRaw = document.getElementById("ritual-price").value.trim();
  const priceCents = priceRaw ? Number(priceRaw) : null;

  const { error } = await supabase.from("rituals").insert({
    venue_id: venueId,
    ritual_type: ritualType,
    day_of_week: dayOfWeek,
    start_time: startTime,
    min_pod_size: minSize,
    max_pod_size: maxSize,
    price_cents: priceCents,
  });

  if (error) {
    status.textContent = `Couldn't add ritual: ${error.message}`;
    return;
  }

  status.textContent = "Ritual added.";
  event.target.reset();
  await loadRituals();
  await loadOverview();
});

async function saveRitual(form) {
  const id = form.dataset.id;
  const { error } = await supabase
    .from("rituals")
    .update({
      venue_id: form.querySelector(".edit-venue").value,
      ritual_type: form.querySelector(".edit-type").value.trim(),
      day_of_week: Number(form.querySelector(".edit-day").value),
      start_time: form.querySelector(".edit-time").value,
      min_pod_size: Number(form.querySelector(".edit-min").value) || 1,
      max_pod_size: Number(form.querySelector(".edit-max").value) || 1,
    })
    .eq("id", id);

  if (error) {
    alert(`Couldn't save ritual: ${error.message}`);
    return;
  }

  editingRitualId = null;
  await loadRituals();
  await loadOverview();
}

async function deleteRitual(id) {
  if (!confirm("Delete this ritual? Its signups and pods will be deleted too.")) return;
  const { error } = await supabase.from("rituals").delete().eq("id", id);
  if (error) {
    alert(`Couldn't delete ritual: ${error.message}`);
    return;
  }
  await loadRituals();
  await loadOverview();
}

async function regenerateCheckInCode(id) {
  const { error } = await supabase
    .from("rituals")
    .update({ check_in_code: randomCheckInCode() })
    .eq("id", id);

  if (error) {
    alert(`Couldn't regenerate code: ${error.message}`);
    return;
  }
  await loadRituals();
}

// ---------------------------------------------------------------
// Manual match
// ---------------------------------------------------------------

document.getElementById("match-ritual").addEventListener("change", (event) => {
  loadWaitingList(event.target.value);
});

async function loadWaitingList(ritualId) {
  selectedSignupIds = new Set();
  const list = document.getElementById("waiting-list");
  const empty = document.getElementById("waiting-empty");
  document.getElementById("form-pod-btn").disabled = true;

  if (!ritualId) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }

  const { data, error } = await supabase.rpc("admin_waiting_signups", { p_ritual_id: ritualId });
  if (error) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load waiting list: ${error.message}`;
    return;
  }

  const signups = data ?? [];
  empty.hidden = signups.length > 0;
  empty.textContent = "No one waiting for this ritual.";
  list.innerHTML = signups
    .map(
      (s) => `
        <li class="record-item">
          <label class="record-label">
            <input type="checkbox" class="signup-checkbox" value="${s.signup_id}" />
            ${s.full_name ?? "(no name)"}
          </label>
        </li>
      `,
    )
    .join("");

  for (const cb of list.querySelectorAll(".signup-checkbox")) {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSignupIds.add(cb.value);
      else selectedSignupIds.delete(cb.value);
      document.getElementById("form-pod-btn").disabled = selectedSignupIds.size === 0;
    });
  }
}

document.getElementById("form-pod-btn").addEventListener("click", async () => {
  const status = document.getElementById("match-status");
  const ritualId = document.getElementById("match-ritual").value;
  const signupIds = [...selectedSignupIds];

  if (!ritualId || signupIds.length === 0) return;

  status.textContent = "Forming pod…";
  const { data, error } = await supabase.functions.invoke("adminFormPod", {
    body: { ritual_id: ritualId, signup_ids: signupIds },
  });

  if (error) {
    status.textContent = `Couldn't form pod: ${error.message}`;
    return;
  }

  status.textContent = `Pod formed with ${data.membersSeated} member(s).`;
  await loadWaitingList(ritualId);
  await loadOverview();
});

// ---------------------------------------------------------------
// Billing
// ---------------------------------------------------------------

function formatPrice(cents) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

async function loadBilling() {
  const { data, error } = await supabase.rpc("admin_billing_overview");
  const tbody = document.getElementById("billing-body");
  const empty = document.getElementById("billing-empty");

  if (error) {
    tbody.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load billing: ${error.message}`;
    return;
  }

  const rows = data ?? [];
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr>
          <td>${r.ritual_type}</td>
          <td>${r.venue_name}</td>
          <td>${formatPrice(r.price_cents)}/mo</td>
          <td>${r.active_subscribers}</td>
          <td>${formatPrice(r.mrr_cents)}</td>
        </tr>
      `,
    )
    .join("");
}

// ---------------------------------------------------------------
// Growth
// ---------------------------------------------------------------

async function loadGrowth() {
  const { data, error } = await supabase.rpc("admin_top_referrers");
  const tbody = document.getElementById("growth-body");
  const empty = document.getElementById("growth-empty");

  if (error) {
    tbody.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load growth data: ${error.message}`;
    return;
  }

  const rows = data ?? [];
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows
    .map(
      (r) => `
        <tr>
          <td>${r.full_name ?? "(no name)"}</td>
          <td>${r.referral_count}</td>
          <td>${r.rewarded_count}</td>
        </tr>
      `,
    )
    .join("");
}
