/*
devModeService.js
-------------------------------------------------------------------------------
Asks the verify-dev-mode Edge Function whether a Dev Mode password is correct.

The real password is stored only as a Supabase function secret. It is never
in the frontend bundle and never comes back in the response.

Returns true / false for a correct / incorrect password.
Throws if the request itself fails (network, server, not signed in).
-------------------------------------------------------------------------------
*/

import { supabase } from "../lib/supabaseClient";

export async function verifyDevModePassword(password) {
  const { data, error } = await supabase.functions.invoke("verify-dev-mode", {
    body: { password },
  });

  if (error) {
    throw error;
  }

  return data?.valid === true;
}
