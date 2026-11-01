import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDefaultGrid } from "../src/pages/settings/model-default-grid";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";

test("model settings recover enabled channel models when the legacy model snapshot is empty", () => {
    const config = {
        ...defaultConfig,
        models: [],
        channels: [
            {
                id: "newapi-text",
                name: "New API",
                scope: "system",
                enabled: true,
                models: ["t-qwen"],
                modelCosts: [{ model: "t-qwen", displayName: "Qwen", channelLabel: "New API · vip", capability: "text", protocol: "chat-completion", unitPriceMicrocredits: 5000000, externalBilling: true, hostPriceLabel: "按 New API 分组价格结算" }],
            },
        ],
    } as unknown as AiConfig;
    const html = renderToStaticMarkup(<ModelDefaultGrid config={config} onChange={() => {}} />);
    expect(html).toContain("Qwen");
    expect(html).toContain("New API · vip");
    expect(html).toContain('role="radio"');
    expect(html).toContain("按 New API 分组价格结算");
    expect(html).not.toContain("5 /次");
});
