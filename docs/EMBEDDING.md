# Embedding Linear TV on another website

The public standalone document is:

```
https://your-peertube.example/plugins/linear-tv/router/embed
```

Its HTML, video player, optional chat and upcoming EPG come from **your own PeerTube instance**. The page has no outer PeerTube navigation and shares the same scheduler as `/p/tv`.

## Allow the parent origin

In **Administration → Plugins → Linear TV → Settings**, set **Allowed external embed origins** to the websites that may embed the page, for example:

```text
https://www.example.org, https://news.example.net:8443
```

Entries must be complete HTTP(S) **origins** without a path, search string, fragment, wildcard or credentials. Separate multiple entries with commas, spaces or semicolons. Maximum 20. Without entries, only same-origin framing is allowed.

Linear TV sets a `Content-Security-Policy: frame-ancestors 'self' ...` header on its embed route. It removes an app-level `X-Frame-Options` header, but external reverse proxies may still inject their own restrictions. Review final response headers in browser developer tools. The parent website's CSP may also need `frame-src` or `child-src` permitting the PeerTube origin.

## Basic iframe

```html
<iframe
  id="linear-tv-frame"
  src="https://your-peertube.example/plugins/linear-tv/router/embed"
  title="Linear TV"
  scrolling="no"
  style="display:block;width:100%;height:850px;border:0;overflow:hidden"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>
```

The upcoming programme list and chat scroll **inside their panels**, not the entire embed. Use a fixed height if the parent site does not allow JavaScript.

## Optional automatic height adjustment

Place this script on the **parent website**, changing `peerTubeOrigin` to the exact PeerTube origin. The iframe emits height changes only to the origins configured by the instance administrator. The parent must verify both event origin **and** source window:

```html
<script>
(() => {
  const frame = document.getElementById('linear-tv-frame')
  const peerTubeOrigin = 'https://your-peertube.example'

  window.addEventListener('message', event => {
    if (event.origin !== peerTubeOrigin ||
        event.source !== frame.contentWindow ||
        event.data?.type !== 'linear-tv:resize') return
    const height = Number(event.data.height)
    if (Number.isFinite(height) && height >= 200 && height <= 4000) {
      frame.style.height = `${height}px`
    }
  })

  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({ type: 'linear-tv:request-size' }, peerTubeOrigin)
  })
})()
</script>
```

The iframe uses strictly targeted `postMessage` origins, not `*`, and never rebuilds playback to resize. For a CMS that strips scripts from content blocks, install the listener in a theme/script module. Browser policies against third-party cookies may affect authenticated chat use inside cross-site embeds.
