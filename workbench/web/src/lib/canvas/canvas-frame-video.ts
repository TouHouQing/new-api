import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

// One isolated worker per render. Encode and discard two-second PNG batches
// so a long shot cannot fill WASM memory with every uncompressed source frame.
export async function encodeCanvasFrames(frames: AsyncIterable<Blob>, fps: number, expectedFrames: number, options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}) {
    if (![24, 25, 30].includes(fps) || !Number.isInteger(expectedFrames) || expectedFrames < 1 || expectedFrames > 1800) throw new Error("预演视频帧率或时长不正确");
    const ffmpeg = new FFmpeg(),
        files = new Set<string>(),
        segments: string[] = [];
    let count = 0,
        batch = 0;
    const check = () => {
        if (options.signal?.aborted) throw new DOMException("已取消白膜制作", "AbortError");
    };
    const cancel = () => ffmpeg.terminate();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const flush = async () => {
        const name = `segment-${segments.length}.mp4`;
        files.add(name);
        const code = await ffmpeg.exec([
            "-framerate",
            String(fps),
            "-start_number",
            "0",
            "-i",
            "frame-%04d.png",
            "-frames:v",
            String(batch),
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-r",
            String(fps),
            "-movflags",
            "+faststart",
            "-threads",
            "1",
            name,
        ]);
        if (code !== 0) throw new Error("预演视频编码失败，未回写不完整文件");
        segments.push(name);
        for (let index = 0; index < batch; index++) {
            const file = `frame-${String(index).padStart(4, "0")}.png`;
            await ffmpeg.deleteFile(file);
            files.delete(file);
        }
        batch = 0;
    };
    try {
        check();
        await ffmpeg.load({ coreURL, wasmURL });
        for await (const frame of frames) {
            check();
            if (count >= expectedFrames) throw new Error("预演帧数超出镜头范围");
            const name = `frame-${String(batch).padStart(4, "0")}.png`;
            files.add(name);
            await ffmpeg.writeFile(name, new Uint8Array(await frame.arrayBuffer()));
            count++;
            batch++;
            options.onProgress?.(Math.floor((count / expectedFrames) * 90));
            if (batch === fps * 2) await flush();
        }
        if (count !== expectedFrames) throw new Error("预演帧数不足，未回写不完整文件");
        if (batch) await flush();
        let output = segments[0];
        if (segments.length > 1) {
            files.add("segments.txt");
            await ffmpeg.writeFile("segments.txt", segments.map((name) => `file '${name}'`).join("\n"));
            files.add("result.mp4");
            if ((await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "segments.txt", "-c", "copy", "-movflags", "+faststart", "result.mp4"])) !== 0) throw new Error("预演视频合成失败");
            output = "result.mp4";
        }
        check();
        const bytes = await ffmpeg.readFile(output);
        options.onProgress?.(100);
        return new Blob([bytes as BlobPart], { type: "video/mp4" });
    } catch (error) {
        check();
        throw error;
    } finally {
        options.signal?.removeEventListener("abort", cancel);
        if (!options.signal?.aborted) for (const name of files) await ffmpeg.deleteFile(name).catch(() => {});
        ffmpeg.terminate();
    }
}
