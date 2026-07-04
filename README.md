# 轻影 LightVideo

> FFmpeg 视频工具箱。压缩、转格式、提取音频、剪辑、转 GIF、截图——拖进来就能用。

FFmpeg 是视频处理的瑞士军刀，但不是每个人都愿意打开终端。**轻影把 FFmpeg 最常用的能力做成了一个干净的桌面应用**——内置 FFmpeg，零依赖，下载即用。

这个项目源于一条和 AI 一起发掘出来的指令：

```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 output.mp4
```

它能在肉眼无损的画质下把视频压小 50%~90%。轻影从这条指令出发，把常用视频操作全部图形化。

## 十七个工具

**视频**：视频压缩（CRF 肉眼无损）· 压缩到指定大小（两遍编码，应对微信等平台限制）· 格式转换（秒级换容器/重编码）· 视频合并（同参数无损拼接）· 视频剪辑（无损快剪/帧级精准）· 视频变速（0.5×–3×，音调自动修正）· 视频倒放

**画面**：旋转翻转 · 画面裁剪（比例居中裁剪）· 横竖屏适配（16:9 ⇄ 9:16，模糊背景铺满）· 加水印（位置/大小/透明度）

**音频**：提取音频（MP3/M4A/WAV/FLAC）· 音量调整/移除音轨 · 配背景音乐（混音/循环/淡出）

**字幕与转写**：烧录字幕（SRT/ASS，中文字体自动适配）· **自动字幕**——本地 AI 语音识别（FunASR 系 SenseVoice 模型 + sherpa-onnx 运行时），不联网不上传，支持中英粤日韩，可生成 SRT 或直接烧录 · **录音转文字**——会议录音、语音备忘、播客转文字稿，支持 MP3/M4A/WAV 等录音格式，输出纯文本或带时间戳 SRT

**图像**：视频转 GIF（调色板两阶段）· 视频截图

通用能力：批量队列串行处理、实时进度、单帧效果预览（水印/裁剪/字幕等）、输出永不覆盖原文件、失败一键重试。自动字幕的语音模型（约 230MB）首次使用时下载，之后完全离线。

## 下载使用

从 [Releases](../../releases) 下载对应平台的安装包（macOS `.dmg`、Windows `.exe` 安装器、Linux `.AppImage`/`.deb`），打开即用。macOS 版本已签名并通过 Apple 公证，无任何安全提示。

## 从源码构建

依赖：[Rust](https://rustup.rs/) stable、Node.js 18+

```bash
# 1. 安装依赖
npm install
npm install --prefix frontend

# 2. 下载静态 FFmpeg 与语音识别运行时 (打进应用的 sidecar 二进制)
./scripts/download_ffmpeg.sh
./scripts/download_asr_runtime.sh

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
- **语音识别**：[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 静态 CLI + [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) int8 模型 + Silero VAD，纯本地推理
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
