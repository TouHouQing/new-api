import { AudioLines, Check, Film, Image, MessageSquareText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelIcon, ModelPicker } from "@/components/model-picker";
import { isDirectSystemModel, modelChannelLabel } from "@/lib/model-picker-groups";
import { configuredModelDisplayName } from "@/lib/model-selection";
import { currentLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { selectableModelsByCapability, modelOptionName, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type DefaultModelKey = "imageModel" | "videoModel" | "textModel" | "audioModel";

const groups: Array<{
    capability: ModelCapability;
    modelKey: DefaultModelKey;
    icon: typeof Image;
}> = [
    { capability: "image", modelKey: "imageModel", icon: Image },
    { capability: "video", modelKey: "videoModel", icon: Film },
    { capability: "text", modelKey: "textModel", icon: MessageSquareText },
    { capability: "audio", modelKey: "audioModel", icon: AudioLines },
];

export function ModelDefaultGrid({ config, onChange }: { config: AiConfig; onChange: (key: DefaultModelKey, model: string) => void }) {
    const { t } = useTranslation();
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    return (
        <div className="space-y-1">
            {groups.map((group) => {
                const models = selectableModelsByCapability(config, group.capability);
                const selectedCost = config[group.modelKey] ? resolveModelChannel(config, config[group.modelKey]).modelCosts?.find((cost) => cost.model === modelOptionName(config[group.modelKey])) : undefined;
                const Icon = group.icon;
                const title = t(`account.settings.models.${group.capability}.title`);
                return (
                    <section key={group.capability} className="py-5 first:pt-0 last:pb-0" aria-labelledby={`default-${group.capability}-title`}>
                        <div className="mb-3 flex items-start gap-3">
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-active text-foreground/65">
                                <Icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                                <h3 id={`default-${group.capability}-title`} className="text-sm font-semibold">
                                    {title}
                                </h3>
                                <p className="mt-0.5 text-xs text-foreground/48">{t(`account.settings.models.${group.capability}.description`)}</p>
                            </div>
                            <span className="ml-auto shrink-0 text-xs tabular-nums text-foreground/38">{t("account.settings.models.available", { count: models.length })}</span>
                        </div>
                        {config.newApiGroups?.length || config.channels.some((channel) => channel.modelCosts?.some((cost) => cost.externalBilling)) ? (
                            <div className="flex flex-col gap-2">
                                <ModelPicker config={config} capability={group.capability} value={config[group.modelKey]} onChange={(model) => onChange(group.modelKey, model)} placeholder={`选择${title}`} fullWidth showSelectedPrice showOptionPrices />
                                {selectedCost?.externalBilling && selectedCost.hostPriceLabel ? <p className="text-xs text-foreground/60">{selectedCost.hostPriceLabel}</p> : null}
                            </div>
                        ) : models.length ? (
                            <div role="radiogroup" aria-label={title} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {models.map((model) => {
                                    const channel = resolveModelChannel(config, model);
                                    const selected = config[group.modelKey] === model;
                                    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
                                    const directSystemModel = isDirectSystemModel(config, model);
                                    const modelName = directSystemModel ? modelChannelLabel(config, model) : configuredModelDisplayName(config, model);
                                    const groupName = directSystemModel ? cost?.displayName?.trim() || t("account.settings.models.uncategorized") : "";
                                    return (
                                        <button
                                            key={model}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            className={cn(
                                                "model-default-option group relative overflow-hidden rounded-md px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                                                selected && "is-selected",
                                            )}
                                            onClick={() => onChange(group.modelKey, model)}
                                        >
                                            <span className="flex min-w-0 items-start gap-2">
                                                <span className="model-default-option-icon grid size-8 shrink-0 place-items-center rounded-md">
                                                    <ModelIcon config={config} model={model} />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    {groupName && groupName !== modelName ? (
                                                        <span className="mb-0.5 block truncate text-[var(--fs-tiny)] text-foreground/55" title={groupName}>
                                                            {groupName}
                                                        </span>
                                                    ) : null}
                                                    <span className="block break-words text-xs font-semibold" title={modelName}>
                                                        {modelName}
                                                    </span>
                                                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--fs-tiny)] text-foreground/45">
                                                        <span className="max-w-full truncate">{channel.scope === "system" ? t("account.settings.models.systemModel") : channel.name || t("account.settings.channels.unnamed")}</span>
                                                        <span className="model-default-option-scope">{channel.scope === "system" ? t("account.settings.models.scopeSystem") : t("account.settings.models.scopeCustom")}</span>
                                                        {creditsEnabled && cost ? (
                                                            <span className="model-default-price">
                                                                {cost.externalBilling ? (
                                                                    cost.hostPriceLabel || "按 New API 实际用量结算"
                                                                ) : (
                                                                    <>
                                                                        {formatPrice(cost.billingMode === "token" ? cost.outputTokenPriceMicrocredits || 0 : cost.unitPriceMicrocredits)} /
                                                                        {cost.billingMode === "token" ? "百万 Token" : cost.billingMode === "per_second" ? "秒" : "次"}
                                                                    </>
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </span>
                                                <span className={cn("model-default-option-check grid size-5 shrink-0 place-items-center rounded-full", selected ? "is-selected" : "text-transparent")}>
                                                    <Check className="size-3" strokeWidth={2.5} />
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-md bg-surface-active px-4 py-6 text-center text-xs text-foreground/45">{t(`account.settings.models.${group.capability}.empty`)}</div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

function formatPrice(microcredits: number) {
    return (microcredits / 1_000_000).toLocaleString(currentLocale(), { maximumFractionDigits: 6 });
}
