import { useId } from "react";
import { Button, Input, InputNumber, Radio, Select } from "antd";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptionsForConfig, audioSpeedLabel, audioVoiceOptionsForConfig, isDoubaoAudioConfig, isLocalAudioConfig, isLocalSeparationConfig, isLocalMusicConfig, normalizeAudioFormatForConfig, normalizeAudioSpeedValue, normalizeAudioVoiceForConfig } from "@/lib/audio-generation";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasAudioSettingKey } from "@/components/canvas/canvas-audio-settings-popover";

type AudioSettingsPanelProps = { config: AiConfig; onConfigChange: (key: CanvasAudioSettingKey, value: string) => void; theme: CanvasTheme; showTitle?: boolean; className?: string };

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[var(--panel-width-compact)] space-y-4" }: AudioSettingsPanelProps) {
    const listId = useId();
    const doubao = isDoubaoAudioConfig(config);
    const localSpeech=isLocalAudioConfig(config);
    const voice = normalizeAudioVoiceForConfig(config, config.audioVoice);
    const voices = audioVoiceOptionsForConfig(config);
    const currentVoice = voices.some((item) => item.value === voice) ? voices : [{ value: voice, label: voice || "不指定音色" }, ...voices];
    const formats = audioFormatOptionsForConfig(config);
    const format = normalizeAudioFormatForConfig(config, config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);
    const selectVoice = (value: string) => onConfigChange("audioVoice", value);
    if (isLocalMusicConfig(config)) return <ImageSettingsTheme theme={theme}>
        <section className={className} style={{color:theme.node.text}} onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()} aria-label="音乐制作参数">
            {showTitle ? <h3 className="text-base font-semibold">制作音乐</h3> : null}
            <fieldset className="space-y-2"><legend className="text-xs">音乐类型</legend>
                <Radio.Group aria-label="音乐类型" value={config.audioMusicMode || "instrumental"} options={[{value:"instrumental",label:"纯音乐"},{value:"song",label:"填词歌曲"}]} onChange={event=>onConfigChange("audioMusicMode",event.target.value)}/>
            </fieldset>
            <label className="flex flex-col gap-2 text-xs">时长（秒）<InputNumber aria-label="音乐时长（秒）" min={10} max={30} precision={0} value={Number(config.audioSeconds || "30")} onChange={value=>{if(value!==null)onConfigChange("audioSeconds",String(value));}}/></label>
            <label className="flex flex-col gap-2 text-xs">节拍（BPM）<InputNumber aria-label="音乐节拍（BPM）" min={40} max={240} precision={0} value={Number(config.audioBpm || "90")} onChange={value=>{if(value!==null)onConfigChange("audioBpm",String(value));}}/></label>
            {config.audioMusicMode === "song" ? <>
                <label className="flex flex-col gap-2 text-xs">歌词语言<Select aria-label="歌词语言" value={config.audioLanguage || "zh"} options={[{value:"zh",label:"普通话"},{value:"yue",label:"粤语"},{value:"en",label:"英语"},{value:"ja",label:"日语"},{value:"ko",label:"韩语"}]} onChange={value=>onConfigChange("audioLanguage",value)}/></label>
                <label className="flex flex-col gap-2 text-xs">演唱歌词<Input.TextArea aria-label="演唱歌词" value={config.audioLyrics || ""} maxLength={3000} showCount autoSize={{minRows:4,maxRows:10}} placeholder={"[Verse]\n填写实际演唱的歌词"} onChange={event=>onConfigChange("audioLyrics",event.target.value)}/></label>
            </> : config.audioLyrics?.trim() ? <div className="space-y-2 text-xs"><p>已保留歌曲草稿。生成纯音乐前请清空歌词，或切回填词歌曲。</p><Button onClick={()=>onConfigChange("audioLyrics","")}>清空歌词</Button></div> : null}
            <p className="text-xs leading-5" style={{color:theme.node.muted}}>在节点提示词里描述风格、乐器和情绪，如“温暖的钢琴与弦乐，适合旅行片尾”。每次制作一段无损 FLAC，可试听后加入时间线。</p>
            <p className="text-xs leading-5" style={{color:theme.node.muted}}>节拍与演唱由模型生成，可能存在偏差。需要逐句对齐时，请生成后分析音频并核对歌词。</p>
        </section>
    </ImageSettingsTheme>;
    if (isLocalSeparationConfig(config)) return <ImageSettingsTheme theme={theme}>
        <section className={className} style={{ color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} aria-label="声音分离参数">
            {showTitle ? <h3 className="text-base font-semibold">分离声音</h3> : null}
            <Radio.Group aria-label="分轨范围" value={config.audioStems === "all" ? "all" : "pair"} options={[{ value: "pair", label: "人声与伴奏" }, { value: "all", label: "全部五轨" }]} onChange={(event) => onConfigChange("audioStems", event.target.value)} />
            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>连接一段音频。结果为独立的 WAV 音轨，可试听、下载和加入剪辑。全部五轨另含鼓点、贝斯和其他乐器；源音频没有的声音可能接近静音。</p>
            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>支持0.1秒至10分钟、最大32 MiB。视频请先提取声音。</p>
        </section>
    </ImageSettingsTheme>;
    return (
        <ImageSettingsTheme theme={theme}>
            <section className={className} style={{ color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} aria-label="音频生成参数">
                {showTitle ? <h3 className="text-base font-semibold">音频设置</h3> : null}
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        音色
                    </legend>
                    {localSpeech ? <><Radio.Group aria-label="配音音色" value={voice.startsWith("sample:")?"sample":voice} options={voices} onChange={event=>selectVoice(event.target.value)}/><p className="text-xs leading-5" style={{color:theme.node.muted}}>输入需要朗读的原文。参考音色需选择“参考音频音色”，并连接一段3–20秒的清晰讲话音频或已绑定声音的角色卡；生成前会确认这份声音的使用授权。</p></> : doubao ? (
                        <>
                            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>
                                无参考素材时按提示词生成；可连接最多 3 段音频或 1 张图片，图片与音频不能混用。
                            </p>
                            <Input aria-label="豆包音色 ID" value={voice} allowClear placeholder="留空按提示词生成，或输入可用的音色 ID" onChange={(event) => selectVoice(event.target.value.trim())} />
                            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>
                                仅填写当前模型已开通的音色或复刻音色 ID；不自动套用旧版音色列表。图片参考模式不使用此音色。
                            </p>
                        </>
                    ) : (
                        <>
                            <Input aria-label="渠道音色 ID" value={config.audioVoice || ""} list={listId} placeholder="输入渠道音色 ID" onChange={(event) => selectVoice(event.target.value)} />
                            <datalist id={listId}>
                                {currentVoice.map((item) => (
                                    <option value={item.value} key={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </datalist>
                            <Radio.Group aria-label="常用音色" value={voice} onChange={(event) => selectVoice(event.target.value)} options={currentVoice} className="flex flex-wrap gap-2" />
                        </>
                    )}
                </fieldset>
                <fieldset>
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        音频格式
                    </legend>
                    <Radio.Group aria-label="音频格式" value={format} options={formats} onChange={(event) => onConfigChange("audioFormat", event.target.value)} className="flex flex-wrap gap-2" />
                </fieldset>
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                        语速
                    </legend>
                    <Radio.Group aria-label="常用语速" value={speed} options={["0.75", "1", "1.25", "1.5"].map((value) => ({ value, label: audioSpeedLabel(value) }))} onChange={(event) => onConfigChange("audioSpeed", event.target.value)} />
                    <InputNumber
                        aria-label="自定义语速"
                        min={localSpeech ? 0.5 : 0.25}
                        max={localSpeech ? 2 : 4}
                        step={0.05}
                        value={Number(speed)}
                        className="w-full"
                        onChange={(value) => {
                            if (value !== null) onConfigChange("audioSpeed", normalizeAudioSpeedValue(String(value)));
                        }}
                    />
                    {doubao ? <p className="text-xs leading-5" style={{ color: theme.node.muted }}>1x 为正常语速。情绪克制、低声不等于慢速；提示词也不要重复要求放慢或拖长尾音。</p> : null}
                </fieldset>
                {localSpeech ? <><label className="flex flex-col gap-2 text-xs">朗读语言<Select aria-label="朗读语言" value={config.audioLanguage||"zh"} onChange={value=>onConfigChange("audioLanguage",value)} options={[...[{value:"zh",label:"中文"},{value:"en",label:"英语"},{value:"ja",label:"日语"},{value:"ko",label:"韩语"}],...Object.entries({ar:"阿拉伯语",da:"丹麦语",de:"德语",el:"希腊语",es:"西班牙语",fi:"芬兰语",fr:"法语",he:"希伯来语",hi:"印地语",it:"意大利语",ms:"马来语",nl:"荷兰语",no:"挪威语",pl:"波兰语",pt:"葡萄牙语",ru:"俄语",sv:"瑞典语",sw:"斯瓦希里语",tr:"土耳其语"}).map(([value,label])=>({value,label}))]}/></label><p className="text-xs leading-5" style={{color:theme.node.muted}}>按选择的声音与语速朗读；角色的文字表演设定保留供创作规划，不作为朗读台词或模型声音指令。</p>{config.audioInstructions&&<><p role="alert" className="text-xs">当前本地模型不支持已有的文字声音指令，请清除后生成。</p><Button size="small" onClick={()=>onConfigChange("audioInstructions","")}>清除不支持的声音指令</Button></>}</> : doubao ? (
                    <details className="space-y-2 text-xs" style={{ color: theme.node.muted }}>
                        <summary className="cursor-pointer">豆包提示词写法</summary>
                        <p className="leading-5">在节点的提示词输入框中写声音要求和台词，不是在这里填写。以下为写法建议，效果需试听确认。</p>
                        <p className="leading-5">建议结构：说话方式 + 情绪与节奏 + 要说的原文。默认自然语速、停顿简短，避免堆叠“缓慢、舒缓、娓娓道来”等要求。</p>
                        <p className="leading-5">例如：用自然、亲切的语气说，正常语速，句间短暂停顿，不拖尾音。只说：“大家好，欢迎来到影策工作台。”</p>
                        <p className="leading-5">参考音频：连接素材后使用 @Audio1、@Audio2、@Audio3，编号与参考顺序对应。例如：参考 @Audio1 的音色，以正常语速说：“我们出发吧。”</p>
                        <p className="leading-5">参考图片：最多连接 1 张图片，写清要说的台词；不要与参考音频混用。</p>
                        <p className="leading-5">当前豆包协议没有独立发送声音指令、语言和方言参数；这些要求写入节点提示词，不保证每项都能精确执行。</p>
                    </details>
                ) : (
                    <label className="flex flex-col gap-2 text-xs" style={{ color: theme.node.muted }}>
                        声音指令
                        <Input.TextArea aria-label="声音指令" rows={3} value={config.audioInstructions || ""} placeholder="例如：自然、温暖的旁白" onChange={(event) => onConfigChange("audioInstructions", event.target.value)} />
                    </label>
                )}
            </section>
        </ImageSettingsTheme>
    );
}
