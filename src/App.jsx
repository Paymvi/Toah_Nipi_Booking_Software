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
import "./styles/GuestInquiriesView.css";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import StaffAuthGate from "./auth/StaffAuthGate";


export default function App() {
  return (
    <BrowserRouter>

      <StaffAuthGate>

        <Routes>

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



          <Route 
            path="*" 
            element={<Navigate to="/dashboard" replace />} 
          />

        </Routes>

      </StaffAuthGate>

    </BrowserRouter>
  );
}