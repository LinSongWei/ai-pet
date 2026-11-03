"use strict";

const assert = require("node:assert/strict");
const { readCompletion, detectEmotion, cleanMessages, buildSystemPrompt } = require("../src/ai-client");

function sse(parts, { step = 3, finish = true, onCancel } = {}) {
  const bytes = new TextEncoder().encode(parts.join(""));
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step));
      if (finish) controller.close();
    },
    cancel: onCancel
  }), { headers: { "content-type": "text/event-stream; charset=utf-8" } });
}
function event(data, ending = "\r\n\r\n") { return `data: ${JSON.stringify(data)}${ending}`; }

async function run() {
  const received = [];
  const message = await readCompletion(sse([
    ": heartbeat\r\n\r\n",
    event({ choices: [{ delta: { role: "assistant", reasoning_content: "不应显示的内部字段" } }] }),
    event({ choices: [{ delta: { content: "旅行者，" } }] }),
    event({ choices: [{ delta: { content: "点心暂归我保管。✦" } }] }, "\n\n"),
    event({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    "data: [DONE]\n\n"
  ], { step: 1 }), (text, chunk) => received.push({ text, chunk }));
  assert.equal(message, "旅行者，点心暂归我保管。✦");
  assert.deepEqual(received, [
    { text: "旅行者，", chunk: "旅行者，" },
    { text: message, chunk: "点心暂归我保管。✦" }
  ]);

  const jsonEvents = [];
  const json = new Response(JSON.stringify({ choices: [{ message: { content: [{ text: "羽毛很整齐。" }] } }] }), { headers: { "content-type": "application/json" } });
  assert.equal(await readCompletion(json, (text) => jsonEvents.push(text)), "羽毛很整齐。");
  assert.deepEqual(jsonEvents, ["羽毛很整齐。"]);

  // Some compatible gateways send message.content inside an SSE event.
  assert.equal(await readCompletion(sse([event({ choices: [{ message: { content: "安静片刻。" } }] }), "data: [DONE]\n\n"])), "安静片刻。");
  assert.equal(await readCompletion(sse([event({ choices: [{ delta: { content: "末尾没有换行" } }] }, "")])), "末尾没有换行");
  await assert.rejects(() => readCompletion(sse(["data: {broken}\n\n"])), /格式不完整/);
  await assert.rejects(() => readCompletion(sse([event({ error: { message: "mock provider failure" } })])), /mock provider failure/);

  let cancelled = false;
  const controller = new AbortController();
  const partial = [];
  const reading = readCompletion(sse([event({ choices: [{ delta: { content: "半句话" } }] })], { finish: false, onCancel() { cancelled = true; } }), (text) => partial.push(text), { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(partial, ["半句话"]);
  controller.abort();
  await assert.rejects(() => reading, { name: "AbortError" });
  assert(cancelled, "aborting a pending read must cancel the response body");
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(() => readCompletion(sse([]), () => {}, { signal: alreadyAborted.signal }), { name: "AbortError" });

  const broken = new Response(new ReadableStream({ start(c) { c.error(new Error("mock connection interrupted")); } }), { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(() => readCompletion(broken), /mock connection interrupted/);

  assert.equal(detectEmotion("只是保管这些饼干。"), "hideSnack");
  assert.equal(detectEmotion("（别过脸）不许笑。"), "blush");
  assert.equal(detectEmotion("这项裁定没有异议。"), "verdict");
  assert.equal(detectEmotion("不必拘谨，坐吧。"), "observe");
  assert.deepEqual(cleanMessages([{ role: "system", content: "wrong" }, { role: "user", content: "你好" }, null]), [{ role: "user", content: "你好" }]);
  assert(buildSystemPrompt({ userName: "旅行者" }, "monologue").includes("轻量二创"));
  console.log("AI client checks passed: Unicode/CRLF SSE, shared cumulative text, JSON compatibility, malformed/error/connection cases, pending/pre-aborted cancellation, persona and emotions.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
