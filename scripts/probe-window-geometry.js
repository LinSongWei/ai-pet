"use strict";
// Isolated native Electron regression probe. No product settings or API requests.
const { app, BrowserWindow, screen } = require("electron");
const fs = require("fs");
const path = require("path");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-features", "Vulkan,UseDawn,WebGPU");
app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
const factorArg = process.argv.find(value => value.startsWith("--probe-scale="));
const requestedScale = factorArg ? factorArg.split("=")[1] : "native";
if (requestedScale !== "native") app.commandLine.appendSwitch("force-device-scale-factor", requestedScale);
app.setPath("userData", path.join(__dirname, "../qa/geometry-probe-profile"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const result = { electron: process.versions.electron, requestedScale, display: { scaleFactor: display.scaleFactor, bounds: display.bounds, workArea: area }, strategies: {} };
  try {
    for (const strategy of ["setPosition", "fixedSetBounds"]) {
      const window = new BrowserWindow({ x: area.x + 50, y: area.y + 50, width: 304, height: 360, show: false, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false });
      await sleep(30);
      const samples = [{ step: 0, bounds: window.getBounds() }];
      for (let step = 1; step <= 600; step++) {
        const x = area.x + 30 + step % 80;
        const y = area.y + 30 + step % 60;
        if (strategy === "setPosition") window.setPosition(x, y);
        else window.setBounds({ x, y, width: 304, height: 360 });
        if (step % 100 === 0 || step <= 5) samples.push({ step, bounds: window.getBounds() });
        if (step % 10 === 0) await sleep(1);
      }
      result.strategies[strategy] = { samples, final: window.getBounds() };
      window.destroy();
    }
    const out = path.join(__dirname, `../qa/window-probe-${requestedScale}.json`);
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
