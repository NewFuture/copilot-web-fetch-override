import { joinSession } from "@github/copilot-sdk/extension";
import { WEB_FETCH_LIMITS, webFetch } from "./web-fetch.mjs";

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
                        maximum: WEB_FETCH_LIMITS.maxLength,
                        default: WEB_FETCH_LIMITS.defaultMaxLength,
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
                        textResultForLlm: message.startsWith("Error:")
                            ? message
                            : `Error: ${message}`,
                        resultType: "failure",
                    };
                }
            },
        },
    ],
});
