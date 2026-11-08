# Installation, upgrades and troubleshooting

## Requirements and architecture

- **PeerTube 8.2+** and **Node.js 22+**.
- One PeerTube application process and one shared Linear TV channel per instance. Independent clustered application processes are not supported.
- Videos are played with PeerTube's **native embedded player**. The plugin does not provide a separate continuous encoder, HLS relay or transcoder.
- **Optional chat:** install and configure `peertube-plugin-livechat` independently.

## Install and upgrade

**Recommended:** use **PeerTube Administration → Plugins** to install or update `peertube-plugin-linear-tv`.

For a local release archive or source checkout, run these commands as the **PeerTube service account**, adjusting paths and the release filename:

```sh
# Unpack a downloaded release (or work from an existing source checkout).
mkdir -p /path/to/unpacked/peertube-plugin-linear-tv
tar -xzf peertube-plugin-linear-tv-VERSION.tgz \
  -C /path/to/unpacked/peertube-plugin-linear-tv --strip-components=1

cd /path/to/unpacked/peertube-plugin-linear-tv
npm install --ignore-scripts
npm run check
npm test

# Run the installer from the PeerTube application directory.
cd /path/to/peertube/peertube-latest
NODE_ENV=production \
NODE_CONFIG_DIR=/path/to/peertube/config \
npm run plugin:install -- \
  --plugin-path /path/to/unpacked/peertube-plugin-linear-tv
```

`NODE_CONFIG_DIR` must point to the **existing PeerTube configuration directory** for that installation (not the plugin directory). Using the wrong configuration can cause database authentication errors. Paths vary between native, packaged and container deployments; use the method appropriate to your PeerTube installation.

An in-place plugin update does **not** normally require uninstalling the previous version. Keep a backup of PeerTube's plugin storage and configuration before production changes. Check the installer output for a successful install; then reload the client page fully (for example, Ctrl+Shift+R) to avoid stale plugin scripts.

## First configuration

In **Administration → Plugins → Linear TV → Settings** configure:

| Setting | Meaning |
| --- | --- |
| Account name | Local account whose channel videos are used, if channel handles are blank |
| Channel handles | Up to 20 handles; **overrides** the account setting |
| Number of newest VODs | 1–100; default 30 |
| TV page title | Heading for the public TV view |
| Permanent chat anchor video UUID | Fixed room for optional Live Chat, independent of on-air video |
| Allowed external embed origins | Up to 20 full HTTP(S) origins, without paths; empty permits only same-origin embedding |

Use **Administration → General settings → TV programme** to edit the programme cycle, saved playlists, schedules and spots. These are **not** individual plugin setting fields. The native public viewer route is `/p/tv`.

Only PeerTube administrators may mutate the programme or use the native Watch **Embed** button. The TV player and configured embeds remain public.

## Quick checks after an update

1. Open `/p/tv` and verify the title, **Now playing** and **Upcoming** information.
2. Confirm the video continues playing and that **Enable sound**, **Pause/Play**, deliberate seeking and **Sync to Programme** behave correctly.
3. With an administrator account, verify **TV programme** and **Embed**; with a regular or anonymous visitor, verify that **Embed** is hidden.
4. If chat is configured, switch PeerTube light/dark theme: the chat colors should change without reloading its iframe.
5. Check a same-origin homepage embed and, if used, one allowed external origin.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| TV empty or no programme | Source account/channel handles, eligible **public** published non-NSFW VODs, configured newest-VOD limit and the initial source refresh |
| Installer reports database authentication failure | Correct PeerTube service user, `NODE_ENV=production`, and the deployment's actual `NODE_CONFIG_DIR` |
| An admin UI panel or menu initially returns 404 | Confirm plugin is installed and enabled, reload the page after the plugin update, inspect PeerTube server logs and network requests if the error persists |
| External iframe is blocked | Exact parent origin in **Allowed external embed origins**, final `frame-ancestors` CSP response header, reverse-proxy `X-Frame-Options`/CSP, and parent page `frame-src` policy |
| Chat blank or disconnected | Live Chat plugin enabled, anchor video UUID with chat enabled, browser developer console and third-party cookie/authentication policies |
| Chat does not follow colors | Live Chat **ConverseJS theme = PeerTube** and **Automatic color detection** enabled; reload initially, then test light/dark switching |
| Player drifts after manual timeline seeking | Deliberate seeking suspends auto-alignment: click **Sync to Programme**. Pause/Play alone does not suspend it |
| An unlisted spot is unexpectedly visible | This is intended: public TV playback exposes the spot video UUID. Do not use unlisted spots for confidential media |

The public `GET /plugins/linear-tv/router/status` endpoint reports programme mode, current item, upcoming entries and health. Administrator operations are under `/plugins/linear-tv/router/admin/*` and require administrator permissions.

## Further reading

- [Configuration and viewer behavior](USAGE.md)
- [Scheduling details](FEATURES.md)
- [Embedding and chat](EMBEDDING.md)
- [PeerTube plugin development](https://docs.joinpeertube.org/contribute/plugins)
