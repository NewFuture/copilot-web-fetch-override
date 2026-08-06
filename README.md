# Copilot WebFetch Override

A user-scoped GitHub Copilot extension that replaces the built-in `web_fetch`
tool without its SSRF target-address filter. It works with DNS Fake-IP ranges
such as `198.18.0.0/15` and also permits loopback, private, link-local, and cloud
metadata addresses.

> [!WARNING]
> This extension gives model-initiated requests access to local and private
> services without per-request permission prompts. Fetched pages can also
> contain prompt injection. Review the [security model](SECURITY.md) before
> installing.

## Compatibility

The extension registers `web_fetch` with `overridesBuiltInTool: true` and keeps
the built-in interface:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | string | required | Absolute HTTP or HTTPS URL |
| `max_length` | integer | `5000` | Returned text characters or inline Base64 characters, up to `20000` |
| `start_index` | integer | `0` | Body character offset for pagination |
| `raw` | boolean | `false` | Skip HTML-to-Markdown conversion |

Behavior is based on black-box tests against Copilot CLI 1.0.78-2:

- Uses the same Markdown-aware `Accept` values and WebFetch user agent.
- Follows redirects and reports both the final and original URLs.
- Matches the built-in `Contents of ...` prefixes, raw-content notices,
  pagination notes, exhausted-content marker, and HTTP status errors.
- Passes Markdown through, simplifies article-like HTML with Mozilla
  Readability, falls back to full-document `node-html-markdown` conversion, and
  leaves JSON, text, XML, and other response bodies unchanged.
- Decodes response bytes using BOM, HTTP `charset`, HTML `<meta charset>`, or
  XML encoding declarations before falling back to UTF-8.
- Treats `text/*`, JSON, XML, Markdown, JavaScript, YAML, and a small allowlist
  of other textual media types as text. A missing `Content-Type` is treated as
  text only when markup or valid control-free UTF-8 can be identified.
- Returns binary image bytes as complete Base64 when that representation fits
  `max_length`. Non-image binary responses and oversized images are written
  byte-for-byte to a private OS temporary directory with owner-only modes where
  supported, then returned as a path with an untrusted-file warning. Temporary
  files are removed after one hour or when the extension process exits,
  whichever happens first; failed timed cleanup is retried while the process
  remains active.
- Limits a request to 30 seconds, 5 MiB, and 10 redirects.

The private built-in handler, telemetry, permission UI, and HTML converter are
not exported to extensions. HTML output is therefore behaviorally compatible,
not guaranteed to be byte-for-byte identical for every page.

## Install

Copilot does not currently provide a Marketplace, deep link, or native
installer for this kind of CLI extension. It discovers `extension.mjs` from its
user extensions directory. This repository provides a one-command public
Release installer as the closest equivalent.

Install or update to the latest release without GitHub CLI or authentication:

```powershell
& ([scriptblock]::Create((irm https://github.com/NewFuture/copilot-proxy-web-fetch/releases/latest/download/install.ps1)))
```

The installer:

- reads public release metadata from the GitHub API;
- downloads the versioned ZIP;
- verifies the SHA-256 digest supplied by GitHub;
- checks the required files; and
- installs to `$HOME\.copilot\extensions\proxy-web-fetch`.

Restart Copilot or run `/clear` to reload extensions. Re-running the command
updates the installed bundle. To inspect the script before executing it:

```powershell
irm https://github.com/NewFuture/copilot-proxy-web-fetch/releases/latest/download/install.ps1 -OutFile install.ps1
Get-Content .\install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

To install a fixed release, download that release's `install.ps1` and pass the
same tag through `-Version`, for example `-Version v2.1.2`.

The released `extension.mjs` is self-contained, so the installed extension does
not require Node.js or npm.

## Develop

Building requires Node.js 20.19 or newer:

```powershell
npm ci
npm run verify
```

`npm run verify` runs the local HTTP compatibility tests, creates the minified
and bundled root `extension.mjs`, checks its syntax, and confirms that its
external runtime imports are limited to the Copilot extension SDK and Node.js
built-ins.

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

Each GitHub Release contains the bundle, installer, license, security policy,
third-party notices, versioned ZIP, and its SHA-256 checksum.

## License

This project is available under the [MIT License](LICENSE). Bundled dependency
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Security

This override intentionally removes the built-in SSRF target-address
restrictions and skips per-request permission prompts. `web_fetch` can access
loopback, LAN, link-local, Fake-IP, and cloud metadata endpoints. Only install
it where that behavior is explicitly acceptable.

Network routing, DNS, proxy policy, response trust, and model tool access remain
the responsibility of the host environment. See [SECURITY.md](SECURITY.md) for
the complete security model and private reporting instructions.
