import type { PrevisPose, PrevisVec3 } from "@/types/previs";
export type PrevisClayLimb = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

// Shared by viewport playback and GLB baking so procedural figures do not
// freeze their walking/waving pose when exported from a moving scene.
export function samplePrevisClayLimb(base: PrevisVec3, pose: PrevisPose | undefined, limb: PrevisClayLimb, time: number): PrevisVec3 {
    const result: PrevisVec3 = [...base];
    if (pose === "walk" || pose === "run") {
        const swing = Math.sin(time * (pose === "run" ? 11 : 8)) * (pose === "run" ? 0.75 : 0.5);
        result[0] += (limb === "leftArm" || limb === "rightLeg" ? 1 : -1) * swing;
    } else if (pose === "wave" && limb === "leftArm") result[2] += Math.sin(time * 10) * 0.3;
    return result;
}
