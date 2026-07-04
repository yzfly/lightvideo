// 后端适配层: 通过 Tauri sidecar 驱动内置 ffmpeg/ffprobe
import { Command } from '@tauri-apps/plugin-shell'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export const VIDEO_EXTS = [
  'mp4', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'webm', 'm4v',
  'ts', 'mts', 'm2ts', '3gp', 'mpg', 'mpeg', 'rmvb',
]

export function isVideo(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  return VIDEO_EXTS.includes(ext)
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

// 弹出系统文件选择框
export async function pickVideos() {
  const paths = await open({
    multiple: true,
    title: '选择视频文件',
    filters: [{ name: '视频文件', extensions: VIDEO_EXTS }],
  })
  if (!paths) return []
  return Array.isArray(paths) ? paths : [paths]
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
    const v = (data.streams || []).find((s) => s.codec_type === 'video')
    const a = (data.streams || []).find((s) => s.codec_type === 'audio')
    if (!v) {
      info.error = '文件中未找到视频流'
      return info
    }
    info.width = v.width
    info.height = v.height
    info.codec = v.codec_name
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
