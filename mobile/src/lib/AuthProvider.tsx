import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { registerPushToken } from "@/lib/registerPushToken";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  onboardingComplete: boolean;
  markOnboardingComplete: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        await checkOnboardingComplete(data.session.user.id);
        registerPushToken(data.session.user.id).catch((error) =>
          console.warn("Push token registration failed", error)
        );
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await checkOnboardingComplete(newSession.user.id);
        registerPushToken(newSession.user.id).catch((error) =>
          console.warn("Push token registration failed", error)
        );
      } else {
        setOnboardingComplete(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function checkOnboardingComplete(userId: string) {
    const { data } = await supabase
      .from("ritual_signups")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    setOnboardingComplete((data?.length ?? 0) > 0);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        onboardingComplete,
        markOnboardingComplete: () => setOnboardingComplete(true),
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
