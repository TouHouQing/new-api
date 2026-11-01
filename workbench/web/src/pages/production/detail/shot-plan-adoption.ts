import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { readShotPlanSource, replaceProjectUnitShots, type ProjectDetail } from "@/services/api/projects";
import type { GenerationTask } from "@/services/api/task-center";
import { storyboardRowsToProjectShots, type ProjectShotReplacementInput } from "./chapter-storyboard-production";
import type { StoryboardRow } from "@/types/canvas";

export type ShotPlanIntent = {
    version: 1;
    requestId: string;
    projectId: string;
    unitId: string;
    scope: string;
    expectedSourceSha256: string;
    expectedShotIds: string[];
    assetVersions: Record<string, string>;
    assetLabels: Record<string, { title: string; category: string }>;
};
export type PendingShotPlan = { version: 1; intent: ShotPlanIntent; shots: ProjectShotReplacementInput[]; taskId?: string; warnings?: string[] };
const prefix = "shot-plan-adoption:";
const keyFor = (intent: ShotPlanIntent) => `${prefix}${intent.projectId}:${intent.unitId}:${intent.requestId}`;
export const shotPlanAdoptionEvent = "yingce:shot-plan-adoption";
const generationKey = (intent: ShotPlanIntent) => `shot-plan-generation:${intent.projectId}:${intent.unitId}:${intent.requestId}`;
const changed = () => window.dispatchEvent(new Event(shotPlanAdoptionEvent));
function requireScope(scope: string) {
    if (scope === "guest" || getActiveUserScope() !== scope) throw new Error("账号已切换，请在原账号中继续采用分镜");
}

export async function prepareShotPlanIntent(detail: ProjectDetail, unitId: string): Promise<ShotPlanIntent> {
    const scope = getActiveUserScope();
    requireScope(scope);
    const source = await readShotPlanSource(detail.project.id, unitId);
    requireScope(scope);
    return {
        version: 1,
        requestId: crypto.randomUUID(),
        projectId: detail.project.id,
        unitId,
        scope,
        expectedSourceSha256: source.sha256,
        expectedShotIds: source.snapshot.entries.map((shot) => shot.shotId),
        assetVersions: Object.fromEntries(detail.assets.flatMap((asset) => (asset.primaryVersionId ? [[asset.id, asset.primaryVersionId]] : []))),
        assetLabels: Object.fromEntries(detail.assets.map((asset) => [asset.id, { title: asset.title, category: asset.category }])),
    };
}
export function shotPlanIntentFromTask(task: GenerationTask): ShotPlanIntent | null {
    const raw = JSON.parse(task.inputJson || "{}").metadata?.shotPlanIntent;
    if (!raw) return null;
    if (
        raw.version !== 1 ||
        typeof raw.requestId !== "string" ||
        typeof raw.scope !== "string" ||
        typeof raw.projectId !== "string" ||
        typeof raw.unitId !== "string" ||
        !/^[a-f0-9]{64}$/.test(raw.expectedSourceSha256) ||
        !Array.isArray(raw.expectedShotIds) ||
        raw.expectedShotIds.some((id: unknown) => typeof id !== "string") ||
        !raw.assetVersions ||
        typeof raw.assetVersions !== "object" ||
        Object.values(raw.assetVersions).some((value) => typeof value !== "string") ||
        !raw.assetLabels ||
        typeof raw.assetLabels !== "object"
    )
        throw new Error("任务的原分镜来源无法读取，请先核对任务记录");
    return raw;
}
export async function savePendingShotPlan(pending: PendingShotPlan) {
    requireScope(pending.intent.scope);
    await localForageStorageForScope(pending.intent.scope).setItem(keyFor(pending.intent), JSON.stringify(pending));
    requireScope(pending.intent.scope);
    changed();
}
export async function pendingShotPlans(projectId: string, unitId: string): Promise<PendingShotPlan[]> {
    const scope = getActiveUserScope(),
        storage = localForageStorageForScope(scope);
    const keys = (await storage.keys()).filter((key) => key.startsWith(`${prefix}${projectId}:${unitId}:`));
    const values = await Promise.all(
        keys.map(async (key) => {
            const raw = await storage.getItem(key);
            if (!raw) return null;
            const value = JSON.parse(raw) as PendingShotPlan;
            if (value.version !== 1 || value.intent.scope !== scope || value.intent.projectId !== projectId || value.intent.unitId !== unitId || !Array.isArray(value.shots)) throw new Error("本地待采用分镜记录无法读取，原数据已保留");
            return value;
        }),
    );
    requireScope(scope);
    return values.filter((value): value is PendingShotPlan => Boolean(value));
}
export async function discardPendingShotPlan(pending: PendingShotPlan) {
    requireScope(pending.intent.scope);
    await localForageStorageForScope(pending.intent.scope).removeItem(keyFor(pending.intent));
    changed();
}
export async function saveShotPlanGeneration(intent: ShotPlanIntent) {
    requireScope(intent.scope);
    await localForageStorageForScope(intent.scope).setItem(generationKey(intent), JSON.stringify(intent));
    changed();
}
export async function finishShotPlanGeneration(intent: ShotPlanIntent) {
    requireScope(intent.scope);
    await localForageStorageForScope(intent.scope).removeItem(generationKey(intent));
    changed();
}
export async function pendingShotPlanGenerations(projectId: string, unitId: string): Promise<ShotPlanIntent[]> {
    const scope = getActiveUserScope(),
        storage = localForageStorageForScope(scope);
    const keys = (await storage.keys()).filter((key) => key.startsWith(`shot-plan-generation:${projectId}:${unitId}:`));
    const intents = await Promise.all(keys.map(async (key) => JSON.parse((await storage.getItem(key)) || "null") as ShotPlanIntent | null));
    requireScope(scope);
    if (intents.some((value) => !value || value.scope !== scope || value.projectId !== projectId || value.unitId !== unitId)) throw new Error("原分镜生成请求无法读取，请先核对本地记录");
    return intents as ShotPlanIntent[];
}
export async function adoptPendingShotPlan(pending: PendingShotPlan) {
    const { intent } = pending;
    requireScope(intent.scope);
    const result = await replaceProjectUnitShots(intent.projectId, intent.unitId, pending.shots, intent.expectedShotIds, { requestId: intent.requestId, expectedSourceSha256: intent.expectedSourceSha256 });
    requireScope(intent.scope);
    if (result.current) await discardPendingShotPlan(pending);
    return result;
}
export async function storeStoryboardPlan(intent: ShotPlanIntent, rows: StoryboardRow[], detail: ProjectDetail, taskId?: string) {
    const pending: PendingShotPlan = { version: 1, intent, shots: storyboardRowsToProjectShots(rows, detail, intent.assetVersions, intent.assetLabels), taskId };
    await savePendingShotPlan(pending);
    await finishShotPlanGeneration(intent);
    return adoptPendingShotPlan(pending);
}
