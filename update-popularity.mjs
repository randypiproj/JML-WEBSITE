import fs from "node:fs";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  throw new Error("Missing APIFY_TOKEN secret");
}

const artists = JSON.parse(fs.readFileSync("./artists-music.json", "utf8"));
const idToName = new Map(artists.map((a) => [a.id, a.name]));
const startUrls = artists.map((a) => ({ url: `https://open.spotify.com/artist/${a.id}` }));

// Run Apify Spotify Scraper synchronously and return dataset items
const endpoint = `https://api.apify.com/v2/acts/trudax~spotify-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    startUrls,
    maxItems: startUrls.length,
    proxy: { useApifyProxy: true }
  })
});

if (!response.ok) {
  const errText = await response.text();
  throw new Error(`Apify API error (${response.status}): ${errText}`);
}

const items = await response.json();
const metrics = {};

for (const item of items) {
  const rawUrl = item.url || item.uri || "";
  const match = rawUrl.match(/artist[:/]([a-zA-Z0-9]{22})/);
  const artistId = item.id || (match ? match[1] : null);
  const artistName = artistId ? idToName.get(artistId) : item.name;

  if (!artistName) continue;

  const monthlyListeners = Number(item.monthlyListeners ?? item.stats?.monthlyListeners ?? 0);
  const topTracks = Array.isArray(item.topTracks) ? item.topTracks.slice(0, 5) : [];
  const top5Streams = topTracks.reduce(
    (sum, t) => sum + Number(t.playcount ?? t.streams ?? t.playCount ?? 0),
    0
  );

  metrics[artistName] = {
    monthlyListeners,
    top5Streams
  };
}

const output = {
  updatedAt: new Date().toISOString(),
  metrics
};

fs.writeFileSync("./popularity.json", JSON.stringify(output, null, 2) + "\n");
console.log(`Updated ${Object.keys(metrics).length} artists at ${output.updatedAt}`);
