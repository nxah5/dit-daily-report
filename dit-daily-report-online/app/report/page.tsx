"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import Link from "next/link";
import {
  getReportMetrics,
  initialReportData,
  loadReportData,
} from "../report-data";
import type { CameraSetup, ClipLog, ReportData } from "../report-data";

const CLIP_FALLBACK_ROWS_PER_PAGE = 23;
const SCENE_COVERAGE_ROWS_PER_PAGE = 20;
const CAMERA_SETUP_ROWS_PER_PAGE = 16;
const FOLDER_SINGLE_COLUMN_LINE_LIMIT = 34;

function chunk<T>(rows: T[], size: number): T[][] {
  if (rows.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function pageSizesFromHeights(rowHeights: number[], availableHeight: number) {
  const pageSizes: number[] = [];
  let currentHeight = 0;
  let currentSize = 0;

  rowHeights.forEach((rowHeight) => {
    if (
      currentSize > 0 &&
      currentHeight + rowHeight > availableHeight
    ) {
      pageSizes.push(currentSize);
      currentHeight = 0;
      currentSize = 0;
    }
    currentHeight += rowHeight;
    currentSize += 1;
  });

  if (currentSize > 0) pageSizes.push(currentSize);
  return pageSizes;
}

function folderLineDepth(line: string) {
  const normalized = line.replaceAll("\t", "    ");
  const connectorIndex = normalized.search(/[├└] /);
  return connectorIndex >= 0
    ? Math.floor(connectorIndex / 4) + 1
    : Math.floor((normalized.match(/^ */)?.[0].length ?? 0) / 4);
}

function estimatedFolderLines(lines: string[], columnCount: 1 | 2) {
  const characterLimit = columnCount === 1 ? 88 : 42;
  return lines.reduce(
    (total, line) =>
      total + Math.max(1, Math.ceil(Array.from(line).length / characterLimit)),
    0,
  );
}

function splitGroupsNearHalf(groups: string[][]) {
  if (groups.length < 2) return 1;
  const weights = groups.map((group) => estimatedFolderLines(group, 2));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let bestIndex = 1;
  let bestDifference = Number.POSITIVE_INFINITY;
  let leftWeight = 0;

  for (let index = 1; index < groups.length; index += 1) {
    leftWeight += weights[index - 1];
    const difference = Math.abs(total - leftWeight * 2);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function groupsFromBoundaries(lines: string[], starts: number[]) {
  return starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? lines.length),
  );
}

function buildFolderTreeLayout(value: string) {
  const lines = value.split("\n").filter((line) => line.trim());
  if (!lines.length) {
    return {
      columns: [["폴더트리 미입력"]],
      fontSizePt: 7,
      lineHeight: 1.5,
    };
  }

  if (
    estimatedFolderLines(lines, 1) <= FOLDER_SINGLE_COLUMN_LINE_LIMIT
  ) {
    return { columns: [lines], fontSizePt: 7, lineHeight: 1.5 };
  }

  const rootStarts = lines
    .map((line, index) => (folderLineDepth(line) === 0 ? index : -1))
    .filter((index) => index >= 0);
  let columns: string[][];

  if (rootStarts.length > 1) {
    const rootGroups = groupsFromBoundaries(lines, rootStarts);
    const splitIndex = splitGroupsNearHalf(rootGroups);
    columns = [
      rootGroups.slice(0, splitIndex).flat(),
      rootGroups.slice(splitIndex).flat(),
    ];
  } else {
    const rootLine = lines[0];
    const childStarts = lines
      .map((line, index) =>
        index > 0 && folderLineDepth(line) === 1 ? index : -1,
      )
      .filter((index) => index >= 0);

    if (childStarts.length > 1) {
      const childGroups = groupsFromBoundaries(lines, childStarts);
      const splitIndex = splitGroupsNearHalf(childGroups);
      columns = [
        [rootLine, ...childGroups.slice(0, splitIndex).flat()],
        [`${rootLine} · CONT.`, ...childGroups.slice(splitIndex).flat()],
      ];
    } else {
      const target = estimatedFolderLines(lines, 2) / 2;
      let splitIndex = 1;
      let accumulated = estimatedFolderLines([lines[0]], 2);
      let bestScore = Number.POSITIVE_INFINITY;

      for (let index = 1; index < lines.length; index += 1) {
        const depthPenalty = folderLineDepth(lines[index]) * 1.5;
        const score = Math.abs(target - accumulated) + depthPenalty;
        if (score < bestScore) {
          bestScore = score;
          splitIndex = index;
        }
        accumulated += estimatedFolderLines([lines[index]], 2);
      }

      columns = [
        lines.slice(0, splitIndex),
        [`${rootLine} · CONT.`, ...lines.slice(splitIndex)],
      ];
    }
  }

  const maxColumnLines = Math.max(
    ...columns.map((column) => estimatedFolderLines(column, 2)),
  );
  const lineHeight = maxColumnLines > 52 ? 1.25 : 1.36;
  const fontSizePt = Math.max(
    3.8,
    Math.min(7, 430 / (maxColumnLines * lineHeight)),
  );

  return { columns, fontSizePt, lineHeight };
}

function statusTone(value: string) {
  const normalized = value.toUpperCase();
  if (
    normalized.includes("PASS") ||
    normalized === "OK" ||
    normalized.includes("READY")
  ) {
    return "tone-good";
  }
  if (
    normalized.includes("CHECK") ||
    normalized.includes("PENDING") ||
    normalized.includes("검증")
  ) {
    return "tone-warn";
  }
  if (
    normalized.includes("HOLD") ||
    normalized.includes("FAIL") ||
    normalized === "NG"
  ) {
    return "tone-bad";
  }
  return "tone-neutral";
}

function PrintValue({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const value =
    children === null || children === undefined || children === ""
      ? "—"
      : children;
  return (
    <span className={`print-fluid-text ${className}`.trim()}>
      {value}
    </span>
  );
}

function Page({
  data,
  pageNumber,
  totalPages,
  section,
  title,
  children,
  className = "",
  contentRef,
}: {
  data: ReportData;
  pageNumber: number;
  totalPages: number;
  section: string;
  title: string;
  children: ReactNode;
  className?: string;
  contentRef?: Ref<HTMLDivElement>;
}) {
  return (
    <section className={`report-page ${className}`}>
      <header className="print-header">
        <div>
          <span>{section}</span>
          <strong>{title}</strong>
        </div>
        <div>
          <span>{data.project.title}</span>
          <strong>{data.project.shootDay}</strong>
        </div>
      </header>
      <div className="print-content" ref={contentRef}>
        {children}
      </div>
      <footer className="print-footer">
        <span>DIT DAILY REPORT · {data.project.reportId}</span>
        <span>
          {String(pageNumber).padStart(2, "0")} /{" "}
          {String(totalPages).padStart(2, "0")}
        </span>
      </footer>
    </section>
  );
}

function ClipTable({
  rows,
  measurement = false,
}: {
  rows: ClipLog[];
  measurement?: boolean;
}) {
  return (
    <table className="print-table clip-table">
      <thead>
        <tr>
          <th>Clip File Name</th>
          <th>Roll</th>
          <th>Cam</th>
          <th>Scene</th>
          <th>Cut</th>
          <th>Take</th>
          <th>OK/NG</th>
          <th>TC In</th>
          <th>TC Out</th>
          <th>Audio</th>
          <th>비고</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((clip, index) => (
          <tr
            data-clip-measure-row={measurement ? "true" : undefined}
            key={`${clip.fileName}-${clip.roll}-${index}`}
          >
            <td><PrintValue>{clip.fileName}</PrintValue></td>
            <td><PrintValue>{clip.roll}</PrintValue></td>
            <td><PrintValue>{clip.camera}</PrintValue></td>
            <td><PrintValue>{clip.scene}</PrintValue></td>
            <td><PrintValue>{clip.cut}</PrintValue></td>
            <td><PrintValue>{clip.take}</PrintValue></td>
            <td>
              <PrintValue className={statusTone(clip.result)}>
                {clip.result}
              </PrintValue>
            </td>
            <td><PrintValue>{clip.tcIn}</PrintValue></td>
            <td><PrintValue>{clip.tcOut}</PrintValue></td>
            <td><PrintValue>{clip.audioRoll}</PrintValue></td>
            <td><PrintValue>{clip.notes}</PrintValue></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CameraSetupTable({ rows }: { rows: CameraSetup[] }) {
  return (
    <table className="print-table camera-setup-table">
      <thead>
        <tr>
          <th>Camera</th>
          <th>Body</th>
          <th>Codec / Resolution</th>
          <th>FPS</th>
          <th>Color Space</th>
          <th>LUT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.camera}-${row.body}-${index}`}>
            <td><PrintValue>{row.camera}</PrintValue></td>
            <td><PrintValue>{row.body}</PrintValue></td>
            <td><PrintValue>{row.codecResolution}</PrintValue></td>
            <td><PrintValue>{row.fps}</PrintValue></td>
            <td><PrintValue>{row.colorSpace}</PrintValue></td>
            <td><PrintValue>{row.lut}</PrintValue></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="print-info-row">
      <span>{label}</span>
      <strong><PrintValue>{value}</PrintValue></strong>
    </div>
  );
}

function SectionTitle({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="print-section-title">
      <span className="print-section-number">{number}</span>
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData>(initialReportData);
  const [clipPageSizes, setClipPageSizes] = useState<number[]>([]);
  const clipMeasureContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setData(loadReportData()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const metrics = useMemo(() => getReportMetrics(data), [data]);
  const rollChunks = useMemo(() => chunk(data.rolls, 12), [data.rolls]);
  const cameraSetupChunks = useMemo(
    () => chunk(data.cameraSetups, CAMERA_SETUP_ROWS_PER_PAGE),
    [data.cameraSetups],
  );
  const clipChunks = useMemo(() => {
    if (data.clips.length === 0) return [];

    const measuredRows = clipPageSizes.reduce(
      (total, size) => total + size,
      0,
    );
    if (measuredRows !== data.clips.length) {
      return chunk(data.clips, CLIP_FALLBACK_ROWS_PER_PAGE);
    }

    let offset = 0;
    return clipPageSizes.map((size) => {
      const rows = data.clips.slice(offset, offset + size);
      offset += size;
      return rows;
    });
  }, [clipPageSizes, data.clips]);
  const storageChunks = useMemo(
    () => chunk(data.storage, 13),
    [data.storage],
  );
  const folderTreeLayout = useMemo(
    () => buildFolderTreeLayout(data.folderTree),
    [data.folderTree],
  );

  const sceneCoverage = useMemo(() => {
    const scenes = new Map<
      string,
      { scene: string; takes: number; ok: number; ng: number }
    >();
    data.clips.forEach((clip) => {
      const scene = clip.scene.trim() || "미지정";
      const current = scenes.get(scene) ?? {
        scene,
        takes: 0,
        ok: 0,
        ng: 0,
      };
      current.takes += 1;
      if (clip.result === "OK") current.ok += 1;
      if (clip.result === "NG") current.ng += 1;
      scenes.set(scene, current);
    });
    return [...scenes.values()];
  }, [data.clips]);
  const sceneCoverageChunks = useMemo(
    () =>
      sceneCoverage.length
        ? chunk(sceneCoverage, SCENE_COVERAGE_ROWS_PER_PAGE)
        : [],
    [sceneCoverage],
  );

  useLayoutEffect(() => {
    const content = clipMeasureContentRef.current;
    if (!content || data.clips.length === 0) {
      setClipPageSizes((current) => (current.length ? [] : current));
      return;
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const tableHeader = content.querySelector("thead");
      const rows = Array.from(
        content.querySelectorAll<HTMLTableRowElement>(
          "[data-clip-measure-row]",
        ),
      );
      if (!tableHeader || rows.length !== data.clips.length) return;

      const availableHeight =
        content.getBoundingClientRect().bottom -
        tableHeader.getBoundingClientRect().bottom -
        2;
      if (availableHeight <= 0) return;

      const nextPageSizes = pageSizesFromHeights(
        rows.map((row) => row.getBoundingClientRect().height),
        availableHeight,
      );
      setClipPageSizes((current) =>
        current.length === nextPageSizes.length &&
        current.every((size, index) => size === nextPageSizes[index])
          ? current
          : nextPageSizes,
      );
    };

    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, [data.clips]);

  const passedQc = data.qc.filter((item) =>
    ["OK", "PASS"].includes(item.status),
  ).length;
  const primary = data.storage.find(
    (row) => row.grade.toLowerCase().startsWith("primary"),
  );
  const primaryReady = primary?.status.toLowerCase() === "ready";
  const totalPages =
    2 +
    rollChunks.length +
    cameraSetupChunks.length +
    clipChunks.length +
    sceneCoverageChunks.length +
    storageChunks.length +
    3;
  const rollPageStart = 3;
  const cameraSetupPageStart = rollPageStart + rollChunks.length;
  const clipPageStart =
    cameraSetupPageStart + cameraSetupChunks.length;
  const sceneCoveragePageStart = clipPageStart + clipChunks.length;
  const storagePageStart =
    sceneCoveragePageStart + sceneCoverageChunks.length;
  const qcPageNumber = storagePageStart + storageChunks.length;
  const handoverPageNumber = qcPageNumber + 1;
  const folderPageNumber = handoverPageNumber + 1;

  return (
    <main className="report-view">
      <div className="report-toolbar">
        <div>
          <Link className="brand brand-light" href="/">
            <span className="brand-mark" aria-hidden="true">
              DR
            </span>
            <span>
              <strong>DIT Daily</strong>
              <small>출력 미리보기</small>
            </span>
          </Link>
          <span className="toolbar-divider" />
          <p>
            <strong>{data.project.title}</strong>
            <span>
              A4 · {totalPages}페이지 · {data.project.reportId}
            </span>
          </p>
        </div>
        <div className="toolbar-actions">
          <Link className="button button-dark-ghost" href="/">
            ← 입력 수정
          </Link>
          <button
            className="button button-print"
            type="button"
            onClick={() => window.print()}
          >
            인쇄 / PDF 저장
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>

      {data.clips.length ? (
        <Page
          className="clip-measure-page"
          contentRef={clipMeasureContentRef}
          data={data}
          pageNumber={0}
          totalPages={0}
          section="DETAIL 03"
          title="클립 · 씬"
        >
          <SectionTitle
            number="03"
            eyebrow="CLIP / SCENE"
            title="클립 · 씬 매핑"
            description="클립별 씬·컷·테이크와 타임코드"
          />
          <ClipTable rows={data.clips} measurement />
        </Page>
      ) : null}

      <div className="report-pages" aria-label="A4 출력 미리보기">
        <section className="report-page cover-page">
          <div className="cover-topline">
            <span>DIT DAILY DATA REPORT</span>
            <span>{data.project.reportStatus}</span>
          </div>
          <div className="cover-center">
            <span className="cover-label">
              {data.project.shootDay} · {data.project.shootDate}
            </span>
            <h1>{data.project.title}</h1>
            <p>Digital Imaging Technician Daily Report</p>
          </div>
          <div className="cover-bottom">
            <div className="cover-id">
              <span>REPORT ID</span>
              <strong>{data.project.reportId}</strong>
              <small>생성 {data.project.createdAt}</small>
            </div>
            <div className="cover-info-grid">
              <InfoRow label="감독" value={data.project.director} />
              <InfoRow
                label="촬영감독"
                value={data.project.cinematographer}
              />
              <InfoRow label="DIT" value={data.project.dit} />
              <InfoRow label="촬영일" value={data.project.shootDate} />
              <InfoRow
                label="콜 / 랩"
                value={`${data.project.callTime} / ${data.project.wrapTime}`}
              />
              <InfoRow label="촬영장소" value={data.project.location} />
            </div>
          </div>
          <footer className="cover-footer">
            <span>PRODUCTION · {data.project.production || "—"}</span>
            <span>
              01 / {String(totalPages).padStart(2, "0")}
            </span>
          </footer>
        </section>

        <Page
          data={data}
          pageNumber={2}
          totalPages={totalPages}
          section="OVERVIEW"
          title="전체 요약"
        >
          <SectionTitle
            number="00"
            eyebrow="DAILY OVERVIEW"
            title="전체 요약"
            description="오프로드부터 인계까지, 오늘의 핵심 상태를 한 장에 정리했습니다."
          />

          <div className="summary-kpis">
            <div>
              <span>MEDIA ROLLS</span>
              <strong>{metrics.rollCount}</strong>
              <small>고유 롤 기준</small>
            </div>
            <div>
              <span>TOTAL OFFLOAD</span>
              <strong>{metrics.offloadGb.toFixed(2)}</strong>
              <small>GB</small>
            </div>
            <div>
              <span>TOTAL CLIPS</span>
              <strong>{metrics.clipCount}</strong>
              <small>Roll Log 합계</small>
            </div>
            <div>
              <span>BACKUP COPIES</span>
              <strong>{metrics.backupCount}</strong>
              <small>Ready 상태</small>
            </div>
          </div>

          <div className="summary-grid">
            <section className="summary-card summary-card-wide">
              <div className="card-heading">
                <span>SHOOT INFORMATION</span>
                <strong>촬영 기본 정보</strong>
              </div>
              <div className="summary-info-grid">
                <InfoRow label="촬영 회차" value={data.project.shootDay} />
                <InfoRow
                  label="콜 / 랩"
                  value={`${data.project.callTime} / ${data.project.wrapTime}`}
                />
                <InfoRow label="감독" value={data.project.director} />
                <InfoRow
                  label="촬영감독"
                  value={data.project.cinematographer}
                />
                <InfoRow label="DIT" value={data.project.dit} />
                <InfoRow label="프로덕션" value={data.project.production} />
              </div>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>ON-SET</span>
                <strong>카메라 세팅</strong>
              </div>
              <div className="summary-bigline">
                <strong>{data.cameraSetups.length}</strong>
                <span>대</span>
              </div>
              <p>
                {data.cameraSetups.length
                  ? data.cameraSetups
                      .slice(0, 2)
                      .map(
                        (camera) =>
                          `${camera.camera || "카메라"} · ${
                            camera.body || "바디 미입력"
                          }`,
                      )
                      .join(" / ")
                  : "카메라 세팅 미입력"}
              </p>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>QUALITY CONTROL</span>
                <strong>
                  QC {passedQc}/{data.qc.length} 통과
                </strong>
              </div>
              <div className="mini-status-list">
                {data.qc.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong className={statusTone(item.status)}>
                      {item.status}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>SCENE COVERAGE</span>
                <strong>씬 커버리지</strong>
              </div>
              <div className="summary-bigline">
                <strong>{sceneCoverage.length}</strong>
                <span>개 씬</span>
              </div>
              <p>
                OK {data.clips.filter((clip) => clip.result === "OK").length} ·
                NG {data.clips.filter((clip) => clip.result === "NG").length}
              </p>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>STORAGE</span>
                <strong>백업 상태</strong>
              </div>
              <div className="summary-bigline">
                <strong className={primaryReady ? "tone-good" : "tone-warn"}>
                  {primaryReady ? "READY" : "CHECK"}
                </strong>
              </div>
              <p>
                Primary {primary?.storage || "미입력"} · Ready 사본{" "}
                {metrics.backupCount}개
              </p>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>HANDOVER</span>
                <strong>인계</strong>
              </div>
              <div className="summary-bigline summary-bigline-text">
                <strong>{data.handover.recipient || "미지정"}</strong>
              </div>
              <p>{data.handover.time || "인계 시각 미지정"}</p>
            </section>

            <section className="summary-card">
              <div className="card-heading">
                <span>FILE TREE / PROXY</span>
                <strong>폴더 · 프록시</strong>
              </div>
              <div className="summary-bigline summary-bigline-text">
                <strong>
                  {data.folderTree.split("\n")[0] || data.project.title}
                </strong>
              </div>
              <p>{data.proxyNote || "프록시 정보 미입력"}</p>
            </section>
          </div>

          <section className="summary-issues">
            <div className="card-heading">
              <span>OPEN ISSUES</span>
              <strong>미해결 이슈 {data.issues.length}건</strong>
            </div>
            {data.issues.length ? (
              data.issues.slice(0, 3).map((issue) => (
                <div className="summary-issue-row" key={`${issue.time}-${issue.roll}`}>
                  <span className={issue.severity === "High" ? "issue-high" : ""}>
                    {issue.severity} · {issue.roll || "공통"}
                  </span>
                  <p>{issue.detail}</p>
                  <strong>{issue.status}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">등록된 이슈가 없습니다.</p>
            )}
          </section>
        </Page>

        {rollChunks.map((rows, chunkIndex) => {
          return (
            <Page
              data={data}
              pageNumber={rollPageStart + chunkIndex}
              totalPages={totalPages}
              section="DETAIL 01"
              title="미디어 롤"
              key={`roll-page-${chunkIndex}`}
            >
              <SectionTitle
                number="01"
                eyebrow="ROLL LOG"
                title="미디어 롤 · 오프로드"
                description={`카드별 데이터 이관과 체크섬 결과${
                  rollChunks.length > 1
                    ? ` · ${chunkIndex + 1}/${rollChunks.length}`
                    : ""
                }`}
              />
              <table className="print-table roll-table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Camera</th>
                    <th>Codec / Resolution</th>
                    <th>Card</th>
                    <th>GB</th>
                    <th>Checksum</th>
                    <th>Status</th>
                    <th>Clips</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.roll}-${row.camera}-${index}`}>
                      <td><PrintValue>{row.roll}</PrintValue></td>
                      <td><PrintValue>{row.camera}</PrintValue></td>
                      <td><PrintValue>{row.codec}</PrintValue></td>
                      <td><PrintValue>{row.card}</PrintValue></td>
                      <td className="numeric">
                        <PrintValue>
                          {Number(row.offloadGb).toFixed(2)}
                        </PrintValue>
                      </td>
                      <td><PrintValue>{row.checksum}</PrintValue></td>
                      <td>
                        <PrintValue className={statusTone(row.status)}>
                          {row.status || "—"}
                        </PrintValue>
                      </td>
                      <td className="numeric">
                        <PrintValue>{row.clips}</PrintValue>
                      </td>
                      <td><PrintValue>{row.notes}</PrintValue></td>
                    </tr>
                  ))}
                </tbody>
                {chunkIndex === rollChunks.length - 1 ? (
                  <tfoot>
                    <tr>
                      <th colSpan={4}>TOTAL</th>
                      <th className="numeric">{metrics.offloadGb.toFixed(2)}</th>
                      <th colSpan={2} />
                      <th className="numeric">{metrics.clipCount}</th>
                      <th />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              <div className="print-note">
                <strong>CHECKSUM NOTE</strong>
                <p>
                  검증이 완료되지 않은 항목은 PASS로 간주하지 않으며, 원본 확인
                  후 재검증 결과를 이 리포트에 업데이트합니다.
                </p>
              </div>
            </Page>
          );
        })}

        {cameraSetupChunks.map((rows, chunkIndex) => (
          <Page
            data={data}
            pageNumber={cameraSetupPageStart + chunkIndex}
            totalPages={totalPages}
            section="DETAIL 02"
            title="ON-SET"
            key={`camera-setup-page-${chunkIndex}`}
          >
            <SectionTitle
              number="02"
              eyebrow="ON-SET CAMERA SETTINGS"
              title="카메라 세팅"
              description={`바디, 기록 포맷, 프레임레이트, 색공간과 LUT${
                cameraSetupChunks.length > 1
                  ? ` · ${chunkIndex + 1}/${cameraSetupChunks.length}`
                  : ""
              }`}
            />
            <CameraSetupTable rows={rows} />
            {data.cameraSetups.length === 0 ? (
              <p className="print-empty-table">
                등록된 카메라 세팅이 없습니다.
              </p>
            ) : null}
          </Page>
        ))}

        {clipChunks.map((rows, chunkIndex) => {
          return (
            <Page
              data={data}
              pageNumber={clipPageStart + chunkIndex}
              totalPages={totalPages}
              section="DETAIL 03"
              title="클립 · 씬"
              key={`clip-page-${chunkIndex}`}
            >
              <SectionTitle
                number="03"
                eyebrow="CLIP / SCENE"
                title="클립 · 씬 매핑"
                description={`클립별 씬·컷·테이크와 타임코드${
                  clipChunks.length > 1
                    ? ` · ${chunkIndex + 1}/${clipChunks.length}`
                    : ""
                }`}
              />
              <ClipTable rows={rows} />
            </Page>
          );
        })}

        {sceneCoverageChunks.map((scenes, chunkIndex) => (
          <Page
            className="coverage-page"
            data={data}
            pageNumber={sceneCoveragePageStart + chunkIndex}
            totalPages={totalPages}
            section="DETAIL 03"
            title="씬 커버리지"
            key={`coverage-page-${chunkIndex}`}
          >
            <SectionTitle
              number="03"
              eyebrow="CLIP / SCENE SUMMARY"
              title="씬 커버리지"
              description={`씬별 테이크와 OK 확보 현황${
                sceneCoverageChunks.length > 1
                  ? ` · ${chunkIndex + 1}/${sceneCoverageChunks.length}`
                  : ""
              }`}
            />
            <table className="print-table coverage-table">
              <thead>
                <tr>
                  <th>Scene</th>
                  <th>테이크</th>
                  <th>OK</th>
                  <th>NG</th>
                  <th>OK 존재?</th>
                </tr>
              </thead>
              <tbody>
                {scenes.map((scene) => (
                  <tr key={scene.scene}>
                    <td><PrintValue>{scene.scene}</PrintValue></td>
                    <td><PrintValue>{scene.takes}</PrintValue></td>
                    <td><PrintValue>{scene.ok}</PrintValue></td>
                    <td><PrintValue>{scene.ng}</PrintValue></td>
                    <td>
                      <PrintValue
                        className={scene.ok ? "tone-good" : "tone-bad"}
                      >
                        {scene.ok ? "OK 확보" : "확인 필요"}
                      </PrintValue>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>
        ))}

        {storageChunks.map((rows, chunkIndex) => {
          return (
            <Page
              data={data}
              pageNumber={storagePageStart + chunkIndex}
              totalPages={totalPages}
              section="DETAIL 04"
              title="저장매체"
              key={`storage-page-${chunkIndex}`}
            >
              <SectionTitle
                number="04"
                eyebrow="STORAGE"
                title="백업 저장매체"
                description={`사본 등급, 포맷, 경로와 준비 상태${
                  storageChunks.length > 1
                    ? ` · ${chunkIndex + 1}/${storageChunks.length}`
                    : ""
                }`}
              />
              <table className="print-table storage-table">
                <thead>
                  <tr>
                    <th>등급</th>
                    <th>용도</th>
                    <th>스토리지</th>
                    <th>포맷</th>
                    <th>경로</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.storage}-${index}`}>
                      <td><PrintValue>{row.grade}</PrintValue></td>
                      <td><PrintValue>{row.purpose}</PrintValue></td>
                      <td><PrintValue>{row.storage}</PrintValue></td>
                      <td><PrintValue>{row.format}</PrintValue></td>
                      <td><PrintValue>{row.path}</PrintValue></td>
                      <td>
                        <PrintValue className={statusTone(row.status)}>
                          {row.status || "—"}
                        </PrintValue>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {chunkIndex === storageChunks.length - 1 ? (
                <>
                  <div
                    className={`storage-alert ${
                      primaryReady ? "storage-alert-good" : ""
                    }`}
                  >
                    <span aria-hidden="true">{primaryReady ? "✓" : "!"}</span>
                    <div>
                      <strong>
                        {primaryReady
                          ? "Primary 저장매체 연결 완료"
                          : "3-2-1 백업 상태 확인 필요"}
                      </strong>
                      <p>
                        {primaryReady
                          ? `현재 Ready 상태 백업본은 ${metrics.backupCount}개입니다.`
                          : "Primary 또는 오프사이트 사본이 준비되지 않았습니다. 다음 회차 전 확보를 권장합니다."}
                      </p>
                    </div>
                  </div>
                  <div className="print-note">
                    <strong>FORMAT GUIDE</strong>
                    <p>
                      macOS·Windows 양쪽 호환은 exFAT, macOS 전용 작업/DI는
                      APFS 사용을 권장합니다. 단일 파일 4GB 초과 시 FAT32는
                      사용하지 않습니다.
                    </p>
                  </div>
                </>
              ) : null}
            </Page>
          );
        })}

        <Page
          data={data}
          pageNumber={qcPageNumber}
          totalPages={totalPages}
          section="DETAIL 05"
          title="QC · 이슈"
        >
          <SectionTitle
            number="05"
            eyebrow="QUALITY CONTROL"
            title="QC 체크리스트 · 이슈 로그"
            description="검증 결과와 후속 조치가 필요한 항목"
          />
          <div className="qc-print-list">
            {data.qc.map((item) => (
              <div key={item.label}>
                <strong>{item.label}</strong>
                <span className={statusTone(item.status)}>{item.status}</span>
                <p>{item.note || "—"}</p>
              </div>
            ))}
          </div>
          <div className="issues-print-block">
            <div className="card-heading">
              <span>ISSUE LOG</span>
              <strong>이슈 {data.issues.length}건</strong>
            </div>
            <table className="print-table issues-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>등급 / Roll</th>
                  <th>내용 / 조치</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map((issue, index) => (
                  <tr key={`${issue.time}-${index}`}>
                    <td><PrintValue>{issue.time}</PrintValue></td>
                    <td>
                      <PrintValue
                        className={
                          issue.severity === "High" ? "tone-bad" : ""
                        }
                      >
                        {issue.severity} / {issue.roll || "공통"}
                      </PrintValue>
                    </td>
                    <td><PrintValue>{issue.detail}</PrintValue></td>
                    <td><PrintValue>{issue.status}</PrintValue></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Page>

        <Page
          data={data}
          pageNumber={handoverPageNumber}
          totalPages={totalPages}
          section="DETAIL 06"
          title="인계"
        >
          <SectionTitle
            number="06"
            eyebrow="HANDOVER"
            title="데이터 인계"
            description="전달 항목, 수령자와 확인 기록"
          />
          <div className="handover-sheet">
            <InfoRow label="인계 항목" value={data.handover.items} />
            <InfoRow label="인계 방식" value={data.handover.method} />
            <InfoRow
              label="DIT / Data Manager"
              value={data.handover.dataManager}
            />
            <InfoRow label="수령자" value={data.handover.recipient} />
            <InfoRow label="인계 시각" value={data.handover.time} />
            <InfoRow
              label="수령 확인"
              value={data.handover.confirmation || "미확인"}
            />
          </div>
          <div className="handover-note">
            <span>HANDOVER NOTE</span>
            <p>{data.handover.note || "추가 인계 메모가 없습니다."}</p>
          </div>
          <div className="signature-grid">
            <div>
              <span>전달자</span>
              <strong>{data.handover.dataManager || data.project.dit}</strong>
              <i />
              <small>서명</small>
            </div>
            <div>
              <span>수령자</span>
              <strong>{data.handover.recipient || "미지정"}</strong>
              <i />
              <small>서명</small>
            </div>
          </div>
        </Page>

        <Page
          data={data}
          pageNumber={folderPageNumber}
          totalPages={totalPages}
          section="DETAIL 07"
          title="폴더트리"
          className="folder-tree-page"
        >
          <SectionTitle
            number="07"
            eyebrow="FILE TREE"
            title={`파일 트리 구조 · ${data.project.shootDay}`}
            description="백업 후 위치 변경 금지"
          />
          <div className="tree-warning">
            체크섬 무결성 검사가 끝난 경로입니다. 파일 또는 폴더 위치를
            변경하면 검증 상태가 달라질 수 있습니다.
          </div>
          <div
            className={`folder-tree-grid ${
              folderTreeLayout.columns.length > 1
                ? "folder-tree-two-columns"
                : "folder-tree-one-column"
            }`}
            style={
              {
                "--folder-tree-font-size": `${folderTreeLayout.fontSizePt}pt`,
                "--folder-tree-line-height": folderTreeLayout.lineHeight,
              } as CSSProperties
            }
          >
            {folderTreeLayout.columns.map((lines, columnIndex) => (
              <pre className="folder-tree" key={`folder-column-${columnIndex}`}>
                {lines.join("\n")}
              </pre>
            ))}
          </div>
          <div className="proxy-card">
            <span>PROXY / BURN-IN</span>
            <strong>{data.proxyNote || "정보 없음"}</strong>
          </div>
        </Page>
      </div>
    </main>
  );
}
