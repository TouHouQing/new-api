import { http } from "./request";

export type ProjectDelivery = { resourceId: string; fileName: string; sha256: string; bytes: number };
export const readProjectDeliverySource = (projectId: string) => http.get<{ sha256: string; projectRevision: number }>(`/projects/${encodeURIComponent(projectId)}/delivery-source`);
export const readProjectDeliveryResult = (projectId: string, sourceSha256: string) => http.get<ProjectDelivery>(`/projects/${encodeURIComponent(projectId)}/delivery-result`, { params: { sourceSha256 }, timeout: 600_000 });
export const createProjectDelivery = (projectId: string, sourceSha256: string, signal?: AbortSignal) => http.post<ProjectDelivery>(`/projects/${encodeURIComponent(projectId)}/delivery-packages`, { sourceSha256 }, { signal, timeout: 600_000 });
