// 工具模块注册表: 每个工具声明自己的参数、输出命名与 ffmpeg 参数构建
// 界面按 fields 声明自动渲染，新增工具只需在此登记
import {
  writeConcatList, copyToTemp, runFFmpeg, runAsr, downloadFile,
  asrDir, fileSize, tempPath, writeTextFile, removeFile,
} from './backend.js'

// "HH:MM:SS.x" / "MM:SS" / "SS" -> 秒
export function parseTime(str) {
  if (!str) return 0
  const parts = String(str).trim().split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  return parts.reduce((acc, v) => acc * 60 + v, 0)
}

function extOf(path) {
  return path.split('.').pop().toLowerCase()
}

// 视频流 copy 时保守沿用原容器 (奇门容器归入 mkv, 什么都能装)
function keepExt(item) {
  const e = extOf(item.path)
  if (['mp4', 'mov', 'm4v'].includes(e)) return 'mp4'
  if (e === 'webm') return 'webm'
  return 'mkv'
}

// 按容器选择音频编码; force=true 时必须重编码(如加了音频滤镜)
function audioArgs(item, ext, force = false) {
  if (!item.audioCodec) return ['-an']
  if (ext === 'webm') {
    return item.audioCodec === 'opus' && !force ? ['-c:a', 'copy'] : ['-c:a', 'libopus', '-b:a', '128k']
  }
  return item.audioCodec === 'aac' && !force ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']
}

const GIF_FILTER = (fps, width) =>
  `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`

// 预览抽帧的时间点: 避开片头黑场, 也别超出片长
const previewTs = (item) => Math.min(1, item.duration / 2).toFixed(2)

// 中文字幕需要显式指定字体, 否则 fontconfig 可能找不到 CJK 字体渲染成方块
const SUB_FONT = /Mac/.test(navigator.platform)
  ? 'PingFang SC'
  : /Win/.test(navigator.platform)
    ? 'Microsoft YaHei'
    : 'Noto Sans CJK SC'

// 构造字幕烧录滤镜 (烧录字幕与自动字幕共用)
// 字幕先复制到安全 ASCII 路径, 绕开滤镜参数的路径转义地狱
async function subtitleVf(subPath, fontsize) {
  const ext = extOf(subPath)
  const safe = await copyToTemp(subPath, ext)
  const p = safe.replace(/\\/g, '/').replace(/:/g, '\\:')
  if (ext === 'ass' || ext === 'ssa') return `ass=filename=${p}`
  return `subtitles=filename=${p}:force_style='FontName=${SUB_FONT},FontSize=${fontsize},Outline=1,Shadow=0'`
}

// ---------- 本地语音识别 (sherpa-onnx + SenseVoice) ----------
const ASR_FILES = [
  {
    name: 'silero_vad.onnx',
    size: 643854,
    urls: [
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
      'https://gh-proxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    ],
  },
  {
    name: 'model.int8.onnx',
    size: 239233841,
    urls: [
      'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx',
      'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx',
    ],
  },
  {
    name: 'tokens.txt',
    size: 315894,
    urls: [
      'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt',
      'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt',
    ],
  },
]

function srtTs(sec) {
  const ms = Math.round(sec * 1000)
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  const f = String(ms % 1000).padStart(3, '0')
  return `${h}:${m}:${s},${f}`
}

function toSrt(segs) {
  return segs.map((g, i) => `${i + 1}\n${srtTs(g.start)} --> ${srtTs(g.end)}\n${g.text}\n`).join('\n')
}

export const TOOLS = [
  // ================= 视频处理 =================
  {
    id: 'compress',
    group: '视频',
    name: '视频压缩',
    desc: '肉眼无损的画质下大幅缩小文件体积，通用 H.264 编码',
    icon: 'compress',
    action: '开始压缩',
    compare: true,
    defaults: { crf: 23, preset: 'medium', maxHeight: 0, audioMode: 'aac' },
    fields: [
      {
        key: 'crf', type: 'range', min: 18, max: 28,
        label: (s) => `画质 CRF ${s.crf}`,
        hint: (s) => (s.crf <= 20 ? '画质优先，压缩率较低' : s.crf <= 24 ? '推荐：肉眼无损，大幅瘦身' : '体积优先，画质轻微下降'),
      },
      {
        key: 'preset', type: 'segmented', label: '编码速度',
        options: [
          { value: 'fast', label: '快速' },
          { value: 'medium', label: '均衡' },
          { value: 'slow', label: '极致' },
        ],
        hint: (s) => ({ fast: '速度快，文件稍大', medium: '推荐，质量与速度兼顾', slow: '更慢，压得更小' }[s.preset]),
      },
      {
        key: 'maxHeight', type: 'segmented', label: '分辨率',
        options: [
          { value: 0, label: '原始' },
          { value: 1080, label: '1080P' },
          { value: 720, label: '720P' },
        ],
        hint: (s) => (s.maxHeight ? '超过该分辨率时缩小' : '保持原分辨率'),
      },
      {
        key: 'audioMode', type: 'segmented', label: '音频',
        options: [
          { value: 'aac', label: '压缩' },
          { value: 'copy', label: '原样保留' },
        ],
        hint: (s) => (s.audioMode === 'aac' ? 'AAC 128k，通用兼容' : '不重编码音轨'),
      },
    ],
    output: () => ({ suffix: '_slim', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    buildArgs(item, s, out) {
      const args = ['-y', '-i', item.path, '-c:v', 'libx264', '-preset', s.preset, '-crf', String(s.crf)]
      if (s.maxHeight > 0) args.push('-vf', `scale=-2:min(${s.maxHeight}\\,ih)`)
      if (s.audioMode === 'copy') args.push('-c:a', 'copy')
      else args.push('-c:a', 'aac', '-b:a', '128k')
      args.push('-movflags', '+faststart', out)
      return args
    },
  },

  {
    id: 'targetsize',
    group: '视频',
    name: '压缩到指定大小',
    desc: '两遍编码精确逼近目标体积，应对微信、邮箱等平台限制',
    icon: 'targetsize',
    action: '开始压缩',
    compare: true,
    defaults: { sizeMB: 100 },
    fields: [
      {
        key: 'sizeMB', type: 'segmented', label: '目标大小',
        options: [
          { value: 10, label: '10M' },
          { value: 25, label: '25M' },
          { value: 50, label: '50M' },
          { value: 100, label: '100M' },
          { value: 200, label: '200M' },
        ],
        hint: () => '第一遍分析画面，第二遍精确分配码率',
      },
    ],
    output: (item, s) => ({ suffix: `_${s.sizeMB}mb`, ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6 * 2, // 两遍
    validate(item, s) {
      if (item.size && item.size <= s.sizeMB * 1024 * 1024) return '原文件已小于目标大小，无需压缩'
      if (this._videoKbps(item, s) < 80) return '该时长下目标太小，画质会崩坏，请选更大的目标'
    },
    _videoKbps(item, s) {
      const audioK = item.audioCodec ? 128 : 0
      return Math.floor((s.sizeMB * 8192 * 0.95) / item.duration - audioK)
    },
    buildSteps(item, s, out) {
      const k = this._videoKbps(item, s)
      const log = out + '.pass'
      const common = [
        '-c:v', 'libx264', '-preset', 'medium',
        '-b:v', `${k}k`, '-maxrate', `${Math.floor(k * 1.5)}k`, '-bufsize', `${k * 3}k`,
        '-passlogfile', log,
      ]
      return [
        ['-y', '-i', item.path, ...common, '-pass', '1', '-an', '-f', 'null', '-'],
        ['-y', '-i', item.path, ...common, '-pass', '2',
          ...(item.audioCodec ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
          '-movflags', '+faststart', out],
      ]
    },
    cleanup: (out) => [out + '.pass-0.log', out + '.pass-0.log.mbtree'],
  },

  {
    id: 'convert',
    group: '视频',
    name: '格式转换',
    desc: '在 MP4、MOV、MKV、WebM 之间转换容器或重新编码',
    icon: 'convert',
    action: '开始转换',
    defaults: { format: 'mp4', mode: 'remux' },
    fields: [
      {
        key: 'format', type: 'segmented', label: '目标格式',
        options: [
          { value: 'mp4', label: 'MP4' },
          { value: 'mov', label: 'MOV' },
          { value: 'mkv', label: 'MKV' },
          { value: 'webm', label: 'WebM' },
        ],
        hint: (s) => ({ mp4: '最通用，所有设备可播', mov: '苹果生态常用', mkv: '开放容器，兼容多轨', webm: '网页嵌入常用，需重编码' }[s.format]),
      },
      {
        key: 'mode', type: 'segmented', label: '转换方式',
        options: [
          { value: 'remux', label: '仅换容器' },
          { value: 'reencode', label: '重新编码' },
        ],
        hint: (s) => (s.mode === 'remux' ? '不重编码，秒级完成，画质零损失' : '重编码为通用编码，耗时较长但兼容性最好'),
      },
    ],
    output: (item, s) => ({ suffix: '', ext: s.format }),
    totalUs: (item, s) => (s.mode === 'remux' ? 0 : item.duration * 1e6),
    validate(item, s) {
      if (s.format === 'webm' && s.mode === 'remux') return 'WebM 容器要求 VP8/VP9 编码，请选择「重新编码」'
    },
    buildArgs(item, s, out) {
      const args = ['-y', '-i', item.path]
      if (s.mode === 'remux') {
        if (s.format === 'mkv') args.push('-map', '0')
        else args.push('-map', '0:v', '-map', '0:a?')
        args.push('-c', 'copy')
      } else if (s.format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k')
      } else {
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k')
        if (s.format === 'mp4' || s.format === 'mov') args.push('-movflags', '+faststart')
      }
      args.push(out)
      return args
    },
  },

  {
    id: 'merge',
    group: '视频',
    name: '视频合并',
    desc: '按顺序拼接多个视频，参数一致时无损秒级完成',
    icon: 'merge',
    action: '开始合并',
    multiInput: true,
    defaults: {},
    fields: [],
    // 所有素材编码/分辨率一致 -> concat demuxer 无损; 否则统一重编码
    canCopy(sources) {
      const f = sources[0]
      return sources.every(
        (x) => x.codec === f.codec && x.audioCodec === f.audioCodec && x.width === f.width && x.height === f.height
      )
    },
    outputMulti(sources) {
      return this.canCopy(sources) ? { suffix: '_merged', ext: keepExt(sources[0]) } : { suffix: '_merged', ext: 'mp4' }
    },
    totalUsMulti(sources) {
      const total = sources.reduce((t, x) => t + x.duration, 0) * 1e6
      return this.canCopy(sources) ? 0 : total
    },
    validateMulti(sources) {
      if (sources.length < 2) return '至少需要两个视频才能合并'
    },
    async buildArgsMulti(sources, out) {
      if (this.canCopy(sources)) {
        const list = await writeConcatList(sources.map((x) => x.path))
        const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy']
        if (out.endsWith('.mp4')) args.push('-movflags', '+faststart')
        args.push(out)
        return args
      }
      // 重编码: 统一到首个视频的分辨率, 黑边补齐, 无音轨的补静音
      const { width: W, height: H } = sources[0]
      const inputs = sources.flatMap((x) => ['-i', x.path])
      let fc = ''
      sources.forEach((x, i) => {
        fc += `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];`
        fc += x.audioCodec
          ? `[${i}:a]aresample=48000[a${i}];`
          : `anullsrc=r=48000:cl=stereo,atrim=0:${x.duration.toFixed(3)}[a${i}];`
      })
      fc += sources.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${sources.length}:v=1:a=1[v][a]`
      return [
        '-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
      ]
    },
  },

  {
    id: 'trim',
    group: '视频',
    name: '视频剪辑',
    desc: '截取起止时间之间的片段，无损模式秒级完成',
    icon: 'trim',
    action: '开始剪辑',
    defaults: { start: '00:00:00', end: '00:00:10', mode: 'lossless' },
    fields: [
      { key: 'start', type: 'time', label: '开始时间', placeholder: '00:00:00' },
      { key: 'end', type: 'time', label: '结束时间', placeholder: '00:00:10' },
      {
        key: 'mode', type: 'segmented', label: '剪辑方式',
        options: [
          { value: 'lossless', label: '无损快剪' },
          { value: 'precise', label: '精准剪辑' },
        ],
        hint: (s) => (s.mode === 'lossless' ? '不重编码，切点对齐到关键帧，可能偏差 1-2 秒' : '重编码，切点精确到帧，耗时较长'),
      },
    ],
    output: () => ({ suffix: '_cut', ext: 'mp4' }),
    totalUs: (item, s) => Math.max(0, (Math.min(parseTime(s.end), item.duration) - parseTime(s.start)) * 1e6),
    validate(item, s) {
      const a = parseTime(s.start)
      const b = parseTime(s.end)
      if (isNaN(a) || isNaN(b)) return '时间格式应为 时:分:秒，如 00:01:30'
      if (b <= a) return '结束时间需要大于开始时间'
      if (a >= item.duration) return '开始时间超出了视频长度'
    },
    buildArgs(item, s, out) {
      const dur = String(parseTime(s.end) - parseTime(s.start))
      const args = ['-y', '-ss', s.start, '-i', item.path, '-t', dur]
      if (s.mode === 'lossless') args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero')
      else args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k')
      args.push('-movflags', '+faststart', out)
      return args
    },
  },

  {
    id: 'speed',
    group: '视频',
    name: '视频变速',
    desc: '加速或放慢整段视频，声音自动修正不变调',
    icon: 'speed',
    action: '开始变速',
    defaults: { rate: 2 },
    fields: [
      {
        key: 'rate', type: 'segmented', label: '倍速',
        options: [
          { value: 0.5, label: '0.5×' },
          { value: 0.75, label: '0.75×' },
          { value: 1.25, label: '1.25×' },
          { value: 1.5, label: '1.5×' },
          { value: 2, label: '2×' },
          { value: 3, label: '3×' },
        ],
        hint: (s) => (s.rate < 1 ? '放慢：时长变长，适合慢动作' : '加速：时长缩短，适合教程和记录'),
      },
    ],
    output: () => ({ suffix: '_speed', ext: 'mp4' }),
    totalUs: (item, s) => (item.duration / s.rate) * 1e6,
    buildArgs(item, s, out) {
      const r = s.rate
      if (item.audioCodec) {
        return [
          '-y', '-i', item.path,
          '-filter_complex', `[0:v]setpts=PTS/${r}[v];[0:a]atempo=${r}[a]`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
          '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
        ]
      }
      return ['-y', '-i', item.path, '-vf', `setpts=PTS/${r}`, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', out]
    },
  },

  {
    id: 'reverse',
    group: '视频',
    name: '视频倒放',
    desc: '时光倒流，整段画面从尾到头播放',
    icon: 'reverse',
    action: '开始倒放',
    defaults: { audio: 'reverse' },
    fields: [
      {
        key: 'audio', type: 'segmented', label: '声音',
        options: [
          { value: 'reverse', label: '同步倒放' },
          { value: 'mute', label: '静音' },
        ],
        hint: (s) => (s.audio === 'reverse' ? '声音也倒着放，效果魔性' : '只倒放画面'),
      },
    ],
    output: () => ({ suffix: '_rev', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    validate(item) {
      if (item.duration > 120) return '倒放要把整段视频装进内存，请先用「视频剪辑」截取到 2 分钟内'
    },
    buildArgs(item, s, out) {
      const audio = s.audio === 'reverse' && item.audioCodec ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '160k'] : ['-an']
      return ['-y', '-i', item.path, '-vf', 'reverse', ...audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', out]
    },
  },

  // ================= 画面 =================
  {
    id: 'rotate',
    group: '画面',
    name: '旋转翻转',
    desc: '手机拍竖了、镜像反了，一键转正',
    icon: 'rotate',
    action: '开始处理',
    defaults: { op: 'cw' },
    fields: [
      {
        key: 'op', type: 'segmented', label: '操作',
        options: [
          { value: 'cw', label: '↻ 90°' },
          { value: 'ccw', label: '↺ 90°' },
          { value: 'flip', label: '180°' },
          { value: 'hflip', label: '左右镜像' },
          { value: 'vflip', label: '上下镜像' },
        ],
        hint: () => '重编码保证所有播放器方向正确',
      },
    ],
    output: () => ({ suffix: '_rotate', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    buildArgs(item, s, out) {
      const vf = { cw: 'transpose=1', ccw: 'transpose=2', flip: 'transpose=1,transpose=1', hflip: 'hflip', vflip: 'vflip' }[s.op]
      return ['-y', '-i', item.path, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', ...audioArgs(item, 'mp4'), '-movflags', '+faststart', out]
    },
  },

  {
    id: 'crop',
    group: '画面',
    name: '画面裁剪',
    desc: '按目标比例居中裁剪画面，先预览再动手',
    icon: 'crop',
    action: '开始裁剪',
    defaults: { aspect: '9:16' },
    fields: [
      {
        key: 'aspect', type: 'segmented', label: '目标比例',
        options: [
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
          { value: '4:3', label: '4:3' },
          { value: '16:9', label: '16:9 横屏' },
        ],
        hint: () => '保留画面中心，裁掉两侧或上下',
      },
    ],
    output: () => ({ suffix: '_crop', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    _dims(item, s) {
      const [aw, ah] = s.aspect.split(':').map(Number)
      let cw = item.width
      let ch = Math.round((item.width * ah) / aw)
      if (ch > item.height) {
        ch = item.height
        cw = Math.round((item.height * aw) / ah)
      }
      return [cw - (cw % 2), ch - (ch % 2)]
    },
    validate(item, s) {
      const [cw, ch] = this._dims(item, s)
      if (cw === item.width && ch === item.height) return '视频已经是该比例，无需裁剪'
    },
    buildArgs(item, s, out) {
      const [cw, ch] = this._dims(item, s)
      return ['-y', '-i', item.path, '-vf', `crop=${cw}:${ch}`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...audioArgs(item, 'mp4'), '-movflags', '+faststart', out]
    },
    previewArgs(item, s, png) {
      const [cw, ch] = this._dims(item, s)
      return ['-y', '-ss', previewTs(item), '-i', item.path, '-vf', `crop=${cw}:${ch}`, '-frames:v', '1', png]
    },
  },

  {
    id: 'vertical',
    group: '画面',
    name: '横竖屏适配',
    desc: '横屏变竖屏、竖屏变横屏，模糊背景铺满不裁内容',
    icon: 'vertical',
    action: '开始转换',
    defaults: { target: '9:16', bg: 'blur' },
    fields: [
      {
        key: 'target', type: 'segmented', label: '目标画幅',
        options: [
          { value: '9:16', label: '9:16 竖屏' },
          { value: '1:1', label: '1:1 方形' },
          { value: '16:9', label: '16:9 横屏' },
        ],
        hint: (s) => ({ '9:16': '抖音、视频号、快手', '1:1': '朋友圈、小红书', '16:9': 'B站、YouTube' }[s.target]),
      },
      {
        key: 'bg', type: 'segmented', label: '背景填充',
        options: [
          { value: 'blur', label: '画面模糊' },
          { value: 'black', label: '黑边' },
        ],
        hint: (s) => (s.bg === 'blur' ? '用放大模糊的画面本身当背景' : '经典黑边'),
      },
    ],
    output: () => ({ suffix: '_fit', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    _dims(s) {
      return { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] }[s.target]
    },
    _filter(item, s) {
      const [W, H] = this._dims(s)
      if (s.bg === 'black') {
        return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
      }
      return `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:5[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
    },
    validate(item, s) {
      const [W, H] = this._dims(s)
      if (Math.abs(item.width / item.height - W / H) < 0.01) return '视频已经是该画幅比例'
    },
    buildArgs(item, s, out) {
      return ['-y', '-i', item.path, '-vf', this._filter(item, s), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...audioArgs(item, 'mp4'), '-movflags', '+faststart', out]
    },
    previewArgs(item, s, png) {
      return ['-y', '-ss', previewTs(item), '-i', item.path, '-vf', this._filter(item, s), '-frames:v', '1', png]
    },
  },

  {
    id: 'watermark',
    group: '画面',
    name: '加水印',
    desc: '给视频盖上 Logo 或图片水印，位置大小透明度随调',
    icon: 'watermark',
    action: '开始添加',
    defaults: { image: '', pos: 'br', wmWidth: 15, opacity: 80 },
    fields: [
      { key: 'image', type: 'file', label: '水印图片', pickTitle: '选择水印图片', filterName: '图片', exts: ['png', 'jpg', 'jpeg', 'webp'] },
      {
        key: 'pos', type: 'segmented', label: '位置',
        options: [
          { value: 'tl', label: '左上' },
          { value: 'tr', label: '右上' },
          { value: 'c', label: '中心' },
          { value: 'bl', label: '左下' },
          { value: 'br', label: '右下' },
        ],
      },
      {
        key: 'wmWidth', type: 'range', min: 5, max: 40,
        label: (s) => `大小 ${s.wmWidth}%`,
        hint: () => '相对画面宽度的占比',
      },
      {
        key: 'opacity', type: 'range', min: 10, max: 100,
        label: (s) => `不透明度 ${s.opacity}%`,
        hint: (s) => (s.opacity <= 50 ? '半透明，不抢画面' : '清晰醒目'),
      },
    ],
    output: () => ({ suffix: '_wm', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    validate(item, s) {
      if (!s.image) return '请先选择水印图片'
    },
    async _fc(item, s) {
      // 图片同样可能带中文名, 复制成安全路径 (滤镜之外的 -i 其实安全, 统一处理省心)
      const w = Math.round((item.width * s.wmWidth) / 100)
      const m = Math.max(16, Math.round(item.width * 0.02))
      const pos = {
        tl: `${m}:${m}`,
        tr: `main_w-overlay_w-${m}:${m}`,
        c: '(main_w-overlay_w)/2:(main_h-overlay_h)/2',
        bl: `${m}:main_h-overlay_h-${m}`,
        br: `main_w-overlay_w-${m}:main_h-overlay_h-${m}`,
      }[s.pos]
      return `[1]format=rgba,colorchannelmixer=aa=${s.opacity / 100},scale=${w}:-1[wm];[0:v][wm]overlay=${pos}[v]`
    },
    async buildArgs(item, s, out) {
      const fc = await this._fc(item, s)
      return [
        '-y', '-i', item.path, '-i', s.image,
        '-filter_complex', fc, '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy',
        '-movflags', '+faststart', out,
      ]
    },
    async previewArgs(item, s, png) {
      const fc = await this._fc(item, s)
      return ['-y', '-ss', previewTs(item), '-i', item.path, '-i', s.image, '-filter_complex', fc, '-map', '[v]', '-frames:v', '1', png]
    },
  },

  // ================= 字幕 =================
  {
    id: 'subtitle',
    group: '字幕',
    name: '烧录字幕',
    desc: '把 SRT / ASS 字幕永久压进画面，任何播放器都能看',
    icon: 'subtitle',
    action: '开始烧录',
    defaults: { sub: '', fontsize: 24 },
    fields: [
      { key: 'sub', type: 'file', label: '字幕文件', pickTitle: '选择字幕', filterName: '字幕文件', exts: ['srt', 'ass', 'ssa', 'vtt'] },
      {
        key: 'fontsize', type: 'segmented', label: '字号',
        options: [
          { value: 18, label: '小' },
          { value: 24, label: '中' },
          { value: 30, label: '大' },
        ],
        hint: (s) => (extOf(s.sub || '') === 'ass' || extOf(s.sub || '') === 'ssa' ? 'ASS 字幕自带样式，忽略此设置' : '白字黑边，底部居中'),
      },
    ],
    output: () => ({ suffix: '_sub', ext: 'mp4' }),
    totalUs: (item) => item.duration * 1e6,
    validate(item, s) {
      if (!s.sub) return '请先选择字幕文件'
    },
    async buildArgs(item, s, out) {
      const vf = await subtitleVf(s.sub, s.fontsize)
      return ['-y', '-i', item.path, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...audioArgs(item, 'mp4'), '-movflags', '+faststart', out]
    },
    async previewArgs(item, s, png) {
      const vf = await subtitleVf(s.sub, s.fontsize)
      // 字幕依赖时间轴, 用输出侧 seek 保证预览帧对应正确的字幕条
      return ['-y', '-i', item.path, '-vf', vf, '-ss', String(Math.min(2, item.duration / 2)), '-frames:v', '1', png]
    },
  },

  {
    id: 'asr',
    group: '字幕',
    name: '自动字幕',
    desc: '本地 AI 识别人声生成字幕，不联网不上传，支持中英粤日韩',
    icon: 'asr',
    action: '开始识别',
    defaults: { lang: 'auto', mode: 'srt' },
    fields: [
      {
        key: 'lang', type: 'segmented', label: '语言',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'zh', label: '中文' },
          { value: 'en', label: 'English' },
          { value: 'yue', label: '粤语' },
        ],
        hint: () => '首次使用需下载语音模型（约 230MB），之后完全离线',
      },
      {
        key: 'mode', type: 'segmented', label: '输出',
        options: [
          { value: 'srt', label: '生成 SRT 文件' },
          { value: 'burn', label: '识别并烧录' },
        ],
        hint: (s) => (s.mode === 'srt' ? '字幕文件存在视频旁边，可先校对再烧录' : '识别后直接把字幕压进画面'),
      },
    ],
    validate(item) {
      if (!item.audioCodec) return '该视频没有音轨'
    },
    async run(item, s, ctx) {
      // 1. 模型就位 (按需下载, 支持断点续传与镜像回退)
      const dir = await asrDir()
      const sep = navigator.platform.includes('Win') ? '\\' : '/'
      const totalBytes = ASR_FILES.reduce((t, f) => t + f.size, 0)
      let doneBytes = 0
      for (const f of ASR_FILES) {
        const dest = dir + sep + f.name
        if ((await fileSize(dest)) !== f.size) {
          ctx.setStage('首次使用：下载语音模型（共约 230MB，支持断点续传）')
          const ok = await downloadFile(f.urls, dest, f.size, (pct) => {
            ctx.onProgress(((doneBytes + (f.size * pct) / 100) / totalBytes) * 30)
          }, ctx.setChild)
          if (ctx.cancelled()) return null
          if (!ok) throw new Error('模型下载失败，请检查网络后点击重试（已下载部分会续传）')
        }
        doneBytes += f.size
      }

      // 2. 提取 16k 单声道音频
      ctx.setStage('提取音频')
      const wav = await tempPath(`lightvideo-asr-${item.uid}.wav`)
      {
        const { child, done } = await runFFmpeg(
          ['-y', '-i', item.path, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
          item.duration * 1e6,
          (p) => ctx.onProgress(30 + Math.max(0, p.percent) * 0.05)
        )
        ctx.setChild(child)
        const r = await done
        ctx.setChild(null)
        if (ctx.cancelled()) return null
        if (!r.ok) throw new Error(r.message)
      }

      // 3. 本地识别
      ctx.setStage('AI 识别中')
      const asrEnd = s.mode === 'burn' ? 60 : 95
      const { child, done } = await runAsr(
        [
          `--silero-vad-model=${dir}${sep}silero_vad.onnx`,
          `--sense-voice-model=${dir}${sep}model.int8.onnx`,
          `--tokens=${dir}${sep}tokens.txt`,
          '--sense-voice-use-itn=1',
          '--silero-vad-max-speech-duration=8',
          `--sense-voice-language=${s.lang}`,
          '--num-threads=4',
          wav,
        ],
        (seg) => ctx.onProgress(35 + Math.min(1, seg.end / item.duration) * (asrEnd - 35))
      )
      ctx.setChild(child)
      const r = await done
      ctx.setChild(null)
      removeFile(wav)
      if (ctx.cancelled()) return null
      if (r.segs.length === 0) {
        throw new Error(r.ok ? '没有识别到人声' : '识别失败：' + r.message)
      }

      // 4. 生成 SRT
      const srtPath = await ctx.outPath('', 'srt')
      await writeTextFile(srtPath, toSrt(r.segs))
      if (s.mode === 'srt') {
        return { output: srtPath, outSize: await fileSize(srtPath) }
      }

      // 5. 烧录进视频
      ctx.setStage('烧录字幕')
      const vf = await subtitleVf(srtPath, 24)
      const out = await ctx.outPath('_sub', 'mp4')
      const { child: c2, done: d2 } = await runFFmpeg(
        ['-y', '-i', item.path, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...audioArgs(item, 'mp4'), '-movflags', '+faststart', out],
        item.duration * 1e6,
        (p) => ctx.onProgress(60 + Math.max(0, p.percent) * 0.4)
      )
      ctx.setChild(c2)
      const r2 = await d2
      ctx.setChild(null)
      if (ctx.cancelled()) return null
      if (!r2.ok) throw new Error(r2.message)
      return { output: out, outSize: r2.outSize }
    },
  },

  // ================= 音频 =================
  {
    id: 'audio',
    group: '音频',
    name: '提取音频',
    desc: '把视频里的声音抽出来，存为常用音频格式',
    icon: 'audio',
    action: '提取音频',
    defaults: { format: 'mp3' },
    fields: [
      {
        key: 'format', type: 'segmented', label: '音频格式',
        options: [
          { value: 'mp3', label: 'MP3' },
          { value: 'm4a', label: 'M4A' },
          { value: 'wav', label: 'WAV' },
          { value: 'flac', label: 'FLAC' },
        ],
        hint: (s) => ({ mp3: '最通用，高品质 VBR', m4a: 'AAC 编码，体积更小', wav: '无压缩原始波形', flac: '无损压缩' }[s.format]),
      },
    ],
    output: (item, s) => ({ suffix: '', ext: s.format }),
    totalUs: (item) => item.duration * 1e6,
    validate(item) {
      if (!item.audioCodec) return '该视频没有音轨'
    },
    buildArgs(item, s, out) {
      const codec = {
        mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
        m4a: ['-c:a', 'aac', '-b:a', '192k'],
        wav: ['-c:a', 'pcm_s16le'],
        flac: ['-c:a', 'flac'],
      }[s.format]
      return ['-y', '-i', item.path, '-vn', ...codec, out]
    },
  },

  {
    id: 'volume',
    group: '音频',
    name: '音量调整',
    desc: '调大调小视频音量，或彻底去掉声音',
    icon: 'volume',
    action: '开始处理',
    defaults: { mode: 'adjust', percent: 150 },
    fields: [
      {
        key: 'mode', type: 'segmented', label: '操作',
        options: [
          { value: 'adjust', label: '调整音量' },
          { value: 'mute', label: '移除音轨' },
        ],
        hint: (s) => (s.mode === 'adjust' ? '画面不重编码，速度很快' : '得到完全无声的视频'),
      },
      {
        key: 'percent', type: 'range', min: 10, max: 300,
        label: (s) => `音量 ${s.percent}%`,
        hint: (s) => (s.percent > 200 ? '大幅增益可能出现破音' : '100% 为原始音量'),
        showIf: (s) => s.mode === 'adjust',
      },
    ],
    output: (item, s) => ({ suffix: s.mode === 'mute' ? '_mute' : '_vol', ext: keepExt(item) }),
    totalUs: (item) => item.duration * 1e6,
    validate(item, s) {
      if (s.mode === 'adjust' && !item.audioCodec) return '该视频没有音轨'
    },
    buildArgs(item, s, out) {
      if (s.mode === 'mute') return ['-y', '-i', item.path, '-c:v', 'copy', '-an', out]
      return ['-y', '-i', item.path, '-c:v', 'copy', '-af', `volume=${s.percent / 100}`, ...audioArgs(item, keepExt(item), true), out]
    },
  },

  {
    id: 'bgm',
    group: '音频',
    name: '配背景音乐',
    desc: '给视频铺一条音乐，可混入原声，音乐不够长自动循环',
    icon: 'bgm',
    action: '开始合成',
    defaults: { music: '', musicVolume: 80, mode: 'mix', fade: 'on' },
    fields: [
      { key: 'music', type: 'file', label: '音乐文件', pickTitle: '选择音乐', filterName: '音频文件', exts: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg'] },
      {
        key: 'musicVolume', type: 'range', min: 10, max: 200,
        label: (s) => `音乐音量 ${s.musicVolume}%`,
        hint: (s) => (s.mode === 'mix' ? '相对原声的音量，铺底建议 40%-80%' : '音乐的播放音量'),
      },
      {
        key: 'mode', type: 'segmented', label: '原声',
        options: [
          { value: 'mix', label: '保留混合' },
          { value: 'replace', label: '替换掉' },
        ],
        hint: (s) => (s.mode === 'mix' ? '音乐和原声叠在一起' : '只保留音乐'),
      },
      {
        key: 'fade', type: 'segmented', label: '结尾',
        options: [
          { value: 'on', label: '淡出' },
          { value: 'off', label: '不淡出' },
        ],
        hint: (s) => (s.fade === 'on' ? '最后 3 秒音乐渐弱，收尾自然' : '音乐戛然而止'),
      },
    ],
    output: (item) => ({ suffix: '_bgm', ext: keepExt(item) }),
    totalUs: (item) => item.duration * 1e6,
    validate(item, s) {
      if (!s.music) return '请先选择音乐文件'
    },
    buildArgs(item, s, out) {
      const vol = s.musicVolume / 100
      const d = item.duration
      const fade = s.fade === 'on' && d > 4 ? `,afade=t=out:st=${(d - 3).toFixed(2)}:d=3` : ''
      const ext = keepExt(item)
      const aenc = ext === 'webm' ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '160k']
      const base = ['-y', '-i', item.path, '-stream_loop', '-1', '-i', s.music]
      if (s.mode === 'mix' && item.audioCodec) {
        return [
          ...base,
          '-filter_complex', `[1:a]volume=${vol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0${fade}[a]`,
          '-map', '0:v', '-map', '[a]', '-c:v', 'copy', ...aenc, '-shortest', out,
        ]
      }
      return [
        ...base,
        '-filter_complex', `[1:a]volume=${vol}${fade}[a]`,
        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', ...aenc, '-shortest', out,
      ]
    },
  },

  // ================= 图像 =================
  {
    id: 'gif',
    group: '图像',
    name: '视频转 GIF',
    desc: '调色板两阶段算法，生成颜色准确的高质量 GIF',
    icon: 'gif',
    action: '生成 GIF',
    defaults: { fps: 12, width: 480 },
    fields: [
      {
        key: 'fps', type: 'range', min: 5, max: 30,
        label: (s) => `帧率 ${s.fps} fps`,
        hint: (s) => (s.fps <= 10 ? '文件小，动作略跳' : s.fps <= 15 ? '推荐：流畅且体积可控' : '很流畅，文件很大'),
      },
      {
        key: 'width', type: 'segmented', label: '宽度',
        options: [
          { value: 320, label: '320px' },
          { value: 480, label: '480px' },
          { value: 640, label: '640px' },
        ],
        hint: () => 'GIF 体积随宽度平方增长，聊天场景 480px 足够',
      },
    ],
    output: () => ({ suffix: '', ext: 'gif' }),
    totalUs: (item) => item.duration * 1e6,
    validate(item) {
      if (item.duration > 60) return '视频超过 1 分钟，GIF 会非常大，建议先用「视频剪辑」截取片段'
    },
    buildArgs(item, s, out) {
      return ['-y', '-i', item.path, '-vf', GIF_FILTER(s.fps, s.width), out]
    },
  },

  {
    id: 'frame',
    group: '图像',
    name: '视频截图',
    desc: '抽取指定时间点的一帧画面，保存为图片',
    icon: 'frame',
    action: '截取画面',
    defaults: { time: '00:00:01', format: 'png' },
    fields: [
      { key: 'time', type: 'time', label: '时间点', placeholder: '00:00:01' },
      {
        key: 'format', type: 'segmented', label: '图片格式',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpg', label: 'JPG' },
        ],
        hint: (s) => (s.format === 'png' ? '无损，文件较大' : '有损，文件小'),
      },
    ],
    output: (item, s) => ({ suffix: '_shot', ext: s.format }),
    totalUs: () => 0,
    validate(item, s) {
      const t = parseTime(s.time)
      if (isNaN(t)) return '时间格式应为 时:分:秒，如 00:01:30'
      if (t >= item.duration) return '时间点超出了视频长度'
    },
    buildArgs(item, s, out) {
      const args = ['-y', '-ss', s.time, '-i', item.path, '-frames:v', '1']
      if (s.format === 'jpg') args.push('-q:v', '2')
      args.push(out)
      return args
    },
  },
]

export const TOOL_GROUPS = ['视频', '画面', '音频', '字幕', '图像'].map((g) => ({
  name: g,
  tools: TOOLS.filter((t) => t.group === g),
}))
