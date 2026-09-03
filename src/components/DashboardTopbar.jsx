/*
DashboardTopbar.jsx
-------------------------------------------------------------------------------
Top navigation/action bar for the staff dashboard.

This component keeps the dashboard header UI out of Dashboard.jsx.

This file handles:
- Showing the current dashboard view title
- Holding hidden file inputs for Excel imports
- Opening the import dropdown menu
- Triggering Master 2025 / 2026 / 2027 imports
- Triggering staff contact imports
- Triggering archive imports
- Triggering Import Everything
- Triggering Excel export
- Refreshing booking data
- Deleting all imported/submitted booking data

Important:
This component does not own the import/export logic itself.
Dashboard.jsx still owns the state, refs, and handler functions, then passes them
into this component as props.
-------------------------------------------------------------------------------
*/

import {
  FaSyncAlt,
  FaFileImport,
  FaFileExport,
  FaTrashAlt,
  FaChevronDown,
  FaRegCalendarCheck,
  FaUsers,
} from "react-icons/fa";

export default function DashboardTopbar({
  activeView,

  masterFileInputRef,
  master2026FileInputRef,
  master2027FileInputRef,

  staffContactsFileInputRef,
  archiveFileInputRef,
  importEverythingFileInputRef,

  importDropdownRef,
  isImportMenuOpen,
  setIsImportMenuOpen,

  handleImportMasterSpreadsheet,
  handleImportMaster2026Spreadsheet,
  handleImportMaster2027Spreadsheet,

  handleImportStaffContactsSpreadsheet,
  handleImportArchiveSpreadsheet,
  handleImportEverythingSpreadsheet,

  openMasterImportPicker,
  openMaster2026ImportPicker,
  openMaster2027ImportPicker,

  openStaffContactsImportPicker,
  openArchiveImportPicker,
  openEverythingImportPicker,

  exportInquiriesToSpreadsheet,
  refreshInquiries,
  deleteAllInquiries,
}) {
  return (
    <header className="dashboard-topbar">
      {/* Page title area */}
      <div>
        <p className="dashboard-eyebrow">Internal Booking Software</p>
        <h1>{activeView}</h1>
      </div>

      {/* Main dashboard action buttons */}
      <div className="dashboard-actions">

        {/* Hidden file input for importing any workbook */}
        <input
          className="dashboard-file-input"
          ref={importEverythingFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportEverythingSpreadsheet}
        />

        {/* Hidden file input for staff contacts */}
        <input
          className="dashboard-file-input"
          ref={staffContactsFileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleImportStaffContactsSpreadsheet}
        />

        {/* Hidden file input for 2025 Master */}
        <input
          className="dashboard-file-input"
          ref={masterFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportMasterSpreadsheet}
        />

        {/* Hidden file input for 2026 Master */}
        <input
          className="dashboard-file-input"
          ref={master2026FileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportMaster2026Spreadsheet}
        />

        {/* Hidden file input for 2027 Master */}
        <input
          className="dashboard-file-input"
          ref={master2027FileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportMaster2027Spreadsheet}
        />

        {/* Hidden archive input */}
        <input
          className="dashboard-file-input"
          ref={archiveFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportArchiveSpreadsheet}
        />

        {/* Import dropdown */}
        <div className="import-dropdown" ref={importDropdownRef}>
          <button
            className={`secondary-dashboard-button import-dropdown-button ${
              isImportMenuOpen ? "is-open" : ""
            }`}
            type="button"
            onClick={() =>
              setIsImportMenuOpen((currentValue) => !currentValue)
            }
            aria-haspopup="menu"
            aria-expanded={isImportMenuOpen}
          >
            <FaFileImport />
            Import
            <FaChevronDown className="import-dropdown-caret" />
          </button>

          {isImportMenuOpen && (
            <div className="import-dropdown-menu" role="menu">

              {/* Master 2025 */}
              <button
                type="button"
                role="menuitem"
                onClick={openMasterImportPicker}
              >
                <FaRegCalendarCheck />

                <span>
                  <strong>Import Master 2025</strong>
                  <small>Upload 2025 master booking spreadsheet</small>
                </span>
              </button>

              {/* Master 2026 */}
              <button
                type="button"
                role="menuitem"
                onClick={openMaster2026ImportPicker}
              >
                <FaRegCalendarCheck />

                <span>
                  <strong>Import Master 2026</strong>
                  <small>Upload 2026 master booking spreadsheet</small>
                </span>
              </button>

              {/* Master 2027 */}
              <button
                type="button"
                role="menuitem"
                onClick={openMaster2027ImportPicker}
              >
                <FaRegCalendarCheck />

                <span>
                  <strong>Import Master 2027</strong>
                  <small>Upload 2027 master booking spreadsheet</small>
                </span>
              </button>

              {/* Archive importer currently hidden from the menu */}
              {/*
              <button
                type="button"
                role="menuitem"
                onClick={openArchiveImportPicker}
              >
                <FaArchive />

                <span>
                  <strong>Import Archives</strong>
                  <small>Upload historical archive spreadsheet</small>
                </span>
              </button>
              */}

              {/* Staff Contacts */}
              <button
                type="button"
                role="menuitem"
                onClick={openStaffContactsImportPicker}
              >
                <FaUsers />

                <span>
                  <strong>Import Staff Contacts</strong>
                  <small>Use the Staff_Contacts sheet</small>
                </span>
              </button>

              {/* Import Everything */}
              <button
                type="button"
                role="menuitem"
                onClick={openEverythingImportPicker}
              >
                <FaFileImport />

                <span>
                  <strong>Import Everything</strong>
                  <small>Import all Master and Inquiry sheets in workbook</small>
                </span>
              </button>

            </div>
          )}
        </div>

        {/* Export */}
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={exportInquiriesToSpreadsheet}
        >
          <FaFileExport />
          Export Excel
        </button>

        {/* Refresh */}
        <button
          className="primary-dashboard-button"
          type="button"
          onClick={refreshInquiries}
        >
          <FaSyncAlt />
          Refresh
        </button>

        {/* Delete */}
        <button
          className="danger-dashboard-button"
          type="button"
          onClick={deleteAllInquiries}
        >
          <FaTrashAlt />
          Delete All
        </button>
      </div>
    </header>
  );
}