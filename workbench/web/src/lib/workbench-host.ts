export const isNewAPIWorkbench = typeof __NEW_API_WORKBENCH__ !== "undefined" && __NEW_API_WORKBENCH__;

const guestView = () => /^\/workbench\/(share\/canvas|review)\//.test(window.location.pathname);

type HostAuthentication = {
    headers(): Promise<Record<string, string>>;
    refresh(): Promise<void>;
};

let authentication: Promise<HostAuthentication> | undefined;

export async function workbenchAuthHeaders(): Promise<Record<string, string>> {
    if (!isNewAPIWorkbench || guestView()) return {};
    const bridgeURL: string = "/workbench/auth-bridge.js";
    authentication ??= import(/* @vite-ignore */ bridgeURL) as Promise<HostAuthentication>;
    return (await authentication).headers();
}

export function workbenchSignIn() {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/sign-in?redirect=${encodeURIComponent(next)}`);
}

// Only same-origin workbench requests receive the host session. Provider URLs
// and user supplied links never receive dashboard credentials.
export async function initializeWorkbenchHost() {
    if (!isNewAPIWorkbench) return;
    try {
        await workbenchAuthHeaders();
    } catch {
        workbenchSignIn();
        return;
    }
    if (!guestView()) {
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void workbenchAuthHeaders().catch(workbenchSignIn);
        }, 240_000);
        window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const target = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        if (target.origin !== window.location.origin || !target.pathname.startsWith("/api/workbench/")) return originalFetch(input, init);
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        for (const [key, value] of Object.entries(await workbenchAuthHeaders())) headers.set(key, value);
        return originalFetch(input, { ...init, headers, credentials: "same-origin" });
    };
}
