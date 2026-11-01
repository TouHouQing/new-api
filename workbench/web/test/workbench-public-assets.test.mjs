import { afterEach, expect, test } from "bun:test";
import config from "../vite.config";

const original = process.env.VITE_NEW_API_WORKBENCH;
const plugin = config.plugins.find((entry) => entry.name === "workbench-public-assets");
afterEach(() => {
    if (original === undefined) delete process.env.VITE_NEW_API_WORKBENCH;
    else process.env.VITE_NEW_API_WORKBENCH = original;
});

test("hosted build preserves canvas routes, navigation and route matching", () => {
    process.env.VITE_NEW_API_WORKBENCH = "true";
    const code = 'const route = "/canvas/:id"; const prefix = "/canvas/"; navigate(`/canvas/${id}`);';
    expect(plugin.transform(code, "/app/src/router.tsx")).toBeUndefined();
});

test("hosted build prefixes the actual bundled canvas models", () => {
    process.env.VITE_NEW_API_WORKBENCH = "true";
    const code = 'const model = "/canvas/models/facecap.glb"; const logo = "/logo.svg";';
    expect(plugin.transform(code, "/app/src/editor.tsx").code).toBe('const model = "/workbench/canvas/models/facecap.glb"; const logo = "/workbench/logo.svg";');
});

test("standalone build preserves public asset addresses", () => {
    process.env.VITE_NEW_API_WORKBENCH = "false";
    expect(plugin.transform('const model = "/canvas/models/facecap.glb";', "/app/src/editor.tsx")).toBeUndefined();
});
