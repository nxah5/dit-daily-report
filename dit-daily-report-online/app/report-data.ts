export type ReportStatus = "READY" | "CHECK" | "HOLD";
export type QualityStatus = "OK" | "PASS" | "CHECK" | "PENDING" | "N/A";
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
  status: "PASS",
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
    const parsed = JSON.parse(saved) as Partial<ReportData>;

    return {
      ...cloneInitial(),
      ...parsed,
      project: { ...initialReportData.project, ...parsed.project },
      handover: { ...initialReportData.handover, ...parsed.handover },
      rolls: Array.isArray(parsed.rolls) ? parsed.rolls : cloneInitial().rolls,
      cameraSetups: Array.isArray(parsed.cameraSetups)
        ? parsed.cameraSetups.map((row) => ({
            ...emptyCameraSetup(),
            ...row,
          }))
        : cloneInitial().cameraSetups,
      clips: Array.isArray(parsed.clips)
        ? parsed.clips.map((row) => ({
            ...emptyClip(),
            ...row,
            result: row.result === "NG" ? "NG" : "OK",
          }))
        : cloneInitial().clips,
      storage: Array.isArray(parsed.storage)
        ? parsed.storage.map((row) => ({
            ...emptyStorage(),
            ...row,
            status: normalizeStorageStatus(row.status),
          }))
        : cloneInitial().storage,
      qc: Array.isArray(parsed.qc) ? parsed.qc : cloneInitial().qc,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues
        : cloneInitial().issues,
    };
  } catch {
    return cloneInitial();
  }
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
