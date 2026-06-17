/*
spreadsheetUtils.js
-------------------------------------------------------------------------------
Shared spreadsheet helper functions for the booking dashboard.

This file keeps low-level Excel/spreadsheet parsing logic out of Dashboard.jsx.

This file handles:
- Reading values from possible spreadsheet column names
- Cleaning ExcelJS cell values
- Checking whether rows contain useful data
- Finding flexible header rows in imported workbooks
- Reading spreadsheet rows from worksheets
- Detecting whether a row looks like Waitlist, Master, Master 2026, or Generic
- Turning unknown spreadsheet rows into readable notes

Important:
This file should stay focused on generic spreadsheet parsing.

The actual "turn this row into a booking object" logic can later move into
inquiryUtils.js.
-------------------------------------------------------------------------------
*/

// Reads the first non-empty value from a row using a list of possible column names.
export function readSpreadsheetCell(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }

  return "";
}

// Cleans values returned by ExcelJS.
// Handles plain values, formulas, rich text, and text objects.
export function cleanExcelCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if (value.text) {
      return value.text;
    }

    if (value.result) {
      return value.result;
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
  }

  return value;
}

// Converts different waitlist-looking values into either "Yes" or "No".
export function normalizeWaitlistValue(value) {
  const text = String(value || "").trim().toLowerCase();

  if (["yes", "y", "true", "waitlist", "waitlisted"].includes(text)) {
    return "Yes";
  }

  return "No";
}

// Checks whether a spreadsheet row has any real data.
// Ignores metadata columns added during import.
export function rowHasAnyData(row) {
  return Object.entries(row).some(([key, value]) => {
    if (key === "sourceSheet" || key === "sourceRowNumber") {
      return false;
    }

    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

// Cleans a possible header name.
// Example: " Guest   Group Name " becomes "Guest Group Name".
export function normalizeHeaderName(value) {
  return String(cleanExcelCellValue(value) || "")
    .replace(/\s+/g, " ")
    .trim();
}

// Finds the most likely header row in a worksheet.
// This helps with spreadsheets where headers are not always on row 1.
export function getWorksheetHeaderInfo(worksheet) {
  const knownHeaderNames = [
    "Date",
    "Contact Name",
    "Email Address",
    "Phone Number",
    "Guest Group Name",
    "Size",
    "Desired Dates",
    "Additional Notes",
    "Waitlist or No",

    "Arrival Date",
    "Departure Date",
    "Guest Group Type",
    "Returning (R) or New (N)",
    "Contact Person",
    "Contact Person Cell #",
    "Actual Number of Guests",
    "Buildings/Rooms",
    "Food Allergies",

    "name",
    "Group Leader/Contact Person",
    "Phone",
    "Estimated Number of Guests",
    "Allergies",
    "Contact Person Email",
    "Stage of Group",
    "Min. Number of Paying Guests",
    "Max. Number of Paying Guests",
    "Guest Rate",
    "Exp. Minimum Revenue for Lodging/Meals",
    "Invoice for Lodging/Meals (does not include linens's fees or other service fees)",
    "Deposit",
    "Deposit Received",
    "Date of Cancellation",
    "Reason for Cancellation",
    "Vacancy filled by another group?",

        "Organization",
    "Organization_Confident",
    "First Name",
    "First_Name_Confident",
    "Last Name",
    "Last_Name_Confident",
    "Address",
    "Address_Confident",
    "City",
    "City_Confident",
    "State",
    "State_Confident",
    "Zip",
    "Zip_Confident",
    "Email",
    "Email_Confident",
    "Phone Number",
    "Phone_Number_Confident",
    "Visit Date",
    "Visit_Date_Confident",
    "Guest Group",
    "Guest_Group_Confident",
    "All Prior Visit Dates",
    "All_Prior_Visit_Dates_Confident",
    "Notes_Confident",
    "Visit Count",
    "Visit_Count_Confident",
    "Source_PDF_Link",
    "Prior_Visit_1_Link",
    "Prior_Visit_2_Link",
    "Prior_Visit_3_Link",
    "Prior_Visit_4_Link",
    "Prior_Visit_5_Link",
    "Prior_Visit_6_Link",
    "Prior_Visit_7_Link",
    "Prior_Visit_8_Link",
    "Prior_Visit_9_Link",
    "Prior_Visit_10_Link",
    "Prior_Visit_11_Link",
  ];

  const knownHeaderSet = new Set(
    knownHeaderNames.map((header) => header.toLowerCase())
  );

  let bestHeaderRowNumber = 1;
  let bestHeaders = {};
  let bestScore = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 12) {
      return;
    }

    const headers = {};
    let score = 0;
    let nonEmptyHeaderCount = 0;

    row.eachCell((cell, columnNumber) => {
      const headerName = normalizeHeaderName(cell.value);

      if (!headerName) {
        return;
      }

      nonEmptyHeaderCount += 1;
      headers[headerName] = columnNumber;

      if (knownHeaderSet.has(headerName.toLowerCase())) {
        score += 3;
      } else {
        score += 1;
      }
    });

    if (nonEmptyHeaderCount >= 2 && score > bestScore) {
      bestScore = score;
      bestHeaderRowNumber = rowNumber;
      bestHeaders = headers;
    }
  });

  if (Object.keys(bestHeaders).length === 0) {
    return null;
  }

  return {
    headerRowNumber: bestHeaderRowNumber,
    headers: bestHeaders,
  };
}

// Reads worksheet rows using the best detected header row.
// Adds sourceSheet and sourceRowNumber so imported data can be traced later.
export function getRowsFromWorksheetFlexible(worksheet) {
  const headerInfo = getWorksheetHeaderInfo(worksheet);

  if (!headerInfo) {
    return [];
  }

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerInfo.headerRowNumber) {
      return;
    }

    const rowObject = {};

    Object.entries(headerInfo.headers).forEach(([headerName, columnNumber]) => {
      rowObject[headerName] = cleanExcelCellValue(
        row.getCell(columnNumber).value
      );
    });

    rowObject.sourceSheet = worksheet.name;
    rowObject.sourceRowNumber = rowNumber;

    if (rowHasAnyData(rowObject)) {
      rows.push(rowObject);
    }
  });

  return rows;
}

// Checks whether a row has data in at least one of the possible column names.
export function rowHasAnyColumn(row, possibleNames) {
  return possibleNames.some((name) => {
    const value = row[name];

    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

// Guesses what kind of imported spreadsheet row this is.
export function detectSpreadsheetRowType(row) {

  const rowColumnNames = new Set(
    Object.keys(row || {}).map((key) => String(key).trim().toLowerCase())
  );

  const looksLikeArchive =
    readSpreadsheetCell(row, ["Source_PDF_Link"]) ||
    readSpreadsheetCell(row, ["All Prior Visit Dates"]) ||
    readSpreadsheetCell(row, ["Visit Count"]) ||
    readSpreadsheetCell(row, ["Organization_Confident"]) ||
    readSpreadsheetCell(row, ["Visit_Date_Confident"]) ||
    (
      readSpreadsheetCell(row, ["Guest Group"]) &&
      readSpreadsheetCell(row, ["Visit Date"])
    );

  if (looksLikeArchive) {
    return "Archive";
  }

  const hasColumn = (columnName) =>
    rowColumnNames.has(String(columnName).trim().toLowerCase());

  const is2027Inquiry =
    hasColumn("Guest Group Name") &&
    hasColumn("Contact Person") &&
    hasColumn("Contact Person Cell #") &&
    hasColumn("Estimated Number of Guests") &&
    (hasColumn("Exp. Minimum Revenue") || hasColumn("Schedule"));

  if (is2027Inquiry) {
    return "2027 Inquiry";
  }
  
  if (
    rowHasAnyColumn(row, ["Waitlist or No", "Desired Dates"]) &&
    rowHasAnyColumn(row, ["Contact Name", "Guest Group Name", "Email Address"])
  ) {
    return "Waitlist";
  }

  if (
    rowHasAnyColumn(row, [
      "Stage of Group",
      "Group Leader/Contact Person",
      "Estimated Number of Guests",
      "Contact Person Email",
      "Exp. Minimum Revenue for Lodging/Meals",
      "Deposit Received",
      "Vacancy filled by another group?",
    ])
  ) {
    return "Master 2026";
  }

  if (
    rowHasAnyColumn(row, [
      "Arrival Date",
      "Departure Date",
      "Contact Person Cell #",
      "Actual Number of Guests",
      "Food Allergies",
    ])
  ) {
    return "Master";
  }

  return "Generic";
}

// Turns all non-empty raw spreadsheet values into a readable notes string.
// Useful for generic imports where the spreadsheet format is unknown.
export function getRawRowNotes(row) {
  return Object.entries(row)
    .filter(([key, value]) => {
      if (key === "sourceSheet" || key === "sourceRowNumber") {
        return false;
      }

      return value !== undefined && value !== null && String(value).trim() !== "";
    })
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join("\n");
}