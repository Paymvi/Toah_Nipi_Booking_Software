// Every stylesheet, in cascade order: see src/styles/index.css and docs/CSS_GUIDE.md.
import "./styles/index.css";

import { Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import StaffAuthGate from "./auth/StaffAuthGate";
import { useStaffAccess } from "./auth/staffAccess";

// Each part downloads when first opened: the staff app on a phone never loads the office app.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StaffApp = lazy(() => import("./pages/StaffApp"));
const TutorialGnome = lazy(() => import("./tutorial/TutorialGnome"));

function PageLoading() {
  return (
    <main className="staff-login-page" aria-busy="true">
      <section className="staff-login-card">
        <p className="dashboard-eyebrow">Loading</p>
        <h1>Opening the page...</h1>
      </section>
    </main>
  );
}

// A part that cannot download (offline, or a tab left open across a new release) asks for a reload instead of a blank page.
class PageLoadError extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Could not open this page:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="staff-login-page" role="alert">
        <section className="staff-login-card">
          <p className="dashboard-eyebrow">Could not open this page</p>
          <h1>Check the internet connection, then reload.</h1>
          <button className="primary-dashboard-button" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      </main>
    );
  }
}


export default function App() {
  return (
    <BrowserRouter>

      <StaffAuthGate>
        <PageLoadError>
          <Suspense fallback={<PageLoading />}>
            <AppRoutes />
          </Suspense>
        </PageLoadError>
      </StaffAuthGate>

    </BrowserRouter>
  );
}

function AppRoutes() {
  const { access } = useStaffAccess();
  const isStaffApp = useLocation().pathname.startsWith("/staff");

  // Limited accounts only ever get the staff app (the database would refuse office data anyway).
  if (access === "limited" || access === null) {
    return (
      <Routes>
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="*" element={<Navigate to="/staff" replace />} />
      </Routes>
    );
  }

  return (
    <>
        <Routes>

          <Route path="/staff/*" element={<StaffApp />} />

          <Route 
            path="/" 
            element={<Navigate to="/dashboard" replace />} 
          />

          <Route 
            path="/dashboard" 
            element={<Dashboard />} 
          />

          <Route 
            path="/form" 
            element={<Dashboard />} 
          />

          <Route 
            path="/portal-admin" 
            element={<Dashboard />} 
          />



          <Route 
            path="/calendar" 
            element={<Dashboard />} 
          />

          <Route 
            path="/lodging-calendar" 
            element={<Dashboard />} 
          />

          <Route 
            path="/master-spreadsheet" 
            element={<Dashboard />} 
          />

          <Route 
            path="/inquiry-spreadsheet" 
            element={<Dashboard />} 
          />

          <Route 
            path="/contacts" 
            element={<Dashboard />} 
          />

          <Route 
            path="/inquiry-pipeline" 
            element={<Dashboard />} 
          />



          <Route 
            path="/reports" 
            element={<Dashboard />} 
          />

          <Route 
            path="/user-admin" 
            element={<Dashboard />} 
          />

          <Route 
            path="/jobs" 
            element={<Dashboard />} 
          />



          <Route
            path="/guest-inquiries"
            element={<Dashboard />}
          />

          <Route path="/hosting" element={<Dashboard />} />



          <Route 
            path="*" 
            element={<Navigate to="/dashboard" replace />} 
          />

          <Route path="/backup" element={<Dashboard />} />

        </Routes>

        {/* Office help; outside Routes so it stays put across views. Not over the staff app's bottom bar. */}
        {!isStaffApp && (
          <Suspense fallback={null}>
            <TutorialGnome />
          </Suspense>
        )}
    </>
  );
}