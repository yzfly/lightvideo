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
    if (out.code !== 0) return { found: false }
    const fields = out.stdout.split('\n')[0].split(/\s+/)
    return { found: true, version: fields[2] || '', bundled: true }
  } catch (e) {
    return { found: false, error: String(e) }
  }
}

// 弹出系统文件选择框
export async function pickVideos() {
  const paths = await open({
    multiple: true,
    title: '选择要压缩的视频',
    filters: [{ name: '视频文件', extensions: VIDEO_EXTS }],
  })
  if (!paths) return []
  return Array.isArray(paths) ? paths : [paths]
}

// ffprobe 探测视频元信息
export async function probe(path) {
  const name = path.split(/[/\\]/).pop()
  const info = { path, name, size: 0, duration: 0, width: 0, height: 0, codec: '', error: '' }
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
    if (!v) {
      info.error = '文件中未找到视频流'
      return info
    }
    info.width = v.width
    info.height = v.height
    info.codec = v.codec_name
  } catch (e) {
    info.error = '解析视频信息失败'
  }
  return info
}

/**
 * 压缩一个视频。核心即那条经典指令:
 * ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 output.mp4
 *
 * @returns {Promise<{child, done}>} child 用于取消(kill)，done 在结束时 resolve
 */
export async function compress(item, opts, onProgress) {
  const out = await invoke('output_path', { input: item.path })

  const args = [
    '-y', '-i', item.path,
    '-c:v', 'libx264',
    '-preset', opts.preset,
    '-crf', String(opts.crf),
  ]
  if (opts.maxHeight > 0) {
    // -2 保证宽度为偶数; min(...) 保证只缩小不放大; \, 转义滤镜表达式中的逗号
    args.push('-vf', `scale=-2:min(${opts.maxHeight}\\,ih)`)
  }
  if (opts.audioMode === 'copy') {
    args.push('-c:a', 'copy')
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k')
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-loglevel', 'error', out)

  const cmd = Command.sidecar('binaries/ffmpeg', args)

  // 解析 -progress 流: 每周期一组 key=value 行，以 progress= 行收尾
  const totalUs = item.duration * 1e6
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
      let percent = totalUs > 0 ? Math.min((curUs / totalUs) * 100, 99.9) : 0
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

export function revealFile(path) {
  invoke('reveal', { path })
}
