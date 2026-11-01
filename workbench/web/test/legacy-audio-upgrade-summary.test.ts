import { test, expect } from "bun:test";
import { legacyNativeSummary } from "@/lib/legacy-import-fields";

test("later audio upgrades describe retained planning without promising another recovered chapter", () => {
    const result = legacyNativeSummary({ timelineClips: 8, audioLinks: 3, planningRecordId: "existing", recoveredUnitId: "previous-chapter", planningShots: 2, planningReused: true });
    expect(result).toContain("3 组声音跟随镜头");
    expect(result).toContain("保留已有制作方案的2 个镜头");
    expect(result).not.toContain("另增");
    expect(legacyNativeSummary({ planningRecordId: "new", recoveredUnitId: "new", planningShots: 2 })).toContain("另增制作方案章节");
});
