import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom/worker";
import { NodeHtmlMarkdown } from "node-html-markdown";

export const WEB_FETCH_LIMITS = Object.freeze({
    defaultMaxLength: 5_000,
    maxLength: 20_000,
    requestTimeoutMs: 30_000,
    maxBodyBytes: 5 * 1024 * 1024,
    maxRedirects: 10,
});

export class WebFetchError extends Error {
    constructor(message) {
        super(message);
        this.name = "WebFetchError";
    }
}

const markdownConverter = new NodeHtmlMarkdown();
const READABILITY_MAX_ELEMENTS = 100_000;
const READABILITY_MIN_TEXT_LENGTH = 500;
const ENCODING_SNIFF_BYTES = 2_048;

function integerArgument(value, fallback, minimum, maximum, name) {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new WebFetchError(
            `${name} must be an integer between ${minimum} and ${maximum}.`,
        );
    }
    return value;
}

function booleanArgument(value, fallback, name) {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== "boolean") {
        throw new WebFetchError(`${name} must be a boolean.`);
    }
    return value;
}

export function parseHttpUrl(value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new WebFetchError("url must be a non-empty string.");
    }

    const displayUrl = value.trim();
    let url;
    try {
        url = new URL(displayUrl);
    } catch {
        throw new WebFetchError("url must be a valid absolute URL.");
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new WebFetchError("Only HTTP and HTTPS URLs are supported.");
    }

    url.hash = "";
    return {
        url,
        displayUrl: displayUrl.replace(/#.*$/s, ""),
    };
}

function parseRedirectUrl(location, baseUrl) {
    let url;
    try {
        url = new URL(location, baseUrl);
    } catch {
        throw new WebFetchError(`Error: Invalid redirect URL: ${location}`);
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new WebFetchError(
            `Error: Redirect target must use HTTP or HTTPS: ${url.href}`,
        );
    }
    url.hash = "";
    return url;
}

function redirectStatus(status) {
    return [301, 302, 303, 307, 308].includes(status);
}

function errorDetail(error) {
    if (error instanceof Error && error.cause instanceof Error) {
        return error.cause.message;
    }
    return error instanceof Error ? error.message : String(error);
}

async function cancelBody(response) {
    if (response.body) {
        await response.body.cancel();
    }
}

async function readLimitedBody(response, maxBodyBytes) {
    const declaredLength = response.headers.get("content-length");
    if (/^\d+$/.test(declaredLength ?? "") && Number(declaredLength) > maxBodyBytes) {
        await cancelBody(response);
        throw new WebFetchError(
            `Error: Response is larger than the ${maxBodyBytes} byte download limit.`,
        );
    }

    if (!response.body) {
        return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > maxBodyBytes) {
            await reader.cancel();
            throw new WebFetchError(
                `Error: Response exceeded the ${maxBodyBytes} byte download limit.`,
            );
        }
        chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export async function requestUrl(initial, raw, options = {}) {
    const {
        fetchImpl = globalThis.fetch,
        requestTimeoutMs = WEB_FETCH_LIMITS.requestTimeoutMs,
        maxBodyBytes = WEB_FETCH_LIMITS.maxBodyBytes,
        maxRedirects = WEB_FETCH_LIMITS.maxRedirects,
    } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let currentUrl = initial.url;
    let redirected = false;

    try {
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
            const response = await fetchImpl(currentUrl, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers: {
                    Accept: raw
                        ? "text/html, */*"
                        : "text/markdown, text/html, */*",
                    "User-Agent": "GitHubCopilotRuntime-WebFetch",
                },
            });

            const location = response.headers.get("location");
            if (redirectStatus(response.status) && location) {
                if (redirectCount === maxRedirects) {
                    await cancelBody(response);
                    throw new WebFetchError(
                        `Error: Request exceeded the ${maxRedirects} redirect limit.`,
                    );
                }
                await cancelBody(response);
                currentUrl = parseRedirectUrl(location, currentUrl);
                redirected = true;
                continue;
            }

            const responseDisplayUrl = redirected ? currentUrl.href : initial.displayUrl;
            if (!response.ok) {
                await cancelBody(response);
                throw new WebFetchError(
                    `Error: Failed to fetch ${responseDisplayUrl} - status code ${response.status}`,
                );
            }

            const body = await readLimitedBody(response, maxBodyBytes);
            return {
                body,
                contentType: response.headers.get("content-type")?.trim() ?? "",
                finalDisplayUrl: responseDisplayUrl,
                originalDisplayUrl: initial.displayUrl,
                redirected,
            };
        }
    } catch (error) {
        if (error instanceof WebFetchError) {
            throw error;
        }
        if (controller.signal.aborted) {
            throw new WebFetchError(
                `Error: Request timed out after ${requestTimeoutMs / 1000} seconds.`,
            );
        }
        throw new WebFetchError(
            `Error: Failed to fetch ${initial.displayUrl}: ${errorDetail(error)}`,
        );
    } finally {
        clearTimeout(timer);
    }

    throw new WebFetchError("Error: Request did not produce a response.");
}

function charsetValue(value) {
    const match =
        /charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s"'/>]+))/i.exec(value);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function bomEncoding(body) {
    if (
        body.length >= 3 &&
        body[0] === 0xef &&
        body[1] === 0xbb &&
        body[2] === 0xbf
    ) {
        return "utf-8";
    }
    if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) {
        return "utf-16le";
    }
    if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
        return "utf-16be";
    }
    return "";
}

function markupEncoding(body, contentType) {
    const type = mediaType(contentType);
    const isMarkup =
        type === "" ||
        ["text/html", "application/xhtml+xml", "text/xml", "application/xml"].includes(
            type,
        ) ||
        type.endsWith("+xml");
    if (!isMarkup) {
        return "";
    }

    let head = "";
    for (const byte of body.subarray(0, ENCODING_SNIFF_BYTES)) {
        head += String.fromCharCode(byte);
    }

    const xmlDeclaration = /<\?xml\b[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(
        head,
    );
    if (xmlDeclaration) {
        return xmlDeclaration[1].trim();
    }

    for (const metaTag of head.match(/<meta\b[^>]*>/gi) ?? []) {
        const charset = charsetValue(metaTag);
        if (charset) {
            return charset;
        }
    }
    return "";
}

export function decodeBody(body, contentType) {
    const encodings = [
        bomEncoding(body),
        charsetValue(contentType),
        markupEncoding(body, contentType),
        "utf-8",
    ];
    for (const encoding of encodings) {
        if (!encoding) {
            continue;
        }
        try {
            return new TextDecoder(encoding).decode(body);
        } catch {
            // Try the next declared or inferred encoding.
        }
    }
    return new TextDecoder().decode(body);
}

function normalizedText(value) {
    return value
        .replace(/^#{1,6}\s+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("en-US");
}

function documentTitle(html) {
    const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
    if (!match) {
        return "";
    }
    return markdownConverter
        .translate(match[1])
        .replace(/\s+/g, " ")
        .trim();
}

function markdownWithTitle(title, markdown, heading = false) {
    if (!title) {
        return markdown;
    }

    const firstLine = markdown.split(/\r?\n/, 1)[0];
    if (normalizedText(firstLine) === normalizedText(title)) {
        if (heading && !/^#\s+/.test(firstLine)) {
            return `# ${firstLine.replace(/^#{1,6}\s+/, "")}${markdown.slice(firstLine.length)}`;
        }
        return markdown;
    }
    const formattedTitle = heading ? `# ${title}` : title;
    return markdown ? `${formattedTitle}\n\n${markdown}` : formattedTitle;
}

function readableMarkdown(html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const article = new Readability(document, {
        maxElemsToParse: READABILITY_MAX_ELEMENTS,
    }).parse();
    const textContent = article?.textContent?.trim() ?? "";
    if (
        !article?.content ||
        textContent.length < READABILITY_MIN_TEXT_LENGTH
    ) {
        return "";
    }
    const markdown = markdownConverter.translate(article.content).trim();
    if (!markdown) {
        return "";
    }
    const title = article.title?.replace(/\s+/g, " ").trim() || documentTitle(html);
    return markdownWithTitle(title, markdown, true);
}

export function htmlToMarkdown(html) {
    try {
        const readable = readableMarkdown(html);
        if (readable) {
            return readable;
        }
    } catch {
        // Readability is best effort; preserve the full-document conversion fallback.
    }

    const title = documentTitle(html);
    const markdown = markdownConverter.translate(html).trim();
    return markdownWithTitle(title, markdown);
}

function mediaType(contentType) {
    return contentType.split(";", 1)[0].trim().toLowerCase();
}

function markdownContentType(contentType) {
    const type = mediaType(contentType);
    return [
        "text/markdown",
        "text/x-markdown",
        "application/markdown",
    ].includes(type) || type.endsWith("+markdown");
}

function htmlContentType(contentType, text) {
    const type = mediaType(contentType);
    if (["text/html", "application/xhtml+xml"].includes(type)) {
        return true;
    }
    return type === "" && /^\s*(?:<!doctype\s+html|<html\b)/i.test(text);
}

export function simplifyContent(text, contentType, raw) {
    if (raw) {
        return { content: text, rawReason: "requested" };
    }
    if (markdownContentType(contentType)) {
        return { content: text, rawReason: null };
    }
    if (htmlContentType(contentType, text)) {
        return { content: htmlToMarkdown(text), rawReason: null };
    }
    return { content: text, rawReason: "unsupported" };
}

export function paginate(content, startIndex, maxLength) {
    if (startIndex >= content.length) {
        return "<error>No more content available.</error>";
    }

    const page = content.slice(startIndex, startIndex + maxLength);
    const nextIndex = startIndex + page.length;
    if (nextIndex >= content.length) {
        return page;
    }
    return `${page}\n\n<note>Content truncated. Call the fetch tool with a start_index of ${nextIndex} to get more content.</note>`;
}

function contentsHeader(result) {
    if (result.redirected) {
        return `Contents of ${result.finalDisplayUrl} (redirected from ${result.originalDisplayUrl}):`;
    }
    return `Contents of ${result.originalDisplayUrl}:`;
}

export function formatResult(result, raw, startIndex, maxLength) {
    const text = decodeBody(result.body, result.contentType);
    const simplified = simplifyContent(text, result.contentType, raw);
    const page = paginate(simplified.content, startIndex, maxLength);
    const header = contentsHeader(result);

    if (simplified.rawReason === "requested") {
        return `Here is the raw content:\n${header}\n${page}`;
    }
    if (simplified.rawReason === "unsupported") {
        const type = result.contentType || "unknown";
        return `Content type ${type} cannot be simplified to markdown. Here is the raw content:\n${header}\n${page}`;
    }
    return `${header}\n${page}`;
}

export async function webFetch(args, requestOptions = {}) {
    const initial = parseHttpUrl(args.url);
    const maxLength = integerArgument(
        args.max_length,
        WEB_FETCH_LIMITS.defaultMaxLength,
        1,
        WEB_FETCH_LIMITS.maxLength,
        "max_length",
    );
    const startIndex = integerArgument(
        args.start_index,
        0,
        0,
        Number.MAX_SAFE_INTEGER,
        "start_index",
    );
    const raw = booleanArgument(args.raw, false, "raw");
    const result = await requestUrl(initial, raw, requestOptions);
    return formatResult(result, raw, startIndex, maxLength);
}
