import { useState } from "react";
import ReportsView from "./ReportsView";
import SeasonReportsView from "./SeasonReportsView";

const REPORTS_LAYOUT_STORAGE_KEY = "toahNipiReportsLayout";

function getSavedLayout() {
  try {
    return localStorage.getItem(REPORTS_LAYOUT_STORAGE_KEY) === "original" ? "original" : "season";
  } catch {
    return "season";
  }
}

/*
  Reports has two layouts. "Original" is ReportsView, deliberately left exactly
  as it was, with its own calculations. The choice is a per-browser preference.
*/
function ReportsPage({ inquiryBookings, isLoading, loadError, loadedAt, onRetry, onOpenBooking }) {
  const [layout, setLayout] = useState(getSavedLayout);

  const chooseLayout = (nextLayout) => {
    setLayout(nextLayout);
    try {
      localStorage.setItem(REPORTS_LAYOUT_STORAGE_KEY, nextLayout);
    } catch {
      // The toggle still works for this visit.
    }
  };

  return (
    <div className="season-reports-page">
      {/* data-tutorial-ui: during a tutorial the click guard must let this through. */}
      <div
        className="season-layout-bar"
        role="group"
        aria-label="Reports layout"
        data-tutorial-ui
        data-tutorial-target="reports-layout"
      >
        <span>Layout</span>
        <div className="season-segment">
          <button type="button" aria-pressed={layout === "season"} onClick={() => chooseLayout("season")}>
            New
          </button>
          <button type="button" aria-pressed={layout === "original"} onClick={() => chooseLayout("original")}>
            Original
          </button>
        </div>
      </div>

      {layout === "original" ? (
        <ReportsView inquiryBookings={inquiryBookings} />
      ) : (
        <SeasonReportsView
          inquiryBookings={inquiryBookings}
          isLoading={isLoading}
          loadError={loadError}
          loadedAt={loadedAt}
          onRetry={onRetry}
          onOpenBooking={onOpenBooking}
        />
      )}
    </div>
  );
}

export default ReportsPage;
