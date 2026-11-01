import type { App } from "antd";

type ModalApi = ReturnType<typeof App.useApp>["modal"];

/** Permission is scoped to the selected immutable uploaded file, never all voices. */
export async function confirmVoiceReferenceRights(modal: ModalApi, reference: { storageKey?: string; name?: string }, previous?: string) {
    const storage = reference.storageKey;
    if (!storage?.startsWith("resource:") || storage === "resource:") throw new Error("请先把声音参考上传到素材库");
    if (previous === storage) return storage;
    const accepted = await new Promise<boolean>((resolve) =>
        modal.confirm({
            title: "确认参考声音的使用授权",
            content: `将参考“${reference.name || "已连接的音频"}”的音色生成这段台词。请确认你拥有或已取得使用这份声音的授权；确认仅绑定这份音频，更换参考后需重新确认。`,
            okText: "我有使用授权，继续",
            cancelText: "取消",
            centered: true,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        }),
    );
    return accepted ? storage : undefined;
}
