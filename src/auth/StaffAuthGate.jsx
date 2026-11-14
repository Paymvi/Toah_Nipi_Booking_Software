import { Fragment, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import StaffLogin from "../pages/StaffLogin";
import { fetchStaffAppMe } from "../services/staffAppService";
import { StaffAccessContext } from "./staffAccess";

export default function StaffAuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // { userId, me } for the signed-in account; me.access is "office", "limited" or null.
  const [access, setAccess] = useState(null);
  const userId = session?.user?.id || "";

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

  useEffect(() => {
    if (!userId) return undefined;
    let isCurrent = true;
    fetchStaffAppMe()
      .then((me) => isCurrent && setAccess({ userId, me: me || { access: null } }))
      .catch((error) => {
        if (!isCurrent) return;
        // Before the staff app migration runs there is no limited role, so the office app is unchanged.
        console.warn("Staff app access check:", error.message);
        setAccess({ userId, me: { access: error.kind === "setup" ? "office" : "unknown", error: error.message } });
      });
    return () => {
      isCurrent = false;
    };
  }, [userId]);

  const isAccessLoading = Boolean(userId) && access?.userId !== userId;

  if (isAuthLoading || isAccessLoading) {
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

  // Keyed by account: switching accounts remounts everything, so no screen keeps the previous account's data.
  return (
    <StaffAccessContext.Provider value={access.me}>
      <Fragment key={userId}>{children}</Fragment>
    </StaffAccessContext.Provider>
  );
}
