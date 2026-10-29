/*
  Contact preferences stored online (AUDIT-049, Q-038 A).

  Hidden ("deleted") contacts are shared by all staff: table contact_hidden.
  Stars belong to the signed-in login: table contact_stars, keyed by
  auth.uid(). Everyone currently shares one login, so stars are in effect
  shared too until separate logins are used.

  Until the tables exist (see the migration) the browser's own lists are
  used, as before. The client is a parameter so the logic can be tested.
*/

function isMissingTable(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

export async function loadContactPreferences(client) {
  const [hidden, stars] = await Promise.all([
    client.from("contact_hidden").select("contact_key, identity_keys, snapshot, hidden_at"),
    client.from("contact_stars").select("contact_key"),
  ]);

  if (hidden.error || stars.error) {
    const error = hidden.error || stars.error;
    return {
      available: false,
      reason: isMissingTable(error)
        ? "Contact preferences are not stored online yet."
        : error.message || "Contact preferences could not be read.",
    };
  }

  return {
    available: true,
    hidden: (hidden.data || []).map((row) => ({
      ...(row.snapshot || {}),
      id: row.contact_key,
      identityKeys: Array.isArray(row.identity_keys) ? row.identity_keys : [row.contact_key],
      deletedAt: row.hidden_at,
    })),
    starredKeys: (stars.data || []).map((row) => row.contact_key),
  };
}

export async function hideContactOnline(client, snapshot) {
  const { error } = await client.from("contact_hidden").upsert(
    {
      contact_key: snapshot.id,
      identity_keys: snapshot.identityKeys || [snapshot.id],
      snapshot,
    },
    { onConflict: "contact_key" }
  );
  if (error) throw error;
}

export async function unhideContactOnline(client, contactKey) {
  const { error } = await client.from("contact_hidden").delete().eq("contact_key", contactKey);
  if (error) throw error;
}

// user_id defaults to auth.uid() in the table, so it is never sent.
export async function setContactStarOnline(client, contactKey, starred) {
  const { error } = starred
    ? await client.from("contact_stars").upsert({ contact_key: contactKey }, { onConflict: "user_id,contact_key" })
    : await client.from("contact_stars").delete().eq("contact_key", contactKey);
  if (error) throw error;
}

/*
  One-time copy of this browser's old lists into the online tables, so
  earlier choices are not lost when the tables are first used.
*/
export async function uploadBrowserContactPreferences(client, { hidden = [], starredKeys = [] }) {
  if (hidden.length) {
    const { error } = await client.from("contact_hidden").upsert(
      hidden.map((snapshot) => ({
        contact_key: snapshot.id,
        identity_keys: snapshot.identityKeys || [snapshot.id],
        snapshot,
      })),
      { onConflict: "contact_key", ignoreDuplicates: true }
    );
    if (error) throw error;
  }
  if (starredKeys.length) {
    const { error } = await client
      .from("contact_stars")
      .upsert(starredKeys.map((key) => ({ contact_key: key })), {
        onConflict: "user_id,contact_key",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
}
