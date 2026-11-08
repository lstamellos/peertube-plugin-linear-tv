# Linear TV — Documentation

Linear TV creates a shared, television-style programme within **one PeerTube instance**. The browser plays the original PeerTube videos; there is no separate broadcasting encoder or relay.

## Documentation

1. **[Getting started, administration and viewer controls](Getting-Started)** — video sources, plugin settings, programme editor, playlists and spots, Pause/Play, seeking, synchronization and persistent chat.
2. **[Programming and scheduling rules](Programming-Rules)** — automatic queue, live priority and recovery, interstitials, persistence, capacity limits and timing accuracy.
3. **[Embedding and Live Chat](Embedding-and-Live-Chat)** — native PeerTube homepage tag, external iframe, allowlisted origins and CSP, auto-resize, administrator-only Embed button, dark/light themes.
4. **[Installation and troubleshooting](Installation-and-Troubleshooting)** — CLI upgrade commands, version checks, deployment assumptions, common errors and verification checklist.

## Quick reference

- **Viewer:** `https://your-peertube.example/p/tv`
- **TV programme administration:** PeerTube **Administration → General settings → TV programme** (administrators only)
- **Plugin configuration:** PeerTube **Administration → Plugins → Linear TV → Settings**
- **External TV embed:** `https://your-peertube.example/plugins/linear-tv/router/embed`
- **Homepage tag:** `<peertube-container data-linear-tv="true"></peertube-container>`
- **Permanent chat:** one configured Live Chat room independent of the video currently playing

**Scope:** one channel per instance, one PeerTube application process. Public VODs are used in automatic programming; spots may be public or unlisted. Only administrators can edit the programme or see the native **Embed** button. Public playback and configured iframe access are separate from that button.

**Project:** [GitHub repository](https://github.com/lstamellos/peertube-plugin-linear-tv) · [Latest releases](https://github.com/lstamellos/peertube-plugin-linear-tv/releases) · [Issue tracker](https://github.com/lstamellos/peertube-plugin-linear-tv/issues)
