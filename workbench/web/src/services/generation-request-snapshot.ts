export const generationRequestClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function canonicalGenerationRequest(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalGenerationRequest(item)).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalGenerationRequest(item)}`)
            .join(",")}}`;
    return JSON.stringify(value) ?? "null";
}
export async function generationRequestSHA256(value: unknown) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalGenerationRequest(value)))))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
const requestQueues = new Map<string, Promise<unknown>>();
export async function withGenerationRequestLock<T>(key: string, run: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(key, run);
    const previous = requestQueues.get(key) || Promise.resolve(),
        current = previous.catch(() => {}).then(run);
    requestQueues.set(key, current);
    try {
        return await current;
    } finally {
        if (requestQueues.get(key) === current) requestQueues.delete(key);
    }
}
