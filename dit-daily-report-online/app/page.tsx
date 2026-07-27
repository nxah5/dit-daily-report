"use client";

import {
  CSSProperties,
  FormEvent,
  forwardRef,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ClipLog,
  emptyClip,
  emptyIssue,
  emptyRoll,
  emptyStorage,
  getReportMetrics,
  initialReportData,
  IssueLog,
  loadReportData,
  QualityStatus,
  ReportData,
  RollLog,
  saveReportData,
  STORAGE_STATUS_OPTIONS,
  StorageLog,
} from "./report-data";

const sections = [
  ["basic", "01", "기본 정보"],
  ["rolls", "02", "미디어 롤"],
  ["clips", "03", "클립 · 씬"],
  ["storage", "04", "저장매체"],
  ["qc", "05", "QC · 이슈"],
  ["handover", "06", "인계"],
  ["folder", "07", "폴더트리"],
] as const;

type FolderNode = {
  name: string;
  children: FolderNode[];
};

type FlatFolderNode = {
  path: number[];
  name: string;
  depth: number;
};

function parseFolderTree(value: string): FolderNode[] {
  const roots: FolderNode[] = [];
  const stack: FolderNode[] = [];

  value.split("\n").forEach((rawLine) => {
    if (!rawLine.trim()) return;

    const line = rawLine.replaceAll("\t", "    ");
    const connectorIndex = line.search(/[├└] /);
    const hasConnector = connectorIndex >= 0;
    const depth = hasConnector
      ? Math.floor(connectorIndex / 4) + 1
      : Math.floor((line.match(/^ */)?.[0].length ?? 0) / 4);
    const name = hasConnector
      ? line.slice(connectorIndex + 2).trim()
      : line.trim();
    if (!name) return;

    const node: FolderNode = { name, children: [] };
    if (depth === 0 || !stack[depth - 1]) {
      roots.push(node);
    } else {
      stack[depth - 1].children.push(node);
    }
    stack[depth] = node;
    stack.length = depth + 1;
  });

  return roots;
}

function formatFolderTree(nodes: FolderNode[]): string {
  const lines: string[] = [];

  const appendChildren = (children: FolderNode[], prefix: string) => {
    children.forEach((node, index) => {
      const isLast = index === children.length - 1;
      lines.push(`${prefix}${isLast ? "└ " : "├ "}${node.name}`);
      appendChildren(node.children, `${prefix}${isLast ? "    " : "│   "}`);
    });
  };

  nodes.forEach((node) => {
    lines.push(node.name);
    appendChildren(node.children, "");
  });

  return lines.join("\n");
}

function flattenFolderTree(
  nodes: FolderNode[],
  depth = 0,
  parentPath: number[] = [],
): FlatFolderNode[] {
  return nodes.flatMap((node, index) => {
    const path = [...parentPath, index];
    return [
      { path, name: node.name, depth },
      ...flattenFolderTree(node.children, depth + 1, path),
    ];
  });
}

function updateFolderName(
  nodes: FolderNode[],
  path: number[],
  name: string,
): FolderNode[] {
  const [index, ...rest] = path;
  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (!rest.length) return { ...node, name };
    return {
      ...node,
      children: updateFolderName(node.children, rest, name),
    };
  });
}

function addFolderNode(
  nodes: FolderNode[],
  parentPath: number[],
  name: string,
): FolderNode[] {
  if (!parentPath.length) {
    return [...nodes, { name, children: [] }];
  }

  const [index, ...rest] = parentPath;
  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (!rest.length) {
      return {
        ...node,
        children: [...node.children, { name, children: [] }],
      };
    }
    return {
      ...node,
      children: addFolderNode(node.children, rest, name),
    };
  });
}

function removeFolderNode(
  nodes: FolderNode[],
  path: number[],
): FolderNode[] {
  const [index, ...rest] = path;
  if (!rest.length) {
    return nodes.filter((_, nodeIndex) => nodeIndex !== index);
  }
  return nodes.map((node, nodeIndex) =>
    nodeIndex === index
      ? {
          ...node,
          children: removeFolderNode(node.children, rest),
        }
      : node,
  );
}

function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

const FluidTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function FluidTextArea(
  { className = "", onKeyDown, rows = 1, ...props },
  ref,
) {
  return (
    <textarea
      {...props}
      className={`fluid-text-control ${className}`.trim()}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      ref={ref}
      rows={rows}
    />
  );
});

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <span className="section-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}

export default function InputPage() {
  const [data, setData] = useState<ReportData>(initialReportData);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState("불러오는 중");
  const [newFolderName, setNewFolderName] = useState("");
  const [parentFolderPath, setParentFolderPath] = useState("");
  const folderNameInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData(loadReportData());
      setHydrated(true);
      setSaveState("저장됨");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      saveReportData(data);
      setSaveState("저장됨");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data, hydrated]);

  const metrics = useMemo(() => getReportMetrics(data), [data]);
  const completion = useMemo(() => {
    const required = [
      data.project.title,
      data.project.reportId,
      data.project.shootDay,
      data.project.shootDate,
      data.project.director,
      data.project.cinematographer,
      data.project.dit,
      data.project.location,
    ];
    return Math.round(
      (required.filter((value) => value.trim()).length / required.length) * 100,
    );
  }, [data.project]);
  const folderNodes = useMemo(
    () => parseFolderTree(data.folderTree),
    [data.folderTree],
  );
  const flatFolderNodes = useMemo(
    () => flattenFolderTree(folderNodes),
    [folderNodes],
  );

  const updateProject = (
    key: keyof ReportData["project"],
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      project: { ...current.project, [key]: value },
    }));
  };

  const updateRoll = (index: number, patch: Partial<RollLog>) => {
    setData((current) => ({
      ...current,
      rolls: current.rolls.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const updateClip = (index: number, patch: Partial<ClipLog>) => {
    setData((current) => ({
      ...current,
      clips: current.clips.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const updateStorage = (index: number, patch: Partial<StorageLog>) => {
    setData((current) => ({
      ...current,
      storage: current.storage.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const updateIssue = (index: number, patch: Partial<IssueLog>) => {
    setData((current) => ({
      ...current,
      issues: current.issues.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const saveFolderNodes = (nodes: FolderNode[]) => {
    setData((current) => ({
      ...current,
      folderTree: formatFolderTree(nodes),
    }));
  };

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) {
      folderNameInputRef.current?.focus();
      return;
    }

    const parentPath = parentFolderPath
      ? parentFolderPath.split(".").map(Number)
      : [];
    saveFolderNodes(addFolderNode(folderNodes, parentPath, name));
    setNewFolderName("");
    folderNameInputRef.current?.focus();
  };

  const openReport = (event: FormEvent) => {
    event.preventDefault();
    saveReportData(data);
    window.location.href = "/report";
  };

  return (
    <main className="input-app">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="DIT Daily Report 입력 첫 화면">
          <span className="brand-mark" aria-hidden="true">
            DR
          </span>
          <span>
            <strong>DIT Daily</strong>
            <small>Report Builder</small>
          </span>
        </a>
        <nav className="header-nav" aria-label="페이지 이동">
          <Link className="nav-active" href="/">
            입력
          </Link>
          <Link href="/report">출력 미리보기</Link>
        </nav>
        <div className="save-indicator" aria-live="polite">
          <span aria-hidden="true" />
          {saveState}
        </div>
      </header>

      <div className="input-layout" id="top">
        <aside className="section-nav" aria-label="입력 항목">
          <p className="nav-kicker">REPORT SECTIONS</p>
          <ol>
            {sections.map(([id, number, label]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <span>{number}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
          <div className="progress-card">
            <div>
              <span>기본 정보</span>
              <strong>{completion}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="기본 정보 작성률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completion}
            >
              <span style={{ width: `${completion}%` }} />
            </div>
            <small>입력 내용은 이 기기에 자동 저장됩니다.</small>
          </div>
        </aside>

        <form className="report-form" onSubmit={openReport}>
          <section className="form-intro">
            <div>
              <span className="intro-kicker">ON-SET DATA REPORT</span>
              <h1>오늘의 촬영 데이터를 정리하세요.</h1>
              <p>
                입력한 내용은 표지, 전체 요약, 세부 페이지 순서의 A4 리포트로
                자동 구성됩니다.
              </p>
            </div>
            <Link className="button button-secondary" href="/report">
              미리보기
              <span aria-hidden="true">↗</span>
            </Link>
          </section>

          <section className="form-card" id="basic">
            <SectionHeader
              eyebrow="01 · PROJECT"
              title="기본 정보"
              description="표지와 모든 페이지의 머리말에 반복되는 촬영 기본값입니다."
            />
            <div className="field-grid field-grid-3">
              <Field label="프로젝트명" wide>
                <FluidTextArea
                  required
                  value={data.project.title}
                  onChange={(event) =>
                    updateProject("title", event.target.value)
                  }
                />
              </Field>
              <Field label="리포트 ID">
                <FluidTextArea
                  required
                  value={data.project.reportId}
                  onChange={(event) =>
                    updateProject("reportId", event.target.value)
                  }
                />
              </Field>
              <Field label="상태">
                <select
                  value={data.project.reportStatus}
                  onChange={(event) =>
                    updateProject("reportStatus", event.target.value)
                  }
                >
                  <option value="READY">READY</option>
                  <option value="CHECK">CHECK</option>
                  <option value="HOLD">HOLD</option>
                </select>
              </Field>
              <Field label="촬영 회차">
                <FluidTextArea
                  required
                  value={data.project.shootDay}
                  onChange={(event) =>
                    updateProject("shootDay", event.target.value)
                  }
                />
              </Field>
              <Field label="촬영 날짜">
                <input
                  required
                  type="date"
                  value={data.project.shootDate}
                  onChange={(event) =>
                    updateProject("shootDate", event.target.value)
                  }
                />
              </Field>
              <Field label="리포트 생성 시각">
                <FluidTextArea
                  value={data.project.createdAt}
                  onChange={(event) =>
                    updateProject("createdAt", event.target.value)
                  }
                />
              </Field>
              <Field label="콜 타임">
                <input
                  type="time"
                  value={data.project.callTime}
                  onChange={(event) =>
                    updateProject("callTime", event.target.value)
                  }
                />
              </Field>
              <Field label="랩 타임">
                <input
                  type="time"
                  value={data.project.wrapTime}
                  onChange={(event) =>
                    updateProject("wrapTime", event.target.value)
                  }
                />
              </Field>
              <Field label="감독">
                <FluidTextArea
                  required
                  value={data.project.director}
                  onChange={(event) =>
                    updateProject("director", event.target.value)
                  }
                />
              </Field>
              <Field label="촬영감독">
                <FluidTextArea
                  required
                  value={data.project.cinematographer}
                  onChange={(event) =>
                    updateProject("cinematographer", event.target.value)
                  }
                />
              </Field>
              <Field label="DIT / 데이터매니저">
                <FluidTextArea
                  required
                  value={data.project.dit}
                  onChange={(event) => updateProject("dit", event.target.value)}
                />
              </Field>
              <Field label="프로덕션">
                <FluidTextArea
                  value={data.project.production}
                  onChange={(event) =>
                    updateProject("production", event.target.value)
                  }
                />
              </Field>
              <Field label="촬영 장소" wide>
                <FluidTextArea
                  required
                  value={data.project.location}
                  onChange={(event) =>
                    updateProject("location", event.target.value)
                  }
                />
              </Field>
            </div>
          </section>

          <section className="form-card" id="rolls">
            <SectionHeader
              eyebrow="02 · MEDIA"
              title="미디어 롤"
              description="카메라·오디오 카드별 오프로드와 체크섬 결과를 입력합니다."
              action={
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      rolls: [...current.rolls, emptyRoll()],
                    }))
                  }
                >
                  + 롤 추가
                </button>
              }
            />
            <div className="metric-strip" aria-label="롤 데이터 자동 합계">
              <div>
                <span>미디어 롤</span>
                <strong>{metrics.rollCount}</strong>
              </div>
              <div>
                <span>총 오프로드</span>
                <strong>{metrics.offloadGb.toFixed(2)} GB</strong>
              </div>
              <div>
                <span>총 클립</span>
                <strong>{metrics.clipCount}</strong>
              </div>
            </div>
            <div className="sheet-editor">
              <div className="sheet-scroll">
                <table className="sheet-table roll-sheet">
                  <caption className="sr-only">
                    미디어 롤 오프로드 기록
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Roll</th>
                      <th scope="col">Camera</th>
                      <th scope="col">Codec / Resolution</th>
                      <th scope="col">Card</th>
                      <th scope="col">Offload (GB)</th>
                      <th scope="col">Checksum</th>
                      <th scope="col">Status</th>
                      <th scope="col">Clips</th>
                      <th scope="col">Notes</th>
                      <th scope="col">
                        <span className="sr-only">삭제</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rolls.map((row, index) => (
                      <tr key={`roll-${index}`}>
                        <th className="sheet-row-number" scope="row">
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 이름`}
                            value={row.roll}
                            onChange={(event) =>
                              updateRoll(index, { roll: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 카메라`}
                            value={row.camera}
                            onChange={(event) =>
                              updateRoll(index, { camera: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 코덱과 해상도`}
                            value={row.codec}
                            onChange={(event) =>
                              updateRoll(index, { codec: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 카드`}
                            value={row.card}
                            onChange={(event) =>
                              updateRoll(index, { card: event.target.value })
                            }
                          />
                        </td>
                        <td className="sheet-number-cell">
                          <input
                            aria-label={`${index + 1}번째 롤 오프로드 용량`}
                            min="0"
                            step="0.01"
                            type="number"
                            value={row.offloadGb}
                            onChange={(event) =>
                              updateRoll(index, {
                                offloadGb: Number(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 체크섬`}
                            value={row.checksum}
                            onChange={(event) =>
                              updateRoll(index, {
                                checksum: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 상태`}
                            value={row.status}
                            onChange={(event) =>
                              updateRoll(index, { status: event.target.value })
                            }
                          />
                        </td>
                        <td className="sheet-number-cell">
                          <input
                            aria-label={`${index + 1}번째 롤 클립 수`}
                            min="0"
                            type="number"
                            value={row.clips}
                            onChange={(event) =>
                              updateRoll(index, {
                                clips: Number(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 롤 메모`}
                            value={row.notes}
                            onChange={(event) =>
                              updateRoll(index, { notes: event.target.value })
                            }
                          />
                        </td>
                        <td className="sheet-delete-cell">
                          <RemoveButton
                            label={`${index + 1}번째 미디어 롤 삭제`}
                            onClick={() =>
                              setData((current) => ({
                                ...current,
                                rolls: current.rolls.filter(
                                  (_, rowIndex) => rowIndex !== index,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="form-card" id="clips">
            <SectionHeader
              eyebrow="03 · CLIP / SCENE"
              title="클립 · 씬 매핑"
              description="클립과 씬·컷·테이크를 연결하면 출력 페이지에서 씬 커버리지가 자동 집계됩니다."
              action={
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      clips: [...current.clips, emptyClip()],
                    }))
                  }
                >
                  + 클립 추가
                </button>
              }
            />
            <div className="sheet-editor">
              <div className="sheet-scroll">
                <table className="sheet-table clip-sheet">
                  <caption className="sr-only">클립과 씬 매핑 기록</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Clip File Name</th>
                      <th scope="col">Roll</th>
                      <th scope="col">Cam</th>
                      <th scope="col">Scene</th>
                      <th scope="col">Cut</th>
                      <th scope="col">Take</th>
                      <th scope="col">OK / NG</th>
                      <th scope="col">TC In</th>
                      <th scope="col">TC Out</th>
                      <th scope="col">Audio Roll</th>
                      <th scope="col">비고</th>
                      <th scope="col">
                        <span className="sr-only">삭제</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clips.map((row, index) => (
                      <tr key={`clip-${index}`}>
                        <th className="sheet-row-number" scope="row">
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 파일명`}
                            value={row.fileName}
                            onChange={(event) =>
                              updateClip(index, {
                                fileName: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 롤`}
                            value={row.roll}
                            onChange={(event) =>
                              updateClip(index, { roll: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 카메라`}
                            value={row.camera}
                            onChange={(event) =>
                              updateClip(index, { camera: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 씬`}
                            value={row.scene}
                            onChange={(event) =>
                              updateClip(index, { scene: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 컷`}
                            value={row.cut}
                            onChange={(event) =>
                              updateClip(index, { cut: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 테이크`}
                            value={row.take}
                            onChange={(event) =>
                              updateClip(index, { take: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`${index + 1}번째 클립 OK 또는 NG`}
                            value={row.result}
                            onChange={(event) =>
                              updateClip(index, {
                                result: event.target.value as "OK" | "NG",
                              })
                            }
                          >
                            <option value="OK">OK</option>
                            <option value="NG">NG</option>
                          </select>
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 시작 타임코드`}
                            placeholder="00:00:00:00"
                            value={row.tcIn}
                            onChange={(event) =>
                              updateClip(index, { tcIn: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 종료 타임코드`}
                            placeholder="00:00:00:00"
                            value={row.tcOut}
                            onChange={(event) =>
                              updateClip(index, { tcOut: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 오디오 롤`}
                            value={row.audioRoll}
                            onChange={(event) =>
                              updateClip(index, {
                                audioRoll: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 클립 비고`}
                            value={row.notes}
                            onChange={(event) =>
                              updateClip(index, { notes: event.target.value })
                            }
                          />
                        </td>
                        <td className="sheet-delete-cell">
                          <RemoveButton
                            label={`${index + 1}번째 클립 삭제`}
                            onClick={() =>
                              setData((current) => ({
                                ...current,
                                clips: current.clips.filter(
                                  (_, rowIndex) => rowIndex !== index,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="form-card" id="storage">
            <SectionHeader
              eyebrow="04 · STORAGE"
              title="저장매체"
              description="Primary와 Secondary 사본의 위치, 포맷, 준비 상태를 기록합니다."
              action={
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() =>
                    setData((current) => ({
                      ...current,
                      storage: [...current.storage, emptyStorage()],
                    }))
                  }
                >
                  + 저장매체 추가
                </button>
              }
            />
            <div className="metric-strip metric-strip-compact">
              <div>
                <span>Ready 백업본</span>
                <strong>{metrics.backupCount}</strong>
              </div>
              <div>
                <span>총 입력 매체</span>
                <strong>{data.storage.length}</strong>
              </div>
            </div>
            <div className="sheet-editor">
              <div className="sheet-scroll">
                <table className="sheet-table storage-sheet">
                  <caption className="sr-only">저장매체 기록</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">등급</th>
                      <th scope="col">용도</th>
                      <th scope="col">스토리지</th>
                      <th scope="col">포맷 형식</th>
                      <th scope="col">경로</th>
                      <th scope="col">상태</th>
                      <th scope="col">
                        <span className="sr-only">삭제</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.storage.map((row, index) => (
                      <tr key={`storage-${index}`}>
                        <th className="sheet-row-number" scope="row">
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 저장매체 등급`}
                            value={row.grade}
                            onChange={(event) =>
                              updateStorage(index, {
                                grade: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 저장매체 용도`}
                            value={row.purpose}
                            onChange={(event) =>
                              updateStorage(index, {
                                purpose: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 저장매체 이름`}
                            value={row.storage}
                            onChange={(event) =>
                              updateStorage(index, {
                                storage: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 저장매체 포맷`}
                            value={row.format}
                            onChange={(event) =>
                              updateStorage(index, {
                                format: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 저장매체 경로`}
                            value={row.path}
                            onChange={(event) =>
                              updateStorage(index, { path: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`${index + 1}번째 저장매체 상태`}
                            value={row.status}
                            onChange={(event) =>
                              updateStorage(index, {
                                status: event.target
                                  .value as StorageLog["status"],
                              })
                            }
                          >
                            {STORAGE_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="sheet-delete-cell">
                          <RemoveButton
                            label={`${index + 1}번째 저장매체 삭제`}
                            onClick={() =>
                              setData((current) => ({
                                ...current,
                                storage: current.storage.filter(
                                  (_, rowIndex) => rowIndex !== index,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="form-card" id="qc">
            <SectionHeader
              eyebrow="05 · QUALITY CONTROL"
              title="QC 체크리스트"
              description="상태는 요약 페이지와 경고 영역에 바로 반영됩니다."
            />
            <div className="sheet-editor">
              <div className="sheet-scroll">
                <table className="sheet-table qc-sheet">
                  <caption className="sr-only">QC 체크리스트</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">검사 항목</th>
                      <th scope="col">상태</th>
                      <th scope="col">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.qc.map((row, index) => (
                      <tr key={`qc-${index}`}>
                        <th className="sheet-row-number" scope="row">
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 QC 검사 항목`}
                            value={row.label}
                            onChange={(event) =>
                              setData((current) => ({
                                ...current,
                                qc: current.qc.map((item, rowIndex) =>
                                  rowIndex === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`${index + 1}번째 QC 상태`}
                            value={row.status}
                            onChange={(event) =>
                              setData((current) => ({
                                ...current,
                                qc: current.qc.map((item, rowIndex) =>
                                  rowIndex === index
                                    ? {
                                        ...item,
                                        status: event.target
                                          .value as QualityStatus,
                                      }
                                    : item,
                                ),
                              }))
                            }
                          >
                            {["OK", "PASS", "CHECK", "PENDING", "N/A"].map(
                              (status) => (
                                <option key={status}>{status}</option>
                              ),
                            )}
                          </select>
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 QC 메모`}
                            value={row.note}
                            onChange={(event) =>
                              setData((current) => ({
                                ...current,
                                qc: current.qc.map((item, rowIndex) =>
                                  rowIndex === index
                                    ? { ...item, note: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="subsection-heading">
              <div>
                <span>ISSUE LOG</span>
                <h3>이슈 로그</h3>
              </div>
              <button
                className="button button-ghost"
                type="button"
                onClick={() =>
                  setData((current) => ({
                    ...current,
                    issues: [...current.issues, emptyIssue()],
                  }))
                }
              >
                + 이슈 추가
              </button>
            </div>
            <div className="sheet-editor">
              <div className="sheet-scroll">
                <table className="sheet-table issue-sheet">
                  <caption className="sr-only">이슈 기록</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">시간</th>
                      <th scope="col">등급</th>
                      <th scope="col">Roll</th>
                      <th scope="col">내용 / 조치</th>
                      <th scope="col">상태</th>
                      <th scope="col">
                        <span className="sr-only">삭제</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.issues.map((row, index) => (
                      <tr key={`issue-${index}`}>
                        <th className="sheet-row-number" scope="row">
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 이슈 시간`}
                            value={row.time}
                            onChange={(event) =>
                              updateIssue(index, { time: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`${index + 1}번째 이슈 등급`}
                            value={row.severity}
                            onChange={(event) =>
                              updateIssue(index, {
                                severity: event.target.value,
                              })
                            }
                          >
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                          </select>
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 이슈 롤`}
                            value={row.roll}
                            onChange={(event) =>
                              updateIssue(index, { roll: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 이슈 내용과 조치`}
                            value={row.detail}
                            onChange={(event) =>
                              updateIssue(index, {
                                detail: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <FluidTextArea
                            aria-label={`${index + 1}번째 이슈 상태`}
                            value={row.status}
                            onChange={(event) =>
                              updateIssue(index, { status: event.target.value })
                            }
                          />
                        </td>
                        <td className="sheet-delete-cell">
                          <RemoveButton
                            label={`${index + 1}번째 이슈 삭제`}
                            onClick={() =>
                              setData((current) => ({
                                ...current,
                                issues: current.issues.filter(
                                  (_, rowIndex) => rowIndex !== index,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="form-card" id="handover">
            <SectionHeader
              eyebrow="06 · HANDOVER"
              title="인계 정보"
              description="수령자와 확인 상태를 명확히 남겨 후속 담당자가 바로 파악할 수 있게 합니다."
            />
            <div className="field-grid field-grid-2">
              <Field label="인계 항목" wide>
                <FluidTextArea
                  value={data.handover.items}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        items: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="인계 방식">
                <FluidTextArea
                  value={data.handover.method}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        method: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="DIT / Data Manager">
                <FluidTextArea
                  value={data.handover.dataManager}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        dataManager: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="수령자">
                <FluidTextArea
                  value={data.handover.recipient}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        recipient: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="인계 시각">
                <FluidTextArea
                  value={data.handover.time}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        time: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="수령 확인">
                <FluidTextArea
                  placeholder="서명 또는 확인 문구"
                  value={data.handover.confirmation}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        confirmation: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="인계 메모" wide>
                <textarea
                  className="fluid-text-control fluid-text-control-multiline"
                  rows={2}
                  value={data.handover.note}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      handover: {
                        ...current.handover,
                        note: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            </div>
          </section>

          <section className="form-card" id="folder">
            <SectionHeader
              eyebrow="07 · FILE TREE"
              title="폴더트리"
              description="폴더 이름과 상위 폴더를 선택하면 출력용 트리가 자동으로 만들어집니다."
            />
            <div className="folder-builder">
              <div className="folder-add-panel">
                <label className="folder-add-name">
                  <span>새 폴더명</span>
                  <FluidTextArea
                    ref={folderNameInputRef}
                    value={newFolderName}
                    placeholder="예: OCF, Proxy, Camera A"
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addFolder();
                      }
                    }}
                  />
                </label>
                <label className="folder-add-parent">
                  <span>상위 폴더</span>
                  <select
                    value={parentFolderPath}
                    onChange={(event) =>
                      setParentFolderPath(event.target.value)
                    }
                  >
                    <option value="">최상위 폴더</option>
                    {flatFolderNodes.map((node) => (
                      <option
                        key={node.path.join(".")}
                        value={node.path.join(".")}
                      >
                        {`${"— ".repeat(node.depth)}${node.name}`}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-secondary folder-add-button"
                  type="button"
                  onClick={addFolder}
                >
                  + 폴더 추가
                </button>
              </div>

              <div
                className="folder-node-list"
                role="list"
                aria-label="폴더 구조"
              >
                {flatFolderNodes.length ? (
                  flatFolderNodes.map((node) => {
                    const pathKey = node.path.join(".");
                    return (
                      <div
                        className="folder-node-row"
                        key={`${pathKey}:${node.name}`}
                        role="listitem"
                        aria-label={`${node.depth + 1}단계 ${node.name} 폴더`}
                        style={
                          {
                            "--folder-indent": `${node.depth * 21}px`,
                          } as CSSProperties
                        }
                      >
                        <span className="folder-node-branch" aria-hidden="true">
                          {node.depth ? "└" : "●"}
                        </span>
                        <FluidTextArea
                          aria-label={`${node.name} 폴더명`}
                          defaultValue={node.name}
                          onBlur={(event) => {
                            const name = event.target.value.trim();
                            if (!name) {
                              event.target.value = node.name;
                              return;
                            }
                            saveFolderNodes(
                              updateFolderName(folderNodes, node.path, name),
                            );
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <button
                          className="folder-child-button"
                          type="button"
                          onClick={() => {
                            setParentFolderPath(pathKey);
                            folderNameInputRef.current?.focus();
                          }}
                        >
                          + 하위 폴더
                        </button>
                        <RemoveButton
                          label={`${node.name} 폴더와 하위 폴더 삭제`}
                          onClick={() => {
                            saveFolderNodes(
                              removeFolderNode(folderNodes, node.path),
                            );
                            setParentFolderPath("");
                          }}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="folder-empty-state">
                    아직 등록된 폴더가 없습니다. 새 폴더명을 입력해 시작하세요.
                  </div>
                )}
              </div>

              <div className="folder-tree-preview">
                <span>출력 미리보기</span>
                <pre>{data.folderTree || "폴더트리 미입력"}</pre>
              </div>
            </div>
            <Field label="프록시 / Burn-in 메모">
              <FluidTextArea
                value={data.proxyNote}
                onChange={(event) =>
                  setData((current) => ({
                    ...current,
                    proxyNote: event.target.value,
                  }))
                }
              />
            </Field>
          </section>

          <footer className="form-actions">
            <div>
              <strong>리포트 작성 준비 완료</strong>
              <span>
                {data.rolls.length}개 미디어 항목 · {data.clips.length}개 클립
                · {data.storage.length}개 저장매체 · {data.issues.length}개 이슈
              </span>
            </div>
            <button className="button button-primary" type="submit">
              출력 페이지 만들기
              <span aria-hidden="true">→</span>
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
