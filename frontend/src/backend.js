// 后端适配层: 通过 Tauri sidecar 驱动内置 ffmpeg/ffprobe
import { Command } from '@tauri-apps/plugin-shell'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export const VIDEO_EXTS = [
  'mp4', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'webm', 'm4v',
  'ts', 'mts', 'm2ts', '3gp', 'mpg', 'mpeg', 'rmvb',
]

export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'amr', 'aiff', 'caf']

export function hasExt(path, exts) {
  const ext = path.split('.').pop()?.toLowerCase()
  return exts.includes(ext)
}

// 检查内置 ffmpeg 可用性
export async function checkFFmpeg() {
  try {
    const out = await Command.sidecar('binaries/ffmpeg', ['-version']).execute()
    return { found: out.code === 0 }
  } catch (e) {
    return { found: false, error: String(e) }
  }
}

// 弹出系统文件选择框 (按工具声明的输入类型过滤)
export async function pickMedia(name, extensions) {
  const paths = await open({
    multiple: true,
    title: `选择${name}`,
    filters: [{ name, extensions }],
  })
  if (!paths) return []
  return Array.isArray(paths) ? paths : [paths]
}

// 单文件选择 (音频/字幕/图片等辅助素材)
export async function pickFile(title, name, extensions) {
  const path = await open({ multiple: false, title, filters: [{ name, extensions }] })
  return typeof path === 'string' ? path : null
}

export function writeConcatList(paths) {
  return invoke('write_concat_list', { paths })
}

export function removeFile(path) {
  return invoke('remove_file', { path })
}

export function tempPath(name) {
  return invoke('temp_path', { name })
}

export function fileSize(path) {
  return invoke('file_size', { path })
}

export function asrDir() {
  return invoke('asr_dir')
}

export function writeTextFile(path, content) {
  return invoke('write_text_file', { path, content })
}

/**
 * 运行本地语音识别 sidecar，流式回调识别出的分段
 * 输出行格式: "0.742 -- 5.568: 文本"
 */
export async function runAsr(args, onSegment) {
  const cmd = Command.sidecar('binaries/sherpa-asr', args)
  const segs = []
  let errTail = ''
  cmd.stdout.on('data', (line) => {
    const m = line.match(/^(\d+(?:\.\d+)?)\s*--\s*(\d+(?:\.\d+)?):\s*(.*)$/)
    if (m) {
      const seg = { start: +m[1], end: +m[2], text: m[3].trim() }
      if (seg.text) {
        segs.push(seg)
        onSegment?.(seg)
      }
    }
  })
  cmd.stderr.on('data', (line) => {
    errTail = (errTail + '\n' + line).slice(-400)
  })
  const done = new Promise((resolve) => {
    cmd.on('close', ({ code }) => resolve({ ok: code === 0, segs, message: errTail.trim() }))
    cmd.on('error', (e) => resolve({ ok: false, segs, message: String(e) }))
  })
  const child = await cmd.spawn()
  return { child, done }
}

/**
 * 用系统 curl 下载文件, 按已落盘字节数汇报进度; 支持断点续传。
 * 依次尝试 urls, 全部失败返回 false; isCancelled 返回真时立即停止(不再换镜像)。
 */
export async function downloadFile(urls, dest, expectedSize, onPct, setChild, isCancelled) {
  for (const url of urls) {
    if (isCancelled?.()) return false
    const existing = await fileSize(dest)
    if (existing === expectedSize) return true
    if (existing > expectedSize) {
      // 残留文件比预期还大(镜像塞了错误页/上游文件变了): 续传只会永远 416, 删掉重来
      await removeFile(dest)
    }
    const cmd = Command.create('curl', ['-fSL', '--retry', '2', '-C', '-', '--connect-timeout', '15', '-o', dest, url])
    const done = new Promise((resolve) => {
      cmd.on('close', ({ code }) => resolve(code))
      cmd.on('error', () => resolve(-1))
    })
    const child = await cmd.spawn()
    setChild?.(child)
    const poll = setInterval(async () => {
      const sz = await fileSize(dest)
      onPct?.(Math.min(99, (sz / expectedSize) * 100))
    }, 800)
    await done
    clearInterval(poll)
    setChild?.(null)
    // 取消判定不能依赖退出码: Windows 上 kill 后 curl 退出码是 1 而不是 null
    if (isCancelled?.()) return false
    if ((await fileSize(dest)) === expectedSize) {
      onPct?.(100)
      return true
    }
    if ((await fileSize(dest)) > expectedSize) await removeFile(dest)
  }
  return false
}

export function copyToTemp(src, ext) {
  return invoke('copy_to_temp', { src, ext })
}

// ffprobe 探测视频元信息
export async function probe(path) {
  const name = path.split(/[/\\]/).pop()
  const info = { path, name, size: 0, duration: 0, width: 0, height: 0, codec: '', audioCodec: '', error: '' }
  try {
    const out = await Command.sidecar('binaries/ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', path,
    ]).execute()
    if (out.code !== 0) {
      info.error = '无法解析该文件，可能不是有效的视频'
      return info
    }
    const data = JSON.parse(out.stdout)
    info.size = Number(data.format?.size) || (await invoke('file_size', { path }))
    info.duration = Number(data.format?.duration) || 0
    // 纯音频文件没有视频流, 是否算错误由工具自己判断 (tool.check)
    const v = (data.streams || []).find((s) => s.codec_type === 'video')
    const a = (data.streams || []).find((s) => s.codec_type === 'audio')
    if (v) {
      info.width = v.width
      info.height = v.height
      info.codec = v.codec_name
    }
    info.audioCodec = a?.codec_name || ''
  } catch (e) {
    info.error = '解析视频信息失败'
  }
  return info
}

/**
 * 执行一个 ffmpeg 任务。
 * @param {string[]} args     完整 ffmpeg 参数，输出文件须是最后一个参数
 * @param {number}   totalUs  总时长(微秒)，0 表示不确定进度(percent 回调为 -1)
 * @returns {Promise<{child, done}>} child 用于取消(kill)，done 在结束时 resolve
 */
export async function runFFmpeg(args, totalUs, onProgress) {
  const out = args[args.length - 1]
  const full = [...args.slice(0, -1), '-progress', 'pipe:1', '-nostats', '-loglevel', 'error', out]

  const cmd = Command.sidecar('binaries/ffmpeg', full)

  let curUs = 0
  let speed = ''
  let outSize = 0
  let stderrTail = ''

  cmd.stdout.on('data', (line) => {
    const idx = line.indexOf('=')
    if (idx < 0) return
    const key = line.slice(0, idx)
    const val = line.slice(idx + 1).trim()
    if (key === 'out_time_us') curUs = Number(val) || curUs
    else if (key === 'speed') speed = val
    else if (key === 'total_size') outSize = Number(val) || outSize
    else if (key === 'progress') {
      const percent = totalUs > 0 ? Math.min((curUs / totalUs) * 100, 99.9) : -1
      let eta = -1
      const sp = parseFloat(speed)
      if (sp > 0 && totalUs > 0) eta = Math.round((totalUs - curUs) / 1e6 / sp)
      onProgress({ percent, speed, outSize, eta })
    }
  })
  cmd.stderr.on('data', (line) => {
    stderrTail = (stderrTail + '\n' + line).slice(-300)
  })

  const started = Date.now()
  const done = new Promise((resolve) => {
    cmd.on('close', async ({ code }) => {
      if (code === 0) {
        const size = await invoke('file_size', { path: out })
        resolve({ ok: true, output: out, outSize: size, seconds: Math.round((Date.now() - started) / 1000) })
      } else {
        await invoke('remove_file', { path: out })
        resolve({ ok: false, message: stderrTail.trim() || `ffmpeg 退出码 ${code}` })
      }
    })
    cmd.on('error', async (err) => {
      await invoke('remove_file', { path: out })
      resolve({ ok: false, message: String(err) })
    })
  })

  const child = await cmd.spawn()
  return { child, done }
}

export function outputPath(input, suffix, ext) {
  return invoke('output_path', { input, suffix, ext })
}

export function revealFile(path) {
  invoke('reveal', { path })
}
