export type SignupStatus = "waiting" | "matched" | "cancelled";

export interface Venue {
  id: string;
  name: string;
  city: string;
  neighborhood: string | null;
}

export interface Ritual {
  id: string;
  ritual_type: string;
  day_of_week: number;
  start_time: string;
  min_pod_size: number;
  max_pod_size: number;
  venues: Venue;
}

export interface RitualSignup {
  id: string;
  ritual_id: string;
  user_id: string;
  status: SignupStatus;
  created_at: string;
}

export interface PodMemberProfile {
  user_id: string;
  full_name: string | null;
}

export interface RitualInfo {
  id: string;
  ritual_type: string;
  day_of_week: number;
  start_time: string;
  check_in_code: string;
  price_cents: number | null;
  venues: { name: string };
}

export type PaymentStatus = "incomplete" | "active" | "past_due" | "canceled";

export interface Payment {
  ritual_id: string;
  status: PaymentStatus;
  current_period_end: string | null;
}

export interface Message {
  id: string;
  pod_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface Streak {
  current_streak: number;
  longest_streak: number;
  last_session_date: string | null;
}

export const VIBE_TAGS = [
  "early bird",
  "social butterfly",
  "competitive",
  "chill",
  "beginner-friendly",
  "quiet focus",
] as const;

export const MAX_VIBE_TAGS = 2;
