// Injects the Validate/Repair jsCode sources into workflows/generate.json.
// Keeps prompt/compiler logic in readable .js files; generate.json stays the
// n8n-importable artifact with placeholders only.
import { readFileSync, writeFileSync } from "node:fs";

const wf = JSON.parse(readFileSync("workflows/generate.json", "utf8"));
const validate = readFileSync("workflows/src/validate-compiler.js", "utf8").trimEnd();
const repair = readFileSync("workflows/src/repair-v2.js", "utf8").trimEnd();

for (const node of wf.nodes) {
  if (node.id === "validate") node.parameters.jsCode = validate;
  if (node.id === "validate-repair") node.parameters.jsCode = repair;
}

writeFileSync("workflows/generate.json", JSON.stringify(wf, null, 2) + "\n");
console.log("injected validate + repair sources into workflows/generate.json");
