"use strict";
const assert = require("assert/strict");
const { createSpeech, paginate } = require("../src/speech");
let displayed;
let hidden = false;
let clock = 0;
let timerId = 0;
const timers = new Map();
const speech = createSpeech({
  render: data => { displayed = data; hidden = false; },
  hide: () => { hidden = true; },
  now: () => clock,
  setTimer: fn => { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimer: id => timers.delete(id)
});
speech.show("……", { priority: 0, requestId: "m1", streaming: true });
speech.show("……", { priority: 3, requestId: "c1", streaming: true });
assert.equal(speech.show("独处的话", { priority: 0, requestId: "m1" }), false);
assert.equal(speech.finishRequest("m1"), false);
assert.equal(displayed.requestId, "c1");
assert.equal(hidden, false);
const reply = "（轻轻别过脸）既然你这样请求，便靠近些吧。不要误会，我只是在确认你有没有休息。🙂".repeat(4);
speech.show(reply, { priority: 3, requestId: "c1" });
assert.equal(displayed.pageCount > 1, true);
assert.equal(paginate(reply).join(""), reply);
assert.equal(paginate(reply).some(page => /[\uD800-\uDBFF]$/.test(page)), false);
assert.equal(speech.show("拥抱动作的内置短句", { priority: 1 }), false);
const seen = [displayed.pageText];
while (!hidden) {
  const entry = timers.entries().next().value;
  assert(entry, "final speech must eventually dismiss");
  timers.delete(entry[0]); clock += 12000; entry[1]();
  if (!hidden) seen.push(displayed.pageText);
}
assert.equal(seen.join(""), reply);
assert.equal(speech.show("读完后可以自言自语了", { priority: 0 }), true);
console.log("Speech priority, request isolation, Unicode pagination and completion checks passed.");
