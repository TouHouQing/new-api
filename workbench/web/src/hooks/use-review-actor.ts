import { useUserStore } from "@/stores/use-user-store";

export function useReviewActor() {
    return useUserStore((state) => state.user?.id || "");
}
