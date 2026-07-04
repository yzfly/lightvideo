# 轻影 LightVideo

> FFmpeg 视频工具箱。压缩、转格式、提取音频、剪辑、转 GIF、截图——拖进来就能用。

FFmpeg 是视频处理的瑞士军刀，但不是每个人都愿意打开终端。**轻影把 FFmpeg 最常用的能力做成了一个干净的桌面应用**——内置 FFmpeg，零依赖，下载即用。

这个项目源于一条和 AI 一起发掘出来的指令：

```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 output.mp4
```

它能在肉眼无损的画质下把视频压小 50%~90%。轻影从这条指令出发，把常用视频操作全部图形化。

## 六大工具

| 工具 | 说明 |
|------|------|
| 🗜 **视频压缩** | CRF 恒定质量编码，肉眼无损大幅瘦身，可调画质/速度/分辨率 |
| 🔄 **格式转换** | MP4 / MOV / MKV / WebM 互转，支持秒级换容器与重编码两种方式 |
| 🎵 **提取音频** | 抽出视频音轨，存为 MP3 / M4A / WAV / FLAC |
| ✂️ **视频剪辑** | 按起止时间截取片段，无损快剪秒级完成，精准模式帧级切割 |
| 🎞 **视频转 GIF** | 调色板两阶段算法，颜色准确的高质量 GIF |
| 📸 **视频截图** | 抽取任意时间点画面，保存 PNG / JPG |

通用能力：批量队列串行处理、实时进度（百分比/速度/剩余时间）、输出永不覆盖原文件、失败一键重试。

## 下载使用

从 [Releases](../../releases) 下载对应平台的安装包（macOS `.dmg`、Windows `.exe` 安装器、Linux `.AppImage`/`.deb`），打开即用。macOS 版本已签名并通过 Apple 公证，无任何安全提示。

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

# 4. 构建安装包
npm run build
```

## 发布流程

推送 `v*` 标签即触发 GitHub Actions，自动构建四个平台产物（macOS arm64 / x64、Windows x64、Linux x64）并创建 Release 草稿：

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## 技术架构

- **外壳**：[Tauri v2](https://v2.tauri.app/) —— 原生 WebView，安装包小
- **界面**：Vue 3 + Vite —— 亮色系设计，拖拽交互
- **编码内核**：FFmpeg 以 [sidecar](https://v2.tauri.app/develop/sidecar/) 形式内置静态构建
- **工具注册表**：`frontend/src/tools.js` 声明式定义每个工具的参数、校验与 ffmpeg 命令构建，新增工具只需登记一项

```
frontend/            Vue 3 界面 + 任务调度 (src/backend.js) + 工具定义 (src/tools.js)
src-tauri/           Tauri 外壳与少量 Rust 命令
src-tauri/binaries/  静态 FFmpeg sidecar (由 scripts/download_ffmpeg.sh 下载)
scripts/             FFmpeg 下载脚本、图标生成脚本
.github/workflows/   多平台自动发布流水线
```

## FAQ

**为什么有的视频压不小？**
说明它已经用高效参数编码过了。CRF 编码保证"质量恒定"，不保证"一定变小"——遇到这种情况工具会如实告诉你。

**无损快剪的切点为什么有偏差？**
无损模式不重编码，切点只能落在关键帧上，可能偏差 1-2 秒；需要帧级精度时用「精准剪辑」。

**支持 H.265/AV1 吗？**
当前版本以 H.264 为核心——兼容性最好，任何设备都能播。后续版本考虑加入 H.265 与硬件加速选项。

## 许可

本项目代码采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)（署名-非商业性使用）。

本应用内置 [FFmpeg](https://ffmpeg.org/)（GPL 许可，静态构建来自 [martin-riedl.de](https://ffmpeg.martin-riedl.de/) 与 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)），FFmpeg 是 FFmpeg 项目的商标，版权归其贡献者所有。

## 作者

**云中江树** · 微信公众号「云中江树」
