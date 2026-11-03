"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const toolRoots = [
  root, process.env.RONOVA_BUILD_TOOLS
].filter(Boolean);
const cli = toolRoots.map((dir) => path.join(dir, "node_modules", "electron", "cli.js")).find((file) => fs.existsSync(file));
if (!cli) { console.error("未找到 Electron。请在项目目录运行 npm install 后再启动。"); process.exit(1); }
const result = spawnSync(process.execPath, [cli, root, ...process.argv.slice(2)], { cwd: root, stdio: "inherit", windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
