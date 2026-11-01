import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { getDrama } from "@/services/api/drama";
import { ApiError } from "@/services/api/request";
import { WorkspaceRouteLoader } from "@/components/ui/aceternity/full-screen-loader";
const Drama = lazy(() => import("./detail"));
const Production = lazy(() => import("../production/detail"));
export default function ProjectRoute() {
    const { projectId = "" } = useParams();
    const query = useQuery({
        queryKey: ["project-route", projectId],
        queryFn: async () => {
            try {
                await getDrama(projectId);
                return "drama";
            } catch (error) {
                if (error instanceof ApiError && error.status === 404) return "production";
                throw error;
            }
        },
        retry: false,
    });
    if (query.error) throw query.error;
    return query.isPending ? <WorkspaceRouteLoader /> : <Suspense fallback={<WorkspaceRouteLoader />}>{query.data === "drama" ? <Drama /> : <Production />}</Suspense>;
}
