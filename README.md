# Copilot Proxy WebFetch

A user-scoped GitHub Copilot extension that provides `proxy_web_fetch` as a fallback when the built-in `web_fetch` rejects a URL because DNS returned a blocked or Fake-IP address.

## Behavior

- Keeps the built-in `web_fetch` as the preferred tool.
- Detects address-validation failures through `onPostToolUseFailure`.
- Tells Copilot to retry the same request with `proxy_web_fetch`.
- Supports `url`, `raw`, `start_index`, and `max_length` like `web_fetch`.
- Converts HTML to simplified Markdown without third-party dependencies.
- Follows HTTP redirects and limits requests to 30 seconds, 5 MiB, and 10 redirects.
- Does not filter target hostnames or IP addresses.

## Install

The repository root is the extension directory. Clone it into the user extensions folder:

```powershell
gh repo clone NewFuture/copilot-proxy-web-fetch "$env:USERPROFILE\.copilot\extensions\proxy-web-fetch"
```

Restart Copilot or run `/clear` so extensions are reloaded.

To update:

```powershell
git -C "$env:USERPROFILE\.copilot\extensions\proxy-web-fetch" pull --ff-only
```

## Tool parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | string | required | Absolute HTTP or HTTPS URL |
| `max_length` | integer | `5000` | Maximum returned content length, up to `20000` |
| `start_index` | integer | `0` | Character offset for pagination |
| `raw` | boolean | `false` | Return original response text instead of simplified Markdown |

## Security

`proxy_web_fetch` intentionally does not apply the built-in SSRF target-address restrictions. It can access loopback, LAN, link-local, Fake-IP, and cloud metadata endpoints. Only install and use it in an environment where that behavior is acceptable.

Network routing, DNS, and proxy configuration remain the responsibility of the host system.
