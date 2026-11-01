import type { Project } from "@/services/api/projects";

// Task progress and cover uploads also advance the project revision. They do
// not conflict with the settings form while its editable source is unchanged.
export function projectSettingsSource(project: Project): string {
    return JSON.stringify([
        project.id,
        project.name,
        project.type,
        project.description || "",
        project.aspectRatio,
        project.sourceType,
        project.stylePresetId || "",
        project.styleProfileJson || "",
        project.defaultImageModel || "",
        project.defaultVideoModel || "",
        project.creativeBriefJson || "",
        project.status,
    ]);
}
