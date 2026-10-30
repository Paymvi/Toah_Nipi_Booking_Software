/*
  Inquiry rows hidden ("deleted") from the Inquiry Spreadsheet, shared by
  all staff: table inquiry_hidden. Same pattern as contact_hidden in
  contactPreferences.js. Hiding a row never deletes the inquiry record.

  Until the table exists (see the migration) this browser's own list is
  used. The client is a parameter so the logic can be tested.
*/

const INQUIRY_HIDDEN_STORAGE_KEY = "toahNipiInquirySpreadsheetDeletedRows";
export const INQUIRY_HIDDEN_UPLOADED_KEY = "toahNipiInquirySpreadsheetDeletedUploaded";

function isMissingTable(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

export function getSavedHiddenInquiries() {
  try {
    const savedValue = localStorage.getItem(INQUIRY_HIDDEN_STORAGE_KEY);
    const parsedValue = savedValue ? JSON.parse(savedValue) : [];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error("Could not read deleted inquiry rows:", error);
    return [];
  }
}

export function saveHiddenInquiries(hiddenInquiries) {
  try {
    localStorage.setItem(INQUIRY_HIDDEN_STORAGE_KEY, JSON.stringify(hiddenInquiries));
  } catch (error) {
    console.error("Could not save deleted inquiry rows:", error);
  }
}

export async function loadHiddenInquiries(client) {
  const { data, error } = await client
    .from("inquiry_hidden")
    .select("inquiry_id, snapshot, hidden_at")
    .order("hidden_at", { ascending: false });

  if (error) {
    return {
      available: false,
      reason: isMissingTable(error)
        ? "Deleted inquiry rows are not stored online yet."
        : error.message || "Deleted inquiry rows could not be read.",
    };
  }

  return {
    available: true,
    hidden: (data || []).map((row) => ({
      ...(row.snapshot || {}),
      id: row.inquiry_id,
      deletedAt: row.hidden_at,
    })),
  };
}

export async function hideInquiryOnline(client, snapshot) {
  const { error } = await client
    .from("inquiry_hidden")
    .upsert({ inquiry_id: snapshot.id, snapshot }, { onConflict: "inquiry_id" });
  if (error) throw error;
}

export async function unhideInquiryOnline(client, inquiryId) {
  const { error } = await client.from("inquiry_hidden").delete().eq("inquiry_id", inquiryId);
  if (error) throw error;
}

// One-time copy of this browser's list into the table when it first exists.
export async function uploadBrowserHiddenInquiries(client, hidden) {
  if (!hidden.length) return;
  const { error } = await client.from("inquiry_hidden").upsert(
    hidden.map((snapshot) => ({ inquiry_id: snapshot.id, snapshot })),
    { onConflict: "inquiry_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}
