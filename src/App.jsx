import "./App.css";
import "./styles/shared.css";
import "./styles/Dashboard.css";
import "./styles/CalendarView.css";
import "./styles/InquiryPipeline.css";
import "./styles/SpreadsheetView.css";
import "./styles/ContactsView.css";
import "./styles/BookingDetail.css";
import "./styles/ReportsView.css";
import "./styles/AdminJobsView.css";
import "./styles/BackupView.css";
import "./styles/Auth.css";
import "./styles/PortalAdminView.css";
import Dashboard from "./pages/Dashboard";
import StaffAuthGate from "./auth/StaffAuthGate";

export default function App() {
  return (
    <StaffAuthGate>
      <Dashboard />
    </StaffAuthGate>
  );
}