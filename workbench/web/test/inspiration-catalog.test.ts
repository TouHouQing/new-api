import { afterEach, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

async function catalogModule(hosted: boolean) {
    const build = await Bun.build({
        entrypoints: [new URL("../src/services/inspiration-catalog.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")],
        target: "bun",
        define: { __NEW_API_WORKBENCH__: String(hosted) },
    });
    if (!build.success) throw new AggregateError(build.logs, "Catalog test bundle failed");
    return import(`data:text/javascript;base64,${Buffer.from(await build.outputs[0].text()).toString("base64")}`);
}

test("hosted inspiration catalogs load when the reverse proxy rejects static JSON URLs", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string) => {
        requested.push(input);
        if (!input.startsWith("/api/workbench/inspirations/") || input.endsWith(".json")) return new Response("nginx", { status: 404 });
        return Response.json(input.endsWith("/manifest") ? { sources: {} } : { entries: [{ id: input, prompt: "A scene", category: "film" }] });
    }) as typeof fetch;
    const module = await catalogModule(true);
    const catalog = await module.loadInspirationCatalog();
    await module.loadGalleryPool();
    expect(catalog.entries.some((entry: { id: string }) => entry.id === "/api/workbench/inspirations/youmind")).toBe(true);
    expect(requested.sort()).toEqual(["gallery-pool", "haohaoxue", "manifest", "seedance", "youmind"].map((name) => `/api/workbench/inspirations/${name}`));
});

test("standalone inspiration catalogs retain their public asset URLs", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: string) => {
        requested.push(input);
        return Response.json(input.endsWith("manifest.json") ? { sources: {} } : { entries: [] });
    }) as typeof fetch;
    const module = await catalogModule(false);
    await module.loadInspirationCatalog();
    expect(requested).toContain("/inspirations/youmind.json");
    expect(requested.every((url) => url.startsWith("/inspirations/"))).toBe(true);
});
