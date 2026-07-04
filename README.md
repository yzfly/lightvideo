# 视频瘦身 SlimVideo

> 无损画质，极限压缩。一条 ffmpeg 指令的桌面化。

这个工具源于一条和 AI 一起发掘出来的指令：

```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 output.mp4
```

它能在肉眼无损的画质下把视频文件压小 50%~90%。但不是每个人都愿意打开终端。**SlimVideo 把这条指令做成了一个拖进来就能用的桌面应用**——内置 FFmpeg，零依赖，下载即用。

## 特性

- 🎬 **拖拽即压缩**：把视频拖进窗口，点一下开始，完事
- 📦 **内置 FFmpeg**：用户无需安装任何东西
- 🔍 **画质无损**：默认 CRF 23 恒定质量编码，肉眼看不出差别
- 📊 **实时进度**：百分比、编码速度、剩余时间一目了然
- 🗂 **批量队列**：一次拖入多个视频，自动排队串行处理（榨干 CPU 但不互相拖慢）
- ⚙️ **可调参数**：画质 (CRF 18-28)、编码速度、分辨率上限、音频处理
- 🛡 **不动原文件**：输出为 `原名_slim.mp4`，永不覆盖源视频
- 💻 **跨平台**：macOS (Apple Silicon / Intel)、Windows、Linux

## 参数说明

| 参数 | 选项 | 说明 |
|------|------|------|
| 画质 CRF | 18–28，默认 **23** | 恒定质量因子，越小画质越高体积越大；23 是"肉眼无损"的甜点值 |
| 编码速度 | 快速 / **均衡** / 极致 | 对应 x264 preset fast / medium / slow，越慢压缩率越高 |
| 分辨率 | **原始** / 1080P / 720P | 限制最大高度，只缩小不放大 |
| 音频 | **压缩 (AAC 128k)** / 原样保留 | 保留模式不重编码音轨 |

## 下载使用

从 [Releases](../../releases) 下载对应平台的安装包（macOS `.dmg`、Windows `.exe` 安装器、Linux `.AppImage`/`.deb`），打开即用。

> macOS 首次打开如提示"无法验证开发者"，右键应用 → 打开，或在系统设置 → 隐私与安全性中允许。

## 从源码构建

依赖：[Rust](https://rustup.rs/) stable、Node.js 18+

```bash
# 1. 安装依赖
npm install
npm install --prefix frontend

# 2. 下载静态 FFmpeg (打进应用的 sidecar 二进制)
./scripts/download_ffmpeg.sh

# 3. 开发调试（热重载）
npm run dev

# 4. 构建安装包 (macOS 产出 .app + .dmg)
npm run build
```

## 发布流程

推送 `v*` 标签即触发 GitHub Actions，自动构建四个平台产物（macOS arm64 / x64、Windows x64、Linux x64）并创建 Release 草稿：

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## 技术架构

- **外壳**：[Tauri v2](https://v2.tauri.app/) —— Rust 侧仅少量文件系统命令，体积小、原生 WebView
- **界面**：Vue 3 + Vite —— 亮色系界面，拖拽交互
- **编码内核**：FFmpeg (libx264) 以 [sidecar](https://v2.tauri.app/develop/sidecar/) 形式内置静态构建，压缩逻辑（进程驱动、`-progress` 实时进度解析、串行任务队列）在前端 JS 层完成

```
frontend/            Vue 3 界面 + 压缩调度逻辑 (src/backend.js)
src-tauri/           Tauri 外壳配置与少量 Rust 命令
src-tauri/binaries/  静态 FFmpeg sidecar (由 scripts/download_ffmpeg.sh 下载)
scripts/             FFmpeg 下载脚本 (本地与 CI 通用)
.github/workflows/   多平台自动发布流水线
```

## FAQ

**为什么有的视频压不小？**
说明它已经用高效参数编码过了（比如已经是 H.264/H.265 低码率）。CRF 编码保证的是"质量恒定"，不保证"一定变小"——遇到这种情况工具会如实告诉你。

**压缩后画质真的没损失吗？**
严格说是"视觉无损"：CRF 23 的失真低于绝大多数人眼的分辨阈值。对画质极敏感的场景（后期素材、存档母带）建议调到 CRF 18–20 或直接保留原片。

**支持 H.265/AV1 吗？**
当前版本专注把 H.264 这条经典指令做到体验极致——兼容性最好，任何设备都能播。后续版本考虑加入 H.265 与硬件加速选项。

## 许可

本项目代码采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)（署名-非商业性使用）。

本应用内置 [FFmpeg](https://ffmpeg.org/)（GPL 许可，静态构建来自 [martin-riedl.de](https://ffmpeg.martin-riedl.de/) 与 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)），FFmpeg 是 FFmpeg 项目的商标，版权归其贡献者所有。

## 作者

**云中江树** · 微信公众号「云中江树」
