import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const syntaxCheck = spawnSync(process.execPath, ["--check", "extension.mjs"], {
    encoding: "utf8",
});
assert.equal(
    syntaxCheck.status,
    0,
    syntaxCheck.stderr || syntaxCheck.stdout || "Bundle syntax check failed.",
);

const source = await readFile("extension.mjs", "utf8");
const externalImports = [
    ...source.matchAll(
        /(?:from\s+|import\s*)["']([^"'./][^"']*)["']/g,
    ),
].map((match) => match[1]);

assert.deepEqual(
    [...new Set(externalImports)],
    ["@github/copilot-sdk/extension"],
    "The bundle must only import the Copilot extension SDK at runtime.",
);
assert.match(source, /overridesBuiltInTool:\s*true/);
assert.match(source, /name:\s*"web_fetch"/);
assert.equal(
    source.includes("((?:\\s+[^>]*?"),
    false,
    "The bundled HTML parser must not contain the vulnerable attribute pattern.",
);
assert.equal(
    source.includes('.replace("|", "\\\\|")'),
    false,
    "The bundle must not retain the first-pipe-only table escaping.",
);
assert.equal(
    source.includes('.replace(/\\|/g, "\\\\|")'),
    true,
    "The bundle must escape every pipe in table cells.",
);

console.log("Bundle is self-contained except for the Copilot extension SDK.");
