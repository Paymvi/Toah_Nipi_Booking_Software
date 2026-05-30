import { useState } from "react";
import "./App.css";
import CreateBooking from "./pages/CreateBooking";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [currentPage, setCurrentPage] = useState("form");

  return <Dashboard />;
}