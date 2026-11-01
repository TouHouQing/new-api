type EditIntent = { resourceId: string; expectedSourceSha256: string; emotion?: unknown };
type EditReceipt = { kind: "mask" | "emotion"; sourceResourceId: string; sourceSha256: string; recipeSha256: string };

// A saved full-frame composite is consumed directly. Missing or mismatched
// receipts must not publish a raw crop or blend the same result a second time.
export function hasNativeImageEditResult(intent: EditIntent | undefined, receipt: EditReceipt | undefined, storageKey: string | undefined) {
    if (!intent) {
        if (receipt) throw new Error("图片处理回执缺少对应的原任务参数");
        return false;
    }
    if (
        !receipt ||
        receipt.kind !== (intent.emotion ? "emotion" : "mask") ||
        receipt.sourceResourceId !== intent.resourceId ||
        receipt.sourceSha256 !== intent.expectedSourceSha256 ||
        !/^[a-f0-9]{64}$/.test(receipt.recipeSha256) ||
        !storageKey?.startsWith("resource:")
    )
        throw new Error("局部图片结果尚未完成服务端合成，请恢复原任务结果");
    return true;
}
