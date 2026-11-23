# Sumthing narrowcast

A buildless display for GitHub Pages. Serve the repository with any static HTTP server. Run checks with `node --test tests/*.test.mjs`.

## Display

- Text scales with the screen width (24px base at 1920px wide, up to 48px), so it stays readable from across the room on 1080p and 4K screens.
- Field updates keep their full-screen media layout. Vertical (portrait) videos sit on the right with the caption beside them on the left, so the caption never covers burned-in subtitles; that caption stays for the whole video.
- Photos get a slow 20-second push-in. Slides cross-fade.
- The blurred background behind videos uses hls.js (native HLS only where hls.js is unsupported, such as Safari) at the lowest rendition.
- Company supporters appear as overlapping logo avatars. Individuals and country-flag placeholders are omitted. Logos belong to the story, rather than being unrelated companies.
- Video text remains for 20–45 seconds of actual playback, depending on reading length and video duration. Buffering does not consume reading time. Videos shorter than that keep their text throughout.
- One 24-second Sumthing slide follows every four field updates.
- The whole display reloads every three hours, fetching its news and shared snapshot again.
- The screen recovers on its own: a video that errors, or makes no progress for 20 seconds, is skipped, and a failed load retries after 60 seconds instead of waiting for the next three-hourly reload.

## Shared data and API load

Every screen reads `weekly-stats.json` from the **narrowcast-data** branch through GitHub's CDN. The bundled snapshot is a first-run fallback. Screens make **no additional Sumthing API calls for statistics or company logos**. Their news loading uses the existing projects/news endpoints, now with one news request instead of the former initial-plus-background requests.

The GitHub Actions workflow checks the shared snapshot every three hours. Weekly counts cover the seven completed **UTC calendar days**, matching the donation statistics API's daily buckets; today is excluded. Completed-day counts are reused for the rest of that day. Company logos are cached for 24 hours per story.

The refresher issues sequential requests with 300 ms spacing. It caps the entire run at 32 Sumthing requests, including retries, with at most two attempts per request. User counting has a 20-page bound and rejects incomplete or unsorted results. A failed metric fails the job and preserves the previous published file. The screen suppresses numbers if the shared snapshot is over 36 hours old. GitHub often runs scheduled workflows hours late, and the slide always shows the exact dates the figures cover, so a figure from one late run is still labelled correctly.

The first checked snapshot used 20 API requests (including company logos). Same-day runs with unchanged stories normally need only the single news-feed request. The number of screens does not multiply this work. No private API keys, user lists, or individual profiles are published in the snapshot.

Metric definitions:

- **New contributions:** sum of `totalDonations` from `/v3/donations/stats` for the displayed date range, across project types. This is Sumthing's donation-record count, not euros or payment transactions.
- **New users:** public user accounts created in that same range, including organisation accounts. `/v2/users` is read newest first until the range's lower boundary.
- **New companies:** accounts with `type=organization` created in that range; includes organisations represented as companies on the public platform.

## Team news

There is no announcement at the moment. To show one with the weekly figures, add it to `updates.json`. The first item whose `displayFrom` / `displayUntil` window contains the current time is shown. Every item needs a `displayUntil`, so old news always disappears by itself (the tests check this):

```json
{
  "announcements": [
    {
      "label": "Team news",
      "date": "12 DEC",
      "title": "Christmas drinks",
      "text": "From 16:00 in the office.",
      "footer": "Bring a colleague from another team.",
      "displayFrom": "2026-12-01T00:00:00+01:00",
      "displayUntil": "2026-12-13T00:00:00+01:00"
    }
  ]
}
```

## Activation

Merge the feature branch into `main`. GitHub Pages publishes the source as before. Scheduled workflows run from the default branch; the first successful run creates the dedicated `narrowcast-data` branch. Run **Refresh shared narrowcast data → Run workflow** once after merging for an immediate refresh. Until then, the display can use its bundled initial snapshot.

The workflow needs repository `contents: write` solely to update the data branch. It does not push to `main`, trigger website rebuilds, or use third-party services. No dependency install is required. To refresh manually: `node scripts/refresh-stats.mjs weekly-stats.json`.
