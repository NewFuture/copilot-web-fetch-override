import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
    WebFetchError,
    decodeBody,
    htmlToMarkdown,
    parseHttpUrl,
    textualResponse,
    webFetch,
} from "../src/web-fetch.mjs";
import {
    CONTROLLED_HTML,
    EXAMPLE_HTML,
    EXAMPLE_MARKDOWN,
    truncationNote,
} from "./fixtures/builtin-baseline.mjs";

let primaryServer;
let secondaryServer;
let primaryUrl;
let secondaryUrl;

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            const address = server.address();
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

function close(server) {
    server.closeAllConnections();
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

before(async () => {
    secondaryServer = createServer((request, response) => {
        if (request.url === "/final") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end("<h1>Final</h1>");
            return;
        }
        response.writeHead(404);
        response.end();
    });
    secondaryUrl = await listen(secondaryServer);

    primaryServer = createServer((request, response) => {
        switch (request.url) {
            case "/example":
                response.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                });
                response.end(EXAMPLE_HTML);
                break;
            case "/markdown":
                response.writeHead(200, { "Content-Type": "text/markdown" });
                response.end("# Direct\n");
                break;
            case "/json":
                response.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                });
                response.end('{"ok":true}\n');
                break;
            case "/text":
                response.writeHead(200, { "Content-Type": "text/plain" });
                response.end("abcdefghijklmnopqrstuvwxyz");
                break;
            case "/binary":
                response.writeHead(200, {
                    "Content-Type": "application/octet-stream",
                });
                response.end(Buffer.from([0x00, 0xff, 0x41]));
                break;
            case "/binary-text":
                response.writeHead(200, {
                    "Content-Type": "application/octet-stream",
                });
                response.end("must remain bytes");
                break;
            case "/missing-content-type-html":
                response.removeHeader("Content-Type");
                response.end("<!doctype html><html><body><h1>Detected</h1></body></html>");
                break;
            case "/xml":
                response.writeHead(200, {
                    "Content-Type": "application/problem+xml",
                });
                response.end("<?xml version=\"1.0\"?><problem>details</problem>");
                break;
            case "/inspect":
                response.writeHead(200, { "Content-Type": "text/plain" });
                response.end(
                    `accept=${request.headers.accept}\nua=${request.headers["user-agent"]}`,
                );
                break;
            case "/redirect":
                response.writeHead(302, { Location: `${secondaryUrl}/final` });
                response.end();
                break;
            case "/redirect-loop":
                response.writeHead(302, { Location: "/redirect-loop" });
                response.end();
                break;
            case "/missing":
                response.writeHead(404, { "Content-Type": "text/plain" });
                response.end("missing");
                break;
            case "/large":
                response.writeHead(200, {
                    "Content-Type": "text/plain",
                    "Content-Length": "11",
                });
                response.end("12345678901");
                break;
            case "/slow":
                setTimeout(() => {
                    if (!response.destroyed) {
                        response.writeHead(200, { "Content-Type": "text/plain" });
                        response.end("late");
                    }
                }, 100);
                break;
            default:
                response.writeHead(404);
                response.end();
        }
    });
    primaryUrl = await listen(primaryServer);
});

after(async () => {
    await Promise.all([close(primaryServer), close(secondaryServer)]);
});

test("matches the built-in example.com Markdown body", () => {
    assert.equal(htmlToMarkdown(EXAMPLE_HTML), EXAMPLE_MARKDOWN);
});

test("adds a distinct document title and preserves relative links", () => {
    const markdown = htmlToMarkdown(CONTROLLED_HTML);
    assert.match(markdown, /^Page Title\n\n# Body Heading/);
    assert.match(markdown, /\[Relative\]\(\/relative\)/);
    assert.doesNotMatch(markdown, /\.x\{\}|bad/);
});

test("handles quoted angle brackets and escapes every table-cell pipe", () => {
    const markdown = htmlToMarkdown(
        '<p title="1 > 0">safe</p><table><tr><th>Value</th></tr><tr><td>a\\b|c|d</td></tr></table>',
    );
    assert.match(markdown, /^safe/);
    assert.match(markdown, /a\\\\b\\\|c\\\|d/);
});

test("uses Readability for article pages and removes surrounding navigation", () => {
    const paragraph =
        "This detailed article explains a focused topic, provides supporting context, " +
        "and contains enough substantive prose for reliable reader-mode extraction. ";
    const html =
        "<!doctype html><html><head><title>Focused Article</title></head><body>" +
        "<nav>Navigation noise that should be removed</nav>" +
        `<article><h1>Focused Article</h1><p>${paragraph.repeat(8)}</p>` +
        `<p>${paragraph.repeat(8)}</p>` +
        '<p><a href="javascript:alert(1)">Script link</a> ' +
        '<a href="DaTa:text/html,unsafe">Data link</a> ' +
        '<a href=" vbscript:unsafe">VBScript link</a></p></article>' +
        "<footer>Footer noise that should be removed</footer></body></html>";

    const markdown = htmlToMarkdown(html);
    assert.match(markdown, /^# Focused Article/);
    assert.match(markdown, /substantive prose/);
    assert.match(markdown, /Script link.*Data link.*VBScript link/s);
    assert.doesNotMatch(markdown, /Navigation noise|Footer noise/);
    assert.doesNotMatch(markdown, /javascript:|data:|vbscript:/i);
});

test("decodes BOM, HTTP charset, and HTML metadata encodings", () => {
    const latin1Bytes = (value) =>
        Uint8Array.from(value, (character) => character.charCodeAt(0));
    const utf8Text = new TextEncoder().encode("中文");
    const utf8Bom = new Uint8Array(utf8Text.length + 3);
    utf8Bom.set([0xef, 0xbb, 0xbf]);
    utf8Bom.set(utf8Text, 3);
    assert.equal(
        decodeBody(utf8Bom, "text/plain; charset=windows-1252"),
        "中文",
    );

    assert.equal(
        decodeBody(
            Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]),
            "text/plain; charset=gbk",
        ),
        "中文",
    );

    const html = '<meta charset="windows-1252"><p>caf\xe9</p>';
    const htmlBytes = latin1Bytes(html);
    assert.equal(
        decodeBody(htmlBytes, "text/html; charset=unsupported"),
        '<meta charset="windows-1252"><p>café</p>',
    );

    const untypedHtml = `<!doctype html>${html}`;
    assert.equal(
        decodeBody(latin1Bytes(untypedHtml), ""),
        '<!doctype html><meta charset="windows-1252"><p>café</p>',
    );
    assert.equal(
        decodeBody(htmlBytes, ""),
        '<meta charset="windows-1252"><p>caf�</p>',
    );
});

test("classifies textual media types conservatively", () => {
    const text = new TextEncoder().encode("plain text");
    assert.equal(textualResponse("text/csv", text), true);
    assert.equal(textualResponse("application/problem+json", text), true);
    assert.equal(textualResponse("application/problem+xml", text), true);
    assert.equal(textualResponse("image/svg+xml", text), true);
    assert.equal(textualResponse("application/pdf", text), false);
    assert.equal(textualResponse("application/octet-stream", text), false);
    assert.equal(textualResponse("", text), true);
    assert.equal(textualResponse("", Uint8Array.from([0x00, 0xff, 0x41])), false);
});

test("matches normal and raw request headers", async () => {
    const normal = await webFetch({ url: `${primaryUrl}/inspect` });
    assert.match(normal, /accept=text\/markdown, text\/html, \*\/\*/);
    assert.match(normal, /ua=GitHubCopilotRuntime-WebFetch/);

    const raw = await webFetch({ url: `${primaryUrl}/inspect`, raw: true });
    assert.match(raw, /accept=text\/html, \*\/\*/);
    assert.match(raw, /ua=GitHubCopilotRuntime-WebFetch/);
});

test("wraps converted HTML like the built-in tool", async () => {
    const url = `${primaryUrl}/example`;
    assert.equal(
        await webFetch({ url }),
        `Contents of ${url}:\n${EXAMPLE_MARKDOWN}`,
    );
});

test("passes Markdown through without a raw-content notice", async () => {
    const url = `${primaryUrl}/markdown`;
    assert.equal(await webFetch({ url }), `Contents of ${url}:\n# Direct\n`);
});

test("preserves JSON and reports its content type", async () => {
    const url = `${primaryUrl}/json`;
    assert.equal(
        await webFetch({ url }),
        "Content type application/json; charset=utf-8 cannot be simplified to markdown. Here is the raw content:\n" +
            `Contents of ${url}:\n{"ok":true}\n`,
    );
});

test("preserves XML and missing-content-type HTML handling", async () => {
    const xmlUrl = `${primaryUrl}/xml`;
    assert.equal(
        await webFetch({ url: xmlUrl }),
        "Content type application/problem+xml cannot be simplified to markdown. Here is the raw content:\n" +
            `Contents of ${xmlUrl}:\n<?xml version="1.0"?><problem>details</problem>`,
    );

    const htmlUrl = `${primaryUrl}/missing-content-type-html`;
    assert.equal(
        await webFetch({ url: htmlUrl }),
        `Contents of ${htmlUrl}:\n# Detected`,
    );
});

test("raw mode preserves HTML and uses the raw prefix", async () => {
    const url = `${primaryUrl}/example`;
    assert.equal(
        await webFetch({ url, raw: true }),
        `Here is the raw content:\nContents of ${url}:\n${EXAMPLE_HTML}`,
    );
});

test("paginates only the response body and emits the built-in note", async () => {
    const url = `${primaryUrl}/text`;
    assert.equal(
        await webFetch({ url, max_length: 5 }),
        "Content type text/plain cannot be simplified to markdown. Here is the raw content:\n" +
            `Contents of ${url}:\nabcde\n\n${truncationNote(5)}`,
    );
    assert.equal(
        await webFetch({ url, start_index: 5, max_length: 5 }),
        "Content type text/plain cannot be simplified to markdown. Here is the raw content:\n" +
            `Contents of ${url}:\nfghij\n\n${truncationNote(10)}`,
    );
});

test("returns the built-in no-more-content marker", async () => {
    const url = `${primaryUrl}/text`;
    assert.equal(
        await webFetch({ url, start_index: 1_000 }),
        "Content type text/plain cannot be simplified to markdown. Here is the raw content:\n" +
            `Contents of ${url}:\n<error>No more content available.</error>`,
    );
});

test("shows the final and original URLs after redirects", async () => {
    const url = `${primaryUrl}/redirect`;
    assert.equal(
        await webFetch({ url }),
        `Contents of ${secondaryUrl}/final (redirected from ${url}):\n# Final`,
    );
});

test("maps HTTP errors to the built-in failure text", async () => {
    const url = `${primaryUrl}/missing`;
    await assert.rejects(
        webFetch({ url }),
        new WebFetchError(`Error: Failed to fetch ${url} - status code 404`),
    );
});

test("validates URL and pagination arguments", async () => {
    assert.throws(() => parseHttpUrl("file:///tmp/a"), /Only HTTP and HTTPS/);
    await assert.rejects(
        webFetch({ url: `${primaryUrl}/text`, max_length: 0 }),
        /max_length must be an integer between 1 and 20000/,
    );
    await assert.rejects(
        webFetch({ url: `${primaryUrl}/text`, raw: "yes" }),
        /raw must be a boolean/,
    );
});

test("returns complete binary content as Base64 when it fits", async () => {
    const url = `${primaryUrl}/binary`;
    assert.equal(
        await webFetch({ url, max_length: 4 }),
        "Content type: application/octet-stream\nByte count: 3\nBase64:\nAP9B",
    );
    assert.equal(
        await webFetch({ url, max_length: 4, raw: true, start_index: 99 }),
        "Content type: application/octet-stream\nByte count: 3\nBase64:\nAP9B",
    );
});

test("writes exact oversized binary bytes to a restricted temporary path", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "web-fetch-test-"));
    try {
        const url = `${primaryUrl}/binary-text`;
        const result = await webFetch(
            { url, max_length: 4 },
            { temporaryRoot, temporaryFileTtlMs: 40 },
        );
        const match = /^Content type: application\/octet-stream\nByte count: 17\nTemporary file: (.+)\nWarning: This file is untrusted\. Do not open or execute it automatically\.$/.exec(
            result,
        );
        assert.ok(match);

        const path = match[1];
        assert.equal(dirname(dirname(path)), temporaryRoot);
        assert.match(basename(path), /^[0-9a-f-]{36}\.bin$/);
        assert.deepEqual(await readFile(path), Buffer.from("must remain bytes"));

        const deadline = Date.now() + 2_000;
        while (Date.now() < deadline) {
            try {
                await stat(path);
                await new Promise((resolve) => setTimeout(resolve, 20));
            } catch (error) {
                assert.equal(error.code, "ENOENT");
                return;
            }
        }
        assert.fail("Temporary binary response was not removed after its TTL.");
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});

test("enforces configurable response, redirect, and timeout limits", async () => {
    await assert.rejects(
        webFetch(
            { url: `${primaryUrl}/large` },
            { maxBodyBytes: 10 },
        ),
        /Response is larger than the 10 byte download limit/,
    );
    await assert.rejects(
        webFetch(
            { url: `${primaryUrl}/redirect-loop` },
            { maxRedirects: 1 },
        ),
        /Request exceeded the 1 redirect limit/,
    );
    await assert.rejects(
        webFetch(
            { url: `${primaryUrl}/slow` },
            { requestTimeoutMs: 20 },
        ),
        /Request timed out after 0.02 seconds/,
    );
});
