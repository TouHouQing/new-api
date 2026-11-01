import { InputNumber } from "antd";
import type { CanvasTheme } from "@/lib/canvas-theme";

export function CanvasImageCandidateCount({ theme, count, onChange, disabled = false }: { theme: CanvasTheme; count: number; onChange: (count: number) => void; disabled?: boolean }) {
    return (
        <div className="mt-4 space-y-2">
            <div className="text-sm font-medium">候选图片</div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="候选图片数量">
                {[1, 2, 3, 4].map((value) => (
                    <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        aria-pressed={count === value}
                        onClick={() => onChange(value)}
                        className="rounded-md border px-3 py-1.5 text-sm focus-visible:outline disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ borderColor: theme.node.stroke, background: count === value ? theme.toolbar.activeBg : theme.node.fill, color: count === value ? theme.toolbar.activeText : theme.node.text }}
                    >
                        {value} 张
                    </button>
                ))}
                <InputNumber disabled={disabled} min={1} max={15} precision={0} value={count} aria-label="自定义候选图片数量" onChange={(value) => onChange(value || 1)} />
            </div>
            <p className="text-xs" style={{ color: theme.node.muted }}>
                每张单独计费，可分别挑选和重做。
            </p>
        </div>
    );
}
