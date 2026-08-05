# Copilot WebFetch Override

A user-scoped GitHub Copilot extension that replaces the built-in `web_fetch` tool so Fake-IP, loopback, private, and link-local targets are not rejected by its SSRF address check.

## Behavior

- Registers `web_fetch` with `overridesBuiltInTool: true`.
- Handles every `web_fetch` request directly; the original handler is not invoked.
- Supports the original `url`, `raw`, `start_index`, and `max_length` interface.
- Converts HTML to simplified Markdown without third-party dependencies.
- Follows HTTP redirects and limits requests to 30 seconds, 5 MiB, and 10 redirects.
- Does not filter target hostnames or IP addresses.

## Implementation

The extension reuses the public `@github/copilot-sdk` extension API and Node.js built-ins such as `fetch`, `URL`, `TextDecoder`, and `Buffer`. Copilot's original WebFetch handler and bundled HTML-processing modules are not exported to extension child processes, so the HTML-to-Markdown conversion remains a small local implementation.

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

This override intentionally removes the built-in SSRF target-address restrictions. `web_fetch` can access loopback, LAN, link-local, Fake-IP, and cloud metadata endpoints. Only install and use it in an environment where that behavior is acceptable.

Network routing, DNS, and proxy configuration remain the responsibility of the host system.
