# PeerTube Linear TV

A shared, television-style player for a PeerTube instance. Linear TV schedules publicly available videos from an account or selected channels, switches to active livestreams, and shows the next programmes in an electronic programme guide (EPG). It also offers a configurable administrator programme panel, optional interstitial spots, persistent live chat and an embeddable player.

**Version:** 0.2.12 · **PeerTube:** 8.2+ · **Node.js:** 22+ · **License:** GPL-3.0-only

## Features

- **Shared continuous schedule:** viewers see the same programme and a calculated playback offset. The channel loops through a source-derived queue or scheduled editorial playlists.
- **Live preemption and exact resume:** an active live interrupts the programme. After live ends, one configured spot plays (if any), then the interrupted VOD resumes at its saved position. Publications discovered during live follow the resumed programme.
- **Optional interstitials:** configure 0–20 public or unlisted PeerTube VODs; normal breaks play spots in order between programme videos. On return from live, play only the next spot, not the full list. Spots are excluded from the EPG.
- **EPG:** displays upcoming programme VODs with estimated start times and external links to their individual watch pages. The complete EPG hides during live, then returns with recalculated times.
- **Programme management:** an administrator can edit the current/next cycle, create reusable playlists, schedule them, reorder them, and manage spots without restarting the playing VOD.
- **Optional persistent chat:** integrate a single room from `peertube-plugin-livechat` by setting an anchor video UUID.
- **Native homepage markup:** paste `<peertube-container data-linear-tv="true"></peertube-container>` into PeerTube's custom homepage editor. The plugin renders the existing responsive TV embed in place, with no extra JavaScript or external-origin configuration.
- **Administrator-only Embed button:** only logged-in PeerTube administrators (role 0) see the localized **Embed / Ενσωμάτωση** button on the native Watch page. It shows copyable, instance-specific HTML with automatic height adjustment. Moderators, regular users and visitors do not see the button; logging out closes the panel. This hides an administrative convenience, **not** the public embedded TV player, whose access and origin restrictions are unchanged.
- **Automatic and manual programme synchronization:** By default, playback is checked/corrected every five seconds. **Only an intentional viewer seek** (timeline drag/click or seek keyboard shortcut) suspends those corrections; Pause/Play alone does not. **Sync to Programme / Συγχρονισμός με το πρόγραμμα** seeks to the current programme position and **reenables automatic synchronization**. When aligned, **Synced / Συγχρονισμένο** appears. Live broadcasts retain their distinct LIVE badge, and programme boundaries still advance automatically.
- **Three viewer surfaces:** the PeerTube `/p/tv` page, the standalone iframe at `/plugins/linear-tv/router/embed`, and custom homepage markup. All share the same server-side schedule.
- **Persistent state:** scheduled playlists, spots and play positions survive plugin/service restarts (within the supported single-process installation).

## Install or upgrade

1. Install or upgrade this plugin through **PeerTube Administration → Plugins**, or use the standard PeerTube CLI from your PeerTube application directory, as its service account:

   ```sh
   # In the plugin source directory first:
   npm install --omit=dev
   # Then in the PeerTube application directory:
   npm run plugin:install -- --plugin-path /absolute/path/to/peertube-plugin-linear-tv
   ```

2. In **Administration → Plugins → Linear TV → Settings**, configure **Account name** or **Channel handles** (the channel list overrides the account). The account/channels must exist on this PeerTube instance and contain eligible videos.
3. Optionally set the VOD limit (default 30), page title, chat anchor UUID, and external embed origins. Save.
4. Open `https://your-peertube.example/p/tv` to view the shared channel. In the instance's **General settings**, use the **TV programme** tab to edit playlists, schedules and spots.

For detailed guidance see [Usage](docs/USAGE.md), [Features and scheduling rules](docs/FEATURES.md) and [Embedding](docs/EMBEDDING.md).

## Configuration reference

| Setting | Purpose |
| --- | --- |
| Account name | All channels belonging to a local PeerTube account, when no channel handles are set |
| Channel handles | Up to 20 comma-separated channels; overrides Account name |
| Number of newest VODs | 1–100 (default 30) in the automatic source queue |
| TV page title | Display heading of the viewer page |
| Permanent chat anchor video UUID | Video whose livechat room remains open across programme changes |
| Allowed external embed origins | 0–20 comma-separated **full origins** such as `https://www.example.org`. Empty = iframe embedding only from the PeerTube origin |

Spots and saved playlists are managed separately in the **TV programme** panel, not through the above plugin settings.

## PeerTube homepage custom markup

In **Administration → Settings → Configuration → Homepage** (custom homepage editor), paste:

```html
<peertube-container data-linear-tv="true"></peertube-container>
```

The plugin recognizes this built-in, sanitizer-allowed PeerTube tag by its `data-linear-tv` attribute and mounts the existing responsive TV iframe, with live chat and EPG. PeerTube does not expose a plugin API to register new custom tag names, so an arbitrary `<peertube-linear-tv>` element would be removed by PeerTube's markup sanitizer. The same snippet is available from **Watch → Embed → PeerTube homepage tag**. The Embed button is available on the native Watch page but hidden in standalone and homepage embedded views.

## Embed example

First add your website's exact origin (scheme, host and optional port; **no path**) to **Allowed external embed origins**. Then insert:

```html
<iframe src="https://your-peertube.example/plugins/linear-tv/router/embed"
  title="Linear TV" loading="lazy"
  style="width:100%;height:850px;border:0;overflow:hidden"
  scrolling="no" allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen></iframe>
```

The embedded document permits only its own origin and configured external origins through the `frame-ancestors` CSP directive. A resize listener, optional for fixed-height embeds, is documented in [Embedding](docs/EMBEDDING.md). Reverse-proxy `X-Frame-Options`/CSP headers must also allow the configured parent origin.

## Limitations and safety

- One channel per PeerTube instance; no multi-instance coordination, separate encoder, HLS relay or transcoding. Playback remains PeerTube's native iframe player.
- Source VODs must be public, published, playable and non-NSFW. Interstitials may additionally be **unlisted**; playing unlisted media in public TV exposes its UUID to viewers. Never use unlisted spots for confidential material.
- Live detection uses the PeerTube API and hooks; fallback polling is about 15 seconds. Browsers may introduce buffering, autoplay, HLS latency or background-tab drift. **Synced** allows a few seconds of tolerance and is not frame-accurate. During actual livestreams, native live-edge detection is used when exposed by PeerTube.
- The first player normally starts muted due to autoplay policies. The sound control enables audio without replacing the stream.
- Chat requires a separately installed and configured `peertube-plugin-livechat`; authentication inside third-party iframes may be restricted by browser cookie policies.
- Test upgrades and cross-site embeds on a staging installation before changing the production channel.

## Development

```sh
npm install --ignore-scripts
npm run check
npm test
npm pack
```

The automated suite covers timelines, live transitions, spot rotation, playlist scheduling, client routing, iframe behavior and simulated PeerTube API calls. GitHub Actions runs syntax and regression tests on changes. Integration testing against the target PeerTube version is still required.

Refer to [PeerTube plugin documentation](https://docs.joinpeertube.org/contribute/plugins) and the [PeerTube Embed API](https://docs.joinpeertube.org/api/embed-player).

**Project:** [repository](https://github.com/lstamellos/peertube-plugin-linear-tv) · [issues](https://github.com/lstamellos/peertube-plugin-linear-tv/issues)
