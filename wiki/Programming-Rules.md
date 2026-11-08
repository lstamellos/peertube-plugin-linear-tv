# Features and scheduling rules

## What Linear TV does

Linear TV is a synchronized **web playback schedule**. It never re-encodes videos or runs a separate continuous streaming server. Viewers' browsers load the original PeerTube embedded players and seek to the scheduled position.

| Capability | Behavior |
| --- | --- |
| Automatic source | Latest eligible public VODs from an account or selected channels |
| Programme loop | Repeats the automatic queue, subject to saved/scheduled playlist changes |
| Current-cycle editor | Changes future programme items without interrupting the current VOD |
| Saved playlists | Named sequences that can be scheduled in a chosen order |
| Live priority | Running lives interrupt VODs and spots |
| Live return | One pending spot (if configured), followed by the exact interrupted VOD offset |
| Ordinary interstitial break | Configured spots run in order between programme VODs |
| Live-to-live transition | Keeps the original interruption snapshot |
| Updated uploads | Eligible public uploads discovered during live can follow the resumed programme |
| Upcoming EPG | Programme items and estimated start times only; hidden during live |
| Persistent room | Optional livechat from one fixed anchor video; does not change with the current VOD |
| Viewer sync | Automatic corrections every five seconds unless the viewer deliberately seeks; Pause/Play alone does not disable correction |
| Chat themes | In-place light/dark updates; PeerTube native/homepage or system preference for external embed |
| Embedding | Admin-only **Embed** button on native Watch; public iframe, optional auto-resize and explicit parent-origin allowlist |
| Persistence | Programme position, spots and editorial settings stored via PeerTube |

## Scheduling details

The server maintains an anchor time, anchor VOD and playback offset. Each entry contributes its actual video duration; interstitial time is included in the estimates but never becomes an EPG programme entry. The client periodically requests the shared status and adjusts the PeerTube player when appropriate.

The first live interruption saves the playback position and the on-air segment. An active live takes priority, and another live does not replace the original interruption snapshot. At the end of live, the schedule inserts **one** next-in-order return spot, then resumes the saved programme segment. After the resumed segment, regular scheduling continues.

If the interrupted segment was a spot, its progress and programme position are preserved. When source videos change during live, the plugin retains the interrupted programme ahead of newly published eligible source videos.

The administrator can edit future order and schedule reusable playlists, but the playing programme VOD is protected against unintended seek/restart. The currently playing VOD must remain in the edited cycle. Editing the current cycle or active playlist is temporarily unavailable while live or an interstitial is on air. Invalid, unpublished or unavailable source videos are revalidated before scheduled playback.

**Limits:** 20 selected channel handles, 1–100 newest VODs (default 30), up to 50 saved playlists of 1–100 videos each, up to 30 scheduled playlist entries, and up to 20 distinct spots. Automatic programme VODs must be public and non-NSFW; manually configured spots can be public or unlisted. Unlisted spots are visible to TV viewers and must not be treated as confidential.

## Playback and scope

Autoplay typically starts muted; the **Enable sound** control unmutes without replacing the player. Video switching and seek adjustments happen in the browser using PeerTube's native embed, so actual playback can lag the computed clock. **Synced** allows a small timing tolerance and does not promise frame-accurate broadcasting. The viewer may Pause/Play or seek; only intentional seeking disables automatic alignment until **Sync to Programme** is clicked. The module supports one shared channel and one application process per PeerTube instance.

For setup, playback controls and embed permissions, see [Usage](Getting-Started), [Embedding](Embedding-and-Live-Chat) and [Operations](Installation-and-Troubleshooting).
