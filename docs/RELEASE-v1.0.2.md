# 若娜瓦 AI 桌宠 1.0.2

非官方《原神》同人桌面陪伴程序，Windows x64。

## 下载使用

在本页 Assets 中下载 `Ronova-AI-Desktop-Pet-Setup-1.0.2.exe`，运行安装即可，无需 Node.js。

- 按住拖动角色，双击打开聊天，右键选择动作。
- 托盘菜单可以找回角色或退出；关闭聊天小窗不会退出桌宠。
- 聊天设置中填写自己的 API Key。默认接口 `https://api.deepseek.com`，默认模型 `deepseek-v4-flash`；请按账号权限填写实际可用模型。
- 无 Key 也能使用动作和本地陪伴短句。程序不附带任何人的 Key。
- 覆盖更新前请先从托盘退出旧版；原用户设置不会由安装包主动删除。

## 本次修复

普通点击、拖动和右键互动不再主动抢走前台应用焦点；明确打开聊天时才激活聊天窗口。保留 80 帧动作和分数 DPI 下的拖动范围修复。

## 文件校验

`Ronova-AI-Desktop-Pet-Setup-1.0.2.exe`

```text
SHA256: E618FA8FBABFBF79EBC11D386AFC341D5AA5CDA80745CE4EBA6B8B81931E6F92
```

安装包未数字签名，请核实下载来源及校验值；不要关闭系统安全防护。角色相关权利归其权利人，项目非官方。

## 安全维护提示

本版保留 Electron 37.10.3。当前依赖审计存在已知告警，Electron 运行时也会随安装包分发，尚未完成逐项影响分析与升级验证。请在下载前阅读 [安全说明](https://github.com/LinSongWei/ai-pet/blob/main/SECURITY.md)，不要用本程序处理敏感资料。
