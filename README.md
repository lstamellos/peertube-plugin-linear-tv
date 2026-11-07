# PeerTube Linear TV v0.2.7 — Interstitial spots

Creates a **shared 24/7 television-style channel** from a PeerTube account or chosen video channels. Visitors joining `/p/tv` watch the *same* programme item at its calculated time offset. The PeerTube sidebar includes **Watch** (**Δείτε** in Greek) under Quick access, and upcoming EPG entries provide an external-link button opening their individual `/w/<uuid>` watch page in a new tab without changing the shared stream. A running livestream immediately preempts VOD playback. When live ends, **one next-in-order configured interstitial spot** plays, then the interrupted programme resumes **at its exact saved offset**. New public videos published during the live remain eligible after the interrupted programme finishes. The electronic programme guide (EPG) is then recalculated.

Designed for PeerTube **8.2.x and 8.3.x**, especially native installations using Node.js >=22. **Version 0.2.6 includes a standalone iframe embed; the PeerTube 8.3.2 route and the WordPress iframe were smoke-tested on a test copy of the OmniaTV homepage.**

## Changes in v0.2.7 — Interstitial spots

- Set **zero to 20 public or unlisted VODs** in the programme administrator panel under **Ενδιάμεσα σποτ**. Paste each video's full UUID or a PeerTube URL containing the UUID, arrange with up/down/drag-and-drop, remove and save. The server resolves each UUID directly and rejects private, restricted, live, unpublished or duplicate content.
- Spots play **in the configured order after each programme video**, before the next one (including playlist transitions and automatic loop boundaries). After a live broadcast ends, **only the next pending spot** plays (round-robin across successive live returns), then **the interrupted VOD resumes where it stopped**, without restarting or skipping it. Live always preempts the current player immediately, even if that player is airing a spot.
- The shared programme clock preserves the exact paused programme offset across live interruptions and service restarts, and accounts for the single return spot and the normal spot-break durations: all viewers and the WordPress iframe remain on the same segment and offset. The EPG displays **only programme videos** in «Προσεχώς», including while live is running; spots never appear as upcoming programme items. Programme VOD start times still account for each spot break. While a spot is on air, **Τώρα παίζει** indicates **Σποτ**.
- Saved playlists remain separate from spot configuration. Spot changes preserve the current VOD position; changes while a spot is already on air are rejected until it ends, to prevent the broadcast from jumping to another video. If the configured spot list is empty, previous TV behaviour is unchanged.
- Unlisted videos require a full UUID (short PeerTube URLs without UUID are not sufficient). They are **not** discovered in public search. Anyone watching the public TV channel can see and share the unlisted spot's UUID; do not use unlisted for confidential media.
- Access: PeerTube administration → General settings → **Προγραμματισμός TV** → **Ενδιάμεσα σποτ**. Existing v0.2.6 saved state is migrated without resetting playlists or requiring a database schema migration.

## Changes in v0.2.6 — Embeddable TV page

- A standalone public `GET /plugins/linear-tv/router/embed` page contains **the same** player, permanent livechat and upcoming EPG as `/p/tv`, without PeerTube's outer navigation. It does not create a second scheduler or a second player implementation.
- The embed is allowed in iframes from `https://omniatv.com`, `https://www.omniatv.com` and the PeerTube host itself (`frame-ancestors`). It uses version-aware static assets, no inline JS and `Cache-Control: no-store` for the HTML document.
- The iframe sends `linear-tv:resize` messages to the allowed parent origins whenever its content height changes. The parent **must validate** both the sender's origin and iframe `contentWindow`.
- Chat stays next to the player on desktop and stacks underneath on mobile. The EPG is internally scrollable to keep the embed reasonably compact. The sound button still unmutes the existing video iframe without reloading the stream.
- This release has no changes to the admin scheduling, EPG status endpoint or source selection.

### WordPress embed

Use a **Custom HTML** block or a site-specific shortcode that renders:

```html
<iframe
  id="linear-tv-frame"
  src="https://video.omniatv.com/plugins/linear-tv/router/embed"
  title="OmniaTV Linear TV"
  scrolling="no"
  style="display:block;width:100%;height:900px;border:0;overflow:hidden"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>

<script>
(() => {
  const frame = document.getElementById('linear-tv-frame');

  window.addEventListener('message', event => {
    if (
      event.origin !== 'https://video.omniatv.com' ||
      event.source !== frame.contentWindow ||
      event.data?.type !== 'linear-tv:resize'
    ) return;

    const height = Number(event.data.height);
    if (Number.isFinite(height) && height >= 200 && height <= 4000) {
      frame.style.height = `${height}px`;
    }
  });

  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage(
      { type: 'linear-tv:request-size' },
      'https://video.omniatv.com'
    );
  });
})();
</script>
```

The iframe's own scrollbar is disabled; the «Προσεχώς» programme list and the chat retain their internal scrolling. The parent listens for `linear-tv:resize` and adjusts height without reloading playback. The code above was tested inside a WordPress Custom HTML block on a copy of the OmniaTV homepage.

For WordPress deployments that strip `<script>` from blocks, put the resize listener in a small site-specific script/shortcode, **not** into the Linear TV client code. If a restrictive WordPress CSP is configured, allow the PeerTube origin under `frame-src`/`child-src`. Any reverse proxy `X-Frame-Options: SAMEORIGIN` must not be sent on the `/embed` route: browsers may reject cross-origin framing even with the plugin's `frame-ancestors` policy. The PeerTube page, status endpoint, embedded video and livechat room should all be reachable from the visitor's browser.

**Authentication caveat:** the video and livechat run inside a cross-site iframe on WordPress. Browser third-party-cookie restrictions can affect PeerTube/livechat login and chat posting; verify anonymous chat, authenticated chat and moderation in actual browsers before rollout. Opening the standalone TV page on the PeerTube origin remains a fallback.

## Changes in v0.2.5 — Prominent video action in the EPG

- Replace the small arrow-only EPG link with a clearly labeled teal **Άνοιγμα ↗** action. Each link still opens its own VOD watch page in a new tab, never affecting the linear TV player or the queue.
- Retain the action at the right side of the same row as the title, with a narrow-screen-friendly flex layout. Key layout/button styles are also applied directly in the client to work reliably if the browser still has a cached CSS file from an earlier version.
- No changes to the live chat, playback, schedule API, settings, or persisted programme data.

## Changes in v0.2.4 — Chat and programme-guide layout

- Chat panel no longer stretches to the end of the EPG: it matches the player height, capped to the visible viewport on desktop. Chat messages scroll inside the embedded widget. On narrow screens, the panel stacks below the player and has a bounded height.
- Accessible **Απόκρυψη συνομιλίας / Εμφάνιση συνομιλίας** toggle immediately under the player, beside the sound control. It hides/shows the existing chat iframe without reloading either iframe; hidden chat releases its column width for the player.
- Programme-guide video title and external-link button share one flex container, keeping the button aligned to the far right, even if an older two-column EPG stylesheet is cached.
- No changes to server settings, schedule clock, playlist management, EPG data or stream selection.

## Changes in v0.2.3 — Watch navigation and EPG links

- Native PeerTube sidebar **Watch** link (Greek **Δείτε**) under **Quick access**, using the built-in `play` SVG icon and `filter:left-menu.links.create.result` client hook. Works for guests and signed-in viewers; preserves sidebar router navigation and prevents duplicate entries.
- Each **Ακολουθεί** EPG entry has a compact ↗ button linking to its own `/w/<uuid>` page in a new tab, including the queue shown during a live broadcast. The linear TV player and queue are not altered.
- Greek sidebar label uses PeerTube's native plugin translations (`languages/el.json`).
- Four new browser-client tests cover sidebar localization, URL construction and both VOD/live EPG lists.

## Changes in v0.2.2 — Editable current cycle and next cycle

- **Full current-playlist editor**, including played and future videos, with a permanent marker for the currently playing video. Use ↑/↓, drag-and-drop, **Αφαίρεση**, or the new search box and **Προσθήκη**.
- Edits to items **after the on-air video** (including additions and removals) take effect when the playing video finishes, with no page reload or seek. Edits to **already played items** and additions positioned **before the on-air video** take effect **only when the next cycle starts**.
- The current on-air video is pinned until it finishes; it cannot be removed through this editor. Reordering the current-video marker changes the boundary between the current remainder and the next cycle but does not move the playback position.
- A manually removed item cannot be silently reintroduced during automatic refresh. Newly discovered *public* videos can still be inserted after the current video, as before.
- Cycle edits are server-persisted as a full next-cycle template plus a finite current-cycle remainder. If saved TV playlists are scheduled, they still play after the current cycle; the deferred full order applies when the automatic programme resumes. Saved TV playlist definitions and chat settings remain unchanged.
- All changes are authenticated and revalidated against the video API (`PUT /plugins/linear-tv/router/admin/cycle`, body `{"revision":N,"uuids":[...]}`). Duplicate, unavailable, private/unlisted, or currently-playing-video-omitting edits are rejected. Editing is disabled while a live is active.
- Unit and simulated admin API regressions cover preserving UUID and exact offset, eventual next-cycle application, removed-video refresh tombstones, newly published-video priority, saved playlist transitions, and access control.

## Changes in v0.2.1 — Settings integration

- Exposes scheduling as a Configuration tab without a PeerTube core patch.
- Does not modify the stream, EPG, or scheduling API.
- Keeps the legacy standalone URL.
- Uses the existing General route, not an unsupported custom Angular child route; this UI injection may need adaptation when upgrading PeerTube.

## Scheduling panel

The administrator programming panel appears as **TV Programme** in **Administration → Settings → Configuration**, at **`/admin/settings/config/general?tv-programme=1`**. The original plugin route **`/p/tv-programme`** remains available for compatibility. PeerTube 8.3.2 does not expose an official API to add a native child route such as `/admin/settings/config/tv-programme`, so the existing General route is reused with a query parameter and the tab is inserted client-side.

- The **current programme queue** displays its full cycle with played/current/future indicators. Admins can reorder, add and remove items with ↑/↓, drag-and-drop, search and removal controls. The existing player/clock retain their exact current UUID and offset; changes to the past are deferred to the next cycle.
- **Saved TV playlists** can be created from selected public PeerTube videos, found with an account/channel library search. Each playlist has a title and an explicitly ordered list of up to 100 videos. Playlist definitions are saved in PeerTube plugin storage.
- **Upcoming TV playlists** can be queued from the saved playlists, moved up/down or cancelled. They execute sequentially **after the current programme finishes**, then the stream returns automatically to the manually edited next-cycle programme (or the latest automatic rotation if no edits exist).
- The scheduling panel displays estimated completion/start times derived from actual video durations. The public `/p/tv` EPG displays scheduled videos after the active playlist. While a live stream is active, absolute post-live times are intentionally unknown.
- A newly public VOD published during an intervening live still goes immediately after the live, before the normal successor. The rest of the TV programme remains queued.
- The saved/queued playlist definitions survive PeerTube restarts and ordinary plugin upgrades. Changes made through the programming panel do not call the PeerTube plugin settings callback and do not restart the stream.
- `POST`/`PUT`/`DELETE` scheduling APIs are restricted to authenticated PeerTube administrators (`role: 0`) and use optimistic revision checks (`409` when the programme changed).
- Videos are checked for public/playable state at playlist creation, on scheduling, and again before an item is brought on air from a saved playlist. Deleted/private/unlisted/NSFW items are excluded. Temporary upstream 5xx failures must not silently erase media.

### Scheduling panel usage

1. Install the update, leave existing source account/channel and chat UUID settings intact, and open **`/admin/settings/config/general?tv-programme=1`** while signed in as a PeerTube administrator.
2. Edit the current playlist (including previously played items), optionally add or remove videos, then choose **Αποθήκευση αλλαγών playlist**. Earlier edits take effect next cycle, while future edits take effect immediately after the current VOD.
3. Type a title for a new TV playlist, search the configured sources, click **Προσθήκη** for each video, reorder the selection and choose **Αποθήκευση νέας playlist**.
4. In **Αποθηκευμένες TV playlists**, click **Προσθήκη μετά την τρέχουσα**. Reorder or cancel queued TV playlists in **Επόμενες TV playlists**.

Design notes: A saved playlist is a template. Scheduling creates a snapshot, so deleting the template does **not** cancel the upcoming programme. Scheduling works at the **end of the current playlist**, not at a wall-clock appointment or by interrupting the current VOD. The active programme is never skipped merely because a new playlist is scheduled. During live, the current queue is read-only until the transition back to VOD. Media are played as PeerTube native embeds; this is not a separate transcoding/broadcasting service. The viewer still uses the original watch page `/p/tv`, with the existing chat UUID intact.

## Changes in v0.1.5

- Fix the **Enable sound** button: unmute the already-running, same-origin PeerTube Video.js player synchronously, without replacing the iframe, navigating the page, seeking or restarting playback.
- Preserve the sound choice for subsequent programme videos and live transitions by using `muted=0` when a new embed is genuinely required.
- If the player is not yet ready, retain the sound button for a retry instead of hiding it or recreating the embed.
- Add sound-control regression tests (same-frame, same URL/time, retry and privacy-boundary behavior).

## Changes in v0.1.4

- Fix HTTP 401 on self-requests to PeerTube 8.3.2: `privacyOneOf` is an authenticated/admin-only filter in the account and channel listing API. Omit it in unauthenticated API calls and enforce `privacy.id === 1` in the plugin itself.
- Add mock API regression guard returning 401 whenever the forbidden filter is present. The live/VOD integration test now exercises this.

## Changes in v0.1.3

- Fix an empty programme on PeerTube 8.3.2: the default account/channel video-list endpoint omits `state`, so previously every public VOD was silently rejected.
- Request `includeScheduledLive=true` explicitly to retrieve each video's state; retain the `state === 1` check for active live, and reject waiting/ended lives. Apply the public-only privacy check locally, because `privacyOneOf` is restricted to privileged API users.
- Tolerate state-less *non-live* entries when they have public privacy, a real `publishedAt` and positive duration; do not infer active lives from missing state.
- Add regression tests using the actual PeerTube 8.3.2 account-list response shape (no `state`).

## Changes in v0.1.2

- Fix browser client route registration: PeerTube loads client plugin scripts as ESM, so export `register` using `export { register }`, not CommonJS `module.exports`.
- Add automated client-module import and `/p/tv` registration test.
- Reinstall/upgrade from the updated source directory and reload the browser after deployment; client-side scripts are version-cached by PeerTube.

## Changes in v0.1.1

- After live: **next VOD from the beginning**, never resume the interrupted video's offset.
- Public VODs published during live: **first in queue after live**, most recent first; the original next programme follows.
- Queue refresh keeps the committed programme order stable and removes videos no longer listed as public.
- Additional automated tests of after-live ordering, publication privacy and schedule boundaries.

## Features

- Account-wide mode (all channels of a user) or explicitly listed channel handles; newest VODs, limit 1–100.
- Administrator-only TV scheduling panel with programmable upcoming order and saved/scheduled TV playlists.
- Public, published, non-NSFW videos only; automatically excludes waiting and ended livestreams.
- Shared server-side clock, deterministic programme grid based on actual PeerTube durations. Programme repeats when the queue ends.
- Server state persisted through PeerTube's plugin storage; reload/restart does not reset the programme clock.
- Local live start/end hooks, with 15-second fallback reconciliation; all visitors switch on their next 5-second status poll.
- Interrupts *the programme clock*, not a backend encoder. At the end of a live, skips the interrupted VOD and starts the next scheduled video at **00:00**. The interrupted video goes to the end of the rotation, not back to its paused position.
- Videos that become **public and published during live** are scheduled **immediately after live**, before the previously planned successor. If several are published, newest first. Unlisted, private, internal, password-protected, NSFW and non-ready videos are excluded.
- A new video already published before the live is not mistaken for a live-time publication merely because the source API discovers it during the live.
- For an active live, EPG correctly says **After live** (no fabricated start time).
- PeerTube native iframe player with `start` offset and optional PeerTube Embed API correction when drift exceeds 3.5 seconds.
- Persistent chat iframe through **peertube-plugin-livechat**, pinned to a selected *anchor video* so chat does not change when the TV programme switches videos.
- No FFmpeg, OBS, video retranscoding, cron, database tables or separate livestream required.

## Installation (staging first)

1. Unpack this source folder on the PeerTube host, and in the folder run `npm install --omit=dev`. This installs the PeerTube Embed API (`@peertube/embed-api`) from npm. Production deployment requires network access to npm.
2. Install or upgrade the plugin from its **absolute source directory** with `npm run plugin:install -- --plugin-path /absolute/path/to/peertube-plugin-linear-tv` in the PeerTube app directory, as the PeerTube service user. **Do not copy source files into PeerTube core.** Restart the PeerTube service afterwards.
3. In PeerTube Administration → Plugins → Linear TV settings, enter either:
   - **Account name**: username, to include all its channels; or
   - **Channel handles**: comma-separated handles; if filled, these override the account field.
4. Set VOD count (default 30), optional page title and optional **chat anchor video UUID**. Open `https://your-peertube.example/p/tv`.

### Chat prerequisite

Install/configure `peertube-plugin-livechat`, enable chat for a **permanent, public, non-deleted video** used as the chat anchor and configure the livechat plugin to permit chat for that video (including non-live videos). Set that video's UUID in the Linear TV settings. The room iframe then stays on the same channel when the player changes to another video or a live. Without an anchor, Linear TV still plays, but the chat panel shows setup instructions. Guest posting/login and moderation are handled by the livechat plugin.

The chat plugin's `/plugins/livechat/router/webchat/room/<UUID>` route is expected from livechat >=7.2.0; enable/verify on a staging instance. This is a plugin-to-plugin integration, **not** the PeerTube live video chat attached automatically to the current video.

### Data sources and requests

- If no channel list is supplied: `GET /api/v1/accounts/{username}/videos`.
- If channel list supplied: `GET /api/v1/video-channels/{handle}/videos` for each channel.
- Each source is requested with `isLive=true` (live detection) or `isLive=false` (VOD queue); only public, published VODs and live streams with confirmed `state.id===1` are considered playable. List requests include `includeScheduledLive=true` to receive the otherwise omitted `state` on PeerTube 8.3.x. Pending live (`state.id===4`) and ended live (`state.id===5`) do not interrupt programme.
- Plugin retrieves its own PeerTube REST API on the **locally listening port**; this avoids routing internal traffic through a Cloudflare proxy. The PeerTube instance's listener must allow loopback HTTP requests.
- No arbitrary externally specified URL is fetched by the plugin.
- Periodic VOD refresh every 5 minutes; 15-second live reconciliation and immediate local hooks for live and video changes. On live start/end the plugin also refreshes the VOD list, so new public uploads are included before the transition. The 15-second reconciliation refreshes VODs when it detects the end of a live (even if a hook was missed).
- `GET /plugins/linear-tv/router/status` returns status/EPG with `Cache-Control: no-store`.

### Browser limitations

The first video is started muted due to browser autoplay restrictions. Press **Enable sound** to unmute the existing video without reloading it, or use the native player controls. This control requires the PeerTube iframe to be same-origin, as it is on `/p/tv` in the normal installation. On some browsers unmuted autoplay after switching sources may still require pressing the player Play button. Sync is subject to browser buffering, background-tab throttling and PeerTube live HLS latency; there is **no guarantee of broadcast-frame-accurate synchronisation**.

### Operational limits

- One linear channel per instance, not multi-station scheduling yet.
- New-video priority uses the PeerTube `publishedAt` timestamp and requires the video to be returned by the sources API when the live concludes. Uploads still transcoding or awaiting publication do not interrupt the live or appear in the VOD queue.
- Up to 20 source channel handles and newest 100 VODs by default; no complex editorial rules, time slots, overrides or archived video scheduling.
- Local lives are picked up by a server hook; remote/federated lives are picked up on the fallback interval.
- Playback is always the original PeerTube embed, *not* a new RTMP/HLS stream URL for smart TVs.
- A public VOD deleted/privatized during playback is removed from the next refreshed schedule. Handling immediate hard takedowns already playing in a browser needs a further production test.
- A single server instance is assumed. Multiple independent PeerTube application processes require a shared scheduling coordinator or database locking; not supported by this version.
- Chat requires a separately installed livechat plugin and manually chosen anchor video.
- Library is downloaded by npm during installation, rather than being vendored into this source archive.

## Development/testing

Run `npm test` and `npm run check` with Node.js 22+. The tests cover programme timing, queue updates, live precedence, new-public-video priority, restart-at-zero, publication privacy, restart simulation, source selection and simulated PeerTube API outages. Tests use mocks; they do not replace browser/PeerTube integration checks.

## Security/privacy

The public status endpoint returns only public video metadata, schedules and chat anchor UUID. Private and NSFW content is not intentionally listed or selected. Admin settings are managed by PeerTube's own authenticated plugin-settings UI. Chat moderation and spam prevention belong to the separate livechat plugin. Text from PeerTube metadata is injected via `textContent`, not HTML.

## Upstream documentation

- [PeerTube plugins](https://docs.joinpeertube.org/contribute/plugins)
- [PeerTube plugin hooks and API](https://docs.joinpeertube.org/api/plugins)
- [PeerTube embed API](https://docs.joinpeertube.org/api/embed-player)
- [PeerTube Livechat third-party room](https://livingston.frama.io/peertube-plugin-livechat/technical/thirdparty/)

License: GPL-3.0-only. This prototype includes no third-party compiled assets.
