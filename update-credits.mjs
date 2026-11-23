import fs from "node:fs";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("Error: APIFY_TOKEN is not set in environment.");
  process.exit(1);
}

const MUSO_PROFILE_URL =
  process.env.MUSO_PROFILE_URL ||
  "https://muso.ai/profile/afdbde8b-349c-41ec-8825-90032fd91d43";

const actorId = process.env.MUSO_APIFY_ACTOR_ID || "apify~web-scraper";
const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;

const pageFunction = `async function pageFunction(context) {
  const { page, request } = context;
  await page.waitForTimeout(4000);
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const title = await page.title();
  return { url: request.url, title, bodyText };
}`;

const payload = {
  startUrls: [{ url: MUSO_PROFILE_URL }],
  runMode: "PRODUCTION",
  maxPagesPerCrawl: 1,
  maxConcurrency: 1,
  pageFunction,
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const errBody = await response.text();
  console.error(`Apify Muso request failed (${response.status}): ${errBody}`);
  process.exit(1);
}

const items = await response.json();
const text = String(items?.[0]?.bodyText || "");

function parseCompactNumber(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/,/g, "").trim();
  const match = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  const mult = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return Math.round(num * mult);
}

function extractStat(labelPattern) {
  // Matches either "1.5B\nStreams" or "Streams\n1.5B"
  const beforeLabel = new RegExp(`([\\d.,]+\\s*[KMB]?)\\s+${labelPattern}`, "i");
  const afterLabel = new RegExp(`${labelPattern}\\s+([\\d.,]+\\s*[KMB]?)`, "i");
  const m1 = text.match(beforeLabel);
  if (m1) return parseCompactNumber(m1[1]);
  const m2 = text.match(afterLabel);
  if (m2) return parseCompactNumber(m2[1]);
  return 0;
}

const streams = extractStat("(?:Total\\s+)?Streams");
const credits = extractStat("Credits");
const collaborators = extractStat("Collaborators");

if (streams === 0 && credits === 0) {
  console.error("Could not parse Muso metrics from page text:", text.slice(0, 600));
  process.exit(1);
}

const output = {
  updatedAt: new Date().toISOString(),
  source: MUSO_PROFILE_URL,
  streams,
  credits,
  artists: collaborators,
};

fs.writeFileSync("./credits.json", JSON.stringify(output, null, 2) + "\n");
console.log(
  `Wrote credits.json from Muso.AI: ${output.streams.toLocaleString()} streams, ${output.credits} credits, ${output.artists} collaborators.`
);
