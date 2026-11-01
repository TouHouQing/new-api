import { expect, test } from "bun:test";
import type { AxiosProgressEvent } from "axios";
import { apiClient } from "../src/services/api/request";
import { uploadResourceFile } from "../src/services/api/resources";

test("普通 multipart 将传输进度换算为文件字节，总量未知不伪造百分比", async () => {
    const adapter = apiClient.defaults.adapter;
    const progress: number[][] = [];
    try {
        apiClient.defaults.adapter = async (config) => {
            config.onUploadProgress?.({ loaded: 100, total: undefined } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 250, total: 1000 } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 1000, total: 1000 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { resource: { id: "upload-test" } } } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(400)]), "file", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[100, 400], [400, 400]]);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("分片上传累加片内真实进度，传输 100% 后仍须等待合并响应", async () => {
    const adapter = apiClient.defaults.adapter;
    const size = 51 * 1024 * 1024;
    const chunkSize = 32 * 1024 * 1024;
    const progress: number[][] = [];
    let merged = false;
    try {
        apiClient.defaults.adapter = async (config) => {
            let data: unknown;
            if (config.url === "/resources/uploads") data = { uploadId: "session", chunkSize, chunkCount: 2 };
            else if (config.url?.endsWith("/complete")) {
                expect(progress.at(-1)).toEqual([size, size]);
                merged = true;
                data = { resource: { id: "chunk-test" } };
            } else {
                const index = Number(config.url?.split("/").at(-1));
                const bytes = index === 0 ? chunkSize : size - chunkSize;
                config.onUploadProgress?.({ loaded: bytes / 2, total: bytes } as AxiosProgressEvent);
                data = { index };
            }
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(size)]), "video", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[chunkSize / 2, size], [chunkSize, size], [chunkSize + (size - chunkSize) / 2, size], [size, size]]);
        expect(merged).toBe(true);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("传输结束不吞掉服务端保存错误", async () => {
    const adapter = apiClient.defaults.adapter;
    try {
        apiClient.defaults.adapter = async (config) => {
            config.onUploadProgress?.({ loaded: 100, total: 100 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 9, msg: "保存失败" } };
        };
        await expect(uploadResourceFile(new Blob(["text"]), "file", undefined, () => {})).rejects.toThrow("保存失败");
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("分片失败先清理当前会话，重开仍使用原幂等编号", async () => {
    const adapter = apiClient.defaults.adapter;
    const events: string[] = [];
    let sessions = 0;
    try {
        apiClient.defaults.adapter = async (config) => {
            events.push(`${config.method} ${config.url}`);
            let data: unknown;
            if (config.url === "/resources/uploads") {
                expect(config.headers.get("X-Idempotency-Key")).toBe("fixed-upload-intent");
                data = { uploadId: `session-${++sessions}`, chunkSize: 60 * 1024 * 1024, chunkCount: 1 };
            } else if (config.method === "delete") data = { closed: true };
            else if (config.url?.includes("session-1/chunks")) throw new Error("first transfer failed");
            else if (config.url?.endsWith("/complete")) data = { resource: { id: "one-resource" } };
            else data = { index: 0 };
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        const resource = await uploadResourceFile(new Blob([new Uint8Array(51 * 1024 * 1024)]), "file", { idempotencyKey: "fixed-upload-intent" });
        expect(resource.id).toBe("one-resource");
        expect(events).toEqual([
            "post /resources/uploads", "put /resources/uploads/session-1/chunks/0", "delete /resources/uploads/session-1",
            "post /resources/uploads", "put /resources/uploads/session-2/chunks/0", "post /resources/uploads/session-2/complete",
        ]);
    } finally { apiClient.defaults.adapter = adapter; }
});

test("未显式传编号时，丢失合并响应的内部重试仍只保存一个资源", async () => {
    const adapter = apiClient.defaults.adapter;
    const keys: Array<string | undefined> = [], sessions = new Map<string, string>(), resources = new Map<string, string>();
    let count = 0, lost = false;
    try {
        apiClient.defaults.adapter = async (config) => {
            let data: unknown;
            if (config.url === "/resources/uploads") {
                const id = `session-${++count}`, key = config.headers.get("X-Idempotency-Key") as string | undefined;
                keys.push(key); sessions.set(id, key || `unkeyed-${id}`);
                data = { uploadId: id, chunkSize: 60 * 1024 * 1024, chunkCount: 1 };
            } else if (config.method === "delete") data = { closed: true };
            else if (config.url?.endsWith("/complete")) {
                const key = sessions.get(config.url.split("/").at(-2)!)!;
                if (!resources.has(key)) resources.set(key, `resource-${resources.size}`);
                data = { resource: { id: resources.get(key) } };
                if (!lost) { lost = true; throw new Error("saved response was lost"); }
            } else data = { index: 0 };
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        const resource = await uploadResourceFile(new Blob([new Uint8Array(51 * 1024 * 1024)]), "file");
        expect(resource.id).toBe("resource-0");
        expect(keys[0]).toBeTruthy();
        expect(keys[1]).toBe(keys[0]);
        expect(resources.size).toBe(1);
    } finally { apiClient.defaults.adapter = adapter; }
});
