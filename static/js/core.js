/* ===========================================================
 * core.js —— 个人生活管理平台 · 内核
 * 职责：
 *   1. 数据访问层（对接后端 CSV 数据库）
 *   2. 模块注册中心（新增模块 = registerModule 一次调用）
 *   3. 路由 / 导航 / 弹窗 / 提示 等基础能力
 * =========================================================== */
window.PM = (function () {
  const PM = {};

  /* ---------------- 数据层 ---------------- */
  const api = {
    async req(url, opt) {
      opt = Object.assign({}, opt);
      if (opt.timeout) {
        const ctrl = new AbortController();
        opt.signal = ctrl.signal;
        setTimeout(() => ctrl.abort(), opt.timeout);
        delete opt.timeout;
      }
      let res;
      try {
        res = await fetch(url, opt);
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('请求超时');
        throw e;
      }
      if (!res.ok) {
        let msg = res.statusText;
        try { const j = await res.json(); msg = j.detail || msg; } catch (e) {}
        throw new Error(msg || '请求失败');
      }
      return res.json();
    },
    async list(table, params = {}) {
      const qs = new URLSearchParams();
      if (params.where) qs.set('where', JSON.stringify(params.where));
      if (params.order_by) qs.set('order_by', params.order_by);
      if (params.desc) qs.set('desc', '1');
      if (params.limit) qs.set('limit', params.limit);
      const r = await api.req(`/api/table/${table}?${qs.toString()}`);
      return r.rows;
    },
    async get(table, id) {
      const rows = await api.list(table, { where: { id: String(id) } });
      return rows[0] || null;
    },
    create(table, data) { return api.req(`/api/table/${table}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data }) }); },
    bulk(table, rows) { return api.req(`/api/table/${table}/bulk`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ rows }) }); },
    update(table, id, data) { return api.req(`/api/table/${table}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data }) }); },
    remove(table, id) { return api.req(`/api/table/${table}/${id}`, { method: 'DELETE' }); },
    today(date) { return api.req(`/api/today${date ? '?date=' + date : ''}`); },
    async weather(lat, lon) {
      const qs = (lat !== undefined && lon !== undefined) ? `?lat=${lat}&lon=${lon}` : '';
      try {
        return await api.req('/api/weather' + qs, { timeout: 6000 });
      } catch (e) {
        return { ok: false, desc: '天气暂不可用', forecast: [] };
      }
    },
    dict(word) { return api.req('/api/dict/' + encodeURIComponent(word)); },
    settings() { return api.req('/api/settings'); },
    saveSettings(data) { return api.req('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); },
    reviewWord(id, know) { return api.req(`/api/vocab/${id}/review`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ know: know ? 1 : 0 }) }); },
    async upload(file) {
      const fd = new FormData();
      fd.append('file', file);
      return api.req('/api/upload', { method: 'POST', body: fd });
    },
    async importArticles(file, mode, minLen) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode || 'auto');
      fd.append('min_len', String(minLen || 220));
      return api.req('/api/pdf/articles', { method: 'POST', body: fd });
    },
    async importScenes(file, session, group) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('session', session || '默认场景');
      fd.append('group', group || 'page');
      return api.req('/api/pdf/scenes', { method: 'POST', body: fd });
    },
  };
  PM.api = api;

  /* ---------------- 工具 ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const U = {
    today() { return U.ymd(new Date()); },
    /* 当前时刻 HH:mm —— 打卡/记录时默认带上，方便同一天多条记录区分先后 */
    now() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parse(s) { const p = String(s || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); },
    addDays(s, n) { const d = U.parse(s); d.setDate(d.getDate() + n); return U.ymd(d); },
    weekday(s) { return '日一二三四五六'[U.parse(s).getDay()]; },
    weekIndex(s) { return U.parse(s).getDay(); },
    monthOf(s) { return String(s).slice(0, 7); },
    cnDate(s) { const d = U.parse(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; },
    relDate(s) {
      const t = U.today();
      if (s === t) return '今天';
      if (s === U.addDays(t, 1)) return '明天';
      if (s === U.addDays(t, -1)) return '昨天';
      const diff = Math.round((U.parse(s) - U.parse(t)) / 86400000);
      if (diff < 0) return `${-diff}天前`;
      if (diff < 7) return `${diff}天后`;
      return String(s).slice(5);
    },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; },
    uid() { return Math.random().toString(36).slice(2, 9); },
    el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
    speak(text, lang) {
      try {
        if (!('speechSynthesis' in window)) return false;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang || 'en-US';
        u.rate = 0.92;
        window.speechSynthesis.speak(u);
        return true;
      } catch (e) { return false; }
    },
  };
  PM.u = U;

  /* ---------------- 卡通吉祥物 & 撒花 ---------------- */
  /* 猫咪吉祥物：冷调天蓝/淡紫版（配玻璃拟物场景） */
  PM.MASCOT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="93" rx="26" ry="4.5" fill="#5A6180" opacity=".14"/>
    <!-- 头顶小云朵 -->
    <g transform="rotate(-6 50 20)">
      <path d="M38 22 q-6 0 -6 -5 q0 -5 6 -5 q2 -6 9 -5 q7 -1 9 5 q6 0 6 5 q0 5 -6 5 z" fill="#C9DDFA" stroke="#2F3550" stroke-width="2.6" stroke-linejoin="round"/>
    </g>
    <!-- 耳朵 -->
    <path d="M27 44 L24 25 Q24 21 28 23 L41 32 Z" fill="#FFFFFF" stroke="#2F3550" stroke-width="3" stroke-linejoin="round"/>
    <path d="M73 44 L76 25 Q76 21 72 23 L59 32 Z" fill="#FFFFFF" stroke="#2F3550" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28.5 38 L27 27 L36 33 Z" fill="#C6BAF0"/>
    <path d="M71.5 38 L73 27 L64 33 Z" fill="#C6BAF0"/>
    <!-- 头 -->
    <path d="M22 55 Q22 33 50 33 Q78 33 78 55 Q78 74 50 74 Q22 74 22 55 Z" fill="#FFFFFF" stroke="#2F3550" stroke-width="3"/>
    <!-- 眯眯眼（开心） -->
    <path d="M33 53 q4.5 -5 9 0" stroke="#2F3550" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M58 53 q4.5 -5 9 0" stroke="#2F3550" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <!-- ω 嘴 -->
    <path d="M45 61 q2.5 3 5 0 q2.5 3 5 0" stroke="#2F3550" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M50 58 v3" stroke="#2F3550" stroke-width="2.4" stroke-linecap="round"/>
    <!-- 胡须 -->
    <path d="M14 55 h9 M15 62 l8 -2 M86 55 h-9 M85 62 l-8 -2" stroke="#2F3550" stroke-width="2.2" stroke-linecap="round"/>
    <!-- 腮红（淡紫） -->
    <ellipse cx="32" cy="62" rx="4.5" ry="2.8" fill="#B7A8E8" opacity=".65"/>
    <ellipse cx="68" cy="62" rx="4.5" ry="2.8" fill="#B7A8E8" opacity=".65"/>
    <!-- 身体 + 挥手的爪子 -->
    <path d="M32 88 Q32 72 50 72 Q68 72 68 88 Z" fill="#FFFFFF" stroke="#2F3550" stroke-width="3"/>
    <path d="M68 84 q10 -2 12 -12" stroke="#2F3550" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="81" cy="69" r="5" fill="#FFFFFF" stroke="#2F3550" stroke-width="3"/>
  </svg>`;

  /* 撒花：完成打卡/学习时的小庆祝 */
  PM.celebrate = function (x, y, emoji) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const list = emoji || ['✨', '💫', '🫧', '🌟', '💙', '💜', '🌸'];
    const ox = x == null ? window.innerWidth / 2 : x;
    const oy = y == null ? window.innerHeight / 2 : y;
    for (let i = 0; i < 16; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.textContent = list[Math.floor(Math.random() * list.length)];
      el.style.left = (ox + (Math.random() - .5) * 120) + 'px';
      el.style.top = (oy + (Math.random() - .5) * 60) + 'px';
      el.style.setProperty('--dx', ((Math.random() - .5) * 320).toFixed(0) + 'px');
      el.style.setProperty('--dy', (-140 - Math.random() * 220).toFixed(0) + 'px');
      el.style.setProperty('--rot', ((Math.random() - .5) * 720).toFixed(0) + 'deg');
      el.style.animationDelay = (Math.random() * .18).toFixed(2) + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    }
  };

  /* ---------------- 提示 / 弹窗 ---------------- */
  PM.toast = function (msg, type) {
    const box = document.getElementById('toastRoot');
    const t = U.el(`<div class="toast ${type === 'err' ? 'err' : ''}">${U.esc(msg)}</div>`);
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 2200);
  };

  let modalStack = 0;
  const overlayClosers = [];
  document.addEventListener('mousedown', e => {
    // 点击最上层浮层之外 → 关闭（替代 mask 自身捕获，避免遮挡点击）
    if (!overlayClosers.length) return;
    if (e.target.closest('.modal') || e.target.closest('.drawer') || e.target.closest('.reader-tooltip') || e.target.closest('.wish-lightbox')) return;
    const top = overlayClosers[overlayClosers.length - 1];
    if (top && top.allowMaskClose !== false) {
      e.stopPropagation();
      e.preventDefault();
      top.close();
    }
  }, true);

  /* 进度条填充：把当前值换算成百分比写进 --p，CSS 用它画「天蓝→淡紫」已填充段 */
  function paintRange(r) {
    const min = r.min === '' ? 0 : +r.min;
    const max = r.max === '' ? 100 : +r.max;
    const v = r.value === '' ? 0 : +r.value;
    const p = max > min ? Math.max(0, Math.min(100, (v - min) / (max - min) * 100)) : 0;
    r.style.setProperty('--p', p.toFixed(2) + '%');
  }
  PM.paintRange = function (root) {
    const scope = root || document;
    if (!scope) return;
    if (scope.nodeType === 1 && scope.matches && scope.matches('input[type=range]')) { paintRange(scope); return; }
    if (scope.querySelectorAll) scope.querySelectorAll('input[type=range]').forEach(paintRange);
  };
  /* 拖动时实时上色（捕获阶段，任何地方新增的 range 都生效） */
  document.addEventListener('input', e => {
    if (e.target && e.target.type === 'range') paintRange(e.target);
  }, true);

  PM.modal = function (opt) {
    const root = document.getElementById('modalRoot');
    const wrap = U.el(`<div class="mask"></div>`);
    const m = U.el(`<div class="modal ${opt.wide ? 'wide' : ''} ${opt.full ? 'full' : ''}"></div>`);
    m.innerHTML = `
      <div class="modal-head">
        <h3>${opt.title || ''}</h3>
        <div class="spacer"></div>
        ${opt.headExtra || ''}
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="modal-body"></div>
      ${opt.foot === false ? '' : `<div class="modal-foot">${opt.foot || ''}</div>`}`;
    const bodyEl = m.querySelector('.modal-body');
    if (typeof opt.body === 'string') bodyEl.innerHTML = opt.body;
    else if (opt.body) bodyEl.appendChild(opt.body);
    wrap.appendChild(m);
    root.appendChild(wrap);
    root.style.pointerEvents = 'auto';
    modalStack++;
    const close = () => {
      if (wrap._closed) return;          /* 幂等：避免全局 mousedown 与遮罩点击重复关闭导致越删 */
      wrap._closed = true;
      wrap.remove();
      modalStack--;
      if (!modalStack) root.style.pointerEvents = 'none';
      const idx = overlayClosers.indexOf(entry);
      if (idx >= 0) overlayClosers.splice(idx, 1);
      opt.onClose && opt.onClose();
    };
    const entry = { close, allowMaskClose: opt.maskClose !== false };
    overlayClosers.push(entry);
    m.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    /* 直接点遮罩（空白处）也关闭：iOS 上比依赖全局 mousedown 更稳，tap 即关 */
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    if (opt.onMount) opt.onMount(m, close);
    PM.paintRange(m);
    PM.paintDate(m);
    return { el: m, close, body: bodyEl };
  };

  /* 日期 / 时间输入：套一层 .dt-wrap，空值时用 CSS 画占位文字。
     原因：iOS Safari 的原生 date/time 控件在空值、自定义边框/圆角下经常整块空白，
     用户看不到也点不出；占位层不依赖原生绘制，任何内核都能显示。 */
  const DT_PH = { date: '选择日期', time: '可不填' };
  function dtSync(inp) {
    const w = inp.closest('.dt-wrap');
    if (w) w.toggleAttribute('data-filled', !!inp.value);
  }
  PM.paintDate = function (root) {
    root.querySelectorAll('input[type=date],input[type=time]').forEach(inp => {
      if (inp.closest('.dt-wrap')) { dtSync(inp); return; }
      const w = document.createElement('span');
      w.className = 'dt-wrap';
      w.dataset.ph = inp.dataset.ph || DT_PH[inp.type] || '选择';
      inp.parentNode.insertBefore(w, inp);
      w.appendChild(inp);
      dtSync(inp);
    });
  };
  /* 侧栏导航：光斑跟随指针——把坐标写进 CSS 变量 --mx/--my（配合 .nav-item::after） */
  document.addEventListener('pointermove', e => {
    const ni = e.target.closest && e.target.closest('.nav-item');
    if (!ni) return;
    const r = ni.getBoundingClientRect();
    ni.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    ni.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
  document.addEventListener('input', e => { if (/^(date|time)$/.test(e.target.type)) dtSync(e.target); });
  document.addEventListener('change', e => { if (/^(date|time)$/.test(e.target.type)) dtSync(e.target); });

  PM.drawer = function (opt) {
    const root = document.getElementById('drawerRoot');
    const wrap = U.el(`<div class="mask"></div>`);
    const d = U.el(`<div class="drawer"></div>`);
    d.innerHTML = `
      <div class="drawer-head"><h3 style="margin:0;font-size:16px">${opt.title || ''}</h3>
        <div class="spacer"></div><button class="icon-btn" data-close>✕</button></div>
      <div class="drawer-body"></div>
      <div class="drawer-foot">${opt.foot || ''}</div>`;
    const b = d.querySelector('.drawer-body');
    if (typeof opt.body === 'string') b.innerHTML = opt.body; else if (opt.body) b.appendChild(opt.body);
    wrap.appendChild(d);
    root.appendChild(wrap);
    root.style.pointerEvents = 'auto';
    const close = () => {
      if (wrap._closed) return;
      wrap._closed = true;
      wrap.remove();
      root.style.pointerEvents = 'none';
      const idx = overlayClosers.indexOf(entry);
      if (idx >= 0) overlayClosers.splice(idx, 1);
      opt.onClose && opt.onClose();
    };
    const entry = { close, allowMaskClose: true };
    overlayClosers.push(entry);
    d.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    /* 直接点遮罩（空白处）也关闭：iOS 上比依赖全局 mousedown 更稳，tap 即关 */
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    if (opt.onMount) opt.onMount(d, close);
    PM.paintRange(d);
    return { el: d, close, body: b };
  };

  PM.confirm = function (msg, title) {
    return new Promise(resolve => {
      let done = false;
      const m = PM.modal({
        title: title || '确认操作',
        body: `<div style="font-size:14px;line-height:1.8">${U.esc(msg)}</div>`,
        foot: `<button class="btn" data-no>取消</button><button class="btn danger" data-yes>确定</button>`,
        onMount(el, close) {
          el.querySelector('[data-yes]').onclick = () => { done = true; close(); resolve(true); };
          el.querySelector('[data-no]').onclick = () => { done = true; close(); resolve(false); };
        },
        onClose() { if (!done) resolve(false); },
      });
      return m;
    });
  };

  /* 表单序列化：收集 [name] 元素 */
  PM.formData = function (root) {
    const o = {};
    root.querySelectorAll('[name]').forEach(inp => {
      if (inp.type === 'checkbox') o[inp.name] = inp.checked ? '1' : '0';
      else o[inp.name] = inp.value;
    });
    return o;
  };
  PM.fillForm = function (root, data) {
    root.querySelectorAll('[name]').forEach(inp => {
      const v = data[inp.name];
      if (v === undefined || v === null) return;
      if (inp.type === 'checkbox') inp.checked = String(v) === '1' || v === true;
      else inp.value = v;
    });
  };

  /* ---------------- 模块注册中心 ----------------
   * 新增一个业务模块只需：
   *   PM.registerModule({ id, name, icon, group, nav, routes, today })
   * 平台会自动：生成侧边栏/移动导航、挂载路由、把 today 部件汇总到今日页。
   * ------------------------------------------------ */
  PM.modules = [];
  PM.registerModule = function (mod) {
    mod.nav = mod.nav || [{ label: mod.name, path: '' }];
    mod.routes = mod.routes || {};
    mod.today = mod.today || [];
    mod.quickAdd = mod.quickAdd || [];
    PM.modules.push(mod);
  };

  /* 汇总全平台的快捷新增项（日历页「+ 新增」用），按模块注册顺序 */
  PM.quickAdds = function () {
    const out = [];
    PM.modules.forEach(m => m.quickAdd.forEach(q => out.push(q)));
    return out;
  };

  /* ---------------- 路由 ---------------- */
  PM.route = { mod: 'today', path: '', query: {} };
  PM.go = function (hash) { location.hash = hash; };

  function parseHash() {
    const h = (location.hash || '#/today').replace(/^#\/?/, '');
    const [p, q] = h.split('?');
    const seg = p.split('/').filter(Boolean);
    const query = {};
    if (q) q.split('&').forEach(kv => { const [k, v] = kv.split('='); query[k] = decodeURIComponent(v || ''); });
    return { mod: seg[0] || 'today', path: seg.slice(1).join('/'), query };
  }

  let renderToken = 0;
  async function render() {
    const my = ++renderToken;
    const r = parseHash();
    PM.route = r;
    const view = document.getElementById('view');
    const mod = PM.modules.find(m => m.id === r.mod) || PM.modules.find(m => m.id === 'today');
    if (!mod) { view.innerHTML = '<div class="empty">模块不存在</div>'; return; }
    view.innerHTML = `<div class="loading-mascot">${PM.MASCOT_SVG}<div>正在准备…</div></div>`;
    try {
      const fn = mod.routes[r.path] || mod.routes[''];
      const node = await fn(view, r.query);
      if (my !== renderToken) return; // 已有更新的渲染，丢弃本次结果
      if (typeof node === 'string') view.innerHTML = node;
      else if (node) { view.innerHTML = ''; view.appendChild(node); }
    } catch (e) {
      if (my !== renderToken) return;
      view.innerHTML = `<div class="empty">加载失败：${U.esc(e.message)}</div>`;
      console.error(e);
    }
    document.getElementById('pageTitle').textContent = (mod.routes[r.path] && mod.pageTitle ? mod.pageTitle : '') || (r.path ? (mod.nav.find(n => n.path === r.path) || {}).label || mod.name : mod.name);
    syncNav(r);
    renderSubnav(r);
    PM.paintRange(document);
    window.scrollTo({ top: 0 });
  }

  function syncNav(r) {
    const cur = r.mod + (r.path ? '/' + r.path : '');
    const mod = PM.modules.find(m => m.id === r.mod);
    const curGroup = mod && !mod.flatTop ? (mod.group || '模块') : null;
    document.querySelectorAll('[data-nav]').forEach(n => {
      /* 一级项：精确匹配路由；组入口：当前页属于这个组就高亮。
         必须显式转成布尔：`false || undefined` 得到 undefined，
         而 classList.toggle(x, undefined) 被当作「没传 force」→ 纯切换，
         会把所有菜单项都翻成 active（踩过一次）。 */
      const isCur = n.dataset.nav === cur;
      const inGroup = !!n.dataset.group && n.dataset.group === curGroup;
      const on = isCur || inGroup;
      n.classList.toggle('active', on);
      /* 手机底部导航用的是 .mn.on 样式，同步一份，否则永远不高亮 */
      if (n.classList.contains('mn')) n.classList.toggle('on', on);
    });
  }

  PM.refresh = render;

  /* ---------------- 导航树 ----------------
   * 两级结构：
   *   一级 = flatTop 模块的每个 nav 项，或一个「组」（group 字段相同的模块合并）
   *   二级 = 组内所有模块的 nav 项按注册顺序平铺
   * 桌面侧边栏：全部展开。
   * 手机底栏：只显示一级（组 → 第一子项），二级在顶栏下方的切换条里选。 */
  function navTree(cfg) {
    const order = ['today', 'fitness', 'todo', 'wishlist', 'notes', 'english'];
    const visible = PM.modules.filter(m => {
      if (m.hide) return false;
      if (cfg.modules && cfg.modules[m.id] && cfg.modules[m.id].on === false) return false;
      return true;
    });
    const all = [...visible].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    const tree = [];
    let lastGroup = null;
    all.forEach(m => {
      const items = m.nav.map(n => ({
        key: m.id + (n.path ? '/' + n.path : ''),
        label: n.label,
        icon: n.icon || m.icon,
        mod: m.id,
      }));
      if (m.flatTop) { items.forEach(it => tree.push({ type: 'item', ...it })); lastGroup = null; return; }
      const g = m.group || '模块';
      if (!lastGroup || lastGroup.label !== g) {
        lastGroup = { type: 'group', label: g, icon: m.icon, items: [] };
        tree.push(lastGroup);
      }
      lastGroup.items.push(...items);
    });
    return tree;
  }

  async function buildNav() {
    const cfg = await api.settings();
    PM.settings = cfg;
    const tree = navTree(cfg);
    PM.navTree = tree;

    /* 桌面侧边栏：分组标题 + 全部子项展开 */
    const nav = document.getElementById('nav');
    nav.innerHTML = tree.map(node => {
      if (node.type === 'item') {
        return `<div class="nav-item" data-nav="${node.key}" data-go="#/${node.key}">
          <span class="ico">${node.icon}</span><span>${U.esc(node.label)}</span>
          <span class="badge" style="display:none"></span></div>`;
      }
      return `<div class="nav-group">${U.esc(node.label.toUpperCase())}</div>` +
        node.items.map(it => `<div class="nav-item" data-nav="${it.key}" data-go="#/${it.key}">
          <span class="ico">${it.icon}</span><span>${U.esc(it.label)}</span>
          <span class="badge" style="display:none"></span></div>`).join('');
    }).join('');

    /* 手机底栏：只放一级。组用第一个子项作为入口（点进去就能看到二级切换条） */
    const mnav = document.getElementById('mobileNav');
    mnav.innerHTML = tree.map(node => {
      if (node.type === 'item') {
        return `<div class="mn" data-nav="${node.key}" data-go="#/${node.key}">
          <span class="mi">${node.icon}</span><span>${U.esc(node.label === '今日总览' ? '今日' : node.label)}</span></div>`;
      }
      const first = node.items[0];
      return `<div class="mn" data-nav="${first.key}" data-group="${U.esc(node.label)}" data-go="#/${first.key}">
        <span class="mi">${node.icon}</span><span>${U.esc(node.label)}</span></div>`;
    }).join('');

    nav.querySelectorAll('[data-go]').forEach(n => n.onclick = () => { PM.go(n.dataset.go); closeSidebar(); });
    mnav.querySelectorAll('[data-go]').forEach(n => n.onclick = () => { PM.go(n.dataset.go); });
    updateBadges();
  }
  PM.buildNav = buildNav;

  /* 二级切换条：进入一个组之后，在顶栏下方横滑选子页。
     flatTop 模块（今日总览/日历）本身就是一级，不需要这条。 */
  function renderSubnav(r) {
    const box = document.getElementById('subnav');
    if (!box) return;
    const mod = PM.modules.find(m => m.id === r.mod);
    if (!mod || mod.flatTop) { box.innerHTML = ''; box.style.display = 'none'; return; }
    const node = (PM.navTree || []).find(n => n.type === 'group' && n.items.some(i => i.key === r.mod + (r.path ? '/' + r.path : '')));
    if (!node || node.items.length < 2) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = node.items.map(it =>
      `<a class="sn-it ${it.key === r.mod + (r.path ? '/' + r.path : '') ? 'on' : ''}" href="#/${it.key}">${U.esc(it.label)}</a>`).join('');
  }
  PM.renderSubnav = renderSubnav;

  async function updateBadges() {
    for (const m of PM.modules) {
      if (!m.badge) continue;
      let n = 0;
      try { n = await m.badge(); } catch (e) { n = 0; }
      // 一个模块的数字角标只挂在它的第一个导航项上，避免整列重复同一个数字
      const firstKey = m.id + (m.nav && m.nav[0] && m.nav[0].path ? '/' + m.nav[0].path : '');
      document.querySelectorAll(`[data-nav^="${m.id}"] .badge`).forEach(b => {
        const item = b.closest('[data-nav]');
        if (!item || item.dataset.nav !== firstKey) { b.style.display = 'none'; b.textContent = ''; return; }
        if (n > 0) { b.style.display = ''; b.textContent = n; } else { b.style.display = 'none'; }
      });
    }
  }
  PM.updateBadges = updateBadges;

  function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }

  /* ---------------- 启动 ---------------- */
  PM.boot = async function () {
    await buildNav();
    document.getElementById('brandDate').textContent = `${U.cnDate(U.today())} 周${U.weekday(U.today())}`;
    document.getElementById('btnMenu').onclick = () => document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('btnSettings').onclick = () => PM.go('#/settings');
    window.addEventListener('hashchange', render);
    loadWeather();
    render();
    setInterval(loadWeather, 30 * 60 * 1000);
  };

  let weatherP = null;
  function loadWeather(force) {
    if (weatherP && !force) return weatherP;
    weatherP = api.weather().then(w => {
      PM.weather = w;
      const chip = document.getElementById('weatherChip');
      if (chip) chip.textContent = w.ok ? `${w.city} ${w.desc} ${Math.round(w.temp)}°C` : '天气不可用';
      return w;
    }).catch(() => ({ ok: false, desc: '天气不可用', forecast: [] }));
    return weatherP;
  }
  PM.loadWeather = loadWeather;

  /* 打卡点颜色约定（各模块共用） */
  /* 马卡龙色板 + 统一状态规则
     规则：未完成 = 虚线左条 + 浅色底；已完成 = 实线左条 + 同色系深底，标题前打 ✓
     - 🏋️ 训练（蒂凡尼蓝）：未打卡 #B8EEE9 → 已打卡 #4DBDB5
     - ✅ 待办（莓粉）    ：未完成 #F8C1CF → 已完成 #DD6D8F
     - 📚 学习（薰衣草紫）：未打卡 #DCCAF7 → 已打卡 #9373D1
     - 📅 日程（天蓝）    ：#559BDC，不区分完成状态（始终实线） */
  PM.C = {
    todoOpen: '#F8C1CF', todoDone: '#DD6D8F',
    event: '#559BDC',
    planOpen: '#B8EEE9', planDone: '#4DBDB5',
    studyOpen: '#DCCAF7', studyDone: '#9373D1',
    body: '#FFE1AC', note: '#C4B0F7',
  };
  PM.DOTS = {
    fitness: PM.C.planDone, body: PM.C.body, english: PM.C.studyOpen,
    todo: PM.C.todoDone, note: PM.C.note, wish: '#F0D38A',
  };
  PM.C_EVENT = PM.C.event;   /* 兼容旧引用 */

  /* ---------- 整页铺满校准（自适应任何可视宽度） ----------
     背景：iOS 上出现过「内容只占屏幕一部分、右侧空出一条」——连 position:fixed 的
     底栏也只有一部分宽。成因有两类，肉眼难区分，这里统一按「实测宽度差」处理：

       A. 浏览器把整页缩小了（双指缩放 / Safari 页面缩放被调小，缩放状态还会跨刷新保留）
          → innerWidth 仍是 layout 宽，visualViewport.width 反而更大；
       B. 布局容器比可视区窄（flex 容器被某个 %max-width 或残留宽度限制住）

     两种情况都表现为 visualViewport.width 明显大于实际内容宽度，所以判断条件
     不看 scale（iOS 在缩小态下 scale 经常仍报 1），只看宽度差；
     一旦发现就把 html/body/#app/.main 以及 fixed 的顶栏底栏一起钉到可视宽度。
     正常浏览（宽度一致）时一行样式都不会写，零副作用。 */
  (function fitViewport(){
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const body = document.body;
    let fixedW = 0, raf = 0;

    const FIXED_SEL = '.mobile-nav,.topbar,.zoom-bar,.toast,.modal,.drawer';

    const clearFix = () => {
      if (!fixedW) return;
      fixedW = 0;
      root.style.minWidth = ''; root.style.width = '';
      body.style.minWidth = ''; body.style.width = ''; body.style.maxWidth = '';
      document.querySelectorAll('[data-vwfix]').forEach(el => {
        el.style.width = ''; el.style.maxWidth = ''; el.removeAttribute('data-vwfix');
      });
      root.removeAttribute('data-vwfix-w');
    };

    const applyFix = (w) => {
      fixedW = w;
      root.style.minWidth = w + 'px';
      body.style.minWidth = w + 'px';
      body.style.maxWidth = 'none';
      /* 布局容器：直接给宽度，绕开百分比 max-width 在 WebKit 下的解析差异 */
      ['#app', '.main'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.width = w + 'px'; el.style.maxWidth = 'none';
          el.setAttribute('data-vwfix', '1');
        });
      });
      /* fixed 元素的包含块是视口，不会跟着 min-width 变，需要单独钉宽 */
      document.querySelectorAll(FIXED_SEL).forEach(el => {
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed') { el.style.width = w + 'px'; el.style.maxWidth = 'none'; el.setAttribute('data-vwfix', '1'); }
        else if (pos === 'absolute' && el.classList.contains('drawer')) {
          el.style.width = w + 'px'; el.setAttribute('data-vwfix', '1');
        }
      });
      root.setAttribute('data-vwfix-w', String(w));
    };

    /* 有些机型在缩小态下 visualViewport.width 也报成缩小后的值，
       这时只有 screen 的短边才是「屏幕真实宽度」，竖屏下用它兜底。
       限定短边 < 500px 的手机，避免 iPad 分屏/桌面窗口被误判撑宽。 */
    const screenTarget = () => {
      const sw = Math.round(Math.min(screen.width, screen.height));
      const portrait = window.innerHeight >= window.innerWidth;
      return (portrait && sw > 240 && sw < 500) ? sw : 0;
    };

    const measure = () => {
      const rawVw = Math.round(vv.width || 0);
      const st = screenTarget();
      const vw = st ? Math.max(rawVw, st) : rawVw;
      const cw = Math.round(root.clientWidth || 0);
      const app = document.getElementById('app');
      const aw = app ? Math.round(app.getBoundingClientRect().width) : cw;
      const main = document.querySelector('.main');
      const mw = main ? Math.round(main.getBoundingClientRect().width) : aw;
      const need = Math.max(vw - cw, vw - aw, vw - mw);
      return { vw, cw, aw, mw, need };
    };

    /* 桌面浏览器有 15px 左右的滚动条占位，会让「可视宽 - 布局宽」天生差一截；
       而桌面本来也不会出现整页缩小留白，所以这里限定为触屏设备才校准。 */
    const coarse = () => {
      try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
    };

    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const m = measure();
        const zoomed = (vv.scale || 1) < 0.99;
        if (!coarse() && !zoomed) { if (fixedW) clearFix(); return; }
        /* 可视宽比内容宽多出 20px 以上才动手（大于滚动条/亚像素误差） */
        if (m.vw > 200 && m.need > 20) {
          if (fixedW !== m.vw) applyFix(m.vw);
        } else if (fixedW && m.need <= 6) {
          clearFix();
        }
      });
    };

    vv.addEventListener('resize', check);
    vv.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', () => setTimeout(check, 320));
    window.addEventListener('pageshow', () => setTimeout(check, 200));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 120); });
    setTimeout(check, 260);
    setTimeout(check, 1200);
    /* 字体/图片加载完成后尺寸可能再变一次 */
    window.addEventListener('load', () => setTimeout(check, 400));

    /* ?diag=1：真机排查用，右下角显示关键宽度读数 */
    if (/[?&]diag=1/.test(location.search)) {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;right:6px;bottom:80px;z-index:9999;background:rgba(20,20,28,.82);'
        + 'color:#fff;font:11px/1.5 -apple-system,monospace;padding:6px 8px;border-radius:8px;pointer-events:auto;white-space:pre';
      const paint = () => {
        const m = measure();
        box.textContent = 'iw ' + window.innerWidth + '  vw ' + m.vw + '  scale ' + (vv.scale || 1).toFixed(2)
          + '\ncw ' + m.cw + '  app ' + m.aw + '  main ' + m.mw
          + '\nfix ' + (fixedW || '-') + '  dpr ' + (window.devicePixelRatio || 1);
      };
      paint();
      setInterval(paint, 800);
      box.onclick = () => box.remove();
      document.body.appendChild(box);
    }
  })();

  return PM;
})();
