import { describe, expect, test } from "bun:test";
import { audioTaskOutputNodeId, planAudioTaskResultNodes } from "@/lib/canvas/canvas-audio-task-results";
import { commitCanvasGenerationResult } from "@/lib/canvas/canvas-generation-result";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const outputs = [
    { name: "人声", role: "vocals" },
    { name: "伴奏", role: "instrumental" },
    { name: "鼓组", role: "drums" },
];
const root = (): CanvasNodeData => ({ id: "voice", type: CanvasNodeType.Audio, title: "分离声音", position: { x: 10, y: 20 }, width: 300, height: 100, metadata: { taskId: "task", status: "loading" } });
const finish = (node: CanvasNodeData): CanvasNodeData => ({ ...node, metadata: { ...node.metadata, taskId: "task", status: "success", content: "/owned.wav" } });

describe("native audio output delivery", () => {
    test("all tracks receive stable identities and remain independent of image batch visibility", () => {
        const node = root();
        const plans = planAudioTaskResultNodes(node, [node], "task", outputs);
        expect(plans.map((plan) => plan.outputIndex)).toEqual([0, 1, 2]);
        expect(plans.map((plan) => plan.node.title)).toEqual(["人声", "伴奏", "鼓组"]);
        expect(plans[0].node.metadata?.audioOutputNodeIds).toEqual([audioTaskOutputNodeId("voice", "task", 1), audioTaskOutputNodeId("voice", "task", 2)]);
        for (const plan of plans.slice(1)) {
            expect(plan.node.metadata?.audioOutputSourceNodeId).toBe(node.id);
            expect(plan.node.metadata?.batchRootId).toBeUndefined();
            expect(plan.node.metadata?.isBatchRoot).toBeUndefined();
        }
        expect(node.title).toBe("分离声音");
        expect(node.metadata?.generationOutputCount).toBeUndefined();
    });

    test("reload preserves moved and renamed tracks and does not resurrect deleted tracks", () => {
        const first = planAudioTaskResultNodes(root(), [root()], "task", outputs).map((plan) => finish(plan.node));
        const renamed = { ...first[0], title: "我的旁白" };
        const moved = { ...first[1], title: "我的配乐", position: { x: -1000, y: 400 } };
        const reloaded = planAudioTaskResultNodes(renamed, [renamed, moved], "task", outputs);
        expect(reloaded.map((plan) => plan.outputIndex)).toEqual([0, 1]);
        expect(reloaded[0].node.title).toBe("我的旁白");
        expect(reloaded[1].node).toMatchObject({ title: "我的配乐", position: moved.position });
        expect(reloaded[0].node.metadata?.audioOutputNodeIds).toHaveLength(2);
    });

    test("repurposed tracks are preserved while unfinished identity collisions are rejected", () => {
        const initial = planAudioTaskResultNodes(root(), [root()], "task", outputs).map((plan) => finish(plan.node));
        const other = { ...initial[1], metadata: { taskId: "other-task", content: "/other.wav" } };
        expect(planAudioTaskResultNodes(initial[0], [initial[0], other, initial[2]], "task", outputs).map((plan) => plan.outputIndex)).toEqual([0, 2]);
        expect(() => planAudioTaskResultNodes(root(), [root(), other], "task", outputs)).toThrow("其他内容");
    });

    test("new tracks avoid existing content and content added while results were loading", () => {
        const node = root();
        const plans = planAudioTaskResultNodes(node, [node], "task", outputs.slice(0, 2));
        const busy = { ...node, id: "later-note", type: CanvasNodeType.Text, position: plans[1].node.position, metadata: {} };
        const committed = commitCanvasGenerationResult([node, busy], node, finish(plans[0].node), "task", [finish(plans[1].node)]);
        const track = committed.find((candidate) => candidate.id === plans[1].node.id)!;
        expect(track.position).not.toEqual(busy.position);
        const separated = track.position.x >= busy.position.x + busy.width || track.position.y >= busy.position.y + busy.height || track.position.x + track.width <= busy.position.x || track.position.y + track.height <= busy.position.y;
        expect(separated).toBe(true);
        expect(committed.find((candidate) => candidate.id === busy.id)).toEqual(busy);
    });

    test("a late result cannot overwrite a track reassigned during asynchronous adoption", () => {
        const first = planAudioTaskResultNodes(root(), [root()], "task", outputs.slice(0, 2)).map((plan) => finish(plan.node));
        const replaced = { ...first[1], title: "我重新选择的声音", metadata: { taskId: "new-task", content: "/different.wav" } };
        const result = commitCanvasGenerationResult([first[0], replaced], first[0], first[0], "task", [first[1]]);
        expect(result.find((node) => node.id === replaced.id)).toEqual(replaced);
        expect(() => commitCanvasGenerationResult([replaced], first[0], first[0], "task", [first[1]])).toThrow("已删除");
    });

    test("an incomplete multi-track document receives its missing outputs once", () => {
        const initial = planAudioTaskResultNodes(root(), [root()], "task", outputs);
        const incomplete = { ...finish(initial[0].node), metadata: { ...initial[0].node.metadata, status: "success" as const, taskId: "task", generationOutputCount: undefined } };
        const restored = planAudioTaskResultNodes(incomplete, [incomplete], "task", outputs);
        expect(restored.map((plan) => plan.node.id)).toEqual(initial.map((plan) => plan.node.id));
        expect(() => planAudioTaskResultNodes(root(), [root()], "task", [])).toThrow("音轨数量");
        expect(() =>
            planAudioTaskResultNodes(
                root(),
                [root()],
                "task",
                Array.from({ length: 33 }, () => ({})),
            ),
        ).toThrow("音轨数量");
    });
});
