const labels: Record<string, string> = {
    "delivery.source-cycle": "需要修复的剪辑来源关系",
    "delivery.source-limit": "需要核对的剪辑来源历史",
    "delivery.source-unavailable": "待恢复的剪辑来源",
    "delivery.source-unreadable": "无法校验的剪辑来源",
    production: "其他制作设置",
    canvas: "画布附加设置",
    assembledMediaId: "原版成片",
    "shots.transition": "镜头转场",
    "shots.reviewStatus": "镜头审核状态",
    "shots.reviewNote": "镜头审片意见",
    "production.timeline.unfinished": "待补齐的镜头素材",
    "production.audioTracks.edit-anchor": "声音跟随方式",
    "production.motionGraphics": "标题、动效与图形",
    "production.reframes": "跟随构图",
    "production.translationNodes": "翻译任务与来源",
    "production.previs": "导演预演场景",
    "production.previs.advanced.exports": "历史 GLB 导出",
    "production.previs.aspectRatio": "原导演台画面比例",
    "production.source-unavailable": "待恢复的原始工程",
    "production.source-unreadable": "待核对的原始工程数据",
    "production.converter-mismatch": "待重新核对的转换版本",
    "audio.duration-pending": "待核对的声音时长",
    "captionsText.invalid-timing": "待校正的字幕时间",
    "regionalVersions.motionGraphics": "区域版动效与图形",
    "regionalVersions.reframes": "区域版跟随构图",
    "regionalVersions.translationNodes": "区域版翻译任务与来源",
    "regionalVersions.source-unavailable": "待恢复的原始版本",
    "regionalVersions.source-unreadable": "待核对的原始版本数据",
    "regionalVersions.source-changed": "已发生变化的原始工程档案",
};

export function legacyImportFieldLabel(field: string) {
    if (/^production\.analysisRefs\[\d+\]\./.test(field)) return "待核对的旧素材分析";
    return Object.hasOwn(labels, field) ? labels[field] : "待核对的旧版高级设置";
}

export function legacyCutConversionLabel(sourceKey: string | undefined) {
    const native = /^studio-native-v([1-9]\d*)$/.exec(sourceKey ?? "");
    if (native) return `旧工程转换 v${native[1]}`;
    const regional = /^legacy-regional-v([1-9]\d*):/.exec(sourceKey ?? "");
    return regional ? `区域转换 v${regional[1]}` : "";
}

export function legacyNativeSummary(report: {
    timelineClips?: number;
    transcripts?: number;
    transcriptVersions?: number;
    mediaAnalyses?: number;
    analysisVersions?: number;
    planningRecordId?: string;
    recoveredUnitId?: string;
    planningShots?: number;
    planningReused?: boolean;
    audioLinks?: number;
    previs?: { objects: number; reused?: boolean };
}) {
    return `${report.timelineClips || 0} 个片段、${report.transcripts || 0} 份文字稿（${report.transcriptVersions || 0} 个历史）、${report.mediaAnalyses || 0} 份素材分析（${report.analysisVersions || 0} 个历史）${report.audioLinks ? `，${report.audioLinks} 组声音跟随镜头` : ""}${report.planningRecordId ? `，${report.planningReused ? "保留已有制作方案的" : report.recoveredUnitId ? "另增制作方案章节，保留" : "制作方案保留"}${report.planningShots || 0} 个镜头及固定设定` : ""}${report.previs ? (report.previs.reused ? "，保留已有导演预演的编辑与删除" : `，在原画布另增可编辑导演预演（${report.previs.objects} 个对象）`) : ""}`;
}
