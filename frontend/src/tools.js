// 工具模块注册表: 每个工具声明自己的参数、输出命名与 ffmpeg 参数构建
// 界面按 fields 声明自动渲染，新增工具只需在此登记

// "HH:MM:SS.x" / "MM:SS" / "SS" -> 秒
export function parseTime(str) {
  if (!str) return 0
  const parts = String(str).trim().split(':').map(Number)
  if (parts.some(isNaN)) return NaN
  return parts.reduce((acc, v) => acc * 60 + v, 0)
}

const GIF_FILTER = (fps, width) =>
  `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`

export const TOOLS = [
  {
    id: 'compress',
    name: '视频压缩',
    desc: '肉眼无损的画质下大幅缩小文件体积，通用 H.264 编码',
    icon: 'compress',
    action: '开始压缩',
    compare: true, // 展示 前→后 体积对比
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
    id: 'convert',
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
        // mp4/mov 容器不认多数字幕轨，只保留音视频；mkv 全量保留
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
    id: 'audio',
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
    id: 'trim',
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
    id: 'gif',
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
    totalUs: () => 0, // 瞬时完成，不显示进度
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
