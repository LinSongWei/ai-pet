"use strict";

// Electron screen/cursor/bounds coordinates are all device-independent pixels.
// Never derive the design size from a native getBounds() round-trip on Windows:
// fractional display scaling can outward-round native bounds on every move.
const PET_WINDOW_SIZE = Object.freeze({ width: 304, height: 360 });

function constrainPetBounds(x, y, area) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !area ||
      ![area.x, area.y, area.width, area.height].every(Number.isFinite) ||
      area.width <= 0 || area.height <= 0) return null;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - PET_WINDOW_SIZE.width)))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - PET_WINDOW_SIZE.height)))),
    ...PET_WINDOW_SIZE
  };
}

function petBoundsFromNative(bounds) {
  return bounds ? { x: bounds.x, y: bounds.y, ...PET_WINDOW_SIZE } : null;
}

module.exports = { PET_WINDOW_SIZE, constrainPetBounds, petBoundsFromNative };
