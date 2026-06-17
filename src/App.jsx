import "./App.css";
import Dashboard from "./pages/Dashboard";
import StaffAuthGate from "./auth/StaffAuthGate";

export default function App() {
  return (
    <StaffAuthGate>
      <Dashboard />
    </StaffAuthGate>
  );
}