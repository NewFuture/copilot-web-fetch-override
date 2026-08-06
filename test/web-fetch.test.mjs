import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import {
    WebFetchError,
    decodeBody,
    htmlToMarkdown,
    parseHttpUrl,
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
    const htmlBytes = Uint8Array.from(html, (character) => character.charCodeAt(0));
    assert.equal(
        decodeBody(htmlBytes, "text/html; charset=unsupported"),
        '<meta charset="windows-1252"><p>café</p>',
    );
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

test("returns unsupported binary content as decoded raw text", async () => {
    const url = `${primaryUrl}/binary`;
    const result = await webFetch({ url });
    assert.match(
        result,
        /^Content type application\/octet-stream cannot be simplified to markdown\./,
    );
    assert.match(result, /\u0000\uFFFDA$/);
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
