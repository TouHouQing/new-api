import { Button, Form, Input } from "antd";
import { Select } from "@/components/ui/base/select";
import { narrativePurposes } from "@/lib/project-creative-brief";
import type { ProjectDetail } from "@/services/api/projects";
import { ShotStateReferenceImages } from "./shot-state-reference-images";

export function ShotIntentionFields({ detail, shotId }: { detail: ProjectDetail; shotId: string }) {
    const states = Form.useWatch("referenceStates") as { assetVersionId?: string }[] | undefined;
    const references = detail.shotReferences.filter((value) => value.shotId === shotId && (value.status === "linked" || value.status === "ready"));
    const options = references.map((value) => ({
        value: value.assetVersionId,
        label: `${value.asset?.title || detail.assets.find((asset) => asset.primaryVersionId === value.assetVersionId)?.title || "固定素材"} · ${value.referencedVersion?.version || "已选"} 版`,
    }));
    for (const state of states || []) if (state.assetVersionId && !options.some((value) => value.value === state.assetVersionId)) options.push({ value: state.assetVersionId, label: "原固定素材版本（请核对关联）" });
    return (
        <div className="workflow-form-grid">
            <Form.Item name={["narrative", "purpose"]} label="这个镜头的作用">
                <Select options={[...narrativePurposes]} />
            </Form.Item>
            <Form.Item name={["narrative", "information"]} label="观众要看懂什么">
                <Input maxLength={2000} placeholder="例如：她发现钥匙不见了" />
            </Form.Item>
            <Form.Item name={["narrative", "emotion"]} label="希望观众感受到什么">
                <Input maxLength={500} placeholder="例如：从轻松转为紧张" />
            </Form.Item>
            <Form.Item name={["narrative", "visualBeat"]} label="画面重点">
                <Input maxLength={2000} placeholder="例如：手伸进口袋后停住，切到空口袋特写" />
            </Form.Item>
            <Form.Item name={["narrative", "continuityNeeds"]} label="前后镜必须延续的内容">
                <Input.TextArea maxLength={2000} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="例如：雨伞一直拿在左手，衣服仍是湿的" />
            </Form.Item>
            <Form.List name="referenceStates">
                {(fields, { add, remove }) => (
                    <div className="space-y-3">
                        <p className="text-xs text-foreground/55">接戏状态固定在当前镜头版本中。先在镜头中关联角色、场景或道具，再补充其状态。</p>
                        {fields.map((field) => (
                            <div key={field.key} className="rounded-lg border border-border p-3">
                                <Form.Item name={[field.name, "assetVersionId"]} label="固定素材版本" rules={[{ required: true, message: "请选择已关联的素材版本" }]}>
                                    <Select options={options} placeholder="选择角色、场景或道具" />
                                </Form.Item>
                                <Form.Item name={[field.name, "stage"]} label="适用阶段">
                                    <Select
                                        options={[
                                            { value: "", label: "图片与视频都采用" },
                                            { value: "image", label: "只用于图片" },
                                            { value: "video", label: "只用于视频" },
                                        ]}
                                        placeholder="图片与视频都采用"
                                    />
                                </Form.Item>
                                <Form.Item name={[field.name, "wardrobe"]} label="衣着 / 外观">
                                    <Input maxLength={2000} />
                                </Form.Item>
                                <Form.Item name={[field.name, "emotion"]} label="情绪 / 表情">
                                    <Input maxLength={2000} />
                                </Form.Item>
                                <Form.Item name={[field.name, "propState"]} label="道具状态">
                                    <Input maxLength={2000} />
                                </Form.Item>
                                <Form.Item name={[field.name, "note"]} label="接戏说明">
                                    <Input maxLength={2000} />
                                </Form.Item>
                                <Form.Item name={[field.name, "referenceResourceIds"]} label="固定参考图">
                                    <ShotStateReferenceImages detail={detail} />
                                </Form.Item>
                                <Button size="small" onClick={() => remove(field.name)}>
                                    移除此状态
                                </Button>
                            </div>
                        ))}
                        <Button size="small" disabled={!options.length || fields.length >= 32} onClick={() => add({ assetVersionId: "", wardrobe: "", emotion: "", propState: "", note: "", referenceResourceIds: [] })}>
                            添加角色 / 场景 / 道具状态
                        </Button>
                    </div>
                )}
            </Form.List>
        </div>
    );
}
