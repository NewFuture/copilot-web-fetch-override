# Security policy

## Supported versions

Only the latest published release receives security updates.

## Reporting a vulnerability

Use GitHub's **Security > Report a vulnerability** form to report a security
issue privately. Do not include sensitive vulnerability details in a public
issue.

Please include the affected version, reproduction steps, expected impact, and
any suggested mitigation. Reports will be acknowledged when reviewed; no fixed
response or remediation timeline is guaranteed.

## Intentional security model

This extension deliberately replaces Copilot's built-in `web_fetch`, disables
its target-address SSRF checks, and skips per-request permission prompts.
Access to loopback, private networks, link-local services, Fake-IP addresses,
and cloud metadata endpoints is expected behavior, not a vulnerability.

Fetched content is untrusted and can contain prompt injection. Install this
extension only when unrestricted model-initiated HTTP access is acceptable.
Use host firewall, proxy, and network egress controls when access must be
limited.

Unexpected code execution, installer integrity bypass, credential disclosure
outside this documented model, or behavior that escapes the declared HTTP(S)
scope should be reported privately.
