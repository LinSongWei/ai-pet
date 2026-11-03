"use strict";
const assert = require("node:assert/strict");
const { createAnimationClock } = require("../src/animation-clock");
const frames = Array.from({ length: 8 }, (_, i) => i);
const states = {
  idle: { row: 0, fps: 7, frames },
  runRight: { row: 1, fps: 14, frames },
  runLeft: { row: 2, fps: 14, frames },
  tea: { row: 5, fps: 10, frames: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0] }
};
for (const refreshRate of [30, 60, 75, 90, 120, 144]) {
  const clock = createAnimationClock(states);
  clock.change("runRight", 0);
  for (let i = 0; i < refreshRate * 20; i++) clock.sample(i * 1000 / refreshRate);
  assert.equal(clock.sample(20000).ticks, 280, `no accumulated drift at ${refreshRate}Hz`);
  const right = clock.sample(23671);
  const left = clock.change("runLeft", 23671);
  assert.equal(left.index, right.index, "reversing direction must keep the current step");
  assert(Math.abs(left.fraction - right.fraction) < 1e-7);
  assert.equal(left.row, 2);
}
const clock = createAnimationClock(states);
clock.change("tea", 1000);
assert.equal(clock.sample(1500).column, 5);
assert.equal(clock.remaining(1500), 1000, "gesture can complete its closing half before idle");
assert.equal(clock.sample(2500).column, 0);
assert.equal(clock.remaining(2500), 0);
clock.change("runRight", 3000);
assert.equal(clock.sample(3000).index, 0);
const skipped = clock.sample(3950);
assert.equal(skipped.index, 5, "a delayed render samples the current phase, rather than slowing the entire cycle");
console.log("Animation checks passed: 30–144Hz timing, sustained phase, direction reversal, dropped-frame catch-up and gesture settling.");
