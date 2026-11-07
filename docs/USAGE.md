# Using Linear TV

## Initial setup

In PeerTube **Administration → Plugins → Linear TV → Settings**, choose the video sources.

- **Account name:** a local PeerTube account handle; includes its channels.
- **Channel handles:** comma-separated handles, taking precedence over the account. Up to 20 channels.
- **Number of newest VODs:** 1–100, default 30. Only published, playable public VODs enter the programme queue. Unlisted VODs are not added automatically.
- **TV page title:** title shown on the viewer's page.
- **Permanent chat anchor video UUID (optional):** set a public video with an enabled `peertube-plugin-livechat` room. Without it, video playback still works.
- **Allowed external embed origins (optional):** parent websites allowed to frame the standalone TV page (see [Embedding](EMBEDDING.md)). Changing this setting does not intentionally restart the programme.

The plugin uses the instance's own locally listening PeerTube API, not a fixed external server. The public viewer page is `/p/tv`, with a **Watch** sidebar link. The channel may initially be empty until the selected sources have eligible videos and the first refresh completes.

## TV programme administrator panel

Open **PeerTube administration → General settings → TV programme**, or visit `/admin/settings/config/general?tv-programme=1` as an instance administrator. The programme administrator API requires an authenticated PeerTube administrator. The panel also has a standalone plugin route.

### Current programme

The current cycle editor shows all programme VODs. Reorder by dragging or using the up/down buttons, add from the configured sources, or remove items, then save. The on-air VOD cannot be removed or restarted by editing. Changes to upcoming items take effect after the current VOD; changes to already-played or pre-current entries apply to the next cycle. Manual edits persist instead of being discarded on each automatic refresh.

### Saved and upcoming playlists

Search the public source library, choose a playlist name and select up to 100 videos, then save the playlist. Schedule a saved playlist to run after the current cycle. Scheduled playlists can be reordered or removed. After scheduled playlists complete, the automatic programme resumes. Content is revalidated before broadcast; unavailable or no-longer-public items may be removed.

### Interstitial spots (optional)

Add up to **20 distinct** full PeerTube video UUIDs or links containing full UUIDs in the **Interstitial spots** section. The video must be published and playable, public or unlisted; private or live videos are not accepted. Use up/down/drag-and-drop to choose the order, then save. A spot currently airing must finish before the list can be edited.

- With **zero** configured spots, the programme plays without spot breaks.
- During ordinary VOD-to-VOD transitions, the configured spot sequence airs in order before the next programme VOD.
- When a livestream ends, **only the next spot** plays. The interrupted VOD then resumes from its saved offset, not from the start. Repeated live returns advance the spot order.
- A live interrupts whatever is on air, including a spot. Live-to-live switches retain the original saved programme state.
- Spots count toward the timing of the programme but do **not** appear as separate entries in **Upcoming**.

**Unlisted is not private.** Everyone viewing the public channel can obtain the spot's UUID.

## Viewer behavior

Visitors arriving at different times watch the programme item corresponding to the server's schedule, at its computed offset. The programme guide lists subsequent **programme VODs** with estimated start times and a button to open each VOD in a new tab. Those links do not affect the shared player.

A live stream preempts the current video. During live, the complete upcoming guide (heading and list) is hidden. Once the live ends and the return spot, if configured, begins, the guide reappears with revised programme times. Playback is approximate because browsers and streaming pipelines add latency.

## Operational notes

The source API is refreshed periodically (about every 5 minutes for VODs, 15 seconds for live checks), with local video/live hooks where available. If the API is temporarily unavailable, the plugin retains the last known state and reports degraded health instead of incorrectly ending a live.

State uses PeerTube plugin storage, not a separate database. The design assumes a single PeerTube application process: multiple independent application instances need a shared scheduler and are not currently supported.

`GET /plugins/linear-tv/router/status` returns the public current programme, upcoming guide, current mode and health information, without admin operations. Administrator endpoints under `/plugins/linear-tv/router/admin/*` enforce the administrator role and revision checks.
