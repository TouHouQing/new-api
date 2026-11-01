import { configuredModelDisplayName, groupModelsByDisplayName, isDirectSystemModel, type DisplayModelGroup } from "@/lib/model-selection";
import { modelIcon, modelNewAPIGroup, modelOptionName, PUBLIC_MODEL_CATALOG_ID, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";

export type ModelPickerGroup = {
    key: string;
    label: string;
    icon: string;
    scope: string;
    kind: "product" | "channel" | "newapi-group";
    models: DisplayModelGroup[];
};

export { isDirectSystemModel } from "@/lib/model-selection";

export function modelChannelLabel(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (channel.scope === "system") return cost?.channelLabel?.trim() || modelOptionName(value);
    return cost?.channelLabel?.trim() || channel.name || "未命名渠道";
}

// 一级按已设置的模型展示名跨渠道聚合，空值归入未分类；二级保留独立调用与售价。
export function groupModelsForPicker(config: AiConfig, options: string[]): ModelPickerGroup[] {
    const groups = new Map<string, ModelPickerGroup>();
    for (const group of config.newApiGroups || []) {
        groups.set(JSON.stringify(["newapi-group", group.id]), { key: JSON.stringify(["newapi-group", group.id]), label: group.label || group.id, icon: "", scope: "New API", kind: "newapi-group", models: [] });
    }
    for (const channel of config.channels) {
        const models = options.filter((value) => resolveModelChannel(config, value).id === channel.id);
        const hostedModels = new Set<string>();
        for (const value of models) {
            const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
            if (!cost?.externalBilling) continue;
            const id = modelNewAPIGroup(config, value);
            if (!id) continue;
            hostedModels.add(value);
            const key = JSON.stringify(["newapi-group", id]);
            let group = groups.get(key);
            if (!group && config.newApiGroups !== undefined) continue;
            if (!group) {
                group = { key, label: id, icon: "", scope: "New API", kind: "newapi-group", models: [] };
                groups.set(key, group);
            }
            group.models.push({ key: value, label: configuredModelDisplayName(config, value), models: [value] });
        }
        const directModels = models.filter((value) => !hostedModels.has(value) && isDirectSystemModel(config, value));
        for (const value of directModels) {
            const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
            const label = cost?.displayName?.trim() || "未分类";
            const key = JSON.stringify(["product", label]);
            let group = groups.get(key);
            if (!group) {
                group = { key, label, icon: modelIcon(config, value), scope: "平台服务", kind: "product", models: [] };
                groups.set(key, group);
            }
            group.models.push({ key: value, label: modelChannelLabel(config, value), models: [value] });
        }
        const otherModels = models.filter((value) => !hostedModels.has(value) && !isDirectSystemModel(config, value));
        if (otherModels.length) {
            const key = JSON.stringify(["channel", channel.id]);
            groups.set(key, {
                key,
                label: channel.scope === "system" ? "系统模型" : channel.name || "未命名渠道",
                icon: modelIcon(config, otherModels[0]),
                scope: channel.id === PUBLIC_MODEL_CATALOG_ID ? "" : "我的模型",
                kind: "channel",
                models: groupModelsByDisplayName(config, otherModels),
            });
        }
    }
    return Array.from(groups.values());
}
