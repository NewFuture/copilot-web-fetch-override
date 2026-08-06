import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const syntaxCheck = spawnSync(process.execPath, ["--check", "extension.mjs"], {
    encoding: "utf8",
});
assert.equal(
    syntaxCheck.status,
    0,
    syntaxCheck.stderr || syntaxCheck.stdout || "Bundle syntax check failed.",
);

const source = await readFile("extension.mjs", "utf8");
const importAnalysis = await build({
    entryPoints: ["extension.mjs"],
    bundle: false,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
});
const externalImports = Object.values(importAnalysis.metafile.outputs).flatMap(
    (output) => output.imports.map((entry) => entry.path),
);

assert.deepEqual(
    [...new Set(externalImports)].sort(),
    [
        "@github/copilot-sdk/extension",
        "node:crypto",
        "node:fs",
        "node:fs/promises",
        "node:os",
        "node:path",
    ],
    "The bundle must only import the Copilot extension SDK and required Node.js built-ins at runtime.",
);
assert.match(source, /overridesBuiltInTool:\s*(?:true|!0)/);
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
    source.includes('.split("|").join("\\\\|")'),
    true,
    "The bundle must escape every pipe in table cells.",
);
assert.equal(
    source.includes('href.indexOf("javascript:") === 0'),
    false,
    "The bundle must not retain Readability's incomplete URL scheme check.",
);
assert.equal(
    source.includes("(?:javascript|data|vbscript):"),
    true,
    "The bundle must reject executable link schemes before Markdown conversion.",
);

console.log(
    "Bundle is self-contained except for the Copilot extension SDK and Node.js built-ins.",
);
