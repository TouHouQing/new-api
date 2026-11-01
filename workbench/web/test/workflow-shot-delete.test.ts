import { expect, test } from "bun:test";

test("镜头编辑器在保存按钮左侧提供带确认的删除操作", async () => {
    const source = await Bun.file(new URL("../src/pages/production/detail/workflow-production-workbench.tsx", import.meta.url)).text();
    const deleteButton = source.search(/>\s*删除镜头\s*<\/Button>/);
    const saveButton = source.search(/>\s*保存脚本\s*<\/Button>/);

    expect(source).toContain("deleteProjectShot(projectId, shotId, expectedRevisionId)");
    expect(source).toContain("会保留在章节的方案历史中，可核对恢复");
    expect(source).toContain("okButtonProps: { danger: true }");
    expect(deleteButton).toBeGreaterThan(-1);
    expect(saveButton).toBeGreaterThan(deleteButton);
});

test("镜头删除 API 使用项目和镜头双重路径作用域", async () => {
    const source = await Bun.file(new URL("../src/services/api/projects.ts", import.meta.url)).text();

    expect(source).toContain("http.delete<{ deleted: boolean }>(`/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}`,");
    expect(source).toContain("requestId: crypto.randomUUID()");
});
