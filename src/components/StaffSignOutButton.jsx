import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function StaffSignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      console.error("Could not sign out:", error);
      alert("Could not sign out. Check the console.");
      setIsSigningOut(false);
    }
  };

  return (
    <button
      className="secondary-dashboard-button"
      type="button"
      disabled={isSigningOut}
      onClick={handleSignOut}
    >
      {isSigningOut ? "Signing out..." : "Sign Out"}
    </button>
  );
}