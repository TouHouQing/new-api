const OVERLAY_TARGET = ".ant-modal-wrap, .ant-drawer, .ant-dropdown, .ant-popover, .ant-select-dropdown, .ant-picker-dropdown, [role='dialog'], [role='menu'], [role='listbox'], [role='slider']";
const OVERLAY_PRESENCE = ".ant-modal-wrap, .ant-drawer-content-wrapper, .ant-dropdown, .ant-popover, .ant-select-dropdown, .ant-picker-dropdown, [aria-modal='true']";

/** A removed editor control can leave focus on body while its dialog is open. */
export function canvasKeyboardIsBlocked(target: Element | null): boolean {
    if (target?.closest(OVERLAY_TARGET)) return true;
    const doc = target?.ownerDocument ?? (typeof document === "undefined" ? null : document);
    if (!doc) return false;
    return Array.from(doc.querySelectorAll(OVERLAY_PRESENCE)).some((element) => {
        if (element.getAttribute("aria-hidden") === "true" || !element.getClientRects().length) return false;
        const style = doc.defaultView?.getComputedStyle(element);
        return style?.display !== "none" && style?.visibility !== "hidden";
    });
}
