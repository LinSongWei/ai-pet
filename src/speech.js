(function (scope) {
  "use strict";
  function paginate(text, limit = 54) {
    const points = Array.from(String(text || "").trim());
    const pages = [];
    while (points.length > limit) {
      let cut = limit;
      for (let i = limit - 1; i > limit * .52; i--) {
        if (/[。！？；…\n]/.test(points[i])) { cut = i + 1; break; }
      }
      pages.push(points.splice(0, cut).join(""));
    }
    if (points.length) pages.push(points.join(""));
    return pages;
  }
  function createSpeech({ render, hide, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
    let current = null;
    let timer;
    let revision = 0;
    function cancelTimer() { clearTimer(timer); timer = null; }
    function draw() {
      if (!current) return;
      render({ ...current, pageText: current.pages[current.page] || current.text, pageCount: current.pages.length });
    }
    function schedule() {
      cancelTimer();
      if (!current || current.streaming) return;
      const token = revision;
      const text = current.pages[current.page] || current.text;
      timer = setTimer(() => {
        if (!current || revision !== token) return;
        if (current.page < current.pages.length - 1) { current.page++; draw(); schedule(); }
        else { current = null; hide(); }
      }, Math.max(4500, Math.min(11000, 2300 + Array.from(text).length * 135)));
    }
    function show(text, options = {}) {
      const content = String(text || "").trim();
      if (!content) return false;
      const priority = options.priority ?? 1;
      if (current && priority < current.priority) return false;
      cancelTimer(); revision++;
      const streaming = Boolean(options.streaming);
      const pages = streaming ? [content] : paginate(content);
      current = { text: content, pages, page: 0, priority, streaming, requestId: options.requestId || null, status: options.status || "余烬低语", createdAt: now() };
      draw(); schedule(); return true;
    }
    function next() {
      if (!current || current.streaming || current.pages.length < 2) return;
      current.page = (current.page + 1) % current.pages.length; revision++;
      draw(); schedule();
    }
    function finishRequest(id) {
      if (!current || current.requestId !== id) return false;
      cancelTimer(); revision++; current = null; hide(); return true;
    }
    return { show, next, finishRequest, snapshot: () => current && ({ ...current }) };
  }
  const api = { createSpeech, paginate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.RonovaSpeech = api;
})(typeof window !== "undefined" ? window : globalThis);
