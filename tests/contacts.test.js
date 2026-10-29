import test from "node:test";
import assert from "node:assert/strict";

import { contactMatchesSavedKeys, groupByIdentities } from "../src/utils/contactGrouping.js";

test("grouping is transitive across email and phone", () => {
  const appearances = [
    { id: 1, keys: ["email:a@x.org"] },
    { id: 2, keys: ["phone:5550100"] },
    { id: 3, keys: ["email:a@x.org", "phone:5550100"] },
    { id: 4, keys: ["email:other@x.org"] },
  ];
  const groups = groupByIdentities(appearances, (item) => item.keys);
  assert.deepEqual(groups.map((group) => group.map((item) => item.id)), [[1, 2, 3], [4]]);
});

test("a hidden contact stays hidden when another email is added", () => {
  const hiddenKeys = new Set(["email:a@x.org", "a@x.org"]);
  assert.equal(contactMatchesSavedKeys(["email:b@x.org", "email:a@x.org"], hiddenKeys), true);
  assert.equal(contactMatchesSavedKeys(["email:c@x.org"], hiddenKeys), false);
});
