import fs from "node:fs";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("Error: APIFY_TOKEN is not set in environment.");
  process.exit(1);
}

const artists = JSON.parse(fs.readFileSync("./artists-music.json", "utf8"));
const idToName = new Map(artists.map((a) => [a.id, a.name]));
const artistUrls = artists.map((a) => `https://open.spotify.com/artist/${a.id}`);

const actorId = process.env.APIFY_ACTOR_ID || "augeas~spotify-monthly-listeners";
const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;

const payload = {
  startURLs: artistUrls.map((url) => ({ url })),
  startUrls: artistUrls.map((url) => ({ url })),
  maxItems: artistUrls.length,
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const errBody = await response.text();
  console.error(`Apify request failed (${response.status}): ${errBody}`);
  process.exit(1);
}

const items = await response.json();
if (!Array.isArray(items)) {
  console.error("Apify response was not an array:", JSON.stringify(items).slice(0, 500));
  process.exit(1);
}

const metrics = {};

for (const item of items) {
  const rawUrl = item.url || item.link_to_artist || item.uri || "";
  const match = String(rawUrl).match(/artist[:/]([a-zA-Z0-9]{22})/);
  const artistId = item.artist_id || item.id || (match ? match[1] : null);
  const artistName =
    (artistId && idToName.get(artistId)) ||
    item.artist_name ||
    item.name ||
    null;

  if (!artistName) continue;

  const monthlyListeners = Number(
    item.monthlyListeners ??
      item.monthly_listeners ??
      item.stats?.monthlyListeners ??
      0
  );

  const topTracks = Array.isArray(item.topTracks)
    ? item.topTracks.slice(0, 5)
    : Array.isArray(item.top_tracks)
      ? item.top_tracks.slice(0, 5)
      : [];

  const top5Streams = topTracks.reduce(
    (sum, track) =>
      sum + Number(track.playcount ?? track.playCount ?? track.streams ?? 0),
    0
  );

  metrics[artistName] = {
    monthlyListeners: Number.isFinite(monthlyListeners) ? monthlyListeners : 0,
    top5Streams: Number.isFinite(top5Streams) ? top5Streams : 0,
  };
}

const output = {
  updatedAt: new Date().toISOString(),
  count: Object.keys(metrics).length,
  metrics,
};

fs.writeFileSync("./popularity.json", JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote popularity.json with ${output.count} artists.`);
