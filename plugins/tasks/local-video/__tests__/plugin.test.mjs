import { test } from "node:test";
import assert from "node:assert/strict";
import { protocols, buildSubmitRequest } from "../plugin.js";

test("local video protocol rejects unsupported model limits before any upstream submission", () => {
  const decode = (model, value) =>
    protocols.openai_video.decodeRequest({ model, body: { kind: "json", value: { model, prompt: "Own test scene", ...value } } });
  assert.equal(decode("wan2.1-vace-1.3b", { seconds: "3", size: "640x480", metadata: { frames: 49 } }).kind, "submit");
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "31" }), /duration/i);
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "3", metadata: { frames: 485 } }), /frames/i);
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "3", size: "1920x1080" }), /size/i);
  assert.throws(() => decode("wan2.2-ti2v-5b", { seconds: "11" }), /duration/i);
});

test("workbench video forms preserve model selection and structured options", () => {
  const result = protocols.openai_video.decodeRequest({ model: "wan2.2-ti2v-5b", body: { kind: "multipart", fields: { model: ["untrusted-name"], prompt: ["A teacup"], seconds: ["3"], size: ["640x384"], metadata: ['{"seed":0,"preserve_keyframes":false,"frames":49,"fps":16}'] }, files: [] } });
  assert.equal(result.action, "text_to_video");
  const request = buildSubmitRequest({ model: result.model, upstreamModel: result.model, baseUrl: "http://local.invalid", requestBody: result.requestBody });
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(request.body.metadata, { seed: 0, preserve_keyframes: false, frames: 49, fps: 16 });
  assert.equal(request.body.model, "wan2.2-ti2v-5b");
  assert.equal(request.body.prompt, "A teacup");
});

test("first-frame files remain host-owned references until upstream request building", () => {
  const file = { field: "input_reference", ref: "request_file:input_reference", filename: "frame.png", mimeType: "image/png", size: 323207 };
  const input = { model: "wan2.2-ti2v-5b", body: { kind: "multipart", fields: { prompt: ["Move gently"], seconds: ["3"] }, files: [file] } };
  const result = protocols.openai_video.decodeRequest(input);
  assert.equal(result.action, "image_to_video");
  assert.deepEqual(result.requestBody.input_reference, { __fileRef: file.ref, encoding: "dataUrl", maxBytes: 8 * 1024 * 1024 });
  assert.throws(() => protocols.openai_video.decodeRequest({ ...input, body: { ...input.body, files: [file, file] } }), /one first-frame/);
  assert.throws(() => protocols.openai_video.decodeRequest({ ...input, body: { ...input.body, fields: { seconds: ["3", "10"] } } }), /one value/);
  assert.throws(() => protocols.openai_video.decodeRequest({ ...input, body: { ...input.body, fields: { input_reference: ["https://other.invalid/frame.png"] } } }), /duplicate/);
  for (const wrong of [{ ...file, field: "reference_video" }, { ...file, size: 8388609 }, { ...file, mimeType: "video/mp4" }]) assert.throws(() => protocols.openai_video.decodeRequest({ ...input, body: { ...input.body, files: [wrong] } }), /first-frame image/);
});
