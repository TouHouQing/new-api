import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webDir = dirname(fileURLToPath(import.meta.url));
const appVersion = process.env.CANVAS_BUILD_VERSION?.trim() || readFileSync(resolve(webDir, "../VERSION"), "utf8").trim();
const buildCommit = process.env.CANVAS_BUILD_COMMIT?.trim() || process.env.VITE_BUILD_COMMIT?.trim() || "unknown";
const buildTime = process.env.CANVAS_BUILD_TIME?.trim() || process.env.VITE_BUILD_TIME?.trim() || "unknown";
const appChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:8080";

export default defineConfig({
    base: process.env.VITE_NEW_API_WORKBENCH === "true" ? "/workbench/" : "/",
    plugins: [
        react(),
        {
            name: "workbench-public-assets",
            enforce: "pre",
            transform(code, id) {
                if (process.env.VITE_NEW_API_WORKBENCH !== "true" || !id.includes("/src/") || !/\.(?:tsx?|css)(?:\?|$)/.test(id)) return;
                // Only literals naming bundled public assets are rewritten. User data,
                // API paths, external URLs and router paths retain their semantics.
                const transformed = code.replace(
                    /(["'`(])\/(canvas\/models\/|doll\/|icons\/|images\/|inspiration-thumbs\/|inspirations\/|lighting-presets\/|live2d\/|mediapipe\/|previs\/|short-drama-styles\/|three\/|welcome\/|logo\.svg)/g,
                    "$1/workbench/$2",
                );
                return transformed === code ? undefined : { code: transformed, map: null };
            },
        },
    ],
    define: {
        __NEW_API_WORKBENCH__: JSON.stringify(process.env.VITE_NEW_API_WORKBENCH === "true"),
        __APP_VERSION__: JSON.stringify(appVersion),
        __APP_CHANGELOG__: JSON.stringify(appChangelog),
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
        "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildCommit),
        "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    },
    server: {
        proxy: {
            "/api": {
                target: apiProxyTarget,
                changeOrigin: true,
                xfwd: true,
                ws: true,
            },
            "/oauth/linuxdo/callback": {
                target: apiProxyTarget,
                changeOrigin: true,
                xfwd: true,
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    build: {
        rolldownOptions: {
            output: {
                strictExecutionOrder: true,
                codeSplitting: {
                    // Keep route-level lazy imports isolated. Recursively merging dependencies
                    // pulls unrelated pages into the initial modulepreload graph.
                    includeDependenciesRecursively: false,
                    minSize: 40 * 1024,
                    groups: [
                        {
                            // Shared interop helpers must not be emitted into a route entry:
                            // AntD would import that entry back and execute its bootstrap early.
                            name: "vendor-babel-runtime",
                            minSize: 0,
                            test: /node_modules[\\/]@babel[\\/]runtime[\\/]/,
                            priority: 40,
                        },
                        {
                            name: "vendor-react",
                            test: /node_modules[\\/](?:react(?:-dom|-router|-router-dom)?|scheduler|zustand|use-sync-external-store|@tanstack[\\/](?:query-core|react-query))[\\/]/,
                            priority: 30,
                        },
                        {
                            name: "vendor-icons",
                            test: /node_modules[\\/](?:lucide-react|@ant-design[\\/]icons)[\\/]/,
                            priority: 20,
                            entriesAware: true,
                            entriesAwareMergeThreshold: 48 * 1024,
                        },
                        {
                            name: "vendor-antd",
                            test: /node_modules[\\/](?:antd|@ant-design|@rc-component|rc-[^\\/]+|dayjs)[\\/]/,
                            priority: 10,
                            entriesAware: true,
                            entriesAwareMergeThreshold: 80 * 1024,
                        },
                    ],
                },
            },
        },
    },
});
