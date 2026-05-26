import { useState } from "react";
import "./App.css";
import CreateBooking from "./pages/CreateBooking";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [currentPage, setCurrentPage] = useState("form");

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 9999,
          display: "flex",
          gap: "10px",
        }}
      >
        <button onClick={() => setCurrentPage("form")}>Form</button>
        <button onClick={() => setCurrentPage("dashboard")}>Dashboard</button>
      </div>

      {currentPage === "form" ? <CreateBooking /> : <Dashboard />}
    </>
  );
}