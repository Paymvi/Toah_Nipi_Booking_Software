import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import StaffLogin from "../pages/StaffLogin";

export default function StaffAuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Could not load Supabase session:", error);
        setSession(null);
      } else {
        setSession(data.session);
      }

      setIsAuthLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isAuthLoading) {
    return (
      <main className="staff-login-page">
        <section className="staff-login-card">
          <p className="dashboard-eyebrow">Loading</p>
          <h1>Checking staff session...</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return <StaffLogin />;
  }

  return children;
}