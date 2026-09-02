/*
DashboardTopbar.jsx
-------------------------------------------------------------------------------
Top navigation/action bar for the staff dashboard.

This component keeps the dashboard header UI out of Dashboard.jsx.

This file handles:
- Showing the current dashboard view title
- Holding hidden file inputs for Excel imports
- Opening the import dropdown menu
- Triggering waitlist/master/import-everything spreadsheet imports
- Triggering Excel export
- Refreshing inquiries from localStorage
- Deleting all imported/submitted inquiries

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
  FaClipboardList,
  FaTable,
  FaRegCalendarCheck,
  FaUsers,
  FaArchive,
} from "react-icons/fa";

export default function DashboardTopbar({
  activeView,
  waitlistFileInputRef,
  masterFileInputRef,
  master2026FileInputRef,
  staffContactsFileInputRef,
  archiveFileInputRef,
  importEverythingFileInputRef,
  importDropdownRef,
  isImportMenuOpen,
  setIsImportMenuOpen,
  handleImportWaitlistSpreadsheet,
  handleImportMasterSpreadsheet,
  handleImportMaster2026Spreadsheet,
  handleImportStaffContactsSpreadsheet,
  handleImportEverythingSpreadsheet,
  openWaitlistImportPicker,
  openMasterImportPicker,
  openMaster2026ImportPicker,
  openStaffContactsImportPicker,
  openEverythingImportPicker,
  exportInquiriesToSpreadsheet,
  refreshInquiries,
  deleteAllInquiries,
  inquiry2027FileInputRef,
  handleImport2027InquirySpreadsheet,
  open2027InquiryImportPicker,
  handleImportArchiveSpreadsheet,
  openArchiveImportPicker,
  master2027FileInputRef,
  handleImportMaster2027Spreadsheet,
  openMaster2027ImportPicker,
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
        {/* Hidden file input for waitlist spreadsheet imports */}
        <input
          className="dashboard-file-input"
          ref={waitlistFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportWaitlistSpreadsheet}
        />

        {/* Hidden file input for importing any workbook/sheet structure */}
        <input
          className="dashboard-file-input"
          ref={importEverythingFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportEverythingSpreadsheet}
        />

        {/* Hidden file input for staff contact imports */}
          <input
            className="dashboard-file-input"
            ref={staffContactsFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportStaffContactsSpreadsheet}
          />

        {/* Hidden file input for 2025 master spreadsheet imports */}
        <input
          className="dashboard-file-input"
          ref={masterFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportMasterSpreadsheet}
        />

        {/* Hidden file input for 2026 master spreadsheet imports */}
        <input
          className="dashboard-file-input"
          ref={master2026FileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportMaster2026Spreadsheet}
        />

        <input
          ref={master2027FileInputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={handleImportMaster2027Spreadsheet}
        />

        <input
          ref={inquiry2027FileInputRef}
          className="dashboard-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleImport2027InquirySpreadsheet}
        />

        <input
          className="dashboard-file-input"
          ref={archiveFileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleImportArchiveSpreadsheet}
        />

        {/* Import dropdown menu */}
        <div className="import-dropdown" ref={importDropdownRef}>
          <button
            className={`secondary-dashboard-button import-dropdown-button ${
              isImportMenuOpen ? "is-open" : ""
            }`}
            type="button"
            onClick={() => setIsImportMenuOpen((currentValue) => !currentValue)}
            aria-haspopup="menu"
            aria-expanded={isImportMenuOpen}
          >
            <FaFileImport />
            Import
            <FaChevronDown className="import-dropdown-caret" />
          </button>

          {isImportMenuOpen && (
            <div className="import-dropdown-menu" role="menu">
              {/* Opens the hidden waitlist file input */}
              <button
                type="button"
                role="menuitem"
                onClick={openWaitlistImportPicker}
              >
                <FaClipboardList />
                <span>
                  <strong>Import Waitlist</strong>
                  <small>Upload waitlist spreadsheet</small>
                </span>
              </button>

              {/* Opens the hidden 2025 master file input */}
              <button
                type="button"
                role="menuitem"
                onClick={openMasterImportPicker}
              >
                <FaRegCalendarCheck />
                <span>
                  <strong>Import Master 2025</strong>
                  <small>Upload master booking spreadsheet</small>
                </span>
              </button>

              {/* Opens the hidden 2026 master file input */}
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

              <button
                type="button"
                role="menuitem"
                onClick={open2027InquiryImportPicker}
              >
                <FaTable />
                <span>
                  <strong>Import 2027 Inquiries</strong>
                  <small>Use the 2027 inquiry spreadsheet format</small>
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={openArchiveImportPicker}
              >
                <FaArchive />
                <span>
                  <strong>Import Archives</strong>
                  <small>Upload historical PDF archive export</small>
                </span>
              </button>

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

              

              {/* Opens the hidden flexible import file input */}
              <button
                type="button"
                role="menuitem"
                onClick={openEverythingImportPicker}
              >
                <FaFileImport />
                <span>
                  <strong>Import Everything</strong>
                  <small>Auto-detect every sheet in workbook</small>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Export current inquiries/bookings to Excel */}
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={exportInquiriesToSpreadsheet}
        >
          <FaFileExport />
          Export Excel
        </button>

        {/* Reload inquiries from localStorage */}
        <button
          className="primary-dashboard-button"
          type="button"
          onClick={refreshInquiries}
        >
          <FaSyncAlt />
          Refresh Inquiries
        </button>

        {/* Delete all locally saved inquiries/imported bookings */}
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