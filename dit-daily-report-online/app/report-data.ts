export type ReportStatus = "READY" | "CHECK" | "HOLD";
export type QualityStatus = "OK" | "PASS" | "CHECK" | "PENDING" | "N/A";
export const ROLL_STATUS_OPTIONS = [
  "Pending (대기)",
  "Ready (준비 완료)",
  "Copying (복사 중)",
  "Verifying (검증 중)",
  "Pass (검증 통과)",
  "Hold (보류)",
  "Failed (실패)",
  "N/A (해당 없음)",
] as const;
export const STORAGE_GRADE_OPTIONS = [
  "Source (원본 카드)",
  "Primary (1차 백업)",
  "Secondary (2차 백업)",
  "Tertiary (3차 백업)",
  "Shuttle (운반용)",
  "Archive (장기 보관)",
  "Proxy (프록시)",
  "N/A (해당 없음)",
] as const;
export const STORAGE_STATUS_OPTIONS = [
  "Ready",
  "Copying",
  "Hold",
  "Pending",
  "Failed",
] as const;
export type StorageStatus = (typeof STORAGE_STATUS_OPTIONS)[number];

export type RollLog = {
  roll: string;
  camera: string;
  codec: string;
  card: string;
  offloadGb: number;
  checksum: string;
  status: string;
  clips: number;
  notes: string;
};

export type CameraSetup = {
  camera: string;
  body: string;
  codecResolution: string;
  fps: string;
  colorSpace: string;
  lut: string;
};

export type ClipLog = {
  fileName: string;
  roll: string;
  camera: string;
  scene: string;
  cut: string;
  take: string;
  result: "OK" | "NG";
  tcIn: string;
  tcOut: string;
  audioRoll: string;
  notes: string;
};

export type StorageLog = {
  grade: string;
  purpose: string;
  storage: string;
  format: string;
  path: string;
  status: StorageStatus;
};

export type QcItem = {
  label: string;
  status: QualityStatus;
  note: string;
};

export type IssueLog = {
  time: string;
  severity: string;
  roll: string;
  detail: string;
  status: string;
};

export type ReportData = {
  project: {
    title: string;
    reportId: string;
    reportStatus: ReportStatus;
    shootDay: string;
    shootDate: string;
    createdAt: string;
    callTime: string;
    wrapTime: string;
    director: string;
    cinematographer: string;
    dit: string;
    production: string;
    location: string;
  };
  rolls: RollLog[];
  cameraSetups: CameraSetup[];
  clips: ClipLog[];
  storage: StorageLog[];
  qc: QcItem[];
  issues: IssueLog[];
  handover: {
    items: string;
    method: string;
    dataManager: string;
    recipient: string;
    time: string;
    confirmation: string;
    note: string;
  };
  folderTree: string;
  proxyNote: string;
};

export const STORAGE_KEY = "dit-daily-report-v2";
export const REPORT_EXPORT_FORMAT = "dit-daily-report";
export const REPORT_EXPORT_VERSION = 1;

export const initialReportData: ReportData = {
  project: {
    title: "",
    reportId: "",
    reportStatus: "CHECK",
    shootDay: "",
    shootDate: "",
    createdAt: "",
    callTime: "",
    wrapTime: "",
    director: "",
    cinematographer: "",
    dit: "",
    production: "",
    location: "",
  },
  rolls: [],
  cameraSetups: [],
  clips: [],
  storage: [],
  qc: [
    {
      label: "파일 트리 고정",
      status: "PENDING",
      note: "",
    },
    {
      label: "체크섬 검증",
      status: "PENDING",
      note: "",
    },
    {
      label: "프록시 확인",
      status: "PENDING",
      note: "",
    },
    {
      label: "네이밍 확인",
      status: "PENDING",
      note: "",
    },
    {
      label: "오디오 무결성",
      status: "PENDING",
      note: "",
    },
    {
      label: "인계 준비",
      status: "PENDING",
      note: "",
    },
  ],
  issues: [],
  handover: {
    items: "",
    method: "",
    dataManager: "",
    recipient: "",
    time: "",
    confirmation: "",
    note: "",
  },
  folderTree: "",
  proxyNote: "",
};

export const emptyRoll = (): RollLog => ({
  roll: "",
  camera: "",
  codec: "",
  card: "",
  offloadGb: 0,
  checksum: "xxHash64",
  status: "Pending (대기)",
  clips: 0,
  notes: "",
});

export const emptyCameraSetup = (): CameraSetup => ({
  camera: "",
  body: "",
  codecResolution: "",
  fps: "",
  colorSpace: "",
  lut: "",
});

export const emptyClip = (): ClipLog => ({
  fileName: "",
  roll: "",
  camera: "",
  scene: "",
  cut: "",
  take: "",
  result: "OK",
  tcIn: "",
  tcOut: "",
  audioRoll: "",
  notes: "",
});

export const emptyStorage = (): StorageLog => ({
  grade: "",
  purpose: "",
  storage: "",
  format: "",
  path: "",
  status: "Pending",
});

export const emptyIssue = (): IssueLog => ({
  time: "",
  severity: "Low",
  roll: "",
  detail: "",
  status: "진행",
});

const cloneInitial = () =>
  JSON.parse(JSON.stringify(initialReportData)) as ReportData;

export const createEmptyReportData = () => cloneInitial();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStorageStatus(value: unknown): StorageStatus {
  if (
    typeof value === "string" &&
    STORAGE_STATUS_OPTIONS.includes(value as StorageStatus)
  ) {
    return value as StorageStatus;
  }
  return "Pending";
}

export function loadReportData(): ReportData {
  if (typeof window === "undefined") return cloneInitial();

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return cloneInitial();
    return normalizeReportData(JSON.parse(saved));
  } catch {
    return cloneInitial();
  }
}

export function normalizeReportData(value: unknown): ReportData {
  if (!isRecord(value)) return cloneInitial();

  const parsed = value as Partial<ReportData>;
  const project = isRecord(parsed.project) ? parsed.project : {};
  const handover = isRecord(parsed.handover) ? parsed.handover : {};

  return {
    ...cloneInitial(),
    ...parsed,
    project: { ...initialReportData.project, ...project },
    handover: { ...initialReportData.handover, ...handover },
    rolls: Array.isArray(parsed.rolls)
      ? parsed.rolls.filter(isRecord).map((row) => ({
          ...emptyRoll(),
          ...row,
          offloadGb: Number.isFinite(Number(row.offloadGb))
            ? Number(row.offloadGb)
            : 0,
          clips: Number.isFinite(Number(row.clips)) ? Number(row.clips) : 0,
          status:
            typeof row.status === "string"
              ? row.status
              : emptyRoll().status,
        }))
      : cloneInitial().rolls,
    cameraSetups: Array.isArray(parsed.cameraSetups)
      ? parsed.cameraSetups.filter(isRecord).map((row) => ({
          ...emptyCameraSetup(),
          ...row,
        }))
      : cloneInitial().cameraSetups,
    clips: Array.isArray(parsed.clips)
      ? parsed.clips.filter(isRecord).map((row) => ({
          ...emptyClip(),
          ...row,
          result: row.result === "NG" ? "NG" : "OK",
        }))
      : cloneInitial().clips,
    storage: Array.isArray(parsed.storage)
      ? parsed.storage.filter(isRecord).map((row) => ({
          ...emptyStorage(),
          ...row,
          grade: typeof row.grade === "string" ? row.grade : "",
          status: normalizeStorageStatus(row.status),
        }))
      : cloneInitial().storage,
    qc: Array.isArray(parsed.qc) ? parsed.qc : cloneInitial().qc,
    issues: Array.isArray(parsed.issues)
      ? parsed.issues
      : cloneInitial().issues,
  } as ReportData;
}

export function createReportExport(data: ReportData) {
  return {
    format: REPORT_EXPORT_FORMAT,
    version: REPORT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function parseReportImport(contents: string): ReportData {
  const parsed: unknown = JSON.parse(contents);
  if (!isRecord(parsed)) {
    throw new Error("올바른 DIT 데일리 리포트 파일이 아닙니다.");
  }

  const candidate =
    parsed.format === REPORT_EXPORT_FORMAT && isRecord(parsed.data)
      ? parsed.data
      : parsed;
  const hasReportShape =
    isRecord(candidate.project) ||
    Array.isArray(candidate.rolls) ||
    Array.isArray(candidate.storage);

  if (!hasReportShape) {
    throw new Error("리포트 데이터를 찾을 수 없습니다.");
  }

  return normalizeReportData(candidate);
}

export function saveReportData(data: ReportData) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

export function getReportMetrics(data: ReportData) {
  const rollCount = new Set(
    data.rolls.map((row) => row.roll.trim()).filter(Boolean),
  ).size;
  const offloadGb = data.rolls.reduce(
    (sum, row) => sum + Number(row.offloadGb || 0),
    0,
  );
  const clipCount = data.rolls.reduce(
    (sum, row) => sum + Number(row.clips || 0),
    0,
  );
  const backupCount = data.storage.filter(
    (row) => row.status.toLowerCase() === "ready",
  ).length;

  return { rollCount, offloadGb, clipCount, backupCount };
}
