/** Keep title and actions reachable when word/history detail is expanded. */
export const TRANSCRIPT_MODAL_LAYOUT = {
    container: { display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)" },
    body: { minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" },
    header: { flexShrink: 0 },
    footer: { flexShrink: 0 },
} as const;
