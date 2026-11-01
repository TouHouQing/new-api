import { describe, expect, test } from "bun:test";

import { resolveAddNodeMenuCommands, type AddNodeMenuContext } from "../src/lib/canvas/tool-registry";

describe("普通画布添加菜单", () => {
    test("双击新建在未关联项目时也包含角色卡", () => {
        const commands = resolveAddNodeMenuCommands({
            workspaceMode: "professional",
            isProjectLinked: false,
            handlers: {} as AddNodeMenuContext["handlers"],
        });
        const character = commands.find((command) => command.id === "project-character");
        expect(character?.label).toBe("角色卡");
        expect(character?.section).toBe("node");
    });
    test("新手与专业模式的配音入口都直接选择音频生成，原工作流保持默认行为", () => {
        for (const workspaceMode of ["simple", "professional"] as const) {
            const modes: (string | undefined)[] = [];
            const context: AddNodeMenuContext = { workspaceMode, isProjectLinked: false, handlers: { onAddWorkflow: (mode) => modes.push(mode) } as AddNodeMenuContext["handlers"] };
            const commands = resolveAddNodeMenuCommands(context);
            const speech = commands.find((command) => command.id === "speech");
            expect(speech?.label).toBe("配音");
            speech!.run(context);
            expect(modes).toEqual(["audio"]);
            const workflow = commands.find((command) => command.id === "workflow");
            if (workspaceMode === "professional") {
                workflow!.run(context);
                expect(modes).toEqual(["audio", undefined]);
            } else expect(workflow).toBeUndefined();
        }
    });
});
