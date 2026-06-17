import "./App.css";
import "./styles/shared.css";
import "./styles/Dashboard.css";
import "./styles/CalendarView.css";
import Dashboard from "./pages/Dashboard";
import StaffAuthGate from "./auth/StaffAuthGate";

export default function App() {
  return (
    <StaffAuthGate>
      <Dashboard />
    </StaffAuthGate>
  );
}