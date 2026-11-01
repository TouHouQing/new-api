import type { ComponentProps } from "react";
import { Coins, DollarSign } from "lucide-react";
import { isNewAPIWorkbench } from "@/lib/workbench-host";

export const creditUnit = isNewAPIWorkbench ? "美元" : "积分";

export { requestCreditCost } from "@/lib/model-pricing";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            {isNewAPIWorkbench ? <DollarSign className="size-[1em]" strokeWidth={2.2} /> : <Coins className="size-[1em]" strokeWidth={2.2} />}
        </span>
    );
}

export function formatCredits(value: number, maximumFractionDigits = 6) {
    return (value / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits });
}
