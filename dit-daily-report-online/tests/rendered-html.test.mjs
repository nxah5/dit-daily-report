import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the DIT input page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /DIT Daily/);
  assert.match(html, /오늘의 촬영 데이터를 정리하세요/);
  assert.match(html, /미디어 롤/);
  assert.match(html, /sheet-table roll-sheet/);
  assert.match(html, /sheet-table storage-sheet/);
  assert.match(html, /sheet-table qc-sheet/);
  assert.match(html, /sheet-table issue-sheet/);
  assert.match(html, /새 폴더명/);
  assert.match(html, /\+ 폴더 추가/);
  assert.doesNotMatch(html, /sheet-table clip-sheet|클립 · 씬 매핑/);
  assert.match(html, /출력 페이지 만들기/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders the separate A4 report page", async () => {
  const response = await render("/report");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Digital Imaging Technician Daily Report/);
  assert.match(html, /전체 요약/);
  assert.doesNotMatch(html, /클립 · 씬 매핑|CLIP \/ SCENE/);
  assert.match(html, /인쇄 \/ PDF 저장/);
});

test("declares A4 print output rules", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /@page\s*\{[^}]*size:\s*A4 portrait/s);
  assert.match(css, /\.report-page\s*\{[^}]*height:\s*297mm/s);
  assert.match(css, /\.report-page\s*\{[^}]*width:\s*210mm/s);
  assert.match(css, /page-break-after:\s*always/);
});

test("ships with an empty project data set", async () => {
  const source = await readFile(
    new URL("../app/report-data.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /STORAGE_KEY\s*=\s*"dit-daily-report-v2"/);
  assert.match(source, /rolls:\s*\[\]/);
  assert.match(source, /storage:\s*\[\]/);
  assert.match(source, /issues:\s*\[\]/);
  assert.match(source, /folderTree:\s*""/);
  assert.match(source, /"Ready"[\s\S]*"Hold"[\s\S]*"Pending"/);
});

test("Docker build installs pnpm without Corepack signature verification", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /npm install --global pnpm@11\.9\.0/);
  assert.doesNotMatch(dockerfile, /corepack/);
  assert.match(dockerfile, /HOST="0\.0\.0\.0"/);
  assert.match(dockerfile, /CMD \["pnpm", "run", "start"\]/);
});
