"use strict";

function updateDragDirection(state, dx, options = {}) {
  if (!Number.isFinite(dx) || Math.abs(dx) < 1) return state.direction;
  const initialThreshold = options.initialThreshold ?? 5;
  const reverseThreshold = options.reverseThreshold ?? 10;
  const candidate = dx > 0 ? "right" : "left";
  if (candidate === state.direction) {
    state.pendingDirection = null;
    state.pendingDistance = 0;
    return state.direction;
  }
  if (candidate !== state.pendingDirection) {
    state.pendingDirection = candidate;
    state.pendingDistance = 0;
  }
  state.pendingDistance += Math.abs(dx);
  if (state.pendingDistance >= (state.direction ? reverseThreshold : initialThreshold)) {
    state.direction = candidate;
    state.pendingDirection = null;
    state.pendingDistance = 0;
  }
  return state.direction;
}

module.exports = { updateDragDirection };
