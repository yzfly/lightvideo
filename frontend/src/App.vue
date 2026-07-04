<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { checkFFmpeg, pickVideos, probe, compress, revealFile, isVideo } from './backend.js'

// ---------- 压缩设置 (默认值即那条经典指令) ----------
const settings = reactive({
  crf: 23,
  preset: 'medium',
  maxHeight: 0,
  audioMode: 'aac',
})

const presets = [
  { value: 'fast', label: '快速', hint: '速度快，文件稍大' },
  { value: 'medium', label: '均衡', hint: '推荐，质量与速度兼顾' },
  { value: 'slow', label: '极致', hint: '更慢，压得更小' },
]

const resolutions = [
  { value: 0, label: '原始' },
  { value: 1080, label: '1080P' },
  { value: 720, label: '720P' },
]

const crfHint = computed(() => {
  if (settings.crf <= 20) return '画质优先，压缩率较低'
  if (settings.crf <= 24) return '推荐：肉眼无损，大幅瘦身'
  return '体积优先，画质轻微下降'
})

// ---------- 文件队列 ----------
const items = ref([])
const ffmpeg = ref(null)
const dragging = ref(false)
let uid = 0
let queueRunning = false
let unlistenDrop = null

const readyItems = computed(() => items.value.filter((i) => i.status === 'ready'))
const activeCount = computed(() => items.value.filter((i) => ['queued', 'running'].includes(i.status)).length)
const doneItems = computed(() => items.value.filter((i) => i.status === 'done'))
const totalSaved = computed(() => doneItems.value.reduce((s, i) => s + (i.inSize - i.outSize), 0))

async function addPaths(paths) {
  for (const path of paths) {
    if (!isVideo(path)) continue
    if (items.value.some((i) => i.path === path && ['ready', 'queued', 'running'].includes(i.status))) continue
    const info = await probe(path)
    items.value.push({
      uid: ++uid,
      ...info,
      status: info.error ? 'error' : 'ready',
      message: info.error || '',
      percent: 0,
      speed: '',
      eta: -1,
      inSize: info.size,
      outSize: 0,
      output: '',
      seconds: 0,
      child: null,
    })
  }
}

async function pickFiles() {
  await addPaths(await pickVideos())
}

function startAll() {
  for (const item of readyItems.value) item.status = 'queued'
  runQueue()
}

// 串行队列: x264 编码本身吃满全核，并行只会互相拖慢
async function runQueue() {
  if (queueRunning) return
  queueRunning = true
  try {
    while (true) {
      const item = items.value.find((i) => i.status === 'queued')
      if (!item) break
      await runOne(item)
    }
  } finally {
    queueRunning = false
  }
}

async function runOne(item) {
  item.status = 'running'
  item.percent = 0
  try {
    const { child, done } = await compress(item, { ...settings }, (p) => {
      item.percent = p.percent
      item.speed = p.speed
      item.eta = p.eta
      item.outSize = p.outSize
    })
    item.child = child
    const result = await done
    item.child = null
    if (item.status === 'cancelled') return
    if (result.ok) {
      item.status = 'done'
      item.percent = 100
      item.output = result.output
      item.outSize = result.outSize
      item.seconds = result.seconds
    } else {
      item.status = 'error'
      item.message = result.message
    }
  } catch (e) {
    item.child = null
    if (item.status !== 'cancelled') {
      item.status = 'error'
      item.message = String(e)
    }
  }
}

function cancel(item) {
  item.status = 'cancelled'
  if (item.child) item.child.kill()
}

function remove(item) {
  items.value = items.value.filter((i) => i.uid !== item.uid)
}

function clearFinished() {
  items.value = items.value.filter((i) => !['done', 'error', 'cancelled'].includes(i.status))
}

function reveal(path) {
  revealFile(path)
}

onMounted(async () => {
  ffmpeg.value = await checkFFmpeg()

  unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
    const type = event.payload.type
    if (type === 'drop') {
      dragging.value = false
      addPaths(event.payload.paths)
    } else if (type === 'leave') {
      dragging.value = false
    } else {
      dragging.value = true
    }
  })
})

onBeforeUnmount(() => {
  if (unlistenDrop) unlistenDrop()
})

// ---------- 格式化 ----------
function fmtSize(bytes) {
  if (!bytes) return '-'
  if (bytes >= 1 << 30) return (bytes / (1 << 30)).toFixed(2) + ' GB'
  if (bytes >= 1 << 20) return (bytes / (1 << 20)).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

function fmtDuration(sec) {
  if (!sec) return '-'
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function fmtEta(sec) {
  if (sec < 0) return ''
  if (sec < 60) return `剩余 ${sec} 秒`
  return `剩余 ${Math.ceil(sec / 60)} 分钟`
}

function savedPct(item) {
  if (!item.inSize || !item.outSize) return 0
  return Math.round((1 - item.outSize / item.inSize) * 100)
}
</script>

<template>
  <div class="page" :class="{ dragging }">
    <!-- 顶栏 -->
    <header class="topbar">
      <div class="brand">
        <div class="logo">瘦</div>
        <div>
          <div class="title">视频瘦身 <span class="en">SlimVideo</span></div>
          <div class="subtitle">无损画质 · 极限压缩</div>
        </div>
      </div>
    </header>

    <main class="main">
      <div v-if="ffmpeg && !ffmpeg.found" class="alert">
        内置 FFmpeg 启动失败，请重新安装应用。{{ ffmpeg.error }}
      </div>

      <!-- 参数面板 -->
      <section class="card settings">
        <div class="setting">
          <div class="setting-label">
            画质 <b>CRF {{ settings.crf }}</b>
          </div>
          <input type="range" min="18" max="28" v-model.number="settings.crf" :disabled="activeCount > 0" />
          <div class="setting-hint">{{ crfHint }}</div>
        </div>

        <div class="setting">
          <div class="setting-label">编码速度</div>
          <div class="segmented">
            <button
              v-for="p in presets"
              :key="p.value"
              :class="{ active: settings.preset === p.value }"
              :disabled="activeCount > 0"
              @click="settings.preset = p.value"
            >
              {{ p.label }}
            </button>
          </div>
          <div class="setting-hint">{{ presets.find((p) => p.value === settings.preset).hint }}</div>
        </div>

        <div class="setting">
          <div class="setting-label">分辨率</div>
          <div class="segmented">
            <button
              v-for="r in resolutions"
              :key="r.value"
              :class="{ active: settings.maxHeight === r.value }"
              :disabled="activeCount > 0"
              @click="settings.maxHeight = r.value"
            >
              {{ r.label }}
            </button>
          </div>
          <div class="setting-hint">{{ settings.maxHeight ? '超过该分辨率时缩小' : '保持原分辨率' }}</div>
        </div>

        <div class="setting">
          <div class="setting-label">音频</div>
          <div class="segmented">
            <button :class="{ active: settings.audioMode === 'aac' }" :disabled="activeCount > 0" @click="settings.audioMode = 'aac'">压缩</button>
            <button :class="{ active: settings.audioMode === 'copy' }" :disabled="activeCount > 0" @click="settings.audioMode = 'copy'">原样保留</button>
          </div>
          <div class="setting-hint">{{ settings.audioMode === 'aac' ? 'AAC 128k，通用兼容' : '不重编码音轨' }}</div>
        </div>
      </section>

      <!-- 拖放区 -->
      <section v-if="items.length === 0" class="dropzone" @click="pickFiles">
        <div class="dropzone-icon">🎬</div>
        <div class="dropzone-title">拖入视频文件，或点击选择</div>
        <div class="dropzone-hint">支持 MP4 / MOV / MKV / AVI / FLV / WebM 等格式，压缩后不覆盖原文件</div>
      </section>

      <!-- 队列 -->
      <section v-else class="queue">
        <div class="queue-head">
          <div class="queue-title">
            文件队列 <span class="count">{{ items.length }}</span>
            <span v-if="totalSaved > 0" class="saved-total">已节省 {{ fmtSize(totalSaved) }}</span>
          </div>
          <div class="queue-actions">
            <button class="btn ghost" @click="clearFinished" v-if="doneItems.length">清除已完成</button>
            <button class="btn ghost" @click="pickFiles">+ 添加视频</button>
            <button class="btn primary" :disabled="readyItems.length === 0 || !ffmpeg?.found" @click="startAll">
              开始压缩{{ readyItems.length > 1 ? ` (${readyItems.length})` : '' }}
            </button>
          </div>
        </div>

        <div class="item card" v-for="item in items" :key="item.uid">
          <div class="item-main">
            <div class="item-name" :title="item.path">{{ item.name }}</div>
            <div class="item-meta">
              <template v-if="!item.error">
                {{ item.width }}×{{ item.height }} · {{ item.codec }} · {{ fmtDuration(item.duration) }} · {{ fmtSize(item.size) }}
              </template>
            </div>

            <!-- 进行中 -->
            <div v-if="item.status === 'running'" class="progress-row">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: item.percent + '%' }"></div>
              </div>
              <span class="progress-text">{{ item.percent.toFixed(0) }}% · {{ item.speed }} {{ fmtEta(item.eta) }}</span>
            </div>

            <!-- 完成 -->
            <div v-else-if="item.status === 'done'" class="result">
              <span class="size-before">{{ fmtSize(item.inSize) }}</span>
              <span class="arrow">→</span>
              <span class="size-after">{{ fmtSize(item.outSize) }}</span>
              <span class="badge success" v-if="savedPct(item) > 0">瘦身 {{ savedPct(item) }}%</span>
              <span class="badge warn" v-else>未变小，原文件已高度压缩</span>
            </div>

            <!-- 错误 -->
            <div v-else-if="item.status === 'error'" class="result">
              <span class="badge danger" :title="item.message">失败：{{ item.message }}</span>
            </div>

            <div v-else-if="item.status === 'cancelled'" class="result">
              <span class="badge gray">已取消</span>
            </div>

            <div v-else-if="item.status === 'queued'" class="result">
              <span class="badge gray">排队中…</span>
            </div>
          </div>

          <div class="item-actions">
            <button v-if="['queued', 'running'].includes(item.status)" class="btn ghost small" @click="cancel(item)">取消</button>
            <button v-if="item.status === 'done'" class="btn ghost small" @click="reveal(item.output)">显示文件</button>
            <button v-if="!['queued', 'running'].includes(item.status)" class="btn ghost small" @click="remove(item)">移除</button>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">作者：云中江树 · 微信公众号「云中江树」 · 基于 FFmpeg，开源免费</footer>

    <!-- 拖拽遮罩 -->
    <div v-if="dragging" class="drag-overlay">
      <div class="drag-overlay-text">松手，把视频交给我</div>
    </div>
  </div>
</template>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶栏 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1664ff, #00c8ff);
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(22, 100, 255, 0.3);
}
.title {
  font-size: 17px;
  font-weight: 600;
}
.title .en {
  font-size: 13px;
  color: var(--text-3);
  font-weight: 400;
  margin-left: 4px;
}
.subtitle {
  font-size: 12px;
  color: var(--text-3);
}
/* 主区域 */
.main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.alert {
  background: var(--danger-light);
  color: var(--danger);
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 13px;
}

.card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* 参数面板 */
.settings {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding: 18px 20px 14px;
  flex-shrink: 0;
}
.setting-label {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 8px;
}
.setting-label b {
  color: var(--primary);
}
.setting-hint {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 6px;
}
.setting input[type='range'] {
  width: 100%;
  accent-color: var(--primary);
}

.segmented {
  display: flex;
  background: var(--fill-2);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}
.segmented button {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  border-radius: 6px;
  color: var(--text-2);
  transition: all 0.15s;
  white-space: nowrap;
}
.segmented button.active {
  background: #fff;
  color: var(--primary);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.segmented button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 拖放区 */
.dropzone {
  flex: 1;
  border: 2px dashed var(--border);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 220px;
}
.dropzone:hover,
.page.dragging .dropzone {
  border-color: var(--primary);
  background: var(--primary-light);
}
.dropzone-icon {
  font-size: 44px;
}
.dropzone-title {
  font-size: 16px;
  font-weight: 600;
}
.dropzone-hint {
  font-size: 12px;
  color: var(--text-3);
}

/* 队列 */
.queue {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.queue-title {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  font-size: 12px;
  color: var(--text-3);
  background: var(--fill-2);
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 400;
}
.saved-total {
  font-size: 12px;
  color: var(--success);
  background: var(--success-light);
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.queue-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.15s;
}
.btn.primary {
  background: var(--primary);
  color: #fff;
  font-weight: 500;
  box-shadow: 0 2px 6px rgba(22, 100, 255, 0.3);
}
.btn.primary:hover:not(:disabled) {
  background: var(--primary-hover);
}
.btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}
.btn.ghost {
  color: var(--text-2);
  border: 1px solid var(--border);
  background: #fff;
}
.btn.ghost:hover {
  color: var(--primary);
  border-color: var(--primary);
}
.btn.small {
  padding: 4px 12px;
  font-size: 12px;
}

.item {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  gap: 16px;
}
.item-main {
  flex: 1;
  min-width: 0;
}
.item-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-meta {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--fill-2);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1664ff, #00c8ff);
  border-radius: 999px;
  transition: width 0.3s;
}
.progress-text {
  font-size: 12px;
  color: var(--text-2);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
}
.size-before {
  color: var(--text-3);
  text-decoration: line-through;
}
.arrow {
  color: var(--text-3);
}
.size-after {
  font-weight: 600;
}
.badge {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 4px;
}
.badge.success {
  color: var(--success);
  background: var(--success-light);
  font-weight: 500;
}
.badge.warn {
  color: var(--warning);
  background: #fff3e8;
}
.badge.danger {
  color: var(--danger);
  background: var(--danger-light);
  max-width: 480px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge.gray {
  color: var(--text-3);
  background: var(--fill-2);
}

/* 底栏 */
.footer {
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
  padding: 10px;
  border-top: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0;
}

/* 拖拽遮罩 */
.drag-overlay {
  position: fixed;
  inset: 0;
  background: rgba(22, 100, 255, 0.08);
  border: 3px dashed var(--primary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}
.drag-overlay-text {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary);
  background: #fff;
  padding: 14px 32px;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(22, 100, 255, 0.25);
}
</style>
