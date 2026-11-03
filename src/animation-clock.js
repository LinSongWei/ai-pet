(function (scope) {
  "use strict";
  function createAnimationClock(states, initial = "idle") {
    let name = initial;
    let origin = 0;
    const cycleMs = key => states[key].frames.length * 1000 / states[key].fps;
    const isRun = key => key === "runRight" || key === "runLeft";
    function sample(time) {
      const state = states[name];
      const ticks = Math.max(0, (time - origin) * state.fps / 1000);
      const index = Math.floor(ticks + 1e-8) % state.frames.length;
      return { name, row: state.row, column: state.frames[index], index, fraction: ticks - Math.floor(ticks), ticks };
    }
    function change(next, time) {
      if (!states[next]) next = initial;
      if (next === name) return sample(time);
      const preserve = isRun(name) && isRun(next);
      const phase = preserve ? ((time - origin) % cycleMs(name)) / cycleMs(name) : 0;
      name = next;
      origin = time - phase * cycleMs(next);
      return sample(time);
    }
    function remaining(time) {
      const duration = cycleMs(name);
      const elapsed = Math.max(0, time - origin);
      const phase = elapsed % duration;
      return phase < .1 || duration - phase < .1 ? 0 : duration - phase;
    }
    return { sample, change, remaining, get name() { return name; } };
  }
  const api = { createAnimationClock };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.RonovaAnimation = api;
})(typeof window !== "undefined" ? window : globalThis);
