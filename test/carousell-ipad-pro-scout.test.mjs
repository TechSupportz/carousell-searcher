import test from "node:test";
import assert from "node:assert/strict";

import {
  isQualifyingListing,
  normalizeListing,
  parsePrice
} from "../src/carousell-ipad-pro-scout.mjs";

test("parsePrice handles Carousell price strings", () => {
  assert.equal(parsePrice("S$799"), 799);
  assert.equal(parsePrice("S$1,050"), 1050);
  assert.equal(parsePrice("SGD 720"), 720);
});

test("normalizes target iPad Pro fields from card text", () => {
  const listing = normalizeListing({
    id: "listing-1419876201",
    url: "/p/ipad-pro-4-11-wifi-cellular-2022-silver-256gb-1419876201/",
    rawText: [
      "flyingtodamoon",
      "2 days ago",
      "iPad Pro 4 11\" WiFi + Cellular (2022) Silver 256GB",
      "S$799",
      "Lightly used",
      "iPad Pro 11-inch 4th Gen M2. Battery health 92%. iPad only, no charger."
    ].join("\n")
  });

  assert.equal(listing.price, 799);
  assert.equal(listing.generation, "4th gen (2022)");
  assert.equal(listing.chip, "M2");
  assert.equal(listing.storage, "256GB");
  assert.equal(listing.colour, "Silver ⭐");
  assert.equal(listing.battery, "92%");
  assert.equal(listing.pencil, "not stated");
  assert.match(listing.caveats, /no charger/);
});

test("filters out non-target iPads and keeps under-budget M1+ 11-inch Pro", () => {
  const good = normalizeListing({
    url: "/p/ipad-pro-m2-11-128gb-1403753076/",
    rawText: "iPad Pro 11-inch M2 (2022) (4th Gen) 128GB\nS$720\nLightly used"
  });
  const air = normalizeListing({
    url: "/p/ipad-air-m2-11-128gb-1403753077/",
    rawText: "iPad Air M2 11-inch with Apple Pencil Pro\nS$725\nLike new"
  });
  const large = normalizeListing({
    url: "/p/ipad-pro-m2-12-9-128gb-1403753078/",
    rawText: "iPad Pro 12.9-inch M2 (2022) 128GB\nS$900\nLike new"
  });
  const accessory = normalizeListing({
    url: "/p/ipad-pro-11-m4-m5-smartdevil-keyboard-1435347918/",
    rawText: "iPad Pro 11\" (M4 / M5) SmartDevil Keyboard\nS$10\nWell used"
  });

  assert.equal(isQualifyingListing(good), true);
  assert.equal(isQualifyingListing(air), false);
  assert.equal(isQualifyingListing(large), false);
  assert.equal(isQualifyingListing(accessory), false);
});
