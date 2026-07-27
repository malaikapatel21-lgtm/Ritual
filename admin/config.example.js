// Copy this file to config.js (gitignored) and fill in your project's
// values. The anon key is safe to ship to the browser — every admin-only
// read or write is enforced server-side, either by is_admin()-gated RLS
// policies (venues, rituals) or by is_admin()-gated RPCs/Edge Functions
// (admin_overview, admin_waiting_signups, adminFormPod).
window.RITUAL_CONFIG = {
  supabaseUrl: "https://your-project-ref.supabase.co",
  supabaseAnonKey: "your-anon-key",
};
