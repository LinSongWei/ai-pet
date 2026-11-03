# 若娜瓦 AI 桌宠 · 余烬之间

以《原神》死之执政若娜瓦为灵感的非官方 Windows 桌面陪伴程序。保留克制、威严的角色气质，再加一点偷偷吃点心、被摸头后不肯承认的反差。

**当前版本：1.0.2 · Windows x64 · Electron**

[下载安装包](https://github.com/LinSongWei/ai-pet/releases/latest) · [版本记录](CHANGELOG.md) · [反馈问题](https://github.com/LinSongWei/ai-pet/issues)

> 安全维护提示：当前 1.0.2 沿用 Electron 37.10.3；依赖审计存在已知告警，尚未完成升级与逐项影响分析。请先阅读 [安全说明](SECURITY.md)。

<p align="center">
  <img src="docs/run-cycle.gif" alt="若娜瓦桌宠跑步动作" width="288" />
  <img src="docs/tea-cycle.gif" alt="若娜瓦桌宠喝茶动作" width="288" />
</p>

## 直接安装使用

1. 打开上方「下载安装包」，在 Assets 中下载 `Ronova-AI-Desktop-Pet-Setup-1.0.2.exe`。不需要安装 Node.js，也不需要下载源码。
2. 运行安装程序，选择安装目录；随后打开「若娜瓦AI桌宠」。更新前请先从托盘退出旧版。
3. 按住角色可拖动；双击角色打开聊天；右键角色选择动作。托盘菜单可以打开聊天、找回角色或完全退出。
4. 聊天窗口的「连接与陪伴」中填写**自己的** API Key、接口地址和模型名。

关闭聊天窗口不会退出桌宠；需要彻底关闭时，从系统托盘选择「退出」。

安装包未做代码签名。下载后请核对发布页的 SHA256；若系统或安全软件阻止运行，请先核实来源及提示原因，不要关闭安全防护。

## 她会做什么

- 80 帧素材，包括左右跑步、观察、眨眼、微笑、羞恼，以及喝茶、吃点心、拥抱、整理羽毛和记账等动作。
- 自己在桌面活动，也会回应鼠标互动；可选安静、均衡、活泼三档。
- 独立聊天小窗，流式回复与角色头顶气泡共用同一轮生成；长句可以分页阅读。
- 可开启 AI 自言自语，或只使用本地陪伴短句。
- 普通点击、拖动和右键互动不主动抢走前台窗口焦点；明确打开聊天时才激活聊天窗。

喝茶、点心及日常陪伴台词属于本项目的二创设定，不是官方确认的角色喜好。

## AI 连接与隐私

项目默认值：

| 设置 | 默认值 |
| --- | --- |
| 接口地址 | `https://api.deepseek.com` |
| 模型名 | `deepseek-v4-flash` |
| API Key | 空，由使用者自行填写 |

默认模型名是项目配置，不保证每个服务商或账号都有权限使用；遇到接口或模型错误，请改为账号实际可用的模型。程序使用 OpenAI 风格的 `/chat/completions` 接口。

没有 Key 也能使用动作和本地短句。调用 AI 产生的费用、余额及限流由你的模型服务商和账号决定；自动自言自语也会调用接口，可以关闭或调整间隔。

设置保存在当前 Windows 用户的 `%APPDATA%\RonovaAIDesktopPet`，不随源码或安装包分发。系统加密可用时，Key 通过 Electron `safeStorage` 加密；加密不可用时可能以明文保存，请保护本机账户和该目录，勿将其分享。

程序不会读取屏幕、文档或其他应用内容。发送消息时，当前对话内容与角色提示词会提交给你配置的模型接口。请勿在聊天中输入不希望服务商接收的敏感信息。

## 从源码运行

需要 Windows x64、Git、Node.js 20 或更高版本及 npm。先完成依赖安装：

```powershell
git clone https://github.com/LinSongWei/ai-pet.git
cd ai-pet
npm ci
npm test
npm start
```

首次安装依赖需要下载 Electron。源码已包含运行所需的精灵图，不需要 Python 或图片生成服务。

项目为 npm 12 的安装脚本策略提供了两个精确版本白名单（Electron 和 electron-winstaller），不需要全局放行安装脚本。

```powershell
# 生成解包程序：dist/win-unpacked/
npm run pack

# 生成 Windows NSIS 安装包：dist/
npm run dist
```

构建优先使用本项目 `node_modules`。开发者也可显式将 `RONOVA_BUILD_TOOLS` 指向已安装相同 Electron / electron-builder 依赖的目录，不再依赖作者电脑上的固定路径。

离线测试覆盖 AI 流解析、动作时钟、拖动 IPC、气泡分页及窗口边界。可额外运行隔离渲染检查：

```powershell
.\node_modules\.bin\electron.cmd scripts/check-renderer.js
```

检查输出位于被 Git 忽略的 `qa/`，不读取真实用户连接设置，也不调用真实 AI 接口。

## 素材与结构

```text
src/             Electron 主进程、桌宠、聊天与 AI 客户端
assets/          运行时精灵图、图标和动作配置
assets/source/   当前使用的原始动作图与角色母图
scripts/         构建、素材处理和离线测试
reference/       角色研究来源及图片生成提示词
docs/            项目演示预览
```

如需重新切片素材，另安装 Python、Pillow 和 NumPy，再执行 `python scripts/build-assets.py`。该脚本只处理已有图片，不会生成新绘画。正常启动和打包无需这一步。

## 已知边界与反馈

- 当前只提供 Windows x64 安装包，尚未提供其他系统或 ARM 原生包。
- 1.0.1 修复了部分 Windows 缩放比例下窗口尺寸累积、拖动范围越来越窄的问题；1.0.2 修复了普通互动抢焦点的问题。
- 多屏、不同 DPI、独占全屏软件和显卡驱动组合尚未逐一覆盖。若仍有异常，请反馈系统版本、屏幕缩放比例、显示器数量和复现步骤；不要上传 Key、设置文件或完整用户 profile。
- 这是桌面陪伴与角色扮演程序，不是能代操作其他软件的通用智能体。

## 非官方声明与使用边界

本项目与米哈游 / HoYoverse 无隶属、赞助或官方授权关系。《原神》、若娜瓦及相关角色设定的权利归其权利人。项目角色图采用 AI 辅助制作并经过切片处理，不应误认为官方素材。

欢迎下载发布的程序体验。公开源码不等同于为所有代码和角色美术授予开源或商用许可；当前 `package.json` 仍标记为 `UNLICENSED`。若需要再分发、修改后发布或商业使用，请先联系仓库维护者，并自行确认涉及的第三方权利。请勿将角色素材单独包装成通用素材库售卖。
