// OpenAI Video surface for a locally configured ComfyUI adapter.
export const meta = {
  apiVersion: 1,
  key: "local-video",
  name: "Local Video",
  icon: "text:LV",
  version: "1.0.0",
  author: { name: "QuantumNous" },
  description: { en: "Wan video generation through a local model adapter", zh: "通过本地模型适配服务生成 Wan 视频" },
  models: ["wan2.2-ti2v-5b", "wan2.1-vace-1.3b"],
  fetchMode: "per_task",
  protocols: ["openai_video"],
  usageSchema: { seconds: { type: "number", unit: "second", description: { en: "Video generation unit price", zh: "视频生成单价" } } },
};

function validate(body) {
  const seconds = Number(body.seconds === undefined ? body.duration || 5 : body.seconds);
  const vace = body.model === "wan2.1-vace-1.3b";
  const maximumSeconds = vace ? 30 : 10;
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > maximumSeconds)
    throw new Error("Local video duration must be between 1 and " + maximumSeconds + " seconds");
  const frames = body.metadata && body.metadata.frames;
  const fps = body.metadata && body.metadata.fps;
  if (fps !== undefined && !(vace ? [16] : [12, 16, 24]).includes(fps))
    throw new Error("Local Wan frame rate must be 12, 16 or 24; local VACE uses 16");
  if (frames !== undefined && (!Number.isInteger(frames) || frames < 5 || frames > (vace ? 481 : 241) || (frames - 1) % 4 !== 0))
    throw new Error("Local video frames must be 4n+1 between 5 and 241");
  if (vace && body.size !== undefined && !["640x384", "384x640", "640x480", "480x640", "512x512", "384x224", "224x384"].includes(body.size))
    throw new Error("Choose a supported local VACE frame size");
  return seconds;
}
export function extractUsage(ctx) {
  return { seconds: validate(ctx.requestBody || {}) };
}
export function buildSubmitRequest(ctx) {
  const body = Object.assign({}, ctx.requestBody, { model: ctx.upstreamModel || ctx.model });
  validate(body);
  return { url: ctx.baseUrl + "/v1/videos", method: "POST", headers: { "Content-Type": "application/json" }, body };
}
export function parseSubmitResponse(ctx, response) {
  if (!response.body || typeof response.body.id !== "string") throw new Error("Local adapter returned no task ID");
  return { taskId: response.body.id, taskData: response.body };
}
export function buildQueryRequest(ctx) {
  return { url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.taskId), method: "GET" };
}
export function parseTaskResult(ctx, body) {
  const states = { queued: "QUEUED", in_progress: "IN_PROGRESS", completed: "SUCCESS", failed: "FAILURE", uncertain: "UNKNOWN" };
  return {
    status: states[body.status] || "UNKNOWN",
    ...(body.status === "failed" ? { reason: (body.error && body.error.message) || "Local video generation failed" } : {}),
  };
}
export function extractUsageOnComplete(ctx, result, body) {
  const seconds = Number(body.seconds);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 3600 ? { seconds } : {};
}
export function listArtifacts(task) {
  return task.status === "SUCCESS" ? [{ key: "video", type: "video", mimeType: "video/mp4" }] : [];
}
export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  return { url: ctx.baseUrl + "/v1/videos/" + encodeURIComponent(ctx.upstreamTaskId) + "/content", method: ctx.clientRequest.method };
}
export const protocols = {
  openai_video: {
    decodeRequest(ctx) {
      if (!ctx.body || ctx.body.kind !== "json" || !ctx.body.value || Array.isArray(ctx.body.value)) throw new Error("Local video requires a JSON request");
      validate(ctx.body.value);
      return {
        kind: "submit",
        model: ctx.model,
        action: ctx.body.value.image || ctx.body.value.input_reference ? "image_to_video" : "text_to_video",
        requestBody: ctx.body.value,
      };
    },
    render(ctx, task) {
      return task.data || {};
    },
  },
};
