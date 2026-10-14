import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskResult, listArtifacts, buildSubmitRequest, extractUsage, extractUsageOnComplete } from "../plugin.js";

test("song options survive the worker boundary and missing lyrics are rejected", () => {
  const ctx = { model: "studio-music", baseUrl: "https://local-worker.invalid", requestBody: { operation: "music", prompt: "Original song", seconds: 30, options: { music_mode: "song", lyrics: "Light upon the hill", bpm: 100, seed: 0 } } };
  assert.deepEqual(buildSubmitRequest(ctx).body.options, ctx.requestBody.options);
  assert.throws(() => buildSubmitRequest({ ...ctx, requestBody: { ...ctx.requestBody, options: { music_mode: "song" } } }), /requires lyrics/);
  assert.throws(() => buildSubmitRequest({ ...ctx, requestBody: { ...ctx.requestBody, options: { music_mode: "instrumental", lyrics: "words" } } }), /does not accept lyrics/);
});

test("candidate reuse bills separation of both source files and does not request new music generation", () => {
 const ctx={model:"studio-audio-separate",baseUrl:"http://127.0.0.1",requestBody:{operation:"audio_separate",prompt:"Use the chosen vocals",seconds:48,references:[{type:"audio",url:"data:audio/wav;base64,eA=="},{type:"audio",url:"data:audio/wav;base64,eQ=="}],options:{repair_start:8,repair_end:16,candidate_start:1,candidate_end:9}}};
 const body=buildSubmitRequest(ctx).body;assert.equal(body.operation,"audio_separate");assert.equal(body.options.music_mode,undefined);assert.deepEqual(extractUsage(ctx),{seconds:48});assert.deepEqual(extractUsageOnComplete(ctx,{}, {seconds:48}),{seconds:48});
 assert.throws(()=>buildSubmitRequest({...ctx,requestBody:{...ctx.requestBody,options:{...ctx.requestBody.options,candidate_end:0}}}),/interval/);
});

test("completed speech with no auxiliary files still exposes the primary WAV artifact", () => {
  assert.deepEqual(listArtifacts({ status: "SUCCESS", data: { artifacts: [], output: { type: "audio", mime_type: "audio/wav" } } }),
    [{ key: "output", type: "audio", mimeType: "audio/wav" }]);
  assert.deepEqual(listArtifacts({ status: "SUCCESS", data: { artifacts: [], output: { type: "video", mime_type: "video/mp4" } } }),
    [{ key: "output", type: "video", mimeType: "video/mp4" }]);
});

test("media failures preserve actionable worker errors for recovery", () => {
  const result = parseTaskResult({}, { status: "failed", error: "Generated audio is nearly silent; choose another source" });
  assert.equal(result.status, "FAILURE");
  assert.match(result.reason, /nearly silent/);
  assert.match(parseTaskResult({}, { status: "failed", error: { message: "No visible face in the input" } }).reason, /visible face/);
});

test("grid billing reserves each new panel and a local redo reserves one while preserving the immutable plan", () => {
  const ctx = { model: "studio-image-grid", baseUrl: "http://127.0.0.1", requestBody: { operation: "image_grid", prompt: "Original fox story", seconds: 1, options: { rows: 2, columns: 2, panel_prompts: ["Opening", "Action", "Reaction", "Outcome"] } } };
  assert.deepEqual(extractUsage(ctx), { operations: 4 });
  assert.deepEqual(extractUsageOnComplete({ model: ctx.model }, {}, { operations: 4 }), { operations: 4 });
  const references = [{ type: "image", url: "data:image/png;base64,eA==" }, { type: "image", url: "data:image/png;base64,eQ==" }];
  const redo = { ...ctx, requestBody: { ...ctx.requestBody, references, options: { ...ctx.requestBody.options, redo_panel: 2 } } };
  assert.deepEqual(extractUsage(redo), { operations: 1 });
  assert.deepEqual(buildSubmitRequest(redo).body.options.panel_prompts, ctx.requestBody.options.panel_prompts);
  assert.throws(() => buildSubmitRequest({ ...ctx, requestBody: { ...ctx.requestBody, options: { rows: 2, columns: 2, panel_prompts: ["Only one"] } } }), /match the grid/);
  assert.throws(() => buildSubmitRequest({ ...redo, requestBody: { ...redo.requestBody, options: { ...redo.requestBody.options, redo_panel: 17 } } }), /Invalid/);
});
