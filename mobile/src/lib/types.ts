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
