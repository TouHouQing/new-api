import { http } from "./request";

export type ReviewRole = "owner" | "editor" | "reviewer" | "viewer";
export type ReviewLocation = { timeMs?: number; endMs?: number; clipId?: string };
export type ReviewClip = { id: string; title?: string; kind?: string; startMs: number; durationMs: number; resourceId?: string; sourceStartMs?: number; playbackRate?: number; shotId?: string; artifactId?: string; assetVersionId?: string };
export type ReviewTarget =
    | { kind: "cut"; cutId: string; cutSha256: string; renderTaskId: string }
    | { kind: "artifact"; artifactId: string }
    | { kind: "asset"; assetVersionId: string; representationId: string }
    | { kind: "snapshot"; reviewId: string; reviewTargetSha256: string };
export type ProjectReview = {
    id: string;
    projectId: string;
    title: string;
    targetKind: string;
    parentReviewId?: string;
    targetSha256: string;
    resourceId: string;
    resourceSha256: string;
    resourceKind: string;
    durationMs: number;
    width: number;
    height: number;
    status: "in_review" | "changes_requested" | "approved";
    revision: number;
    archived: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};
export type ReviewSource = {
    version: number;
    kind: string;
    unitId?: string;
    cutId?: string;
    cutSha256?: string;
    renderTaskId?: string;
    shotId?: string;
    shotRevisionId?: string;
    artifactId?: string;
    assetId?: string;
    assetVersionId?: string;
    representationId?: string;
    resourceId: string;
    resourceKind: string;
    durationMs: number;
    clips?: ReviewClip[];
};
export type ReviewView = { review: ProjectReview; source: ReviewSource; role: ReviewRole; canComment: boolean; canDecide: boolean; canManage: boolean; openIssues: number; nextReviews: ProjectReview[] };
export type ReviewComment = ReviewLocation & {
    id: string;
    projectId?: string;
    reviewId?: string;
    authorUserId?: string;
    authorName: string;
    guest?: boolean;
    message: string;
    blocking?: boolean;
    resolved: boolean;
    assignedUserId?: string;
    resolutionKind?: string;
    resolutionReviewId?: string;
    resolutionNote?: string;
    revision?: number;
    createdAt: string;
};
export type ReviewShare = { id: string; projectId: string; reviewId: string; allowComments: boolean; active: boolean; revision: number; expiresAt: string; createdAt: string };
export type ReviewShareLink = { share: ReviewShare; url?: string; issue?: string };
export type ProjectMember = { id: string; projectId: string; userId: string; username: string; role: Exclude<ReviewRole, "owner">; active: boolean; revision: number };
export type ReviewWriteResult = { kind: string; review?: ProjectReview; comment?: ReviewComment; beforeComment?: ReviewComment; member?: ProjectMember; share?: ReviewShare; replayed: boolean };
export type ReviewReceipt = { result: ReviewWriteResult; link?: ReviewShareLink };
export type ReviewOperation =
    | { kind: "create"; input: { requestId: string; title: string; parentReviewId?: string; target: ReviewTarget } }
    | { kind: "comment"; reviewId: string; input: { requestId: string; targetSha256: string; message: string; blocking: boolean; location: ReviewLocation } }
    | {
          kind: "comment-patch";
          reviewId: string;
          commentId: string;
          input: { requestId: string; expectedRevision: number; targetSha256: string; message?: string; blocking?: boolean; resolved?: boolean; assignedUserId?: string; resolutionKind?: string; resolutionReviewId?: string; resolutionNote?: string };
      }
    | { kind: "state"; reviewId: string; input: { requestId: string; expectedRevision: number; title?: string; status?: ProjectReview["status"]; archived?: boolean; note?: string } }
    | { kind: "member"; input: { requestId: string; expectedRevision: number; userId?: string; username?: string; role: ProjectMember["role"]; active: boolean } }
    | { kind: "share"; reviewId: string; input: { requestId: string; allowComments: boolean; expiresDays: number } }
    | { kind: "revoke"; reviewId: string; shareId: string; input: { requestId: string; expectedRevision: number } };
const p = (id: string) => `/projects/${encodeURIComponent(id)}`;
const r = (project: string, review: string) => `${p(project)}/reviews/${encodeURIComponent(review)}`;
export const reviewStatusLabel = (status: string) => ({ in_review: "待审片", changes_requested: "需要修改", approved: "已通过" })[status] || "未知状态";
export const getReview = (id: string) => http.get<ReviewView>(`/reviews/${encodeURIComponent(id)}`);
export const listReviews = (projectId?: string, cursor?: string, archived = false) => http.get<{ reviews: ProjectReview[]; nextCursor?: string }>("/reviews", { params: { projectId, cursor, archived: archived ? "1" : "0", pageSize: 30 } });
export const listReviewComments = (projectId: string, id: string, cursor?: string) => http.get<{ comments: ReviewComment[]; nextCursor?: string }>(`${r(projectId, id)}/comments`, { params: { cursor, pageSize: 30 } });
export async function listReviewMembers(projectId: string) {
    const page = await http.get<{ members: ProjectMember[] }>(`${p(projectId)}/members`);
    if (!page || !Array.isArray(page.members)) throw new Error("协作者列表格式无效，请重新读取并核对服务版本");
    return page.members;
}
export const listReviewShares = (projectId: string, id: string) => http.get<ReviewShareLink[]>(`${r(projectId, id)}/shares`);
export const readReviewReceipt = (projectId: string, requestId: string) => http.get<ReviewReceipt>(`${p(projectId)}/reviews/results`, { params: { requestId } });
export async function performReviewOperation(projectId: string, operation: ReviewOperation): Promise<ReviewReceipt> {
    const { input } = operation;
    if (operation.kind === "share") return http.post<ReviewReceipt>(`${r(projectId, operation.reviewId)}/shares`, input);
    let result: ReviewWriteResult;
    switch (operation.kind) {
        case "create":
            result = await http.post<ReviewWriteResult>(`${p(projectId)}/reviews`, input);
            break;
        case "member":
            result = await http.post<ReviewWriteResult>(`${p(projectId)}/members`, input);
            break;
        case "comment":
            result = await http.post<ReviewWriteResult>(`${r(projectId, operation.reviewId)}/comments`, input);
            break;
        case "comment-patch":
            result = await http.patch<ReviewWriteResult>(`${r(projectId, operation.reviewId)}/comments/${encodeURIComponent(operation.commentId)}`, input);
            break;
        case "state":
            result = await http.patch<ReviewWriteResult>(r(projectId, operation.reviewId), input);
            break;
        case "revoke":
            result = await http.post<ReviewWriteResult>(`${r(projectId, operation.reviewId)}/shares/${encodeURIComponent(operation.shareId)}/revoke`, input);
            break;
    }
    return { result };
}
export const reviewMediaUrl = (id: string, guest = false) => `${import.meta.env.VITE_CANVAS_BACKEND_URL || "/api"}/${guest ? "review-shares" : "reviews"}/${encodeURIComponent(id)}/media`;
export type PublicReview = { id: string; title: string; projectName: string; targetSha256: string; resourceSha256: string; resourceKind: string; durationMs: number; status: string; allowComments: boolean; expiresAt: string; clips: ReviewClip[] };
const g = (id: string) => `/review-shares/${encodeURIComponent(id)}`;
export const openPublicReview = (id: string, token?: string) => (token ? http.post<PublicReview>(`${g(id)}/session`, { token }) : http.get<PublicReview>(g(id)));
export const listPublicReviewComments = (id: string, cursor?: string) => http.get<{ comments: ReviewComment[]; nextCursor?: string }>(`${g(id)}/comments`, { params: { cursor, pageSize: 30 } });
export type GuestReviewCommentRequest = { requestId: string; targetSha256: string; authorName: string; message: string; location: ReviewLocation };
export const addPublicReviewComment = (id: string, input: GuestReviewCommentRequest) => http.post<ReviewComment>(`${g(id)}/comments`, input);
export const readPublicReviewCommentResult = (id: string, requestId: string) => http.get<ReviewComment>(`${g(id)}/comment-result`, { params: { requestId } });
export const getReviewAssetSource = (projectId: string, assetVersionId: string) =>
    http.get<{ assetVersionId: string; representations: { id: string; resourceId: string; mediaType: string; role: string }[] }>(`${p(projectId)}/reviews/asset-source`, { params: { assetVersionId } });
export const getReviewRework = (projectId: string, reviewId: string, commentId: string) =>
    http.get<{
        reviewId: string;
        commentId: string;
        targetSha256: string;
        source: ReviewSource;
        location: { clip?: ReviewClip; programStartMs: number; programEndMs: number; sourceStartMs: number; sourceEndMs: number; wholeTarget: boolean; sourceTimeKnown: boolean };
    }>(`${r(projectId, reviewId)}/comments/${encodeURIComponent(commentId)}/rework`);
