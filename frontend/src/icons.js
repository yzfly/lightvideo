// 内联 SVG 图标集: 统一 24 viewBox / 1.8 描边 / 圆角端点
const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export const ICONS = {
  // 压缩: 向内收拢的箭头
  compress: wrap(
    '<polyline points="4.5 9.5 9.5 9.5 9.5 4.5"/><polyline points="19.5 14.5 14.5 14.5 14.5 19.5"/><line x1="9.5" y1="9.5" x2="4" y2="4"/><line x1="14.5" y1="14.5" x2="20" y2="20"/>'
  ),
  // 转换: 双向循环箭头
  convert: wrap(
    '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.2"/><polyline points="18 3.2 18 7.2 14 7.2"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.2"/><polyline points="6 20.8 6 16.8 10 16.8"/>'
  ),
  // 音频: 双音符
  audio: wrap(
    '<circle cx="7" cy="17.5" r="2.6"/><circle cx="17" cy="15.5" r="2.6"/><path d="M9.6 17.5V6.5l10-2v11"/>'
  ),
  // 剪辑: 剪刀
  trim: wrap(
    '<circle cx="6" cy="6.5" r="2.4"/><circle cx="6" cy="17.5" r="2.4"/><line x1="8" y1="8" x2="19.5" y2="19"/><line x1="8" y1="16" x2="19.5" y2="5"/><line x1="13.2" y1="13" x2="13.2" y2="11"/>'
  ),
  // GIF: 画框 + 帧点
  gif: wrap(
    '<rect x="3" y="4.5" width="18" height="15" rx="3.2"/><path d="M9.8 9.2l4.8 2.8-4.8 2.8z" fill="currentColor" stroke="none"/><line x1="7" y1="19.5" x2="7" y2="19.5"/><line x1="12" y1="19.5" x2="12" y2="19.5"/><line x1="17" y1="19.5" x2="17" y2="19.5"/>'
  ),
  // 截图: 相机
  frame: wrap(
    '<path d="M4.2 7.8h2.9l1.9-2.4h6l1.9 2.4h2.9c.8 0 1.5.7 1.5 1.5v8.4c0 .8-.7 1.5-1.5 1.5H4.2c-.8 0-1.5-.7-1.5-1.5V9.3c0-.8.7-1.5 1.5-1.5z"/><circle cx="12" cy="13.2" r="3.4"/>'
  ),
  // 合并: 两路汇入一路
  merge: wrap(
    '<path d="M4 6.5h3.6l4.4 5.5h8"/><path d="M4 17.5h3.6L12 12"/><polyline points="16.8 8.8 20 12 16.8 15.2"/>'
  ),
  // 变速: 仪表盘
  speed: wrap(
    '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><line x1="12" y1="14" x2="15.8" y2="9.2"/><circle cx="12" cy="14.8" r="1.3" fill="currentColor" stroke="none"/>'
  ),
  // 旋转: 循环箭头
  rotate: wrap(
    '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><polyline points="17.3 2.8 17.3 6.8 13.3 6.8"/>'
  ),
  // 音量: 喇叭
  volume: wrap(
    '<path d="M4.5 9.5v5h3.2L12 17.8V6.2L7.7 9.5H4.5z"/><path d="M15.3 9.3a4 4 0 0 1 0 5.4"/><path d="M17.8 7a7.3 7.3 0 0 1 0 10"/>'
  ),
  // 背景音乐: 音符 + 加号
  bgm: wrap(
    '<path d="M10 17V5.8l6.5 1.6"/><circle cx="7.4" cy="17" r="2.6"/><line x1="18" y1="12.5" x2="18" y2="18.5"/><line x1="15" y1="15.5" x2="21" y2="15.5"/>'
  ),
  // 指定大小: 同心圆靶
  targetsize: wrap(
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'
  ),
  // 倒放: 双回退箭头
  reverse: wrap(
    '<polyline points="11.5 17 6.5 12 11.5 7"/><polyline points="18.5 17 13.5 12 18.5 7"/>'
  ),
  // 裁剪: 经典裁切框
  crop: wrap(
    '<path d="M7 3.5v11.5a2 2 0 0 0 2 2h11.5"/><path d="M17 20.5V9a2 2 0 0 0-2-2H3.5"/>'
  ),
  // 横竖屏: 两种画幅
  vertical: wrap(
    '<rect x="3.5" y="8" width="9.5" height="8.5" rx="1.6"/><rect x="15.5" y="4.5" width="5" height="15" rx="1.6"/>'
  ),
  // 水印: 画框角落的水滴
  watermark: wrap(
    '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M15.9 13.8a2.9 2.9 0 1 1-5.8 0c0-2 2.9-4.6 2.9-4.6s2.9 2.6 2.9 4.6z"/>'
  ),
  // 字幕: 画框内文字行
  subtitle: wrap(
    '<rect x="3" y="4.5" width="18" height="15" rx="3"/><line x1="6.5" y1="13.5" x2="11" y2="13.5"/><line x1="13.5" y1="13.5" x2="17.5" y2="13.5"/><line x1="6.5" y1="16.3" x2="9" y2="16.3"/><line x1="11.5" y1="16.3" x2="17.5" y2="16.3"/>'
  ),
  // 自动字幕: 麦克风
  asr: wrap(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="18" x2="12" y2="21"/>'
  ),
  // 添加
  plus: wrap('<line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  // 品牌: 羽翼播放
  brand:
    '<svg viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10.5" fill="url(#lv-g)"/><path d="M15.2 12.1c0-1.24 1.36-2 2.42-1.35l11.2 6.9a1.58 1.58 0 0 1 0 2.7l-11.2 6.9c-1.06.65-2.42-.11-2.42-1.35V12.1z" fill="#fff"/><path d="M9 14.5h4.4M9 20h3.2M9 25.5h4.4" stroke="#fff" stroke-opacity=".85" stroke-width="2.2" stroke-linecap="round"/><defs><linearGradient id="lv-g" x1="4" y1="3" x2="36" y2="38" gradientUnits="userSpaceOnUse"><stop stop-color="#3D7FFF"/><stop offset="1" stop-color="#0E4FD1"/></linearGradient></defs></svg>',
}
