// Generic production-media worker contract. The channel administrator chooses
// the worker endpoint; no external URL or credentials come from a canvas.
export const meta = {
  apiVersion: 1,
  key: "studio-media",
  name: "Studio Media",
  icon: "text:SM",
  version: "1.3.0",
  author: { name: "QuantumNous" },
  description: {
    en: "Production image, video and audio tools through a configured media worker",
    zh: "通过已配置的媒体服务执行图像、视频及音频制作工具",
  },
  models: ["studio-music", "studio-sound-effects", "studio-voice-clone", "studio-voice-speech", "studio-lip-sync", "studio-audio-separate", "studio-audio-translate", "studio-image-bg-remove", "studio-image-upscale", "studio-image-outpaint", "studio-image-layers", "studio-image-grid", "studio-image-to-3d", "studio-video-remove", "studio-video-replace", "studio-video-depth"],
  fetchMode: "per_task",
  usageSchema: {
    seconds: { type: "number", unit: "second", description: { en: "Generated or processed audio/video seconds", zh: "实际生成或处理的音视频秒数" } },
  },
  usageProfiles: [{
    models: ["studio-image-bg-remove", "studio-image-upscale", "studio-image-outpaint", "studio-image-layers", "studio-image-grid", "studio-image-to-3d"],
    schema: { operations: { type: "number", unit: "count", unitLabel: { en: "operation", zh: "次" }, description: { en: "Image processing unit price", zh: "图像处理单价" } } },
  }],
};

const actions = {
  "studio-music": "music",
  "studio-sound-effects": "sound_effects",
  "studio-voice-clone": "voice_clone",
  "studio-voice-speech": "voice_speech",
  "studio-lip-sync": "lip_sync",
  "studio-audio-separate": "audio_separate",
  "studio-audio-translate": "audio_translate",
  "studio-image-bg-remove": "image_bg_remove",
  "studio-image-upscale": "image_upscale",
  "studio-image-outpaint": "image_outpaint",
  "studio-image-layers": "image_layers",
  "studio-image-grid": "image_grid",
  "studio-image-to-3d": "image_to_3d",
  "studio-video-remove": "video_remove",
  "studio-video-replace": "video_replace",
  "studio-video-depth": "video_depth",
};

function request(ctx) {
  const input = ctx.requestBody || {};
  const action = actions[ctx.model] || actions[ctx.upstreamModel];
  if (!action || input.operation !== action) throw new Error("Operation does not match the selected media model");
  if (action === "video_remove" || action === "video_replace") {
    const edit = input.edit;
    if (!edit || ![edit.start, edit.end, edit.x, edit.y, edit.width, edit.height].every(Number.isFinite) || edit.start < 0 || edit.end <= edit.start || edit.end - edit.start > 30 || edit.width < 2 || edit.height < 2 || !Array.isArray(input.references) || !input.references.some((item) => item.type === "video")) throw new Error("Select a source video, object region and interval of at most thirty seconds");
  }
  const seconds = Number(input.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) throw new Error("Media duration must be between 1 and 3600");
  if (action === "music" && seconds > 30) throw new Error("Local music drafts support at most thirty seconds");
  if (typeof input.prompt !== "string" || input.prompt.length > 30000) throw new Error("Media prompt is invalid");
  const references = input.references || [];
  if (!Array.isArray(references) || references.length > 12) throw new Error("Media references are invalid");
  let referenceBytes = 0;
  for (const reference of references) {
    if (
      !reference ||
      !["audio", "video", "image"].includes(reference.type) ||
      typeof reference.url !== "string" ||
      reference.url.length > 24 * 1024 * 1024 ||
      !/^(https?:\/\/|data:(audio|video|image)\/)/.test(reference.url)
    )
      throw new Error("Media reference is invalid");
    referenceBytes += reference.url.length;
  }
  if (
    referenceBytes > 32 * 1024 * 1024 ||
    typeof (input.language || "") !== "string" ||
    (input.language || "").length > 40 ||
    typeof (input.voice_id || "") !== "string" ||
    (input.voice_id || "").length > 100
  )
    throw new Error("Media reference or voice configuration is too large");
  if (action === "voice_clone" && (input.confirm_voice_rights !== true || !references.some((item) => item.type === "audio")))
    throw new Error("Voice cloning requires an audio reference and confirmation of voice permission");
  if (action === "voice_speech" && !input.voice_id) throw new Error("Voice synthesis requires a selected voice ID");
  if (action === "lip_sync" && (!references.some((item) => item.type === "audio") || !references.some((item) => item.type === "video")))
    throw new Error("Lip sync requires audio and video references");
  if (action.startsWith("image_") && action !== "image_grid" && !references.some((item) => item.type === "image")) throw new Error("Select an image reference for this tool");
  if (["audio_separate", "audio_translate"].includes(action) && !references.some((item) => item.type === "audio")) throw new Error("Select an audio reference for this tool");
  if (action === "video_depth" && (!references.some((item) => item.type === "video") || seconds < 1 || seconds > 30)) throw new Error("Depth control requires a video reference and one to thirty seconds");
  const options = input.options || {};
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Tool options are invalid");
  const limits = { width: [16, 2048], height: [16, 2048], scale: [1, 4], rows: [1, 4], columns: [1, 4], speed: [0.5, 2], pitch: [-12, 12], pause: [0, 3], expression: [0, 2] };
  const normalized = {};
  for (const key of Object.keys(options)) {
    const value = options[key];
    if (key === "panel_prompts") {
      if (action !== "image_grid" || !Array.isArray(value) || value.length < 1 || value.length > 16 || value.some((prompt) => typeof prompt !== "string" || !prompt.trim() || prompt.length > 3000)) throw new Error("Describe every storyboard panel");
      normalized[key] = value.slice(); continue;
    }
    if (["redo_panel", "repair_start", "repair_end", "candidate_start", "candidate_end"].includes(key)) {
      const panel = key === "redo_panel";
      if ((panel ? action !== "image_grid" : !["music","audio_separate"].includes(action)) || !Number.isFinite(value) || value < (panel ? 1 : 0) || value > (panel ? 16 : action === "music" ? 30 : 600) || panel && !Number.isInteger(value)) throw new Error("Invalid repair interval or panel");
      normalized[key] = value; continue;
    }
    if (["outpaint_mode", "mask_source", "background_prompt"].includes(key)) {
      if (key === "outpaint_mode" && (action !== "image_outpaint" || !["strict", "natural"].includes(value)) || key === "mask_source" && (action !== "image_layers" || !["automatic", "second_reference"].includes(value)) || key === "background_prompt" && (action !== "image_layers" || typeof value !== "string" || value.length > 2000)) throw new Error("Invalid image reconstruction option");
      normalized[key] = value; continue;
    }
    if (["music_mode", "lyrics", "bpm", "seed"].includes(key)) {
      if (action !== "music") throw new Error("Music parameters require a music task");
      if (key === "music_mode" && !["instrumental", "song"].includes(value)) throw new Error("Unsupported music mode");
      if (key === "lyrics" && (typeof value !== "string" || value.length > 3000)) throw new Error("Lyrics exceed the supported limit");
      if (key === "bpm" && (!Number.isInteger(value) || value < 30 || value > 240)) throw new Error("Music tempo must be between 30 and 240 BPM");
      if (key === "seed" && (!Number.isInteger(value) || value < 0 || value > 2147483647)) throw new Error("Invalid music seed");
      normalized[key] = value;
      continue;
    }
    if (key === "translation" || key === "negative") {
      if (typeof value !== "string" || value.length > 3000) throw new Error("Translation is too long");
      normalized[key] = value;
      continue;
    }
    if (!limits[key] || typeof value !== "number" || !Number.isFinite(value)) throw new Error("Unsupported tool option");
    // Zero in the typed server contract means an omitted optional parameter.
    if (value === 0 && !["pitch", "pause", "expression"].includes(key)) continue;
    if (value < limits[key][0] || value > limits[key][1] || (["width", "height", "scale", "rows", "columns"].includes(key) && !Number.isInteger(value))) throw new Error("Tool option is outside the supported range");
    normalized[key] = value;
  }
  if (normalized.panel_prompts && normalized.panel_prompts.length !== (normalized.rows || 2) * (normalized.columns || 2)) throw new Error("Panel plan must match the grid");
  if (normalized.redo_panel && (normalized.redo_panel > (normalized.rows || 2) * (normalized.columns || 2) || references.filter((item) => item.type === "image").length !== 2)) throw new Error("Choose the source image and the original grid");
  if (normalized.mask_source === "second_reference" && references.filter((item) => item.type === "image").length !== 2) throw new Error("Choose the source image and a white removal mask");
  if (normalized.repair_start !== undefined || normalized.repair_end !== undefined) {
    if (action === "music" && normalized.music_mode !== "song" || !Number.isFinite(normalized.repair_start) || !Number.isFinite(normalized.repair_end) || normalized.repair_end <= normalized.repair_start || normalized.repair_end - normalized.repair_start > seconds + .001 || references.filter((item) => item.type === "audio").length !== (action === "audio_separate" ? 2 : 1)) throw new Error("Song repair requires valid source references and intervals");
  }
  if (normalized.candidate_start !== undefined || normalized.candidate_end !== undefined || action === "audio_separate" && normalized.repair_end !== undefined) {
    if (action !== "audio_separate" || normalized.repair_end === undefined || !Number.isFinite(normalized.candidate_start) || !Number.isFinite(normalized.candidate_end) || normalized.candidate_end <= normalized.candidate_start) throw new Error("Select a valid candidate audio interval");
  }
  if (normalized.music_mode === "song" && !(normalized.lyrics || "").trim()) throw new Error("Song mode requires lyrics");
  if (normalized.music_mode === "song") {
    const duration = Math.max(8, Math.ceil(4 + normalized.lyrics.split(/\n/).filter(line => line.trim() && !/^\s*\[[^\]]+\]\s*$/.test(line)).reduce((sum, line) => sum + .75 + (line.match(/[\p{Script=Han}]|[\p{L}]+/gu)?.length || 0) * .65, 0)));
    if (duration > 30) throw new Error("Split lyrics into shorter sections for the thirty-second song limit");
  }
  if (normalized.music_mode !== "song" && normalized.lyrics) throw new Error("Instrumental mode does not accept lyrics");
  return {
    model: ctx.upstreamModel || ctx.model,
    operation: action,
    prompt: input.prompt,
    seconds,
    references,
    language: input.language || "",
    voice_id: input.voice_id || "",
    confirm_voice_rights: input.confirm_voice_rights === true,
    options: normalized,
    edit: input.edit,
  };
}

export function extractUsage(ctx) {
  const value = request(ctx);
  return value.operation.startsWith("image_") ? { operations: value.operation === "image_grid" && !value.options.redo_panel ? (value.options.rows || 2) * (value.options.columns || 2) : 1 } : { seconds: value.seconds };
}
export function buildSubmitRequest(ctx) {
  return {
    url: ctx.baseUrl + "/studio-media/v1/jobs",
    method: "POST",
    headers: { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" },
    body: request(ctx),
  };
}
export function parseSubmitResponse(ctx, response) {
  const body = response.body || {};
  if (typeof body.id !== "string" || !body.id) throw new Error("Media worker returned no task ID");
  return { taskId: body.id, taskData: body };
}
export function buildQueryRequest(ctx) {
  return { url: ctx.baseUrl + "/studio-media/v1/jobs/" + encodeURIComponent(ctx.taskId), method: "GET", headers: { Authorization: "Bearer " + ctx.apiKey } };
}
export function parseTaskResult(ctx, body) {
  const statuses = { queued: "QUEUED", processing: "IN_PROGRESS", completed: "SUCCESS", failed: "FAILURE", cancelled: "FAILURE" };
  const status = statuses[body.status] || "UNKNOWN";
  const progress = Number(body.progress);
  let reason = "Media worker failed";
  if (typeof body.error === "string" && body.error.trim()) reason = body.error;
  else if (body.error && typeof body.error.message === "string" && body.error.message.trim()) reason = body.error.message;
  return {
    status,
    ...(Number.isFinite(progress) && progress >= 0 && progress <= 100 ? { progress: progress + "%" } : {}),
    ...(status === "FAILURE" ? { reason: reason.slice(0, 2000) } : {}),
  };
}
export function extractUsageOnComplete(ctx, result, body) {
  const action = actions[ctx.upstreamModel] || actions[ctx.model];
  if (action && action.startsWith("image_")) {
    const operations = Number(body.operations);
    return { operations: Number.isInteger(operations) && operations >= 1 && operations <= 16 ? operations : 1 };
  }
  const seconds = Number(body.seconds);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 3600 ? { seconds } : {};
}
export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  if (Array.isArray(task.data && task.data.artifacts) && task.data.artifacts.length > 0) {
    if (task.data.artifacts.length > 20) throw new Error("Too many tool artifacts");
    const seen = new Set();
    return task.data.artifacts.map((item) => {
      if (!item || !/^[A-Za-z0-9_-]{1,128}$/.test(item.key) || seen.has(item.key) || !["image", "audio", "video", "file"].includes(item.type) || typeof item.mime_type !== "string") throw new Error("Invalid tool artifact");
      seen.add(item.key);
      return { key: item.key, type: item.type, mimeType: item.mime_type };
    });
  }
  const output = task.data && task.data.output;
  if (!output || !["audio", "video", "image"].includes(output.type)) throw new Error("Media worker returned no usable artifact");
  const defaults = { video: "video/mp4", audio: "audio/mpeg", image: "image/png" };
  return [{ key: "output", type: output.type, mimeType: output.mime_type || defaults[output.type] }];
}
export function buildContentRequest(ctx) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ctx.artifactKey)) throw new Error("artifact_not_found");
  return {
    url: ctx.baseUrl + "/studio-media/v1/jobs/" + encodeURIComponent(ctx.upstreamTaskId) + "/content" + (ctx.artifactKey === "output" ? "" : "?key=" + encodeURIComponent(ctx.artifactKey)),
    method: ctx.clientRequest.method,
    headers: { Authorization: "Bearer " + ctx.apiKey },
  };
}
