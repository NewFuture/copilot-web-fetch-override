export const EXAMPLE_HTML =
    '<!doctype html><html lang="en"><head><title>Example Domain</title><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p><p><a href="https://iana.org/domains/example">Learn more</a></p></div></body></html>';

export const EXAMPLE_MARKDOWN = `# Example Domain

This domain is for use in documentation examples without needing permission. Avoid use in operations.

[Learn more](https://iana.org/domains/example)`;

export const CONTROLLED_HTML =
    '<!doctype html><html><head><title>Page Title</title><style>.x{}</style></head><body><h1>Body Heading</h1><p>Hello <strong>bold</strong> <em>italic</em>.</p><a href="/relative">Relative</a><script>bad</script></body></html>';

export function truncationNote(nextIndex) {
    return `<note>Content truncated. Call the fetch tool with a start_index of ${nextIndex} to get more content.</note>`;
}
