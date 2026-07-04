#!/usr/bin/env bash
# 下载对应平台的静态 ffmpeg/ffprobe 到 src-tauri/binaries/，
# 按 Tauri sidecar 规范命名: ffmpeg-<target-triple>[.exe]
#
# 用法:
#   ./scripts/download_ffmpeg.sh              # 自动检测当前平台
#   ./scripts/download_ffmpeg.sh <triple>     # 指定 target triple (CI 用)
#
# 支持的 triple:
#   aarch64-apple-darwin / x86_64-apple-darwin   (martin-riedl.de 静态构建)
#   x86_64-pc-windows-msvc                        (BtbN GPL 构建)
#   x86_64-unknown-linux-gnu                      (BtbN GPL 构建)
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="src-tauri/binaries"
mkdir -p "$DEST"

TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
echo "目标平台: $TRIPLE"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$TRIPLE" in
aarch64-apple-darwin | x86_64-apple-darwin)
    ARCH="${TRIPLE%%-*}"
    BASE="https://ffmpeg.martin-riedl.de/redirect/latest/macos/${ARCH}/release"
    for bin in ffmpeg ffprobe; do
        echo "下载 $bin ..."
        curl -fsSL --retry 3 -o "$TMP/$bin.zip" "$BASE/$bin.zip"
        tar -xf "$TMP/$bin.zip" -C "$TMP"
        found="$(find "$TMP" -type f -name "$bin" | head -1)"
        install -m 755 "$found" "$DEST/$bin-$TRIPLE"
    done
    ;;
x86_64-pc-windows-msvc)
    URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    echo "下载 BtbN win64 构建 ..."
    curl -fsSL --retry 3 -o "$TMP/ff.zip" "$URL"
    tar -xf "$TMP/ff.zip" -C "$TMP"
    for bin in ffmpeg ffprobe; do
        found="$(find "$TMP" -type f -name "$bin.exe" | head -1)"
        install -m 755 "$found" "$DEST/$bin-$TRIPLE.exe"
    done
    ;;
x86_64-unknown-linux-gnu)
    URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
    echo "下载 BtbN linux64 构建 ..."
    curl -fsSL --retry 3 -o "$TMP/ff.tar.xz" "$URL"
    tar -xf "$TMP/ff.tar.xz" -C "$TMP"
    for bin in ffmpeg ffprobe; do
        found="$(find "$TMP" -type f -name "$bin" | head -1)"
        install -m 755 "$found" "$DEST/$bin-$TRIPLE"
    done
    ;;
*)
    echo "暂不支持的平台: $TRIPLE" >&2
    exit 1
    ;;
esac

echo "完成:"
ls -lh "$DEST"
