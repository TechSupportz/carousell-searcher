#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://www.carousell.sg";
const DEFAULT_STATE_FILE = ".carousell-scout-state.json";

const SEARCH_TERMS = [
  "ipad pro 11 m1",
  "ipad pro 11 m2",
  "ipad pro 11 m4",
  "ipad pro 11 3rd gen",
  "ipad pro 11 4th gen",
  "ipad pro 11 5th gen",
  "ipad pro 2021 11",
  "ipad pro 2022 11",
  "ipad pro 2024 11"
];

const SEARCH_URLS = [
  ...SEARCH_TERMS.map((term) => `${BASE_URL}/${term.replaceAll(" ", "-")}/q/?tab=marketplace&sort_by=3&price_start=300`),
  ...SEARCH_TERMS.map((term) => `${BASE_URL}/search/?query=${encodeURIComponent(term)}&tab=marketplace&sort_by=3&price_start=300`)
];

const CONDITIONS = [
  "Brand new",
  "Like new",
  "Lightly used",
  "Well used",
  "Heavily used"
];

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");
const dryRun = args.has("--dry-run");
const noState = args.has("--no-state");
const maxListings = Number(process.env.CAROUSELL_MAX_LISTINGS || "80");
const stateFile = path.resolve(process.cwd(), process.env.CAROUSELL_STATE_FILE || DEFAULT_STATE_FILE);

function usage() {
  return [
    "Usage: pnpm scout -- [--json] [--dry-run] [--no-state]",
    "",
    "Environment:",
    "  CAROUSELL_HEADLESS=false            show browser for Cloudflare login/challenge",
    "  CAROUSELL_USER_DATA_DIR=...         reuse a browser profile with cookies",
    "  CAROUSELL_STATE_FILE=...            override dedupe state path",
    "  CAROUSELL_MAX_LISTINGS=80           cap listings before filtering"
  ].join("\n");
}

if (args.has("--help") || args.has("-h")) {
  console.log(usage());
  process.exit(0);
}

export function parsePrice(value) {
  if (value == null) return null;
  const match = String(value).match(/(?:S\$|SGD|\$)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function clean(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url.split("?")[0];
  return `${BASE_URL}${url}`.split("?")[0];
}

function idFromUrl(url) {
  const match = normalizeUrl(url).match(/-(\d+)\/?$/);
  return match ? match[1] : normalizeUrl(url);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function inferGeneration(text) {
  const lower = text.toLowerCase();
  if (/\b(3rd|third|3)\s*(gen|generation)\b/.test(lower) || /\b2021\b/.test(lower) || /\bm1\b/.test(lower)) {
    return "3rd gen (2021)";
  }
  if (/\b(4th|fourth|4)\s*(gen|generation)\b/.test(lower) || /\b2022\b/.test(lower) || /\bm2\b/.test(lower)) {
    return "4th gen (2022)";
  }
  if (/\b(5th|fifth|5)\s*(gen|generation)\b/.test(lower) || /\b2024\b/.test(lower) || /\bm4\b/.test(lower)) {
    return "5th gen (2024)";
  }
  return "not stated";
}

function inferChip(text, generation) {
  const explicit = firstMatch(text, [/\b(M[124])\b/i]);
  if (explicit) return explicit[1].toUpperCase();
  if (generation === "3rd gen (2021)") return "not stated, inferred as M1";
  if (generation === "4th gen (2022)") return "not stated, inferred as M2";
  if (generation === "5th gen (2024)") return "not stated, inferred as M4";
  return "not stated";
}

function extractStorage(text) {
  const match = firstMatch(text, [
    /\b(128|256|512)\s*GB\b/i,
    /\b(1|2)\s*TB\b/i
  ]);
  return match ? match[0].replace(/\s+/g, "").toUpperCase() : "not stated";
}

function extractColour(text) {
  const colourPatterns = [
    ["Silver", /\bsilver\b/i],
    ["Space Grey", /\bspace\s+gr[ae]y\b/i],
    ["Grey", /\bgr[ae]y\b/i],
    ["Black", /\bblack\b/i],
    ["Purple", /\bpurple\b/i]
  ];
  for (const [label, pattern] of colourPatterns) {
    if (pattern.test(text)) return label === "Silver" ? "Silver ⭐" : label;
  }
  return "not stated";
}

function extractBattery(text) {
  const match = firstMatch(text, [
    /\bbattery(?:\s+(?:health|life))?\D{0,18}(\d{2,3})\s*%/i,
    /\b(\d{2,3})\s*%\s*(?:battery|bh)\b/i
  ]);
  return match ? `${match[1]}%` : "not stated";
}

function extractPencil(text) {
  if (/\bno\s+(?:apple\s+)?pencil\b/i.test(text)) return "No";
  if (/\b(?:apple\s+)?pencil\s*(?:2|2nd|second|gen\s*2|pro)?\b/i.test(text)) {
    const gen = firstMatch(text, [
      /\bpencil\s*(?:2|2nd|second|gen\s*2)\b/i,
      /\bpencil\s*pro\b/i,
      /\bpencil\s*(?:1|1st|first|gen\s*1)\b/i
    ]);
    if (!gen) return "Yes";
    if (/pro/i.test(gen[0])) return "Yes (Pro)";
    if (/1|first/i.test(gen[0])) return "Yes (gen 1)";
    return "Yes (gen 2)";
  }
  return "not stated";
}

function extractCaveats(text) {
  const caveats = [];
  const checks = [
    ["sold", /\bsold\b/i],
    ["crack/damage", /\b(crack|broken|damage|dent|dented|scuff|scratch|scratches|faulty|repair|repaired)\b/i],
    ["no box", /\bno\s+box\b/i],
    ["no charger", /\bno\s+charger\b|\bwithout\s+charger\b/i],
    ["iPad only", /\bipad\s+only\b/i],
    ["not for fussy buyers", /\bnot\s+for\s+fussy\b/i],
    ["lowballers ignored", /\blow\s*ball/i]
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) caveats.push(label);
  }
  return caveats.length ? caveats.join("; ") : "None";
}

function extractCondition(text, explicitCondition) {
  if (explicitCondition) return clean(explicitCondition);
  const found = CONDITIONS.find((condition) => new RegExp(`\\b${condition}\\b`, "i").test(text));
  return found || "not stated";
}

function titleFromLines(lines, price) {
  const priceIndex = lines.findIndex((line) => parsePrice(line) === price);
  if (priceIndex > 0) return lines[priceIndex - 1];
  return lines.find((line) => /ipad/i.test(line) && !/^description$/i.test(line)) || "not stated";
}

export function normalizeListing(raw) {
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map(clean).filter(Boolean)
    : clean(raw.rawText).split(/\n+/).map(clean).filter(Boolean);
  const rawText = clean([raw.title, raw.description, raw.rawText, ...lines].filter(Boolean).join("\n"));
  const price = parsePrice(raw.price) ?? lines.map(parsePrice).find((value) => value != null) ?? parsePrice(rawText);
  const title = clean(raw.title) || titleFromLines(lines, price);
  const url = normalizeUrl(raw.url || raw.href);
  const condition = extractCondition(rawText, raw.condition);
  const generation = inferGeneration(`${title}\n${rawText}`);
  const chip = inferChip(`${title}\n${rawText}`, generation);
  const id = clean(raw.id) || idFromUrl(url);

  return {
    id,
    title,
    url,
    price,
    generation,
    chip,
    storage: extractStorage(`${title}\n${rawText}`),
    colour: extractColour(`${title}\n${rawText}`),
    condition,
    battery: extractBattery(rawText),
    pencil: extractPencil(rawText),
    caveats: extractCaveats(rawText),
    description: clean(raw.description || rawText),
    posted: clean(raw.posted || raw.time),
    seller: clean(raw.seller || raw.user),
    source: raw.source || "browser"
  };
}

export function isQualifyingListing(listing) {
  const text = `${listing.title}\n${listing.description}`.toLowerCase();
  if (!listing.url || !listing.title || !listing.price) return false;
  if (listing.price < 300) return false;
  if (/\b(sold|reserved)\b/.test(text)) return false;
  if (/\bm5\b|\b2025\b/.test(text)) return false;
  if (/\bipad\s+air\b|\bmacbook\b|\biphone\b|\bmini\b/.test(text)) return false;
  if (/\b(keyboard|case|cover|protector|screen\s+repair|lcd\s+repair|stylus|cable|charger)\b/.test(text) && !/\b(128|256|512)\s*gb\b|\b(1|2)\s*tb\b/.test(text)) return false;
  if (!/\bipad\s+pro\b/.test(text)) return false;
  if (/\b(12\.9|13)(?:\s|-)?(?:inch|in\b|["”])/.test(text) && !/\b11(?:\s|-)?(?:inch|in\b|["”])/.test(text)) return false;
  const mentionsEleven = /\b11(?:\s|-)?(?:inch|in\b|["”])|\bipad\s+pro\s+11\b/.test(text);
  const targetGeneration = listing.generation !== "not stated" || /\b(m1|m2|m4|2021|2022|2024)\b/.test(text);
  if (!mentionsEleven || !targetGeneration) return false;
  if (listing.price <= 1000) return true;

  const compelling =
    listing.price <= 1150 &&
    (/512gb|1tb|2tb/i.test(listing.storage) || /^Yes/.test(listing.pencil)) &&
    /like new|brand new|mint|excellent/i.test(`${listing.condition}\n${listing.description}`);
  return compelling;
}

function signature(listing) {
  return JSON.stringify({
    price: listing.price,
    title: listing.title,
    condition: listing.condition,
    battery: listing.battery,
    pencil: listing.pencil,
    caveats: listing.caveats
  });
}

function loadState() {
  if (noState || !fs.existsSync(stateFile)) return { listings: {} };
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function saveState(state) {
  if (noState || dryRun) return;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function dedupe(listings, state) {
  const reportable = [];
  for (const listing of listings) {
    const prior = state.listings[listing.id];
    const currentSignature = signature(listing);
    if (!prior) {
      reportable.push({ ...listing, updated: false, updateNote: "" });
    } else if (prior.signature !== currentSignature) {
      const notes = [];
      if (listing.price < prior.price) notes.push(`price dropped from SGD ${prior.price} to SGD ${listing.price}`);
      if (listing.price > prior.price) notes.push(`price changed from SGD ${prior.price} to SGD ${listing.price}`);
      if (!notes.length) notes.push("listing details changed");
      reportable.push({ ...listing, updated: true, updateNote: notes.join("; ") });
    }
    state.listings[listing.id] = {
      price: listing.price,
      signature: currentSignature,
      title: listing.title,
      url: listing.url,
      seenAt: new Date().toISOString()
    };
  }
  return reportable;
}

function formatListing(listing) {
  const prefix = listing.updated ? `🔁 UPDATED (${listing.updateNote})\n` : "";
  return `${prefix}  Title      : ${listing.title}
  URL        : ${listing.url}
  Price      : SGD ${listing.price}
  Generation : ${listing.generation}
  Chip       : ${listing.chip}
  Storage    : ${listing.storage}
  Colour     : ${listing.colour}
  Condition  : ${listing.condition}
  Battery    : ${listing.battery}
  Pencil     : ${listing.pencil}
  Caveats    : ${listing.caveats}`;
}

async function scrapeWithBrowser() {
  const { chromium } = await import("playwright");
  const headless = process.env.CAROUSELL_HEADLESS !== "false";
  const userDataDir = process.env.CAROUSELL_USER_DATA_DIR;
  let browser;
  const context = userDataDir
    ? await chromium.launchPersistentContext(userDataDir, { headless })
    : await (async () => {
        browser = await chromium.launch({ headless });
        return browser.newContext({
        locale: "en-SG",
        timezoneId: "Asia/Singapore",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      });
      })();
  const page = await context.newPage();
  const listings = [];

  try {
    for (const url of SEARCH_URLS) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      const title = await page.title();
      const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
      if (/just a moment|enable javascript and cookies|checking your browser|security verification|protect against malicious bots|cloudflare/i.test(`${title}\n${bodyText}`)) {
        throw new Error("Carousell presented a Cloudflare challenge. Run once with CAROUSELL_HEADLESS=false and CAROUSELL_USER_DATA_DIR=.carousell-profile, solve it, then rerun.");
      }
      const pageListings = await page.evaluate(() => {
        const listingLinks = [...document.querySelectorAll('a[href*="/p/"], a[href*="/certified-used-phone-l/"]')]
          .filter((link) => link.innerText && /S\$\s*[0-9]/.test(link.innerText));

        return listingLinks.map((link) => {
          const lines = link.innerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
          return {
            id: "",
            url: link.getAttribute("href") || "",
            rawText: link.innerText,
            lines,
            source: "browser"
          };
        });
      });
      listings.push(...pageListings);
      if (listings.length >= maxListings) break;
    }
  } finally {
    await context.close();
    if (browser) await browser.close();
  }

  return listings;
}

async function collectRawListings() {
  return scrapeWithBrowser();
}

function uniqueById(listings) {
  const seen = new Set();
  const unique = [];
  for (const listing of listings) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);
    unique.push(listing);
  }
  return unique;
}

async function main() {
  const raw = await collectRawListings();
  const normalized = uniqueById(raw.map(normalizeListing))
    .filter(isQualifyingListing)
    .sort((a, b) => a.price - b.price);
  const state = loadState();
  const reportable = dedupe(normalized, state);
  saveState(state);

  if (jsonOutput) {
    console.log(JSON.stringify({ listings: reportable, checked: normalized.length }, null, 2));
    return;
  }

  if (!reportable.length) {
    console.log("No new qualifying listings since last run.");
    return;
  }

  console.log(reportable.map(formatListing).join("\n\n"));
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Scout failed: ${error.message}`);
    process.exit(1);
  });
}
