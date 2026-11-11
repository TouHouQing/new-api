import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "bun:test";

const source = readFileSync(resolve(import.meta.dir, "../src/pages/tasks/task-detail-modal.tsx"), "utf8");

test("text task details render the generated result with copy support", () => {
    expect(source).toContain("const generatedText = resultText(task.resultJson)");
    expect(source).toContain("<h3>生成内容</h3>");
    expect(source).toContain("onCopy(generatedText)");
    expect(source).toMatch(/text\|content\|output_text\|answer\|message/);
});
