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
  assert.match(html, /sheet-table onset-sheet/);
  assert.match(html, /ON-SET/);
  assert.match(html, /Codec \/ Resolution/);
  assert.match(html, /Color Space/);
  assert.match(html, /sheet-table clip-sheet/);
  assert.match(html, /sheet-table storage-sheet/);
  assert.match(html, /sheet-table qc-sheet/);
  assert.match(html, /sheet-table issue-sheet/);
  assert.match(html, /클립 · 씬 매핑/);
  assert.match(html, /새 폴더명/);
  assert.match(html, /\+ 폴더 추가/);
  assert.match(html, /출력 페이지 만들기/);
  assert.match(html, /데이터 내보내기/);
  assert.match(html, /데이터 불러오기/);
  assert.match(html, /전체 데이터 삭제/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders the separate A4 report page", async () => {
  const response = await render("/report");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Digital Imaging Technician Daily Report/);
  assert.match(html, /전체 요약/);
  assert.match(html, /ON-SET CAMERA SETTINGS/);
  assert.match(html, /camera-setup-table/);
  assert.match(html, /씬 커버리지/);
  assert.match(html, /인쇄 \/ PDF 저장/);
});

test("wires Clip / Scene rows into the A4 detail report", async () => {
  const source = await readFile(
    new URL("../app/report/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /CLIP_FALLBACK_ROWS_PER_PAGE\s*=\s*23/);
  assert.match(source, /SCENE_COVERAGE_ROWS_PER_PAGE\s*=\s*20/);
  assert.match(source, /pageSizesFromHeights/);
  assert.match(source, /data-clip-measure-row/);
  assert.match(source, /className="clip-measure-page"/);
  assert.match(source, /className="print-table clip-table"/);
  assert.match(source, /title="클립 · 씬 매핑"/);
  assert.match(source, /sceneCoverageChunks\.map/);
  assert.match(source, /className="coverage-page"/);
  assert.match(source, /씬 커버리지/);
});

test("keeps large folder trees on one balanced two-column A4 page", async () => {
  const source = await readFile(
    new URL("../app/report/page.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /FOLDER_SINGLE_COLUMN_LINE_LIMIT\s*=\s*34/);
  assert.match(source, /function buildFolderTreeLayout/);
  assert.match(source, /rootStarts\.length > 1/);
  assert.match(source, /childStarts\.length > 1/);
  assert.match(source, /folderTreeLayout\.columns\.map/);
  assert.doesNotMatch(source, /chunk\(data\.folderTree\.split/);
  assert.match(css, /\.folder-tree-two-columns\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(css, /--folder-tree-font-size/);
});

test("uses fluid-width two-line fields in input and print tables", async () => {
  const inputSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const reportSource = await readFile(
    new URL("../app/report/page.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(inputSource, /const FluidTextArea = forwardRef/);
  assert.match(inputSource, /className={`fluid-text-control/);
  assert.match(reportSource, /function PrintValue/);
  assert.match(reportSource, /className={`print-fluid-text/);
  assert.match(css, /\.sheet-table\s*\{[^}]*table-layout:\s*auto/s);
  assert.match(css, /\.sheet-table\s*\{[^}]*width:\s*max-content/s);
  assert.match(css, /\.fluid-text-control\s*\{[^}]*field-sizing:\s*content/s);
  assert.match(css, /\.print-fluid-text\s*\{[^}]*-webkit-line-clamp:\s*2/s);
  assert.match(css, /--cell-max:\s*280px/);
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
  assert.match(source, /cameraSetups:\s*\[\]/);
  assert.match(source, /clips:\s*\[\]/);
  assert.match(source, /storage:\s*\[\]/);
  assert.match(source, /issues:\s*\[\]/);
  assert.match(source, /folderTree:\s*""/);
  assert.match(source, /"Ready"[\s\S]*"Hold"[\s\S]*"Pending"/);
  assert.match(source, /ROLL_STATUS_OPTIONS[\s\S]*Ready \(준비 완료\)[\s\S]*Hold \(보류\)/);
  assert.match(source, /STORAGE_GRADE_OPTIONS[\s\S]*Primary \(1차 백업\)[\s\S]*Archive \(장기 보관\)/);
  assert.match(source, /REPORT_EXPORT_FORMAT\s*=\s*"dit-daily-report"/);
  assert.match(source, /function createReportExport/);
  assert.match(source, /function parseReportImport/);
  assert.match(
    source,
    /emptyClip[\s\S]*fileName:[\s\S]*scene:[\s\S]*result:\s*"OK"/,
  );
  assert.match(
    source,
    /emptyCameraSetup[\s\S]*camera:\s*""[\s\S]*body:\s*""[\s\S]*codecResolution:\s*""[\s\S]*fps:\s*""[\s\S]*colorSpace:\s*""[\s\S]*lut:\s*""/,
  );
  assert.doesNotMatch(
    source,
    /Arri Alexa Mini|Sony FX3|Apple Prores 4444|S-Log3 to Rec\.709/i,
  );
});

test("Docker build uses a lightweight standalone runtime", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /npm install --global pnpm@11\.9\.0/);
  assert.doesNotMatch(dockerfile, /corepack/);
  assert.match(dockerfile, /FROM node:22\.13\.0-bookworm-slim AS builder/);
  assert.match(dockerfile, /FROM node:22\.13\.0-bookworm-slim AS runtime/);
  assert.match(
    dockerfile,
    /COPY --from=builder \/app\/dist\/standalone \.\//,
  );
  assert.match(dockerfile, /HOST="0\.0\.0\.0"/);
  assert.match(dockerfile, /NODE_OPTIONS="--max-old-space-size=256"/);
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["pnpm"/);
});

test("vinext emits a standalone Render server", async () => {
  const nextConfig = await readFile(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.match(nextConfig, /output:\s*"standalone"/);
  assert.equal(packageJson.scripts.start, "node dist/standalone/server.js");
  assert.equal(packageJson.dependencies["drizzle-orm"], undefined);
  assert.equal(packageJson.devDependencies["drizzle-kit"], undefined);
  assert.equal(packageJson.devDependencies.tailwindcss, undefined);
});

test("stale GitHub uploads cannot reload the removed Tailwind plugin", async () => {
  const postcssConfig = await readFile(
    new URL("../postcss.config.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(postcssConfig, /@tailwindcss\/postcss/);
  assert.match(postcssConfig, /plugins:\s*\{\s*\}/);
});

test("Render build does not require the local Sites hosting file", async () => {
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    viteConfig,
    /import\s+hostingConfig\s+from\s+["']\.\/\.openai\/hosting\.json["']/,
  );
  assert.match(viteConfig, /existsSync\(hostingConfigUrl\)/);
  assert.match(viteConfig, /d1:\s*null,\s*r2:\s*null/);
});
