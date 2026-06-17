import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSubmitting(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage("Login failed. Check your email and password.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  };

  return (
    <main className="staff-login-page">
      <form className="staff-login-card" onSubmit={handleSubmit}>
        <div>
          <p className="dashboard-eyebrow">Staff Login</p>
          <h1>Toah Nipi Dashboard</h1>
          <p>Sign in with your staff account to access booking data.</p>
        </div>

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {errorMessage && <p className="staff-login-error">{errorMessage}</p>}

        <button className="primary-dashboard-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}