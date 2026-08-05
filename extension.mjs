import { Buffer } from "node:buffer";
import { joinSession } from "@github/copilot-sdk/extension";

const DEFAULT_MAX_LENGTH = 5_000;
const MAX_LENGTH = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 10;

class WebFetchError extends Error {
    constructor(message) {
        super(message);
        this.name = "WebFetchError";
    }
}

function integerArgument(value, fallback, minimum, maximum, name) {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
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

function parseHttpUrl(value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new WebFetchError("url must be a non-empty string.");
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        throw new WebFetchError("url must be a valid absolute URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new WebFetchError("Only HTTP and HTTPS URLs are supported.");
    }
    url.hash = "";
    return url;
}

function redirectStatus(status) {
    return [301, 302, 303, 307, 308].includes(status);
}

async function readLimitedBody(response) {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        throw new WebFetchError(
            `Response is larger than the ${MAX_BODY_BYTES} byte download limit.`,
        );
    }

    if (!response.body) {
        return Buffer.alloc(0);
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
        if (total > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new WebFetchError(
                `Response exceeded the ${MAX_BODY_BYTES} byte download limit.`,
            );
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total);
}

async function requestUrl(initialUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let currentUrl = initialUrl;

    try {
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
            let response;
            try {
                response = await fetch(currentUrl, {
                    method: "GET",
                    redirect: "manual",
                    cache: "no-store",
                    signal: controller.signal,
                    headers: {
                        Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.8",
                        "User-Agent": "GitHub-Copilot-Proxy-Web-Fetch/1.0",
                    },
                });
            } catch (error) {
                if (controller.signal.aborted) {
                    throw new WebFetchError(
                        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
                    );
                }
                const detail =
                    error instanceof Error && error.cause instanceof Error
                        ? error.cause.message
                        : error instanceof Error
                          ? error.message
                          : String(error);
                throw new WebFetchError(`Network request failed: ${detail}`);
            }

            const location = response.headers.get("location");
            if (redirectStatus(response.status) && location) {
                if (redirectCount === MAX_REDIRECTS) {
                    await response.body?.cancel();
                    throw new WebFetchError(
                        `Request exceeded the ${MAX_REDIRECTS} redirect limit.`,
                    );
                }
                await response.body?.cancel();
                currentUrl = parseHttpUrl(new URL(location, currentUrl).href);
                continue;
            }

            const body = await readLimitedBody(response);
            return { response, body, finalUrl: currentUrl };
        }
    } finally {
        clearTimeout(timer);
    }

    throw new WebFetchError("Request did not produce a response.");
}

function decodeBody(body, contentType) {
    const charsetMatch = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType);
    const charset = charsetMatch?.[1] || "utf-8";
    try {
        return new TextDecoder(charset).decode(body);
    } catch {
        return new TextDecoder("utf-8").decode(body);
    }
}

const htmlEntities = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
    ["copy", "(c)"],
    ["reg", "(R)"],
    ["trade", "(TM)"],
    ["hellip", "..."],
    ["ndash", "-"],
    ["mdash", "--"],
    ["lsquo", "'"],
    ["rsquo", "'"],
    ["ldquo", '"'],
    ["rdquo", '"'],
    ["bull", "*"],
    ["middot", "*"],
    ["laquo", "<<"],
    ["raquo", ">>"],
    ["cent", "cent"],
    ["pound", "GBP"],
    ["yen", "JPY"],
    ["euro", "EUR"],
]);

function decodeHtmlEntities(value) {
    return value.replace(
        /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
        (entity, code) => {
            if (code[0] === "#") {
                const hexadecimal = code[1]?.toLowerCase() === "x";
                const number = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
                if (Number.isInteger(number) && number >= 0 && number <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(number);
                    } catch {
                        return entity;
                    }
                }
                return entity;
            }
            return htmlEntities.get(code.toLowerCase()) ?? entity;
        },
    );
}

function htmlAttribute(attributes, name) {
    const expression = new RegExp(
        `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
        "i",
    );
    const match = expression.exec(attributes);
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function stripHtmlTags(value) {
    return value
        .replace(/<br\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\r\n?/g, "\n");
}

function markdownLink(target, baseUrl) {
    const decoded = decodeHtmlEntities(target.trim());
    if (decoded === "" || decoded.startsWith("#")) {
        return decoded;
    }
    try {
        const url = new URL(decoded, baseUrl);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) {
            return url.href;
        }
    } catch {
        return "";
    }
    return "";
}

function htmlToMarkdown(html, baseUrl) {
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
    const title = titleMatch
        ? decodeHtmlEntities(stripHtmlTags(titleMatch[1])).trim()
        : "";
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
    let value = bodyMatch?.[1] ?? html;

    value = value
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(
            /<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
            "",
        )
        .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "");

    const codeBlocks = [];
    value = value.replace(
        /<pre\b([^>]*)>([\s\S]*?)<\/pre\s*>/gi,
        (_match, attributes, contents) => {
            const className = htmlAttribute(attributes, "class");
            const language = /(?:language-|lang-)([\w+-]+)/i.exec(className)?.[1] ?? "";
            const code = decodeHtmlEntities(stripHtmlTags(contents)).trim();
            const fence = code.includes("```") ? "````" : "```";
            const token = `PWF_CODE_BLOCK_${codeBlocks.length}_TOKEN`;
            codeBlocks.push(`\n\n${fence}${language}\n${code}\n${fence}\n\n`);
            return token;
        },
    );

    value = value
        .replace(/<img\b([^>]*)>/gi, (_match, attributes) => {
            const source = markdownLink(htmlAttribute(attributes, "src"), baseUrl);
            if (!source) {
                return "";
            }
            const alt = decodeHtmlEntities(htmlAttribute(attributes, "alt")).trim();
            return `![${alt}](${source})`;
        })
        .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_match, attributes, contents) => {
            const text = stripHtmlTags(contents).trim();
            const target = markdownLink(htmlAttribute(attributes, "href"), baseUrl);
            return target ? `[${text || target}](${target})` : text;
        })
        .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_match, level, contents) => {
            return `\n\n${"#".repeat(Number(level))} ${stripHtmlTags(contents).trim()}\n\n`;
        })
        .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "**$2**")
        .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "*$2*")
        .replace(/<del\b[^>]*>([\s\S]*?)<\/del\s*>/gi, "~~$1~~")
        .replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_match, contents) => {
            const code = decodeHtmlEntities(stripHtmlTags(contents)).trim();
            const delimiter = code.includes("`") ? "``" : "`";
            return `${delimiter}${code}${delimiter}`;
        })
        .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_match, contents) => {
            const quote = stripHtmlTags(contents)
                .split(/\r?\n/)
                .map((line) => `> ${line.trim()}`)
                .join("\n");
            return `\n\n${quote}\n\n`;
        })
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/li\s*>/gi, "\n")
        .replace(/<br\b[^>]*>/gi, "\n")
        .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
        .replace(/<\/?(?:p|div|section|article|main|header|footer|nav|aside|figure|figcaption|ul|ol|dl|dt|dd|details|summary)\b[^>]*>/gi, "\n\n")
        .replace(/<\/?(?:table|thead|tbody|tfoot)\b[^>]*>/gi, "\n\n")
        .replace(/<\/?tr\b[^>]*>/gi, "\n")
        .replace(/<\/?(?:th|td)\b[^>]*>/gi, " | ")
        .replace(/<[^>]+>/g, "");

    value = decodeHtmlEntities(value)
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    for (let index = 0; index < codeBlocks.length; index += 1) {
        value = value.replace(`PWF_CODE_BLOCK_${index}_TOKEN`, codeBlocks[index]);
    }

    value = value.replace(/\n{3,}/g, "\n\n").trim();
    if (title && !value.startsWith(`# ${title}`)) {
        value = `# ${title}\n\n${value}`.trim();
    }
    return value;
}

function isTextContentType(contentType) {
    return (
        contentType === "" ||
        contentType.startsWith("text/") ||
        /(?:json|xml|javascript|xhtml|svg)/i.test(contentType)
    );
}

function formatContent(text, contentType, raw, finalUrl) {
    if (raw) {
        return text;
    }
    if (/text\/html|application\/xhtml\+xml/i.test(contentType) || /^\s*<!doctype html|^\s*<html\b/i.test(text)) {
        return htmlToMarkdown(text, finalUrl);
    }
    if (/(?:application|text)\/(?:[\w.+-]*\+)?json/i.test(contentType)) {
        try {
            return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            return text;
        }
    }
    return text;
}

function paginate(content, startIndex, maxLength) {
    if (startIndex >= content.length) {
        return "";
    }
    const page = content.slice(startIndex, startIndex + maxLength);
    const nextIndex = startIndex + page.length;
    if (nextIndex >= content.length) {
        return page;
    }
    return `${page}\n\n[Content truncated. Continue with start_index=${nextIndex}.]`;
}

async function webFetch(args) {
    const url = parseHttpUrl(args.url);
    const maxLength = integerArgument(
        args.max_length,
        DEFAULT_MAX_LENGTH,
        1,
        MAX_LENGTH,
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
    const { response, body, finalUrl } = await requestUrl(url);
    const contentType = response.headers.get("content-type") ?? "";
    const text = decodeBody(body, contentType);

    if (!response.ok) {
        const detail = text.trim().slice(0, 500);
        throw new WebFetchError(
            `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
        );
    }
    if (!raw && !isTextContentType(contentType)) {
        throw new WebFetchError(
            `Unsupported non-text response type: ${contentType || "unknown"}.`,
        );
    }

    const content = formatContent(text, contentType, raw, finalUrl);
    return paginate(content, startIndex, maxLength);
}

await joinSession({
    tools: [
        {
            name: "web_fetch",
            overridesBuiltInTool: true,
            skipPermission: true,
            defer: "never",
            description:
                "Fetches an HTTP(S) URL without built-in target-address filtering. Supports raw response text, simplified Markdown, and start_index/max_length pagination.",
            parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                    url: {
                        type: "string",
                        description: "Absolute HTTP or HTTPS URL to fetch.",
                    },
                    max_length: {
                        type: "integer",
                        minimum: 1,
                        maximum: MAX_LENGTH,
                        default: DEFAULT_MAX_LENGTH,
                        description: "Maximum number of content characters to return.",
                    },
                    start_index: {
                        type: "integer",
                        minimum: 0,
                        default: 0,
                        description: "Character offset for paginating a previous result.",
                    },
                    raw: {
                        type: "boolean",
                        default: false,
                        description:
                            "Return the original response text instead of simplified Markdown.",
                    },
                },
                required: ["url"],
            },
            handler: async (args) => {
                try {
                    return await webFetch(args);
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    return {
                        textResultForLlm: `web_fetch failed: ${message}`,
                        resultType: "failure",
                    };
                }
            },
        },
    ],
});
