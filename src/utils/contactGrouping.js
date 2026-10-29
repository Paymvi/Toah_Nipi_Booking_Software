/*
  Contact grouping (AUDIT-049, AUDIT-039).

  Every appearance of a person (the primary contact on a booking, or a
  secondary contact) carries identity keys: email, phone digits, and name +
  organization. Appearances that share any key are one contact, and the
  grouping is transitive: booking 1 (email A), booking 2 (phone P) and
  booking 3 (email A + phone P) are one person.
*/

export function groupByIdentities(items, getIdentities) {
  const parent = items.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  const firstIndexByIdentity = new Map();
  items.forEach((item, index) => {
    getIdentities(item).forEach((identity) => {
      if (firstIndexByIdentity.has(identity)) {
        union(index, firstIndexByIdentity.get(identity));
      } else {
        firstIndexByIdentity.set(identity, index);
      }
    });
  });

  const groups = new Map();
  items.forEach((item, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });

  return [...groups.values()];
}

/*
  Hidden or starred if any of the contact's keys was saved. Older saved
  entries used one derived id (an email, phone digits or "name-org"); those
  forms are among the keys, so earlier choices still apply.
*/
export function contactMatchesSavedKeys(contactKeys, savedKeys) {
  return contactKeys.some((key) => savedKeys.has(key));
}
