// Bundles pure logic modules into n8n Code-node jsCode (Code nodes cannot
// import — sources are inlined at provision time) and writes
// workflows/generate.json. Pure modules stay the single source of truth for
// tests and app-side reuse.
import { readFileSync, writeFileSync } from "node:fs";

const strip = (s) =>
  s.replace(/^import[^\n]*\n/gm, "").replace(/^export\s+/gm, "");

const read = (p) => readFileSync("workflows/src/" + p, "utf8").trimEnd();

const compiler = strip(read("analysis-compiler.js"));
const socialCompiler = strip(read("social-compiler.js"));
const promptBuilder = strip(read("prompt-builder.js"));
const validateBody = read("validate-node.js");
const prepareBody = read("prepare-node.js");

// compileAnalysis returns `normalized` for logging/debugging
const compilerWithNormalized = compiler.replace(
  "return {\n    ok: true,",
  "return {\n    normalized: norm,\n    ok: true,",
);

const wf = JSON.parse(readFileSync("workflows/generate.json", "utf8"));
for (const node of wf.nodes) {
  if (node.id === "prepare") node.parameters.jsCode = promptBuilder + "\n\n" + prepareBody;
  if (node.id === "validate" || node.id === "validate-repair") {
    node.parameters.jsCode = compilerWithNormalized + "\n\n" + socialCompiler + "\n\n" + validateBody;
  }
}

writeFileSync("workflows/generate.json", JSON.stringify(wf, null, 2) + "\n");
console.log("bundled pure modules into generate.json (prepare, validate, validate-repair)");
