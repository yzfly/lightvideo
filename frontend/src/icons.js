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
  // 添加
  plus: wrap('<line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  // 品牌: 羽翼播放
  brand:
    '<svg viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10.5" fill="url(#lv-g)"/><path d="M15.2 12.1c0-1.24 1.36-2 2.42-1.35l11.2 6.9a1.58 1.58 0 0 1 0 2.7l-11.2 6.9c-1.06.65-2.42-.11-2.42-1.35V12.1z" fill="#fff"/><path d="M9 14.5h4.4M9 20h3.2M9 25.5h4.4" stroke="#fff" stroke-opacity=".85" stroke-width="2.2" stroke-linecap="round"/><defs><linearGradient id="lv-g" x1="4" y1="3" x2="36" y2="38" gradientUnits="userSpaceOnUse"><stop stop-color="#3D7FFF"/><stop offset="1" stop-color="#0E4FD1"/></linearGradient></defs></svg>',
}
