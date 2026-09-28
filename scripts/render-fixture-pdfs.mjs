// Renders three Markdown fixtures to PDF with headless Chromium (uses web/node_modules/playwright).
// Usage: node scripts/render-fixture-pdfs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve("web/package.json"));
const { chromium } = require("playwright");

const docs = ["owner-manual-aria", "owner-manual-summit", "sb-2026-03-slide-out-seal"];
const src = "assistant/fixtures/docs";

// Tiny Markdown-to-HTML: headings, tables, list items, paragraphs. Enough for text extraction.
function html(md) {
  const out = [];
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.split("|").slice(1, -1));
    out.push("<table>" + rows.map((c) => "<tr>" + c.map((x) => `<td>${x.trim()}</td>`).join("") + "</tr>").join("") + "</table>");
    table = [];
  };
  for (const line of md.split("\n")) {
    if (line.startsWith("|")) { table.push(line); continue; }
    flushTable();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push(`<h${h[1].length}>${h[2]}</h${h[1].length}>`);
    else if (/^\s*([-*]|\d+\.)\s+/.test(line)) out.push(`<p>${line.trim()}</p>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  flushTable();
  return `<html><body style="font-family:serif;font-size:11pt;margin:36pt">${out.join("\n")}</body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of docs) {
  await page.setContent(html(readFileSync(`${src}/${name}.md`, "utf8")));
  writeFileSync(`${src}/pdf/${name}.pdf`, await page.pdf({ format: "Letter" }));
  console.log("rendered", `${src}/pdf/${name}.pdf`);
}
await browser.close();
