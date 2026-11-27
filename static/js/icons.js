/* ===========================================================================
 * 菜单图标（内联 SVG）
 * 用法：PM.icon('home', { size: 22 })
 * 设计约束（与柔光主题对齐）：
 *   - 24×24 画布，1.7 描边，圆头圆角，视觉重量统一
 *   - 全部 currentColor，跟随菜单文字色（未选中 ink-2 / 选中 ink）
 *   - 不用 emoji：跨平台渲染不一致，且没法调色、没法对齐基线
 * 加新图标只要往 PATHS 里补一条 <path> 集合即可。
 * ======================================================================== */
(function () {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  /* 每个图标是「共用属性 + 若干 path」，画在 24×24 网格内，四周留 2px 呼吸位 */
  const ICONS = {
    /* 今日总览：小屋（屋顶 + 门），屋顶线条略粗一点更有分量 */
    home: `
      <path d="M4 10.4 12 4l8 6.4V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/>
      <path d="M9.6 20.6v-5.4a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v5.4"/>`,
    /* 日历：外框 + 两个挂环 + 一条分隔线 + 今日圆点 */
    calendar: `
      <rect x="3.6" y="5.4" width="16.8" height="15" rx="3.2"/>
      <path d="M8 3.4v4M16 3.4v4M3.6 10.2h16.8"/>
      <circle cx="12" cy="15.4" r="1.15" fill="currentColor" stroke="none"/>`,
    /* 训练与体测：哑铃。小尺寸要认得出来，只能「两块配重 + 一根握杆」，
       元件越少越好；配重块用实心圆角矩形，靠形状本身就够 */
    dumbbell: `
      <path d="M6 7.2v9.6M18 7.2v9.6"/>
      <rect x="3.4" y="8.4" width="2.9" height="7.2" rx="1.45" fill="currentColor" stroke="none"/>
      <rect x="17.7" y="8.4" width="2.9" height="7.2" rx="1.45" fill="currentColor" stroke="none"/>
      <rect x="6.3" y="9.6" width="11.4" height="4.8" rx="2.4"/>`,
    /* 训练安排：日历 + 中心对勾（今天该练什么） */
    schedule: `
      <rect x="3.6" y="5.4" width="16.8" height="15" rx="3.2"/>
      <path d="M8 3.4v4M16 3.4v4M3.6 10.2h16.8"/>
      <path d="M9.2 15.2l2 2 3.6-3.9"/>`,
    /* 待办与日程：方框 + 对勾 */
    check: `
      <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.4"/>
      <path d="M8.2 12.2l2.7 2.7 5-5.2"/>`,
    /* 种草清单：书签（想买/想去的收藏） */
    bookmark: `
      <path d="M6.6 5.2A1.8 1.8 0 0 1 8.4 3.4h7.2a1.8 1.8 0 0 1 1.8 1.8v15.4l-5.4-3.9-5.4 3.9z"/>`,
    /* 记录事项：便签 + 三条文本线 */
    note: `
      <path d="M5 5.6A2.2 2.2 0 0 1 7.2 3.4h6.4l5.4 5.4V18.4a2.2 2.2 0 0 1-2.2 2.2H7.2A2.2 2.2 0 0 1 5 18.4z"/>
      <path d="M13.4 3.6v5.2h5.4"/>
      <path d="M8.4 13.2h7M8.4 16.6h4.8"/>`,
    /* 默写：铅笔（斜置笔身 + 笔尖） */
    pen: `
      <path d="M4 20l.9-3.4L15.6 6 18 8.4 8.4 18 4 20z"/>
      <path d="M14.6 7 17 9.4"/>`,
    /* —— 英语学习 —— */
    /* Dashboard：仪表盘（半圆刻度 + 指针） */
    gauge: `
      <path d="M4.2 16.8a8.4 8.4 0 1 1 15.6 0"/>
      <path d="M12 16.2 15.6 10"/>
      <circle cx="12" cy="16.4" r="1.3" fill="currentColor" stroke="none"/>`,
    /* Vocabulary：翻开的书 */
    book: `
      <path d="M12 6.2C10.6 4.9 8.6 4.2 4.4 4.2v13.4c4.2 0 6.2.7 7.6 2 1.4-1.3 3.4-2 7.6-2V4.2c-4.2 0-6.2.7-7.6 2z"/>
      <path d="M12 6.2v13.4"/>`,
    /* Listening：耳机 */
    headphones: `
      <path d="M4.4 17.4v-4.8a7.6 7.6 0 0 1 15.2 0v4.8"/>
      <rect x="3.4" y="13.6" width="3.6" height="6" rx="1.8"/>
      <rect x="17" y="13.6" width="3.6" height="6" rx="1.8"/>`,
    /* Expression：对话气泡（里头三点省略，纯形状更干净） */
    chat: `
      <path d="M20.4 11.6c0 4-3.8 7.2-8.4 7.2-1 0-2-.15-2.9-.44L4.4 19.8l1.3-3.4A6.9 6.9 0 0 1 3.6 11.6c0-4 3.8-7.2 8.4-7.2s8.4 3.2 8.4 7.2z"/>`,
    /* Learning Plan：靶心（目标 + 计划节奏） */
    target: `
      <circle cx="12" cy="12" r="8.2"/>
      <circle cx="12" cy="12" r="4.4"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>`,
    /* Knowledge Base：图书馆（三本立着的书） */
    library: `
      <path d="M4.6 4.6v14.8M9.4 4.6v14.8"/>
      <path d="M12.6 5.6l4.6-.9 2.9 14.4-4.6.9z"/>
      <path d="M3.2 19.4h17.6"/>`,
  };

  function icon(name, opt) {
    opt = opt || {};
    const size = opt.size || 22;
    const sw = opt.sw || 1.7;
    const body = ICONS[name];
    if (!body) return '';
    return `<svg class="svg-ico" ${NS} viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
      stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true" focusable="false">${body.trim()}</svg>`;
  }

  PM.icon = icon;
  PM.ICONS = Object.keys(ICONS);
})();
