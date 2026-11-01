import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Select } from "@/components/ui/base/select";

test("native aria-label survives the unified select wrapper", () => {
    const html = renderToStaticMarkup(<Select aria-label="视频画面来源" options={[{ value: "text", label: "根据文字生成" }]} value="text" />);
    expect(html).toContain('aria-label="视频画面来源"');
});

test("legacy ariaLabel takes precedence when both spellings are supplied", () => {
    const html = renderToStaticMarkup(<Select ariaLabel="旧入口标签" aria-label="原生标签" options={[]} />);
    expect(html).toContain('aria-label="旧入口标签"');
    expect(html).not.toContain('aria-label="原生标签"');
});
