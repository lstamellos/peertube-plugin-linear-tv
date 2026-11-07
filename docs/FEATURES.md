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
| Persistent room | Optional livechat from a fixed anchor video |
| Embedding | Standalone public iframe with explicit parent-origin allowlist |
| Persistence | Programme position, spots and editorial settings stored via PeerTube |

## Scheduling details

The server maintains an anchor time, anchor VOD and playback offset. Each entry contributes its actual video duration; interstitial time is included in the estimates but never becomes an EPG programme entry. The client periodically requests the shared status and adjusts the PeerTube player when appropriate.

The first live interruption saves the playback position and the on-air segment. An active live takes priority, and another live does not replace the original interruption snapshot. At the end of live, the schedule inserts **one** next-in-order return spot, then resumes the saved programme segment. After the resumed segment, regular scheduling continues.

If the interrupted segment was a spot, its progress and programme position are preserved. When source videos change during live, the plugin retains the interrupted programme ahead of newly published eligible source videos.

The administrator can edit future order and schedule reusable playlists, but the playing programme VOD is protected against unintended seek/restart. Invalid, unpublished or unavailable source videos are revalidated before scheduled playback.

## Playback and scope

Autoplay typically starts muted. Video switching and seek adjustments happen in the browser using PeerTube's native embed, so actual playback can lag the computed clock. The module does not promise frame-accurate broadcasting. It currently supports one shared channel and one application process per PeerTube instance.
