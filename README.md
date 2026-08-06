# Copilot WebFetch Override

A user-scoped GitHub Copilot extension that replaces the built-in `web_fetch`
tool without its SSRF target-address filter. It works with DNS Fake-IP ranges
such as `198.18.0.0/15` and also permits loopback, private, link-local, and cloud
metadata addresses.

## Compatibility

The extension registers `web_fetch` with `overridesBuiltInTool: true` and keeps
the built-in interface:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | string | required | Absolute HTTP or HTTPS URL |
| `max_length` | integer | `5000` | Returned body characters, up to `20000` |
| `start_index` | integer | `0` | Body character offset for pagination |
| `raw` | boolean | `false` | Skip HTML-to-Markdown conversion |

Behavior is based on black-box tests against Copilot CLI 1.0.78-2:

- Uses the same Markdown-aware `Accept` values and WebFetch user agent.
- Follows redirects and reports both the final and original URLs.
- Matches the built-in `Contents of ...` prefixes, raw-content notices,
  pagination notes, exhausted-content marker, and HTTP status errors.
- Passes Markdown through, converts HTML with `node-html-markdown`, and leaves
  JSON, text, XML, and other response bodies unchanged.
- Limits a request to 30 seconds, 5 MiB, and 10 redirects.

The private built-in handler, telemetry, permission UI, and HTML converter are
not exported to extensions. HTML output is therefore behaviorally compatible,
not guaranteed to be byte-for-byte identical for every page.

## Install

The committed `extension.mjs` is self-contained, so installation does not
require Node.js or npm:

```powershell
gh repo clone NewFuture/copilot-proxy-web-fetch "$env:USERPROFILE\.copilot\extensions\proxy-web-fetch"
```

Restart Copilot or run `/clear` to reload extensions.

To update:

```powershell
git -C "$env:USERPROFILE\.copilot\extensions\proxy-web-fetch" pull --ff-only
```

## Develop

Building requires Node.js 20 or newer:

```powershell
npm ci
npm run verify
```

`npm run verify` runs the local HTTP compatibility tests, creates the bundled
root `extension.mjs`, checks its syntax, and confirms that its only external
runtime import is `@github/copilot-sdk/extension`.

Source lives in `src/`, compatibility tests in `test/`, and the generated
single-file extension at the repository root. `node_modules` is not committed.

## Security

This override intentionally removes the built-in SSRF target-address
restrictions and skips per-request permission prompts. `web_fetch` can access
loopback, LAN, link-local, Fake-IP, and cloud metadata endpoints. Only install
it where that behavior is explicitly acceptable.

Network routing, DNS, proxy policy, and response trust remain the responsibility
of the host environment.
