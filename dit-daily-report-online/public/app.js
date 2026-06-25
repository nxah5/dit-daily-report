"use strict";

const STORAGE_KEY = "dit-daily-report-state-v3";

const defaults = {
  project: {
    name: "",
    folderName: "",
    shootDay: "",
    date: "",
    ditName: "",
    location: "",
    production: "",
    keyCrew: "",
    callTime: "",
    wrapTime: "",
    reportNo: "",
    generatedAt: ""
  },
  cameras: [],
  proxy: {
    codec: "",
    resolution: "",
    lutState: "",
    burnIn: "",
    notes: ""
  },
  fileTree: {
    mode: "auto",
    customText: "",
    notice: "파일 트리는 변경 금지입니다. 백업 후 체크썸으로 데이터 무결성 검사가 완료되므로 파일 위치 변경 시 검증 상태가 깨질 수 있습니다."
  },
  rolls: [],
  destinations: [],
  qc: {
    folderTreeLocked: false,
    checksumVerified: false,
    proxyChecked: false,
    namingChecked: false,
    audioChecked: false,
    handoffReady: false,
    notes: ""
  },
  issues: [],
  handoff: {
    recipient: "",
    method: "",
    time: "",
    items: "",
    signature: "",
    notes: ""
  },
  analysis: {
    totalFiles: 0,
    videoFiles: 0,
    audioFiles: 0,
    proxyFiles: 0,
    totalSizeGB: 0
  }
};

let state = loadState();
const bindSelector = "[data-bind]";
const app = document;

function toDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return deepClone(defaults);
  try {
    return mergeDefaults(deepClone(defaults), JSON.parse(saved));
  } catch {
    return deepClone(defaults);
  }
}

function mergeDefaults(base, extra) {
  Object.keys(extra || {}).forEach((key) => {
    if (Array.isArray(extra[key])) {
      base[key] = extra[key];
    } else if (extra[key] && typeof extra[key] === "object" && base[key]) {
      base[key] = mergeDefaults(base[key], extra[key]);
    } else {
      base[key] = extra[key];
    }
  });
  return base;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getPath(path) {
  return path.split(".").reduce((obj, key) => (obj ? obj[key] : undefined), state);
}

function setPath(path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((obj, key) => obj[key], state);
  target[last] = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function numberValue(value) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatGB(value) {
  const n = numberValue(value);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}GB`;
}

function dateCode(dateText) {
  if (!dateText) return "000000";
  const clean = dateText.replaceAll("-", "");
  return clean.length >= 8 ? clean.slice(2, 8) : clean;
}

function reportTitle() {
  const code = dateCode(state.project.date);
  const name = state.project.name || state.project.folderName || "";
  if (!state.project.date && !name) return "DIT DAILY DATA REPORT";
  return `${code}_${name}_DIT DAILY DATA REPORT`;
}

function totalOffloadGB() {
  return state.rolls.reduce((sum, roll) => sum + numberValue(roll.offloadSizeGB), 0);
}

function uniqueRollNames() {
  return [...new Set(state.rolls.map((roll) => roll.rollName).filter(Boolean))].sort();
}

function uniqueCameras() {
  const labels = state.cameras.map((camera) => camera.label).filter(Boolean);
  const fromRolls = state.rolls.map((roll) => roll.camera).filter(Boolean);
  return [...new Set([...labels, ...fromRolls])];
}

function statusOk() {
  return state.qc.folderTreeLocked && state.qc.checksumVerified && state.qc.proxyChecked && state.rolls.every((roll) => String(roll.status || "").toLowerCase() !== "failed");
}

function syncBoundInputs(root = app) {
  root.querySelectorAll(bindSelector).forEach((el) => {
    const value = getPath(el.dataset.bind);
    if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else {
      el.value = value ?? "";
    }
  });
}

function renderAll() {
  renderCameras();
  renderRolls();
  renderDestinations();
  renderIssues();
  renderMetrics();
  syncBoundInputs();
  renderPreview();
  saveState();
}

function inputCell(path, value, type = "text") {
  return `<input data-array-bind="${path}" type="${type}" value="${escapeHtml(value)}">`;
}

function textareaCell(path, value) {
  return `<textarea data-array-bind="${path}" rows="1">${escapeHtml(value)}</textarea>`;
}

function renderCameras() {
  const tbody = document.querySelector("#cameraTable tbody");
  tbody.innerHTML = state.cameras.map((camera, index) => `
    <tr>
      <td>${inputCell(`cameras.${index}.label`, camera.label)}</td>
      <td>${inputCell(`cameras.${index}.body`, camera.body)}</td>
      <td>${inputCell(`cameras.${index}.codec`, camera.codec)}</td>
      <td>${inputCell(`cameras.${index}.resolution`, camera.resolution)}</td>
      <td>${inputCell(`cameras.${index}.fps`, camera.fps)}</td>
      <td>${inputCell(`cameras.${index}.colorSpace`, camera.colorSpace)}</td>
      <td>${inputCell(`cameras.${index}.lut`, camera.lut)}</td>
      <td><button class="row-delete" data-delete="cameras.${index}" type="button">x</button></td>
    </tr>
  `).join("");
}

function renderRolls() {
  const tbody = document.querySelector("#rollTable tbody");
  tbody.innerHTML = state.rolls.map((roll, index) => `
    <tr>
      <td>${inputCell(`rolls.${index}.rollName`, roll.rollName)}</td>
      <td>${inputCell(`rolls.${index}.camera`, roll.camera)}</td>
      <td>${inputCell(`rolls.${index}.cardSizeGB`, roll.cardSizeGB, "number")}</td>
      <td>${inputCell(`rolls.${index}.offloadSizeGB`, roll.offloadSizeGB, "number")}</td>
      <td>${inputCell(`rolls.${index}.checksum`, roll.checksum)}</td>
      <td>${inputCell(`rolls.${index}.status`, roll.status)}</td>
      <td>${inputCell(`rolls.${index}.clipCount`, roll.clipCount, "number")}</td>
      <td>${textareaCell(`rolls.${index}.source`, roll.source)}</td>
      <td>${textareaCell(`rolls.${index}.destination`, roll.destination)}</td>
      <td>${textareaCell(`rolls.${index}.notes`, roll.notes)}</td>
      <td><button class="row-delete" data-delete="rolls.${index}" type="button">x</button></td>
    </tr>
  `).join("");
}

function renderDestinations() {
  const tbody = document.querySelector("#destinationTable tbody");
  tbody.innerHTML = state.destinations.map((destination, index) => `
    <tr>
      <td>${inputCell(`destinations.${index}.tier`, destination.tier)}</td>
      <td>${inputCell(`destinations.${index}.purpose`, destination.purpose)}</td>
      <td>${inputCell(`destinations.${index}.name`, destination.name)}</td>
      <td>${inputCell(`destinations.${index}.path`, destination.path)}</td>
      <td>${inputCell(`destinations.${index}.status`, destination.status)}</td>
      <td><button class="row-delete" data-delete="destinations.${index}" type="button">x</button></td>
    </tr>
  `).join("");
}

function renderIssues() {
  const tbody = document.querySelector("#issueTable tbody");
  tbody.innerHTML = state.issues.map((issue, index) => `
    <tr>
      <td>${inputCell(`issues.${index}.time`, issue.time)}</td>
      <td>${inputCell(`issues.${index}.level`, issue.level)}</td>
      <td>${inputCell(`issues.${index}.roll`, issue.roll)}</td>
      <td>${textareaCell(`issues.${index}.item`, issue.item)}</td>
      <td>${textareaCell(`issues.${index}.action`, issue.action)}</td>
      <td>${inputCell(`issues.${index}.status`, issue.status)}</td>
      <td><button class="row-delete" data-delete="issues.${index}" type="button">x</button></td>
    </tr>
  `).join("");
}

function renderMetrics() {
  const metrics = document.querySelector("#analysisMetrics");
  const items = [
    { label: "총 백업 데이터", value: formatGB(totalOffloadGB()) },
    { label: "미디어 롤", value: String(state.rolls.length) },
    { label: "비디오 파일", value: String(state.analysis.videoFiles || 0) },
    { label: "프록시 파일", value: String(state.analysis.proxyFiles || 0) }
  ];
  metrics.innerHTML = items.map((item) => `<div class="metric"><b>${escapeHtml(item.value)}</b><span>${escapeHtml(item.label)}</span></div>`).join("");
}

function renderPreview() {
  const preview = document.querySelector("#reportPreview");
  const title = reportTitle();
  const total = totalOffloadGB();
  const statusClass = statusOk() ? "ok" : "warn";
  const statusLabel = statusOk() ? "READY" : "CHECK";
  document.querySelector("#reportMeta").textContent = `${title} / ${formatGB(total)}`;

  preview.innerHTML = `
    <article class="report-sheet">
      <header class="report-header">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(state.project.reportNo)} / ${escapeHtml(state.project.generatedAt || "")}</p>
        </div>
        <div class="report-status ${statusClass}">${statusLabel}</div>
      </header>

      <section class="summary-strip">
        <div><b>${escapeHtml(state.project.shootDay || "-")}</b><span>Shoot Day</span></div>
        <div><b>${escapeHtml(state.project.date || "-")}</b><span>Date</span></div>
        <div><b>${state.rolls.length}</b><span>Media Rolls</span></div>
        <div><b>${formatGB(total)}</b><span>Total Offload</span></div>
      </section>

      <section class="report-block">
        <h3>1. 파일 트리</h3>
        ${renderFileTree()}
        ${state.fileTree.notice ? `<p class="notice">${escapeHtml(state.fileTree.notice)}</p>` : ""}
      </section>

      <section class="report-block">
        <h3>2. 데일리 리포트</h3>
        <div class="report-grid">
          ${kv("프로젝트명", state.project.name)}
          ${kv("촬영 회차", state.project.shootDay)}
          ${kv("촬영 일자", state.project.date)}
          ${kv("DIT / 데이터 매니저", state.project.ditName)}
          ${kv("촬영 장소", state.project.location)}
          ${kv("프로덕션", state.project.production)}
          ${kv("감독 / 촬영감독", state.project.keyCrew)}
          ${kv("콜 / 랩", [state.project.callTime, state.project.wrapTime].filter(Boolean).join(" - "))}
        </div>
      </section>

      <section class="report-block">
        <h3>3. ON-Set</h3>
        <table class="report-table">
          <thead><tr><th>Camera</th><th>Body</th><th>Codec / Resolution</th><th>FPS</th><th>Color Space</th><th>LUT</th></tr></thead>
          <tbody>
            ${state.cameras.map((camera) => `
              <tr>
                <td>${escapeHtml(camera.label)}</td>
                <td>${escapeHtml(camera.body)}</td>
                <td>${escapeHtml([camera.codec, camera.resolution].filter(Boolean).join(" / "))}</td>
                <td>${escapeHtml(camera.fps)}</td>
                <td>${escapeHtml(camera.colorSpace)}</td>
                <td>${escapeHtml(camera.lut)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="report-block">
        <h3>4. Proxy</h3>
        <ul class="report-list">
          <li>${escapeHtml(state.proxy.lutState)}</li>
          <li>${escapeHtml([state.proxy.codec, state.proxy.resolution].filter(Boolean).join(" / "))}</li>
          <li>Burn-in: ${escapeHtml(state.proxy.burnIn)}</li>
          <li>${escapeHtml(state.proxy.notes)}</li>
        </ul>
      </section>

      <section class="report-block">
        <h3>5. Media Roll Log</h3>
        <table class="report-table">
          <thead><tr><th>Roll</th><th>Camera</th><th>Card</th><th>Offload</th><th>Checksum</th><th>Status</th><th>Clips</th><th>Notes</th></tr></thead>
          <tbody>
            ${state.rolls.map((roll) => `
              <tr>
                <td>${escapeHtml(roll.rollName)}</td>
                <td>${escapeHtml(roll.camera)}</td>
                <td>${formatGB(roll.cardSizeGB)}</td>
                <td>${formatGB(roll.offloadSizeGB)}</td>
                <td>${escapeHtml(roll.checksum)}</td>
                <td>${escapeHtml(roll.status)}</td>
                <td>${escapeHtml(roll.clipCount)}</td>
                <td>${escapeHtml(roll.notes)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="report-block">
        <h3>6. 백업 스토리지 목적지</h3>
        <table class="report-table">
          <thead><tr><th>등급</th><th>용도</th><th>스토리지</th><th>경로</th><th>상태</th></tr></thead>
          <tbody>
            ${state.destinations.map((destination) => `
              <tr>
                <td>${escapeHtml(destination.tier)}</td>
                <td>${escapeHtml(destination.purpose)}</td>
                <td>${escapeHtml(destination.name)}</td>
                <td>${escapeHtml(destination.path)}</td>
                <td>${escapeHtml(destination.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="muted">총 데이터 크기(백업 스토리지 당): ${formatGB(total)}</p>
      </section>

      <section class="report-block">
        <h3>7. QC Checklist</h3>
        <table class="report-table">
          <tbody>
            ${qcRow("파일 트리 고정", state.qc.folderTreeLocked)}
            ${qcRow("체크썸 검증 완료", state.qc.checksumVerified)}
            ${qcRow("프록시 확인", state.qc.proxyChecked)}
            ${qcRow("네이밍 확인", state.qc.namingChecked)}
            ${qcRow("오디오 확인", state.qc.audioChecked)}
            ${qcRow("인계 준비", state.qc.handoffReady)}
          </tbody>
        </table>
        ${state.qc.notes ? `<p>${escapeHtml(state.qc.notes)}</p>` : ""}
      </section>

      ${renderIssuePreview()}
      ${renderHandoffPreview()}
    </article>
  `;
}

function renderFileTree() {
  if (state.fileTree.mode === "custom" && state.fileTree.customText.trim()) {
    return `<pre class="tree-pre">${escapeHtml(state.fileTree.customText.trim())}</pre>`;
  }
  return renderAutoFileTree();
}

function renderAutoFileTree() {
  const rolls = uniqueRollNames();
  const cameras = uniqueCameras();
  const rootName = state.project.folderName || state.project.name || "";
  const shootDay = state.project.shootDay || "";

  if (!rootName && !shootDay && !rolls.length && !cameras.length) {
    return `<p class="muted">-</p>`;
  }

  const rollItems = rolls.map((roll) => `
    <li>${escapeHtml(roll)}
      <ul>
        <li>1_Video<ul>${cameras.map((camera) => `<li>${escapeHtml(camera)}</li>`).join("")}</ul></li>
        <li>2_Audio</li>
      </ul>
    </li>
  `).join("");
  const proxyItems = rolls.map((roll) => `
    <li>${escapeHtml(roll)}
      <ul><li>1_Video<ul>${cameras.map((camera) => `<li>${escapeHtml(camera)}</li>`).join("")}</ul></li></ul>
    </li>
  `).join("");
  return `
    <ul class="tree-list">
      <li>${escapeHtml(rootName || "-")}
        <ul>
          <li>${escapeHtml(shootDay || "-")}
            <ul>
              <li>OCF<ul>${rollItems}</ul></li>
              <li>Proxy (${escapeHtml(state.proxy.codec)} ${escapeHtml(state.proxy.resolution)})<ul>${proxyItems}</ul></li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  `;
}

function autoFileTreeText() {
  const rolls = uniqueRollNames();
  const cameras = uniqueCameras();
  const lines = [
    state.project.folderName || state.project.name || "",
    `  ${state.project.shootDay || ""}`,
    "    OCF"
  ];
  rolls.forEach((roll) => {
    lines.push(`      ${roll}`);
    lines.push("        1_Video");
    cameras.forEach((camera) => lines.push(`          ${camera}`));
    lines.push("        2_Audio");
  });
  lines.push(`    Proxy (${[state.proxy.codec, state.proxy.resolution].filter(Boolean).join(" ")})`);
  rolls.forEach((roll) => {
    lines.push(`      ${roll}`);
    lines.push("        1_Video");
    cameras.forEach((camera) => lines.push(`          ${camera}`));
  });
  return lines.join("\n");
}

function kv(label, value) {
  return `<div class="kv"><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "-")}</span></div>`;
}

function qcRow(label, checked) {
  return `<tr><th>${escapeHtml(label)}</th><td>${checked ? "OK" : "CHECK"}</td></tr>`;
}

function renderIssuePreview() {
  if (!state.issues.length) return "";
  return `
    <section class="report-block">
      <h3>8. 이슈 로그</h3>
      <table class="report-table">
        <thead><tr><th>시간</th><th>등급</th><th>Roll</th><th>내용</th><th>조치</th><th>상태</th></tr></thead>
        <tbody>${state.issues.map((issue) => `
          <tr>
            <td>${escapeHtml(issue.time)}</td>
            <td>${escapeHtml(issue.level)}</td>
            <td>${escapeHtml(issue.roll)}</td>
            <td>${escapeHtml(issue.item)}</td>
            <td>${escapeHtml(issue.action)}</td>
            <td>${escapeHtml(issue.status)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function renderHandoffPreview() {
  return `
    <section class="report-block">
      <h3>9. 인계 정보</h3>
      <div class="report-grid">
        ${kv("수령자", state.handoff.recipient)}
        ${kv("인계 방식", state.handoff.method)}
        ${kv("인계 시각", state.handoff.time)}
        ${kv("확인", state.handoff.signature)}
      </div>
      <p><b>인계 항목</b>: ${escapeHtml(state.handoff.items || "-")}</p>
      ${state.handoff.notes ? `<p>${escapeHtml(state.handoff.notes)}</p>` : ""}
      <div class="signature-line">
        <div>DIT / Data Manager</div>
        <div>Recipient</div>
      </div>
    </section>
  `;
}

function addArrayItem(name, item) {
  state[name].push(item);
  renderAll();
}

function deleteArrayItem(path) {
  const [name, indexText] = path.split(".");
  const index = Number(indexText);
  if (Array.isArray(state[name])) {
    state[name].splice(index, 1);
    renderAll();
  }
}

function emptyRoll() {
  return { rollName: "", camera: "", cardSizeGB: "", offloadSizeGB: "", checksum: "", status: "", clipCount: "", source: "", destination: "", notes: "" };
}

function parseCSVLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function importCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return;
  const headers = parseCSVLine(lines[0]).map(normalizeKey);
  const map = {
    rollname: "rollName",
    roll: "rollName",
    camera: "camera",
    cardsizegb: "cardSizeGB",
    cardsize: "cardSizeGB",
    offloadsizegb: "offloadSizeGB",
    offloadsize: "offloadSizeGB",
    checksum: "checksum",
    status: "status",
    clips: "clipCount",
    clipcount: "clipCount",
    source: "source",
    destination: "destination",
    notes: "notes",
    note: "notes"
  };
  state.rolls = lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const roll = emptyRoll();
    headers.forEach((header, index) => {
      const key = map[header];
      if (key) roll[key] = cells[index] ?? "";
    });
    return roll;
  }).filter((roll) => roll.rollName || roll.camera || roll.offloadSizeGB);
  renderAll();
}

function analyzeFiles(fileList) {
  const files = Array.from(fileList);
  const groups = new Map();
  const videoExt = new Set([".mov", ".mp4", ".mxf", ".ari", ".braw", ".r3d"]);
  const audioExt = new Set([".wav", ".aif", ".aiff", ".mp3"]);
  let totalSize = 0;
  let videoFiles = 0;
  let audioFiles = 0;
  let proxyFiles = 0;
  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const lower = path.toLowerCase();
    const ext = extension(file.name);
    const isVideo = videoExt.has(ext);
    const isAudio = audioExt.has(ext);
    const isProxy = lower.includes("/proxy/") || lower.includes("_proxy") || lower.includes("proxy");
    const rollName = detectRoll(path);
    const camera = detectCamera(path);
    totalSize += file.size;
    if (isVideo) videoFiles += 1;
    if (isAudio) audioFiles += 1;
    if (isProxy) proxyFiles += 1;
    if (!rollName || isProxy || (!isVideo && !isAudio)) return;
    const key = `${rollName}|${camera}`;
    const group = groups.get(key) || { rollName, camera, bytes: 0, clips: 0, source: path.split("/").slice(0, -1).join("/") };
    group.bytes += file.size;
    if (isVideo) group.clips += 1;
    groups.set(key, group);
  });
  state.analysis = { totalFiles: files.length, videoFiles, audioFiles, proxyFiles, totalSizeGB: totalSize / 1e9 };
  mergeAnalyzedRolls([...groups.values()]);
  renderAll();
}

function extension(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function detectRoll(path) {
  const segment = path.split("/").find((part) => /^(r|a|b|c)\d{3,}$/i.test(part));
  if (segment) return segment.toUpperCase();
  const match = path.match(/\b((R|A|B|C)\d{3,})\b/i);
  return match ? match[1].toUpperCase() : "";
}

function detectCamera(path) {
  const lower = path.toLowerCase();
  if (lower.includes("a cam") || lower.includes("/a/") || /\ba\d{3,}/i.test(path)) return "A Cam";
  if (lower.includes("b cam") || lower.includes("/b/") || /\bb\d{3,}/i.test(path)) return "B Cam";
  if (lower.includes("c cam") || lower.includes("/c/") || /\bc\d{3,}/i.test(path)) return "C Cam";
  const found = state.cameras.find((camera) => lower.includes(String(camera.label || "").toLowerCase()));
  return found ? found.label : "Unknown";
}

function mergeAnalyzedRolls(groups) {
  const existing = new Map(state.rolls.map((roll) => [`${roll.rollName}|${roll.camera}`, roll]));
  groups.forEach((group) => {
    const key = `${group.rollName}|${group.camera}`;
    const sizeGB = (group.bytes / 1e9).toFixed(2);
    if (existing.has(key)) {
      const roll = existing.get(key);
      roll.offloadSizeGB = sizeGB;
      roll.cardSizeGB = roll.cardSizeGB || sizeGB;
      roll.clipCount = String(group.clips);
      roll.source = group.source;
    } else {
      state.rolls.push({ ...emptyRoll(), rollName: group.rollName, camera: group.camera, cardSizeGB: sizeGB, offloadSizeGB: sizeGB, clipCount: String(group.clips), source: group.source });
    }
  });
}

function postToNative(message) {
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.reportApp;
  if (!handler) return false;
  handler.postMessage(message);
  return true;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches(bindSelector)) {
    setPath(target.dataset.bind, target.type === "checkbox" ? target.checked : target.value);
    renderPreview();
    renderMetrics();
    saveState();
  }
  if (target.matches("[data-array-bind]")) {
    setPath(target.dataset.arrayBind, target.value);
    renderPreview();
    renderMetrics();
    saveState();
  }
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (target.matches(".tab")) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    target.classList.add("active");
    document.querySelector(`#tab-${target.dataset.tab}`).classList.add("active");
  }
  if (target.dataset.delete) deleteArrayItem(target.dataset.delete);
});

document.querySelector("#addCamera").addEventListener("click", () => addArrayItem("cameras", { label: "", body: "", codec: "", resolution: "", fps: "", colorSpace: "", lut: "" }));
document.querySelector("#addRoll").addEventListener("click", () => addArrayItem("rolls", emptyRoll()));
document.querySelector("#addDestination").addEventListener("click", () => addArrayItem("destinations", { tier: "", purpose: "", name: "", path: "", status: "" }));
document.querySelector("#addIssue").addEventListener("click", () => addArrayItem("issues", { time: "", level: "", roll: "", item: "", action: "", status: "" }));

document.querySelector("#clearRolls").addEventListener("click", () => {
  state.rolls = [];
  state.analysis = deepClone(defaults.analysis);
  renderAll();
});

document.querySelector("#copyAutoFileTree").addEventListener("click", () => {
  state.fileTree.mode = "custom";
  state.fileTree.customText = autoFileTreeText();
  renderAll();
});

document.querySelector("#folderInput").addEventListener("change", (event) => {
  analyzeFiles(event.target.files);
  event.target.value = "";
});

document.querySelector("#csvInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) importCSV(await file.text());
  event.target.value = "";
});

document.querySelector("#jsonInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state = mergeDefaults(deepClone(defaults), JSON.parse(await file.text()));
    renderAll();
  } catch {
    window.alert("JSON 파일을 읽을 수 없습니다.");
  }
  event.target.value = "";
});

document.querySelector("#exportJson").addEventListener("click", () => {
  const filename = `${reportTitle()}.json`;
  const content = JSON.stringify(state, null, 2);
  if (!postToNative({ action: "saveJson", filename, content })) {
    download(filename, content, "application/json");
  }
});

document.querySelector("#printReport").addEventListener("click", () => {
  state.project.generatedAt = toDatetimeLocal(new Date());
  syncBoundInputs();
  renderPreview();
  saveState();
  if (!postToNative({ action: "print" })) window.print();
});

renderAll();
