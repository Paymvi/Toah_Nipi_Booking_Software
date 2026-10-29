import { supabase } from "../lib/supabaseClient";
import {
  fetchBackupSections as fetchSectionsWithClient,
  restoreBookingRows as restoreBookingRowsWithClient,
  restoreSupportingSections as restoreSupportingSectionsWithClient,
} from "./backupData.js";

// Backup reads and restores against the app's Supabase client.
export function fetchBackupSections({ fetchBookings }) {
  return fetchSectionsWithClient({ client: supabase, fetchBookings });
}

export function restoreBookingRows(bookings, liveIds, options = {}) {
  return restoreBookingRowsWithClient(bookings, liveIds, { ...options, client: supabase });
}

export function restoreSupportingSections(sections) {
  return restoreSupportingSectionsWithClient(sections, { client: supabase });
}
