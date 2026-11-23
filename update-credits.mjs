import fs from "node:fs";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("Error: APIFY_TOKEN is not set in environment.");
  process.exit(1);
}

const PLAYLIST_URL =
  process.env.CREDITS_PLAYLIST_URL ||
  "https://open.spotify.com/playlist/6T1NlMgLwWhqn47mmPJ7CJ";

const actorId =
  process.env.CREDITS_APIFY_ACTOR_ID || "fanndev~spotify-playlist-track-scraper";

const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;

const payload = {
  playlistUrls: [PLAYLIST_URL],
  includePlaylistRecord: false,
  enrichWithIsrc: false,
  maxTracksPerPlaylist: 1000,
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const errBody = await response.text();
  console.error(`Apify playlist request failed (${response.status}): ${errBody}`);
  process.exit(1);
}

const items = await response.json();
if (!Array.isArray(items)) {
  console.error("Apify playlist response was not an array:", JSON.stringify(items).slice(0, 500));
  process.exit(1);
}

const trackRows = items.filter(
  (item) =>
    item &&
    item.type !== "PLAYLIST" &&
    (item.trackName || item.name || item.playCount !== undefined || item.playcount !== undefined || item.streamCount !== undefined)
);

let totalStreams = 0;
const uniqueArtists = new Set();

for (const track of trackRows) {
  const plays = Number(
    track.playCount ??
      track.playcount ??
      track.streamCount ??
      track.streams ??
      0
  );
  if (Number.isFinite(plays) && plays > 0) {
    totalStreams += plays;
  }

  if (Array.isArray(track.artists)) {
    for (const artist of track.artists) {
      const artistName = typeof artist === "string" ? artist : artist?.name;
      if (artistName) uniqueArtists.add(artistName.trim());
    }
  } else if (typeof track.artistName === "string") {
    track.artistName
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((name) => uniqueArtists.add(name));
  }
}

const output = {
  updatedAt: new Date().toISOString(),
  playlistUrl: PLAYLIST_URL,
  streams: totalStreams,
  credits: trackRows.length,
  artists: uniqueArtists.size,
};

fs.writeFileSync("./credits.json", JSON.stringify(output, null, 2) + "\n");
console.log(
  `Wrote credits.json: ${output.streams.toLocaleString()} streams across ${output.credits} tracks.`
);
