import { http } from "./request";
import type { RemoteUserDataSummary } from "./user-data";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

export type CanvasHistorySnapshot = { id: string; canvasId: string; revision: number; title: string; nodeCount: number; connectionCount: number; payloadBytes: number; reason: string; contentUpdatedAt: string; createdAt: string };
export type CanvasHistoryList = { snapshots: CanvasHistorySnapshot[]; currentRevision: number };
const path = (canvasId: string) => `/canvas-projects/${encodeURIComponent(canvasId)}/history`;

export function listCanvasHistory(canvasId: string, signal?: AbortSignal) {
    return http.get<CanvasHistoryList>(path(canvasId), { signal });
}
export function getCanvasHistorySnapshot(canvasId: string, snapshotId: string, signal?: AbortSignal) {
    return http.get<{ snapshot: CanvasHistorySnapshot; project: CanvasProject }>(`${path(canvasId)}/${encodeURIComponent(snapshotId)}`, { signal });
}
export function restoreCanvasHistory(canvasId: string, snapshotId: string, expectedRevision: number) {
    return http.post<{ project: RemoteUserDataSummary }>(`${path(canvasId)}/${encodeURIComponent(snapshotId)}/restore`, { expectedRevision }, { timeout: 30000 });
}
