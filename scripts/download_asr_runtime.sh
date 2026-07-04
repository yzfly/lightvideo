#!/usr/bin/env bash
# 下载 sherpa-onnx 静态 CLI (VAD + 离线识别) 作为自动字幕的 sidecar 二进制。
# 语音模型不在此下载 —— 应用首次使用「自动字幕」时按需下载到用户数据目录。
#
# 用法:
#   ./scripts/download_asr_runtime.sh              # 自动检测当前平台
#   ./scripts/download_asr_runtime.sh <triple>     # 指定 target triple (CI 用)
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="src-tauri/binaries"
mkdir -p "$DEST"

VER="v1.13.3"
TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
echo "目标平台: $TRIPLE"

case "$TRIPLE" in
aarch64-apple-darwin)  PKG="sherpa-onnx-$VER-osx-arm64-static" ;;
x86_64-apple-darwin)   PKG="sherpa-onnx-$VER-osx-x64-static" ;;
x86_64-unknown-linux-gnu) PKG="sherpa-onnx-$VER-linux-x64-static" ;;
x86_64-pc-windows-msvc)   PKG="sherpa-onnx-$VER-win-x64-static-MT-Release" ;;
*) echo "暂不支持的平台: $TRIPLE" >&2; exit 1 ;;
esac

BIN="sherpa-onnx-vad-with-offline-asr"
EXT=""
[ "${TRIPLE#*windows}" != "$TRIPLE" ] && EXT=".exe"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "下载 $PKG ..."
curl -fsSL --retry 3 -o "$TMP/pkg.tar.bz2" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/$VER/$PKG.tar.bz2"
tar -xf "$TMP/pkg.tar.bz2" -C "$TMP"

found="$(find "$TMP" -type f -name "$BIN$EXT" | head -1)"
[ -n "$found" ] || { echo "压缩包里没找到 $BIN$EXT" >&2; exit 1; }
install -m 755 "$found" "$DEST/sherpa-asr-$TRIPLE$EXT"

echo "完成:"
ls -lh "$DEST" | grep sherpa
