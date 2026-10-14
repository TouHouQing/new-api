import { test } from "node:test";
import assert from "node:assert/strict";
import { protocols } from "../plugin.js";

test("local video protocol rejects unsupported model limits before any upstream submission", () => {
  const decode = (model, value) =>
    protocols.openai_video.decodeRequest({ model, body: { kind: "json", value: { model, prompt: "Own test scene", ...value } } });
  assert.equal(decode("wan2.1-vace-1.3b", { seconds: "3", size: "640x480", metadata: { frames: 49 } }).kind, "submit");
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "6" }), /duration/i);
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "3", metadata: { frames: 85 } }), /frames/i);
  assert.throws(() => decode("wan2.1-vace-1.3b", { seconds: "3", size: "1920x1080" }), /size/i);
  assert.throws(() => decode("wan2.2-ti2v-5b", { seconds: "11" }), /duration/i);
});
