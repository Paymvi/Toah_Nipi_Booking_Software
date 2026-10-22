/*
  All stylesheets are global and bundled in this order. The order is part
  of the styling: later files override earlier ones, so do not reorder these
  imports without checking the rules involved.
*/
import "./styles/CreateBookingForm.css";
import "./styles/SpreadsheetHeaderSort.css";
import "./styles/CreateBookingFromInquiry.css";
import "./styles/BookingOverview.css";
import "./styles/BookingHousingCamping.css";
import "./styles/LodgingAvailability.css";
import "./styles/BookingOverviewSchedule.css";
import "./styles/shared.css";
import "./styles/Dashboard.css";
import "./styles/ReportsCamperDaysExplainer.css";
import "./styles/CalendarView.css";
import "./styles/InquiryPipeline.css";
import "./styles/SpreadsheetView.css";
import "./styles/ContactsView.css";
import "./styles/BookingDetail.css";
import "./styles/BookingActivities.css";
import "./styles/BookingDetailTabs.css";
import "./styles/ReportsView.css";
import "./styles/AdminJobsView.css";
import "./styles/Auth.css";
import "./styles/PortalAdminView.css";
import "./styles/GuestInquiriesView.css";
import "./styles/LodgingCalendar.css";
import "./styles/BookingHousing.css";
import "./styles/HomeDashboard.css";
import "./styles/InquirySpreadsheet.css";
import "./styles/InquiryRecordDetail.css";
import "./styles/StaffBookingDetails.css";
import "./styles/DashboardBackups.css";

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

          <Route path="/backup" element={<Dashboard />} />

        </Routes>

      </StaffAuthGate>

    </BrowserRouter>
  );
}