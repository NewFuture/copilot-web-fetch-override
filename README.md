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

Copilot does not currently provide a Marketplace, deep link, or native
one-click installer for this kind of CLI extension. It discovers
`extension.mjs` from its user extensions directory. This repository provides a
one-command Release installer as the closest equivalent.

Because the repository is private, first authenticate GitHub CLI with an
account that has access:

```powershell
gh auth login
```

Install or update to the latest release:

```powershell
& ([scriptblock]::Create((gh api repos/NewFuture/copilot-proxy-web-fetch/contents/install.ps1 -H "Accept: application/vnd.github.raw+json" | Out-String)))
```

The installer downloads the signed-in account's latest accessible GitHub
Release, validates its expected files, and installs it to:

```powershell
$HOME\.copilot\extensions\proxy-web-fetch
```

Restart Copilot or run `/clear` to reload extensions. Re-running the command
updates the installed bundle. The committed and released `extension.mjs` is
self-contained, so the installed extension does not require Node.js or npm.

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

## Publish

The Release workflow verifies, packages, and publishes tags whose version
matches `package.json`:

```powershell
$version = "v" + (Get-Content package.json -Raw | ConvertFrom-Json).version
git tag -a $version -m $version
git push origin $version
```

Each GitHub Release contains the single-file bundle, installer, third-party
notices, and a versioned ZIP suitable for manual extraction.

## Security

This override intentionally removes the built-in SSRF target-address
restrictions and skips per-request permission prompts. `web_fetch` can access
loopback, LAN, link-local, Fake-IP, and cloud metadata endpoints. Only install
it where that behavior is explicitly acceptable.

Network routing, DNS, proxy policy, and response trust remain the responsibility
of the host environment.
