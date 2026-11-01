import { useEffect, useRef, useState } from "react";
import { resolveMediaUrl } from "@/services/file-storage";
import { timelineClipFade } from "@/lib/timeline/timeline-preview-layers";
import { clipPlaybackRate, clipSourceTime } from "@/lib/timeline/timeline-speed";
import type { TimelineClip } from "@/types/timeline";

export function EditorPreviewAudio({ clip, programMs, playing, speed, onError }: { clip: TimelineClip; programMs: number; playing: boolean; speed: number; onError: (message: string) => void }) {
    const element = useRef<HTMLAudioElement>(null);
    const blockedPlay = useRef(false);
    const [url, setURL] = useState("");
    const latest = useRef({ clip, programMs, playing, speed });
    latest.current = { clip, programMs, playing, speed };
    useEffect(() => {
        blockedPlay.current = false;
    }, [playing, url]);
    useEffect(() => {
        let disposed = false;
        const media = clip.directMedia;
        setURL("");
        if (media)
            void resolveMediaUrl(media.storageKey ?? "", media.url ?? media.dataUrl ?? "")
                .then((value) => {
                    if (!disposed) setURL(value);
                })
                .catch(() => {
                    if (!disposed) onError("音轨素材无法读取，请检查素材后重新播放");
                });
        return () => {
            disposed = true;
        };
    }, [clip.directMedia?.storageKey, clip.directMedia?.url, clip.directMedia?.dataUrl, onError]);
    const synchronize = () => {
        const audio = element.current;
        if (!audio) return;
        const state = latest.current;
        const sourceTime = clipSourceTime(state.clip, state.programMs) / 1000;
        if (Math.abs(audio.currentTime - sourceTime) > 0.15) audio.currentTime = Math.max(0, sourceTime);
        audio.playbackRate = state.speed * clipPlaybackRate(state.clip);
        audio.volume = Math.min(1, Math.max(0, (state.clip.volume ?? 1) * timelineClipFade(state.clip, state.programMs)));
        if (state.playing && audio.paused && !blockedPlay.current) {
            blockedPlay.current = true;
            void audio
                .play()
                .then(() => {
                    blockedPlay.current = false;
                })
                .catch(() => onError("浏览器尚未允许播放声音，请暂停后再次点击播放"));
        } else if (!state.playing) audio.pause();
    };
    useEffect(synchronize, [url, programMs, playing, speed, clip]);
    useEffect(() => {
        const audio = element.current;
        return () => {
            audio?.pause();
        };
    }, []);
    return <audio ref={element} src={url || undefined} aria-label={`音轨预览：${clip.title || "音频"}`} preload="auto" onLoadedMetadata={synchronize} onError={() => onError("音轨无法解码，请检查源文件")} />;
}
