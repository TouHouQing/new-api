/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { StudioSkill } from './studio-skill-contract'

export const STUDIO_SPECIALIZED_SKILLS: StudioSkill[] = [
  [
    'product-explainer',
    'Product explainer video',
    'Plan benefit, evidence and call to action. Preserve product references, add distinct shots and propose only compatible generation targets.',
  ],
  [
    'whitebox-film',
    'Whitebox to film',
    'Configure set_previs with a camera, actors and props. Propose previs_frame or previs_animation workflowActions into existing image/video nodes. Review the reference before film generation.',
  ],
  [
    'workflow-skill',
    'Create a reusable production skill',
    'Create a reusable production workflow with required assets, inputs, outputs, model limits and validation. Return skillDraft with a lowercase id, readable name, description, version1.0 and detailed instructions. Refer to persistent MCP tools and runtime projectId instead of fixed IDs. Save after review, then export SKILL.md; imported code is never executed.',
  ],
  [
    'video-prompt',
    'Video prompt and repair',
    'Repair prompt, camera, duration and reference contradictions for the actual selected model. Preserve approved Takes; explain unavailable capabilities.',
  ],
  [
    'multimodal-shot',
    'Multimodal shot direction',
    'Use owned first/last frames, character, motion and exact timed keyframes in supported slots. Propose compatible existing video nodes as generation targets.',
  ],
  [
    'tool-connection',
    'Agent tool setup',
    'Explain the actual persistent MCP tools studio_list_projects, studio_read_project, studio_workflow_status, studio_wait_workflow, studio_control_workflow and studio_download_media. Query and recovery are separate from canvas edits. Explain revision, requestId, confirmGeneration and hard budgets. Return explanation in summary with empty operation/task arrays; do not request credentials or connect outside services automatically.',
  ],
  [
    'loop-graphic',
    'Looping graphic motion',
    'Use set_motion_graphics for text, icons, shapes or owned images. Configure exact start/end, x/y in 0..1, font_size12..300, color#RRGGBB, animation fade|slide|pulse|bounce|rotate|morph and bpm30..240. Propose kind graphics with graphics_frame or graphics_animation into a compatible output node; export includes offline HTML and uses no model.',
  ],
  [
    'cinematic-shot',
    'Cinematic motion prompt',
    'Plan framing, lens, subject and camera motion, lighting and continuity for the selected video model. Repair conflicting movements and preserve dialogue.',
  ],
  [
    'action-shot',
    'Action shot prompt',
    'Plan explicit action beats within the supported duration. Use available character and motion references, and preserve satisfied visuals and audio.',
  ],
  [
    'beat-motion',
    'Beat synchronized graphics',
    'Use set_motion_graphics for icon rotation, shape morphing, text or image pulse/bounce at the chosen BPM and exact start/end. Propose kind graphics with graphics_animation for a standalone animation, or render for a timeline overlay. Preserve the soundtrack; require tempo correction when the beat is ambiguous.',
  ],
  [
    'explain-production',
    'Explain this project',
    'Explain the actual graph, chosen Takes, references, soundtrack, review and delivery. Return explanation with no edits unless requested; do not invent job success.',
  ],
  [
    'digital-presenter',
    'Digital presenter video',
    'Plan front-facing video and spoken script. Propose voice_speech and then lip_sync only with existing completed audio/video references. Explain missing dependencies.',
  ],
  [
    'depth-restyle',
    'Depth and motion reference restyle',
    'For source-video restyling, propose media video_depth with studio-video-depth and an owned source video for up to30seconds. Then use the completed depth Take as reference_video, an owned character image as reference_image, and VACE metadata.reference_control=depth. Do not generate before the extraction is complete. For 3D source scenes, previs_depth exports a depth frame from the same scene. Review identity and motion in the actual resulting Take.',
  ],
  [
    'commerce-variants',
    'Product advertisement variants',
    'Plan distinct hooks, demonstrations and calls to action using the same owned product references. Preserve independent regional subtitles, audio and delivery.',
  ],
  [
    'execution-surface',
    'Choose local or agent tools',
    'Choose available browser editing or persistent server tasks. Explain input and output to a beginner without assuming a paid or unavailable model capability.',
  ],
  [
    'scene-director',
    '3D scene director',
    'Configure set_previs camera, actors, props and bounded motion tracks. Place only existing owned GLB models in advanced.models and propose a previs export.',
  ],
].map(([id, name, instructions]) => ({
  id,
  name,
  description: instructions,
  inputs: ['story', 'shots', 'assets', 'media', 'review'],
  output: 'plan',
  allowGeneration: false,
  activeVersion: '1.0',
  versions: [
    { version: '1.0', instructions, importedAt: '2026-10-06T00:00:00Z' },
  ],
}))
