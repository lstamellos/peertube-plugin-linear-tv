# PeerTube Linear TV

A synchronized, television-style programme for one PeerTube instance. Viewers share the same schedule while their browsers play the original PeerTube videos at the corresponding position. Linear TV is **not** a separate 24/7 stream encoder or relay.

**Requirements:** PeerTube 8.2+, Node.js 22+ · **License:** GPL-3.0-only · **Current version:** [Releases](https://github.com/lstamellos/peertube-plugin-linear-tv/releases)

## What it does

- **Continuous programme:** automatic rotation of eligible public VODs from an account or selected channels, with a shared **Now playing / Upcoming** guide.
- **Editorial scheduling:** administrators can reorder the current cycle, save playlists, schedule them and configure optional interstitial spots.
- **Live priority:** an active livestream interrupts the programme. When it ends, one configured spot (if any) plays, then the interrupted item resumes at its saved position.
- **Viewer controls:** Pause/Play and seeking remain available. Intentional seeking suspends automatic programme alignment until **Sync to Programme** is clicked; Pause/Play alone does not.
- **Optional live chat and embedding:** a persistent PeerTube Live Chat room, a native **Watch** page, a custom PeerTube homepage tag and a responsive external iframe. Chat follows light/dark themes without reloading.

## Get started

1. Install **peertube-plugin-linear-tv** in **PeerTube Administration → Plugins**, or use the [CLI instructions](docs/OPERATIONS.md#install-and-upgrade).
2. In **Administration → Plugins → Linear TV → Settings**, select a local **Account name** or **Channel handles** (channels take precedence). Save.
3. Open **`/p/tv`** on your PeerTube instance. Administrators can edit the programme at **Administration → General settings → TV programme**.
4. Optionally configure a **chat anchor video UUID** (requires [peertube-plugin-livechat](https://github.com/JohnXLivingston/peertube-plugin-livechat)) and **Allowed external embed origins**.

The TV page is public; editing the programme and the **Embed / Ενσωμάτωση** button are available only to PeerTube administrators. The **Embed** button generates both the external iframe code and the PeerTube homepage tag.

## Documentation

- [Configuration, administration and viewer controls](docs/USAGE.md)
- [Programming rules, live transitions and spots](docs/FEATURES.md)
- [PeerTube homepage, external embedding and chat themes](docs/EMBEDDING.md)
- [Installation, upgrades and troubleshooting](docs/OPERATIONS.md)

These pages are also organized as publication-ready [GitHub Wiki source pages](wiki/Home.md).

## Important limits

- **One shared TV channel, one PeerTube application process.** All playback uses native PeerTube video embeds; browser autoplay, buffering and latency can affect timing.
- **Public videos only** in the automatic programme; configured spots may also be **unlisted**. An unlisted spot shown publicly exposes its video UUID.
- **External embedding is allowlisted:** configure the exact parent origin and check reverse-proxy CSP / `X-Frame-Options` headers. Chat login in third-party iframes may be affected by browser cookie policies.

## Development

```sh
npm install --ignore-scripts
npm run check
npm test
npm pack
```

Unit tests run in GitHub Actions; test upgrades and cross-site embeds on the target PeerTube version before production deployment.

[Issues](https://github.com/lstamellos/peertube-plugin-linear-tv/issues) · [PeerTube plugin documentation](https://docs.joinpeertube.org/contribute/plugins) · [PeerTube Embed API](https://docs.joinpeertube.org/api/embed-player)
