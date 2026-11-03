"use strict";
const assert = require("node:assert/strict");
const { constrainPetBounds, petBoundsFromNative } = require("../src/window-geometry");
for (const scale of [1, 1.25, 1.5, 2]) {
  const area = { x: 0, y: 0, width: Math.round(3840 / scale), height: Math.round(2160 / scale) };
  const left = constrainPetBounds(-10000, -10000, area);
  const right = constrainPetBounds(10000, 10000, area);
  assert.deepEqual(left, { x: 0, y: 0, width: 304, height: 360 });
  assert.equal(right.x, area.width - 304);
  assert.equal(right.y, area.height - 360);
}
assert.deepEqual(constrainPetBounds(-5000, -5000, { x: -1920, y: -1080, width: 1920, height: 1080 }), { x: -1920, y: -1080, width: 304, height: 360 });
assert.deepEqual(constrainPetBounds(9999, 9999, { x: -1920, y: -1080, width: 1920, height: 1080 }), { x: -304, y: -360, width: 304, height: 360 });
assert.deepEqual(constrainPetBounds(1000, 1000, { x: 20, y: 30, width: 120, height: 200 }), { x: 20, y: 30, width: 304, height: 360 });
assert.deepEqual(petBoundsFromNative({ x: 70, y: 80, width: 9999, height: 9999 }), { x: 70, y: 80, width: 304, height: 360 });
assert.equal(constrainPetBounds(NaN, 10, { x: 0, y: 0, width: 1000, height: 800 }), null);
assert.equal(constrainPetBounds(10, 10, { x: 0, y: 0, width: 0, height: 0 }), null);
console.log("Window geometry checks passed for fractional DPI, negative coordinates, narrow areas, corrupted native bounds and invalid targets.");
