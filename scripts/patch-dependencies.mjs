import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const patches = [
    {
        path: "node_modules/node-html-parser/dist/nodes/html.js",
        before: String.raw`var kMarkupPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][-.:0-9_a-zA-Z]*)((?:\s+[^>]*?(?:(?:'[^']*')|(?:"[^"]*"))?)*)\s*(\/?)>/g;`,
        after: String.raw`var kMarkupPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][-.:0-9_a-zA-Z]*)((?:[^>"'/]|"[^"]*"|'[^']*'|\/(?!\s*>))*)\s*(\/?)>/g;`,
    },
    {
        path: "node_modules/node-html-markdown/dist/config.js",
        before: String.raw`.replace('|', '\\|')`,
        after: String.raw`.split('|').join('\\|')`,
    },
];

for (const patch of patches) {
    const path = resolve(patch.path);
    const source = await readFile(path, "utf8");

    if (source.includes(patch.after)) {
        continue;
    }

    const occurrences = source.split(patch.before).length - 1;
    if (occurrences !== 1) {
        throw new Error(
            `Expected one patch target in ${patch.path}, found ${occurrences}.`,
        );
    }

    await writeFile(path, source.replace(patch.before, patch.after), "utf8");
    console.log(`Patched ${patch.path}`);
}
