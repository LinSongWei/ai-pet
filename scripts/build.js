"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const toolRoots = [
  root, process.env.RONOVA_BUILD_TOOLS
].filter(Boolean);
const toolRoot = toolRoots.find((dir) => fs.existsSync(path.join(dir, "node_modules", "electron", "dist", "electron.exe")) && fs.existsSync(path.join(dir, "node_modules", "electron-builder", "cli.js")));
if (!toolRoot) { console.error("未找到构建依赖。请在项目目录运行 npm install，或将 RONOVA_BUILD_TOOLS 指向已有工具的项目目录。"); process.exit(1); }
for (const item of ["src/main.js", "src/pet.html", "assets/app-icon.ico", "assets/avatar.png", "assets/tray.png"]) {
  if (!fs.existsSync(path.join(root, item))) { console.error(`缺少构建文件：${item}`); process.exit(1); }
}
const stage = fs.mkdtempSync(path.join(os.tmpdir(), `ronova-ai-pet-${packageJson.version}-`));
fs.cpSync(path.join(root, "src"), path.join(stage, "src"), { recursive: true });
// Runtime reads the atlas; individual frames and large generation/research
// sources remain in the project for review and do not belong in the installer.
const runtimeAssets = ["spritesheet.png", "manifest.json", "app-icon.ico", "avatar.png", "tray.png"];
fs.mkdirSync(path.join(stage, "assets"), { recursive: true });
for (const asset of runtimeAssets) {
  const source = path.join(root, "assets", asset);
  if (!fs.existsSync(source)) { console.error(`缺少运行时素材：assets/${asset}`); process.exit(1); }
  fs.copyFileSync(source, path.join(stage, "assets", asset));
}
packageJson.build.electronDist = path.join(toolRoot, "node_modules", "electron", "dist");
packageJson.build.electronVersion = fs.readFileSync(path.join(packageJson.build.electronDist, "version"), "utf8").trim();
packageJson.build.directories.output = path.join(root, "dist");
delete packageJson.devDependencies;
delete packageJson.scripts;
fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(packageJson, null, 2), "utf8");
const args = [path.join(toolRoot, "node_modules", "electron-builder", "cli.js"), "--projectDir", stage, "--win", process.argv.includes("--dir") ? "dir" : "nsis"];
console.log(`Build stage: ${stage}`);
const result = spawnSync(process.execPath, args, {
  cwd: root, stdio: "inherit", shell: false, windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: path.join(toolRoot, ".builder-cache"),
    ELECTRON_CACHE: path.join(toolRoot, ".electron-cache"),
    npm_config_cache: path.join(root, ".npm-cache")
  }
});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
