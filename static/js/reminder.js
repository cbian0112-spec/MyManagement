/* ===========================================================
 * 到期提醒引擎：日程与待办到点提醒
 * 通道：① 应用内横幅 + 提示音（所有浏览器可用，含 iOS Safari）
 *      ② 系统通知（Notification API：桌面 Chrome / Edge 直接可用；
 *         iPhone 需先把网页「添加到主屏幕」变成 PWA 才支持，iOS 16.4+）
 * 说明：iOS 普通网页无后台推送（App 关闭也推）需要 Service Worker +
 *      Web Push 服务端，后续可加；本引擎覆盖「打开着页面」的场景。
 * =========================================================== */
(function () {
  const { u, api } = PM;
  const LS_SEEN = 'pm.rem.seen';      // 当日已提醒 key 列表
  const LS_ON = 'pm.rem.on';          // 应用内提醒开关（默认开）
  const DEFAULT_TIME = '09:00';       // 没填时间的待办，默认 09:00 提醒

  let timer = null, audioCtx = null;

  const on = () => localStorage.getItem(LS_ON) !== '0';
  const setOn = v => localStorage.setItem(LS_ON, v ? '1' : '0');
  const seen = () => { try { return JSON.parse(localStorage.getItem(LS_SEEN) || '[]'); } catch (e) { return []; } };
  const markSeen = k => {
    const s = seen();
    if (!s.includes(k)) { s.push(k); localStorage.setItem(LS_SEEN, JSON.stringify(s.slice(-200))); }
  };
  /* 每天清一次已提醒记录 */
  const todayKey = () => 'seen:' + u.today();
  if (localStorage.getItem('pm.rem.day') !== u.today()) {
    localStorage.removeItem(LS_SEEN);
    localStorage.setItem('pm.rem.day', u.today());
  }

  /* 提示音：两声清脆的「叮」，无音频文件依赖 */
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const play = (t0, f) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t0 + 0.5);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t0); o.stop(audioCtx.currentTime + t0 + 0.55);
      };
      play(0, 880); play(0.35, 660);
    } catch (e) { /* 自动播放策略拦了就算了 */ }
  }

  /* 应用内横幅：点一下跳到今日页处理 */
  function banner(title, body, n) {
    const b = document.createElement('div');
    b.className = 'rem-banner';
    b.innerHTML = `
      <div class="rem-ico">🔔</div>
      <div class="rem-main"><b>${u.esc(title)}</b><span>${u.esc(body)}</span></div>
      ${n > 1 ? `<span class="tag red">+${n - 1}</span>` : ''}
      <button class="btn xs" data-go>去处理</button>
      <button class="rem-x" title="关闭">✕</button>`;
    b.querySelector('[data-go]').onclick = () => { b.remove(); location.hash = '#/today'; };
    b.querySelector('.rem-x').onclick = () => b.remove();
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('show'), 60);
    setTimeout(() => b.remove(), 12000);
  }

  function notify(items) {
    if (!items.length || !on()) return;
    const n = items.length;
    const first = items[0];
    const body = n > 1
      ? `${first.text} 等 ${n} 项到时间了`
      : `${first.text}${first.time ? ' · ' + first.time : ''}`;
    banner('到点啦！', body, n);
    beep();
    /* 系统通知：授权过才发；点击通知聚焦并跳今日页 */
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const nt = new Notification('⏰ ' + body, {
          tag: 'pm-rem-' + Date.now(), body: '个人管理平台',
        });
        nt.onclick = () => { window.focus(); location.hash = '#/today'; nt.close(); };
      }
    } catch (e) { /* iOS 普通网页不支持，忽略 */ }
    items.forEach(it => markSeen(it.key));
  }

  /* 一条日程/待办今天的「到期时刻」，null = 不提醒 */
  function dueTimeOf(r, date) {
    const kind = r.kind || 'todo';
    if (kind === 'event') {
      /* 跨天日程：只有第一天带时间才按时间提醒；否则全天不按点提醒 */
      return r.date === date && r.time ? String(r.time).slice(0, 5) : null;
    }
    return r.time ? String(r.time).slice(0, 5) : DEFAULT_TIME;
  }

  async function tick() {
    if (!on()) return;
    let rows = [];
    try { rows = await api.list('todos'); } catch (e) { return; }
    const t = u.today();
    const now = u.now();                    // "HH:MM:SS" 或 "HH:MM"
    const nowHM = now.slice(0, 5);
    const T = (PM.modules.find(m => m.id === 'todo') || {}).api || {};
    const isEvent = T.isEvent || (r => r.kind === 'event');
    const covers = T.covers || ((r, d) => isEvent(r)
      ? (r.date <= d && (r.end_date || r.date) >= d) : r.date === d);

    const due = [];
    const overdue = [];
    (rows || []).forEach(r => {
      if (r.done === '1') return;
      /* 已过期未完成的待办：不按点提醒，但每天固定提醒一次（09:00 后） */
      if (!isEvent(r) && r.date && r.date < t && nowHM >= DEFAULT_TIME) {
        overdue.push({ key: `od|${r.id}|${t}`, text: r.title || '未命名待办', time: '' });
        return;
      }
      if (!covers(r, t)) return;
      const tm = dueTimeOf(r, t);
      if (!tm || tm > nowHM) return;        // 还没到点
      const key = `${r.id}|${t}|${tm}`;
      if (seen().includes(key)) return;
      due.push({ key, text: r.title || '未命名', time: tm, kind: isEvent(r) ? '日程' : '待办' });
    });
    due.sort((a, b) => a.time.localeCompare(b.time));
    if (due.length) notify(due);
    /* 过期清单合并成一次提醒，避免逐条轰炸 */
    const odNew = overdue.filter(x => !seen().includes(x.key));
    const odKey = 'od|day|' + t;
    if (odNew.length && !seen().includes(odKey)) {
      markSeen(odKey);
      notify(odNew.map((x, i) => ({ ...x, key: i === 0 ? odKey : x.key })));
    }
  }

  function start() {
    if (timer) return;
    tick();
    timer = setInterval(tick, 30000);
    /* 回到前台立刻补查一次（切后台时浏览器会限流 interval） */
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  PM.reminder = { on, setOn, tick, notify, banner,
    notifyPermission: () => ('Notification' in window) ? Notification.permission : 'unsupported' };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
