import { expect, test } from "bun:test";
import { inspectSrtImport } from "../src/lib/timeline/srt-parser";

test("字幕导入逐段指出格式问题，避免只导入部分文件后提示全部成功", () => {
    const valid = "1\n00:00:00,500 --> 00:00:01,500\n晨光里的橘猫";
    expect(inspectSrtImport(valid).invalidBlocks).toEqual([]);
    for (const invalid of ["broken", "2\n00:75:00,000 --> 00:76:00,000\nwrong", "2\n00:00:02,000 --> 00:00:01,000\nreverse", valid]) {
        expect(inspectSrtImport(valid + "\n\n" + invalid).invalidBlocks).toEqual([2]);
    }
});
