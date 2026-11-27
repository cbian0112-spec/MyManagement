/* ===========================================================
 * 今日页面：把四个模块汇总到同一个页面
 * 1) 日期 / 星期 / 天气  2) 今日体重  3) 统一打卡日历  4) 待办  5) 各模块部件
 * =========================================================== */
(function () {
  const { u, api } = PM;

  /* ---------------- 通用月历组件（其它模块也可复用） ----------------
   * getMarks(ds) 返回 [{ text, done, span, color, key, icon }]
   *   text  : 该格里显示的文字（默认取 text）
   *   done  : 已完成 → 加横线 + 变淡
   *   span  : 跨天日程（连续块，首尾有圆角）
   *   icon  : 文字前的小图标
   * ---------------------------------------------------------------- */
  PM.calendar = function (opt) {
    const state = { month: opt.month || u.monthOf(u.today()) };
    const box = u.el('<div></div>');
    const MAX = opt.maxItems || 3;
    /* 节假日模块（可能未加载，做兜底） */
    const H = PM.holiday || { of: () => null, monthSummary: () => [] };

    function draw() {
      const [y, m] = state.month.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const startIdx = (first.getDay() + 6) % 7; // 周一开头
      const days = new Date(y, m, 0).getDate();
      const prevDays = new Date(y, m - 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startIdx; i++) cells.push({ d: new Date(y, m - 2, prevDays - startIdx + i + 1), other: true });
      for (let i = 1; i <= days; i++) cells.push({ d: new Date(y, m - 1, i) });
      while (cells.length % 7) cells.push({ d: new Date(y, m, cells.length - startIdx - days + 1), other: true });
      while (cells.length < 42) cells.push({ d: new Date(y, m, cells.length - startIdx - days + 1), other: true });

      const marks = {};
      let total = 0;
      for (const c of cells) {
        const ds = u.ymd(c.d);
        marks[ds] = (opt.getMarks ? (opt.getMarks(ds, state.month) || []) : []);
        if (!c.other) total += marks[ds].length;
      }
      const empty = total === 0;

      /* 本月假期汇总：横幅 + 统计 */
      const summ = H.monthSummary(state.month) || [];
      const banDays = summ.reduce((n, h) => n + (h.workDays || []).length, 0);
      const offDays = summ.reduce((n, h) => n + (h.monthDays || 0), 0);
      /* 本月内的假期区间，用来给连续假期加首尾圆角 */
      const offSet = {};
      summ.forEach(h => {
        let ds = h.from;
        while (ds <= h.to) { offSet[ds] = h.short; ds = u.addDays(ds, 1); }
      });

      box.innerHTML = `
        <div class="row" style="margin-bottom:12px">
          <button class="btn xs" data-pm="-1">‹</button>
          <b style="min-width:100px;text-align:center">${y} 年 ${m} 月</b>
          <button class="btn xs" data-pm="1">›</button>
          <div class="spacer"></div>
          <button class="btn xs" data-pm="0">本月</button>
        </div>
        ${summ.length ? `
        <div class="hol-banner">
          <span class="hb-ico">🧨</span>
          <div class="hb-main">
            <b>${summ.map(h => `${h.short} ${Number(h.from.slice(5, 7))}/${Number(h.from.slice(8))}–${Number(h.to.slice(5, 7))}/${Number(h.to.slice(8))}`).join(' · ')}</b>
            <span>${summ.map(h => `法定休假 ${h.monthDays} 天`).join(' · ')}${banDays ? ` · 补班 ${banDays} 天` : ''}</span>
          </div>
          <span class="hb-cnt">休 ${offDays} 天${banDays ? ` · 班 ${banDays} 天` : ''}</span>
        </div>` : ''}
        <div class="cal-head">${['一', '二', '三', '四', '五', '六', '日'].map((d, i) => `<div class="${i >= 5 ? 'we' : ''}">${d}</div>`).join('')}</div>
        <div class="cal">
          ${cells.map(c => {
            const ds = u.ymd(c.d);
            /* 待办在前；已完成的计划不再沉底；记录类（体测等）和漏练排最后 */
            const mk = (marks[ds] || []).slice().sort((a, b) => (a.rec ? 1 : 0) - (b.rec ? 1 : 0)
              || (a.done ? 1 : 0) - (b.done ? 1 : 0)
              || ((a.plan && !a.done) ? 1 : 0) - ((b.plan && !a.done) ? 1 : 0)
              || (a.missed ? 1 : 0) - (b.missed ? 1 : 0));
            const show = mk.slice(0, MAX);
            const rest = mk.length - show.length;
            const hl = c.other ? null : H.of(ds);
            const isOff = hl && hl.type === 'holiday';
            const isBan = hl && hl.type === 'workday';
            const off = offSet[ds];
            /* 假期区间首尾（用于两端圆角，形成连续色带） */
            const isStart = isOff && offSet[u.addDays(ds, -1)] !== off;
            const isEnd = isOff && offSet[u.addDays(ds, 1)] !== off;
            /* 格内副标题：假期名 > 补班 > 节日（只在非周末/非假期时显示，避免信息过载） */
            let sub = '';
            if (isOff) sub = `<span class="csub">${hl.name}</span>`;
            else if (isBan) sub = `<span class="csub ban">班</span>`;
            else if (hl && hl.type === 'festival') sub = `<span class="csub fest">${hl.name.replace('节', '')}</span>`;
            /* 跨天日程画成一条连到格子边缘的色带：
               span=true 表示「前一天 / 后一天还有同一条」，据此去掉对应一侧的圆角；
               start / end 表示这条在这里开始 / 结束，用来决定首尾那半格画不画。 */
            const band = x => x.span
              ? ` cal-band${x.start !== false ? '' : ' no-s'}${x.end !== false ? '' : ' no-e'}`
              : '';
            return `<div class="cal-day ${c.other ? 'other' : ''} ${ds === u.today() ? 'today' : ''} ${isOff ? 'off' : ''} ${isBan ? 'ban' : ''} ${isStart ? 'off-s' : ''} ${isEnd ? 'off-e' : ''}" data-d="${ds}" data-n="${mk.length}">
              <div class="dnum">${c.d.getDate()}${sub}</div>
              <div class="cal-items">
                ${show.map((x, i) => `<div class="cal-it k-${x.kind || 'todo'} ${x.done ? 'done' : ''} ${x.span ? 'span' : ''} ${x.plan ? 'plan' : ''} ${x.missed ? 'missed' : ''} ${x.planHit ? 'plan-hit' : ''} ${x.rec ? 'rec' : ''}${band(x)}" ${opt.onItem ? `data-idx="${i}"` : ''} style="${x.color ? '--c:' + x.color : ''}" title="${u.esc((x.time ? x.time + ' ' : '') + (x.missed ? '漏练：' : x.planHit ? '已完成：' : x.plan ? '计划：' : '') + x.text + (x.planHit ? ` · 完成度 ${x.completion || 0}%` : '') + (opt.onItem && x.kind === 'vocab' ? ' · 点击打卡' : ''))}">
                  ${x.time ? `<i class="tm">${u.esc(x.time)}</i>` : ''}<span>${x.missed ? '<i class="ck missed-ck">⏳</i>' : (x.done && !x.rec) || x.planHit ? '<i class="ck">✓</i>' : ''}${u.esc(x.text || '')}</span></div>`).join('')}
                ${rest > 0 ? `<div class="cal-it more">+${rest} 项</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        ${empty ? `<div class="cal-empty">📭 ${m} 月还没有任何安排或记录${opt.emptyHint ? '，' + opt.emptyHint : ''}</div>` : ''}`;
      box.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => {
        const delta = +b.dataset.pm;
        if (delta === 0) state.month = u.monthOf(u.today());
        else {
          const [yy, mm] = state.month.split('-').map(Number);
          const d = new Date(yy, mm - 1 + delta, 1);
          state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        /* 通知调用方月份变了，方便按需补数据再重画 */
        if (opt.onMonth) opt.onMonth(state.month);
        draw();
      });
      box.querySelectorAll('.cal-day').forEach(c => c.onclick = () => opt.onDay && opt.onDay(c.dataset.d));
      /* 条目级点击：只有传了 onItem 的调用方才绑（目前只有日历页用），
         其它复用这个组件的地方行为完全不变。单词任务点一下就打卡，
         其它类型仍然走「点整天开抽屉」；data-idx 用来回查原始事件对象。 */
      if (opt.onItem) {
        box.querySelectorAll('.cal-it[data-idx]').forEach(it => {
          it.onclick = e => {
            e.stopPropagation();
            const day = it.closest('.cal-day');
            const list = marks[day && day.dataset.d] || [];
            const x = list[+it.dataset.idx];
            if (x) opt.onItem(x, day.dataset.d);
          };
        });
      }
    }
    draw();
    return box;
  };

  /* ---------------- 统一事件流：把各模块横向铺成按天的列表 ----------------
   * 返回 { [日期]: [{ id, text, done, icon, color, span, start, end, ref }] }
   * 跨天日程会在区间内每一天都出现一条（span=true），方便日历画连续条。
   * ---------------------------------------------------------------- */
  function buildEvents({ workouts, body, todos, logs, notes, vocabTasks, listenTasks, only }, range) {
    const ev = {};
    const push = (d, o) => { if (d) (ev[d] = ev[d] || []).push(o); };
    /* only：只铺这几类事件（日历页只要「日程 + 待办 + 健身」，不要体测/学习/随手记） */
    const want = k => !only || only.indexOf(k) >= 0;
    /* cross：跨天日程被 range 截断时，首尾要跟着截断，否则翻月后色带的圆角画错位置 */
    const cross = !!range;
    const F = PM.modules.find(m => m.id === 'fitness').api;
    /* 待办/日程的类型判定统一走 todo 模块导出的 isEvent，别在日历这里重复实现一遍 */
    const todoApi = (PM.modules.find(m => m.id === 'todo') || {}).api || {};
    const isEvent = todoApi.isEvent || (r => r.kind === 'event');
    /* range = { from, to }：只在这个日期区间内铺开，翻月时按新区间重建 */
    const inRange = d => !range || (d >= range.from && d <= range.to);

    /* rec = 记录类（体测 / 学习 / 随手记）：它是「记了一笔数据」，不是要完成的待办。
       统计口径照旧按 done 走，但渲染时不该被当成「已完成事项」划掉变淡。 */
    (body || []).forEach(b => { if (!want('body')) return; push(b.date, {
      id: 'b' + b.id, text: (b.weight ? b.weight + '斤' : '体测') + (b.body_fat ? ' · ' + b.body_fat + '%' : ''),
      kind: 'body', time: '',
      icon: '⚖️', done: true, rec: true, color: PM.C.body, ref: { table: 'body_metrics', row: b },
    }); });
    (logs || []).forEach(l => { if (!want('study')) return; push(l.date, {
      id: 'l' + l.id, text: l.title || l.kind || '学习', kind: 'study', time: '',
      icon: '📖', done: true, rec: true,
      color: PM.C.studyOpen, ref: { table: 'study_logs', row: l },
    }); });
    (notes || []).forEach(n => { if (!want('note')) return; push((n.created_at || '').slice(0, 10), {
      id: 'n' + n.id, text: n.title || '记录', kind: 'note', time: '',
      icon: '📝', done: true, rec: true,
      color: PM.C.note, ref: { table: 'notes', row: n },
    }); });
    /* 训练打卡全部照常显示（训练安排功能已删，所有记录都是主动打卡；
       同一天多条按时间倒序，跟训练详情页保持一致） */
    (F.sortWorkouts ? F.sortWorkouts(workouts) : (workouts || [])).forEach(w => {
      if (!want('workout')) return;
      push(w.date, {
        id: 'w' + w.id, text: w.title || w.type || '训练', kind: 'workout',
        time: w.duration_min ? w.duration_min + '分' : '',
        icon: F.TYPE_ICON[w.type] || '🏋️',
        done: true, color: PM.C.planDone, ref: { table: 'workouts', row: w },
      });
    });
    /* 背词计划排出来的每日任务：点一下就能打卡
       注意不要给它 plan:true —— 顶部「健身 N 次」统计是按 plan 算的，会把单词任务算进去 */
    (vocabTasks || []).forEach(t => {
      if (!want('vocab') || !t.date) return;
      if (range && !inRange(t.date)) return;
      push(t.date, {
        id: 'v' + t.id, text: t.title || '背词', kind: 'vocab', time: '',
        icon: '📚', done: t.done === '1',
        color: t.done === '1' ? PM.C.studyDone : PM.C.studyOpen, vocabId: t.id,
        ref: { table: 'vocab_tasks', row: t },
      });
    });
    /* 听力计划排出来的每日任务：点一下打卡（同单词任务，不挂 plan:true，
       否则顶部「健身 N 次」统计会把听力也算进去） */
    (listenTasks || []).forEach(t => {
      if (!want('listen') || !t.date) return;
      if (range && !inRange(t.date)) return;
      push(t.date, {
        id: 'lt' + t.id, text: t.title || '听力', kind: 'listen', time: '',
        icon: '🎧', done: t.done === '1',
        color: t.done === '1' ? PM.C.studyDone : PM.C.studyOpen, listenId: t.id,
        ref: { table: 'listen_tasks', row: t },
      });
    });
    /* 待办 / 日程：类型看 kind 字段，不再靠 end_date 猜
       - 日程(event)：区间内每天都铺一条，跨天连成色带
       - 待办(todo)：只放在截止日那一天（它是要完成的事，不是「占着这几天」） */
    (todos || []).forEach(r => {
      if (!r.date) return;
      if (!want(isEvent(r) ? 'event' : 'todo')) return;
      const done = r.done === '1';
      const isEv = isEvent(r);
      const span = isEv && r.end_date && r.end_date > r.date;
      const end = span ? r.end_date : r.date;
      if (!span) {
        if (!inRange(r.date)) return;
        push(r.date, {
          id: 't' + r.id, text: r.title, kind: isEv ? 'event' : 'todo',
          time: r.time ? String(r.time).slice(0, 5) : '',
          icon: done ? '✅' : (isEv ? '📆' : '○'), done,
          color: isEv ? PM.C.event : (done ? PM.C.todoDone : PM.C.todoOpen),
          ref: { table: 'todos', row: r }, todoId: isEv ? undefined : r.id,
        });
        return;
      }
      for (let d = r.date; d <= end; d = u.addDays(d, 1)) {
        if (!inRange(d)) continue;
        push(d, {
          id: 't' + r.id + d, text: r.title, kind: 'event',
          time: d === r.date && r.time ? String(r.time).slice(0, 5) : '',
          icon: d === r.date ? '📆' : '', done,
          color: PM.C.event, span: true,
          /* 首尾跟随区间截断：翻到某月时，色带在该月第一/最后一天也该有圆角 */
          start: d === r.date || (cross && d === range.from),
          end: d === end || (cross && d === range.to),
          ref: { table: 'todos', row: r },
        });
        if (d === end) break;
        if (u.addDays(d, 1) <= d) break; // 保险：防死循环
      }
    });
    return ev;
  }
  PM.buildEvents = buildEvents;

  /* ---------------- 某日详情抽屉 ---------------- */
  async function openDayPanel(date, onChanged) {
    const [ws, bs, allTodos, logs, notes, vtasks, vplans, ltasks, liPlans] = await Promise.all([
      api.list('workouts', { where: { date } }),
      api.list('body_metrics', { where: { date } }), api.list('todos'),
      api.list('study_logs', { where: { date } }), api.list('notes'),
      api.list('vocab_tasks', { where: { date } }), api.list('vocab_plans'),
      api.list('listen_tasks', { where: { date } }), api.list('listen_plans'),
    ]);
    /* 待办要在这里「按天」筛：日程看区间（跨天中间日也算），待办只在那一天显示。
       以前直接 where={date} 查，跨天日程的中间几天会完全看不到。 */
    const F = PM.modules.find(m => m.id === 'fitness').api;
    const T = PM.modules.find(m => m.id === 'todo').api;
    const coversD = T.covers || (r => r.date === date);
    const todos = allTodos.filter(r => coversD(r, date));
    const dayNotes = notes.filter(n => (n.created_at || '').slice(0, 10) === date);
    /* 背词任务：只显示启用中的计划（模块可能被关掉，取 api 要兜底） */
    const E = (PM.modules.find(m => m.id === 'english') || {}).api || {};
    const onPlans = new Set(vplans.filter(p => p.active !== '0').map(p => String(p.id)));
    const dayVocab = vtasks.filter(t => onPlans.has(String(t.plan_id)));
    const liOn = new Set(liPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const dayListen = ltasks.filter(t => liOn.has(String(t.plan_id)));

    PM.drawer({
      title: `${u.cnDate(date)} 周${u.weekday(date)}`,
      body: `
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3>🏋️ 训练</h3><div class="right">
            <button class="btn xs primary" data-a="w-add">+ 打卡</button></div></div>
          <div class="list" style="margin-top:10px">
            ${F.sortWorkouts(ws).map(w => {
              return `<div class="li"><span class="avatar-emoji">${F.TYPE_ICON[w.type] || ''}</span>
              <div class="li-main"><div class="li-title">${F.wTimeHTML(w)}${u.esc(w.title || w.type)} ✓</div>
              <div class="li-sub">${w.duration_min || 0} 分钟 · 完成度 ${w.completion || 0}%</div></div>
              <button class="btn xs" data-a="w-edit" data-id="${w.id}">编辑</button>
              <button class="btn xs danger" data-a="w-del" data-id="${w.id}">删</button></div>`;
            }).join('') ||
              '<div class="small muted">当日无训练记录</div>'}
          </div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3>⚖️ 体测</h3><div class="right">
            <button class="btn xs primary" data-a="b-add">+ 记录</button></div></div>
          ${bs.map(b => `<div class="li"><div class="li-main">
            <div class="li-title">${b.weight ? b.weight + ' 斤' : '—'} ${b.body_fat ? '· 体脂 ' + b.body_fat + '%' : ''}</div>
            <div class="li-sub">${u.esc(b.time || '')} ${[
              b.metabolism ? '代谢 ' + b.metabolism + ' kcal' : '',
              b.whr ? '腰臀比 ' + b.whr : '',
              b.visceral_fat ? '内脂 ' + b.visceral_fat : '',
              u.esc(b.note || ''),
            ].filter(Boolean).join(' · ')}</div></div>
            <button class="btn xs" data-a="b-edit" data-id="${b.id}">编辑</button></div>`).join('') ||
            '<div class="small muted">当日无体测数据</div>'}
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3>✅ 待办</h3><div class="right">
            <button class="btn xs primary" data-a="t-add">+ 待办</button></div></div>
          <div class="list">
            ${todos.map(r => `<div class="li ${r.done === '1' ? 'done' : ''}">
              <div class="check ${r.done === '1' ? 'on' : ''}" data-a="t-toggle" data-id="${r.id}">✓</div>
              <div class="li-main"><div class="li-title">${u.esc(r.title)}</div>
              <div class="li-sub">${u.esc(r.time || '全天')}</div></div></div>`).join('') ||
              '<div class="small muted">当日无待办</div>'}
          </div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3>📚 单词任务</h3><div class="right">
            ${E.planPanel ? '<button class="btn xs" data-a="v-plan">计划安排</button>' : ''}</div></div>
          <div class="list">
            ${dayVocab.map(t => {
              const p = vplans.find(x => String(x.id) === String(t.plan_id));
              const done = t.done === '1';
              return `<div class="li vt-li ${done ? 'done' : ''}">
                <div class="check ${done ? 'on' : ''}" data-a="v-toggle" data-id="${t.id}">✓</div>
                <div class="li-main">
                  <div class="li-title">${u.esc(t.title || '背词')} <span class="vt-n">${t.count || 0} 个</span></div>
                  <div class="li-sub">${u.esc((p && p.name) || '背词计划')} · ${u.esc(t.mode === 'new' ? '学新词' : t.mode === 'review' ? '复习到期' : '混合')}</div>
                </div>
                ${done ? '' : `<button class="btn xs primary" data-a="v-start" data-id="${t.id}">开始背</button>`}
              </div>`;
            }).join('') || '<div class="small muted">当日没有单词任务</div>'}
          </div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3>🎧 听力任务</h3><div class="right">
            ${E.liPlanPanel ? '<button class="btn xs" data-a="l-plan">计划安排</button>' : ''}</div></div>
          <div class="list">
            ${dayListen.map(t => {
              const p = liPlans.find(x => String(x.id) === String(t.plan_id));
              const done = t.done === '1';
              return `<div class="li vt-li ${done ? 'done' : ''}">
                <div class="check ${done ? 'on' : ''}" data-a="l-toggle" data-id="${t.id}">✓</div>
                <div class="li-main">
                  <div class="li-title">${u.esc(t.title || '听力')} <span class="vt-n">${t.count || 0} 段</span></div>
                  <div class="li-sub">${u.esc((p && p.name) || '听力计划')}</div>
                </div>
                ${done ? '' : `<button class="btn xs primary" data-a="l-start" data-id="${t.id}">开始练</button>`}
              </div>`;
            }).join('') || '<div class="small muted">当日没有听力任务</div>'}
          </div>
        </div>
        <div class="card" style="box-shadow:none">
          <div class="card-head"><h3>📖 学习 / 记录</h3></div>
          ${logs.map(l => `<div class="li"><div class="li-main"><div class="li-title">${u.esc(l.title || l.kind)}</div>
            <div class="li-sub">${u.esc(l.kind)} · ${l.count || 0} 项 · ${l.minutes || 0} 分钟</div></div></div>`).join('') ||
            '<div class="small muted">当日无学习记录</div>'}
          ${dayNotes.map(n => `<div class="li"><div class="li-main"><div class="li-title">📝 ${u.esc(n.title || '记录')}</div>
            <div class="li-sub">${u.esc((n.content || '').slice(0, 50))}</div></div></div>`).join('')}
        </div>`,
      onMount(el, close) {
        /* 改完数据怎么刷新：日历页传了回调就原地重绘当前月（不跳回本月），
           其它调用方（今日页小日历）没有回调，退回整页 refresh */
        const done = () => (onChanged ? onChanged() : PM.refresh());
        el.onclick = async e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          const a = b.dataset.a;
          if (a === 'w-add') { if (await F.workoutEditor(date)) { close(); done(); } }
          if (a === 'w-edit') { const w = ws.find(x => x.id === b.dataset.id); if (await F.workoutEditor(date, w)) { close(); done(); } }
          if (a === 'w-del') { if (await PM.confirm('删除该训练记录？')) { await api.remove('workouts', b.dataset.id); close(); done(); } }
          /* 在计划上打卡：记录会挂到该计划，日历里合并成一条 */
          if (a === 'b-add') { if (await F.bodyEditor(date)) { close(); done(); } }
          if (a === 'b-edit') { const x = bs.find(y => y.id === b.dataset.id); if (await F.bodyEditor(date, x)) { close(); done(); } }
          if (a === 't-add') { if (await T.todoEditor(date)) { close(); done(); } }
          if (a === 't-toggle') {
            const r = todos.find(x => x.id === b.dataset.id);
            await api.update('todos', r.id, { done: r.done === '1' ? '0' : '1', done_at: r.done === '1' ? '' : date });
            close(); done();
          }
          /* 背词任务：勾选=直接打卡；「开始背」=进闪卡，做完自动打卡 */
          if (a === 'v-toggle') {
            const t = dayVocab.find(x => x.id === b.dataset.id);
            const to = t.done === '1' ? '0' : '1';
            await api.update('vocab_tasks', t.id, { done: to, done_at: to === '1' ? date : '' });
            close(); done();
          }
          if (a === 'v-start') {
            const t = dayVocab.find(x => x.id === b.dataset.id);
            if (!E.startTask) return PM.toast('英语模块未启用', 'err');
            close();
            await E.startTask(t, done);
          }
          if (a === 'v-plan') {
            if (!E.planPanel) return PM.toast('英语模块未启用', 'err');
            close();
            await E.planPanel(done);
          }
          /* 听力任务：勾选=直接打卡；「开始练」=进四步训练，练够段数自动打卡 */
          if (a === 'l-toggle') {
            const t = dayListen.find(x => x.id === b.dataset.id);
            const to = t.done === '1' ? '0' : '1';
            await api.update('listen_tasks', t.id, { done: to, done_at: to === '1' ? date : '' });
            close(); done();
          }
          if (a === 'l-start') {
            const t = dayListen.find(x => x.id === b.dataset.id);
            if (!E.liStartTask) return PM.toast('英语模块未启用', 'err');
            close();
            await E.liStartTask(t, done);
          }
          if (a === 'l-plan') {
            if (!E.liPlanPanel) return PM.toast('英语模块未启用', 'err');
            close();
            await E.liPlanPanel(done);
          }
        };
      },
    });
  }
  PM.openDayPanel = openDayPanel;

  /* ---------------- 今日页 ----------------
   * 今日总览 = hero + 体重·体脂 + 月历 + 各模块今日部件。
   * 月历原来单独占一个页签（#/today/calendar），现在合并进来，
   * 老链接仍然可用：渲染完自动滚到日历那一段。
   * ---------------------------------------------------------------- */
  async function viewToday(el) {
    const wantCal = !!(PM.route && PM.route.path === 'calendar');
    const t = u.today();
    const [body, workouts, todos, logs, notes, vocab, vplans, vtasks, liPlans, ltasks] = await Promise.all([
      api.list('body_metrics', { order_by: 'date' }), api.list('workouts'),
      api.list('todos'), api.list('study_logs'), api.list('notes'), api.list('vocabulary'),
      api.list('vocab_plans'), api.list('vocab_tasks'),
      api.list('listen_plans'), api.list('listen_tasks'),
    ]);
    /* 今日的背词任务也进「今日安排」，跟日历保持一致（暂停的计划不显示） */
    const vOn = new Set(vplans.filter(p => p.active !== '0').map(p => String(p.id)));
    const vocabTasks = vtasks.filter(x => x.date === t && vOn.has(String(x.plan_id)));
    const liOnT = new Set(liPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const listenTasks = ltasks.filter(x => x.date === t && liOnT.has(String(x.plan_id)));
    let weather = PM.weather || { ok: false, desc: '加载中…', forecast: [] };

    const todayBody = body.filter(b => b.date === t);
    const prev = body.length > 1 ? body[body.length - 2] : null;
    /* 体重：优先今天；体脂：今天没有就用最近一次 */
    const lastW = [...body].reverse().find(b => b.weight) || null;
    const hasTodayW = todayBody.length && todayBody[todayBody.length - 1].weight ? true : false;
    const wShow = hasTodayW ? u.num(todayBody[todayBody.length - 1].weight) : (lastW ? u.num(lastW.weight) : null);
    const diff = (hasTodayW && prev) ? (wShow - u.num(prev.weight || 0)) : null;
    const fatRec = [...body].reverse().find(b => b.body_fat) || null;
    const fatVal = fatRec ? u.num(fatRec.body_fat) : null;
    const fatDate = fatRec ? fatRec.date : '';
    const hasTodayFat = todayBody.some(b => b.body_fat);

    const F = PM.modules.find(m => m.id === 'fitness').api;
    const todoRows = todos;

    /* 今天这一天的事项（今日页唯一数据源：hero 的「今天有 N 项」和下方列表都用它）
       体测不进这张列表：右栏「体重 · 体脂」卡片已完整呈现今日体重/体脂/曲线，
       再在「今日安排」里放一条既重复，又会被当成「已完成的待办」划掉。 */
    const dayEv = (buildEvents({ workouts, body, todos, logs, notes, vocabTasks, listenTasks }, { from: t, to: t })[t] || []).filter(x => !x.rec);
    /* 未完成在前（计划优先），已完成沉底，同组按时间排 */
    dayEv.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)
      || ((a.plan && !a.done) ? 0 : 1) - ((b.plan && !b.done) ? 0 : 1)
      || String(a.time || '99').localeCompare(String(b.time || '99')));

    /* 基础代谢 / 腰臀比 / 内脏脂肪：这三项各取最近一次有值的记录
       （体脂秤不是每次都测全，按字段分别回退比按整条记录回退更能显示到数据） */
    /* 基础代谢 / 腰臀比 / 内脏脂肪：这三项各取最近一次有值的记录
       （体脂秤不是每次都测全，按字段分别回退比按整条记录回退更能显示到数据）
       压缩成一行小胶囊，不再占三块卡片的面积 */
    function extraBodyHTML() {
      const cells = [
        { k: 'metabolism', label: '基础代谢', unit: 'kcal' },
        { k: 'whr', label: '腰臀比', unit: '' },
        { k: 'visceral_fat', label: '内脏脂肪', unit: '级' },
      ].map(o => {
        const rec = [...body].reverse().find(b => b[o.k]) || null;
        return `<div class="ms"><span>${o.label}${rec && rec.date !== t ? `<em>${rec.date.slice(5)}</em>` : ''}</span>
          <b>${rec ? u.esc(rec[o.k]) : '—'}${rec && o.unit ? `<i>${o.unit}</i>` : ''}</b></div>`;
      }).join('');
      return `<div class="mini-stats">${cells}</div>`;
    }

    /* 未记录体重的提醒：只在今天没称时出现，附在指标行下面。
       「下一个假期」那行已按需求删掉，不再显示。
       变量别叫 notes：上面已经用它接了随手记的数据。 */
    const noteHTML = !hasTodayW
      ? `<div class="bm-note">⏰ 今天还没记录体重${lastW ? '（上次 ' + lastW.date + '）' : ''}</div>`
      : '';

    el.innerHTML = `
      <div class="hero">
        <div class="clouds" aria-hidden="true"><span>✿</span><span>❋</span><span>✿</span></div>
        <div class="sun" aria-hidden="true"></div>
        <div class="hero-inner">
          <div class="hdate">${u.cnDate(t)}</div>
          <div class="hsub"><span>星期${u.weekday(t)}</span><span id="heroCity">${weather.ok ? u.esc(weather.city) : '天气加载中…'}</span>
            <span id="t-hero-extra">${dayEv.length ? `<a data-act="to-cal" style="cursor:pointer">今天有 ${dayEv.length} 项安排 ↓</a>` : '今天还没安排'}</span></div>
          <div class="hweather" id="heroWeather">${weatherHTML(weather)}</div>
          <div class="tip dress" id="dressTip">${dressAdvice(weather)}</div>
        </div>
        <div class="mascot" aria-hidden="true">${PM.MASCOT_SVG}</div>
        <div class="grass" aria-hidden="true"></div>
      </div>

      <div class="card body-mini">
        <div class="card-head"><h3>体重 · 体脂</h3><div class="right">
          <a class="small" href="#/fitness">训练与体测 →</a>
          <button class="btn xs primary" data-act="add-body">+ 记录</button></div></div>
        <div class="body-row">
          <div class="bp bp-w">
            <div class="bp-k">体重</div>
            <div class="bp-v">${wShow != null ? wShow : '—'}<small>斤</small></div>
            <div class="bp-d">${hasTodayW ? `今日 ${todayBody.length} 次${diff != null ? ' · ' + (diff > 0 ? '+' : '') + diff.toFixed(1) + ' 斤' : ''}` : (lastW ? '最近 ' + lastW.date : '暂无记录')}</div>
          </div>
          <div class="bp bp-f">
            <div class="bp-k">体脂率</div>
            <div class="bp-v">${fatVal != null ? fatVal : '—'}<small>%</small></div>
            <div class="bp-d">${fatVal != null ? (hasTodayFat ? '今日记录' : '最近 ' + fatDate) : '暂无记录'}</div>
          </div>
        </div>
        ${extraBodyHTML()}
        ${noteHTML}
      </div>

      <div class="today-cols">
        <div id="calSection" class="cal-section"></div>
        <div class="grid g2" id="widgets"></div>
      </div>`;

    /* 今日体重录入 */
    el.querySelector('[data-act=add-body]').onclick = async () => {
      if (await F.bodyEditor(t)) PM.refresh();
    };

    /* hero 里的「今天有 N 项安排 ↓」：滚到下面这一段日历 */
    const toCalBtn = el.querySelector('[data-act=to-cal]');
    if (toCalBtn) toCalBtn.onclick = scrollToCal;

    /* 汇总各模块今日部件 */
    async function paintWidgets() {
      const widgets = el.querySelector('#widgets');
      if (!widgets) return;
      widgets.innerHTML = '';
      const parts = [];
      PM.modules.forEach(m => (m.today || []).forEach(w => parts.push({ mod: m, w })));
      parts.sort((a, b) => (a.w.order || 99) - (b.w.order || 99));
      for (const p of parts) {
        const holder = u.el('<div></div>');
        widgets.appendChild(holder);
        try { await p.w.render(holder); } catch (e) { holder.innerHTML = `<div class="empty small">${u.esc(p.mod.name)} 加载失败</div>`; console.error(e); }
      }
    }

    /* 日历挂到「体重 · 体脂」卡片下面；日历里改了数据要顺带重画下方部件 */
    const calHost = el.querySelector('#calSection');
    const calP = mountCalendar(calHost, { onChanged: paintWidgets }).catch(e => {
      calHost.innerHTML = '<div class="empty small">日历加载失败</div>';
      console.error(e);
    });
    await paintWidgets();
    await calP;

    /* 老链接 #/today/calendar：渲染完滚到日历 */
    if (wantCal) setTimeout(scrollToCal, 80);

    /* 天气异步补齐，不阻塞首屏 */
    if (!weather.ok) PM.loadWeather().then(w => paintWeather(w));

    function scrollToCal() {
      const s = el.querySelector('#calSection');
      if (!s) return;
      const top = s.getBoundingClientRect().top + window.scrollY - (window.innerWidth <= 720 ? 62 : 74);
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  /* 天气：只展示温度 + 是否下雨（去掉湿度/风速/预报） */
  function weatherHTML(w) {
    if (!w || !w.ok) return '<div class="hw"><b>—</b><span>天气加载中</span></div>';
    const rain = w.rain, snow = w.snow;
    const icon = rain ? '🌧' : (snow ? '❄️' : '☀️');
    const label = rain ? '有雨 · 带伞' : (snow ? '有雪' : '无雨');
    return `
      <div class="hw"><b>${w.temp != null ? Math.round(w.temp) + '°' : '—'}</b><span>${u.esc(w.desc || '')}</span></div>
      <div class="hw ${rain ? 'wet' : ''}"><b>${icon}</b><span>${label}</span></div>`;
  }

  /* 穿衣建议：按体感温度 + 风力给厚度提示 */
  function dressAdvice(w) {
    if (!w || !w.ok) return '天气数据加载中…';
    const f = (w.feels != null ? w.feels : w.temp) || 0;
    const wind = w.wind || 0;
    let layer;
    if (f >= 29) layer = '短袖短裤，注意防晒';
    else if (f >= 25) layer = '短袖，早晚可加件薄外套';
    else if (f >= 21) layer = '薄长袖或 T 恤 + 薄外套';
    else if (f >= 17) layer = '长袖 + 中等厚度外套';
    else if (f >= 12) layer = '长袖 + 毛衣 / 卫衣外套';
    else if (f >= 7) layer = '厚外套 + 保暖内搭';
    else if (f >= 2) layer = '厚羽绒 / 大衣 + 保暖内搭';
    else layer = '加厚羽绒服 + 保暖内搭，注意手脚保暖';
    const extra = [];
    if (wind >= 30) extra.push('风力较大，建议加防风外套');
    else if (wind >= 15) extra.push('有风，可加一件挡风层');
    if (w.rain) extra.push('有雨，记得带伞');
    if (w.snow) extra.push('有雪，注意防滑');
    const feels = (w.feels != null && w.temp != null && Math.abs(w.feels - w.temp) >= 2)
      ? `（体感 ${Math.round(w.feels)}°）` : '';
    return `👕 ${layer}${feels}${extra.length ? '；' + extra.join('，') : ''}`;
  }

  function paintWeather(w) {
    const hw = document.getElementById('heroWeather');
    if (!hw) return;
    hw.innerHTML = weatherHTML(w);
    const tip = document.getElementById('dressTip');
    if (tip) tip.textContent = dressAdvice(w);
    const c = document.getElementById('heroCity');
    if (c) c.textContent = w.ok ? w.city : '天气暂不可用';
  }

  function tipOfDay({ workouts, todos, vocab, t }) {
    const due = vocab.filter(v => v.next_review && v.next_review <= t).length;
    const tw = workouts.filter(w => w.date === t).length;
    /* 待办：截止日已到或已过、还没做完的，都算「今天该处理」 */
    const tApi = (PM.modules.find(m => m.id === 'todo') || {}).api || {};
    const isTd = tApi.isTodo || (r => r.kind !== 'event');
    const td = todos.filter(r => isTd(r) && r.date && r.date <= t && r.done !== '1').length;
    if (due > 0) return `有 ${due} 个单词到了复习时间，趁热打铁完成艾宾浩斯曲线`;
    if (td > 0) return `今天还有 ${td} 项待办，先挑最重要的那件开始`;
    if (tw > 0) return '今天已经完成训练，别忘了补充蛋白质和睡眠';
    return '今天很轻松，读一篇英语短文或记录一件小事吧';
  }

  /* ---------------- 总日历 ----------------
   * 抽成 mountCalendar(host)：今日总览页（体脂体重卡片下面）与老链接
   * #/today/calendar 共用同一份实现，所有 DOM 查询都限定在 host 内。
   * 日历里必须同时看到：日程（跨天连成色带）、待办、健身计划与训练打卡。
   * 「只显示一条」的老毛病来自两处：① 格子里 maxItems 截断；② 跨天日程同格多条互相遮挡。
   * 这里改成「同一天有几条就堆几条」，格子高度随行自动撑开。
   * ---------------------------------------------------------------- */
  async function mountCalendar(host, opts) {
    const onChanged = (opts && opts.onChanged) || null;
    const el = host;
    const t = u.today();
    const [workouts, todos, vocabPlans, allVocabTasks, liPlans, allLiTasks] = await Promise.all([
      api.list('workouts'), api.list('todos'),
      api.list('vocab_plans'), api.list('vocab_tasks'),
      api.list('listen_plans'), api.list('listen_tasks'),
    ]);
    /* 暂停的计划不再往日历里铺；它的任务留着，重新启用就会回来 */
    const onIds = new Set(vocabPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const vocabTasks = allVocabTasks.filter(x => onIds.has(String(x.plan_id)));
    const liOn = new Set(liPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const listenTasks = allLiTasks.filter(x => liOn.has(String(x.plan_id)));

    const mon = u.monthOf(t);
    const cur = { month: mon };
    const rangeOf = mo => {
      const [y, m] = mo.split('-').map(Number);
      return { from: `${mo}-01`, to: `${mo}-${new Date(y, m, 0).getDate()}` };
    };
    /* 哪些月份有内容：用于「< 10 月 >」两侧的提示点 */
    const monthsWithData = new Set([mon]);
    const markMonth = d => { if (d && d.length >= 7) monthsWithData.add(d.slice(0, 7)); };
    todos.forEach(r => { markMonth(r.date); markMonth(r.end_date); });
    workouts.forEach(w => markMonth(w.date));
    vocabTasks.forEach(x => markMonth(x.date));
    listenTasks.forEach(x => markMonth(x.date));

    const DATA = { workouts, todos, vocabTasks, listenTasks };
    const evCache = {};
    /* 只铺「日程 / 待办 / 健身 / 背词任务」四类，体测、学习、随手记不进来 */
    const loadMonth = mo => {
      if (!evCache[mo]) {
        evCache[mo] = buildEvents(Object.assign({ only: ['event', 'todo', 'workout', 'vocab', 'listen'] }, DATA), rangeOf(mo));
      }
      return evCache[mo];
    };
    const markList = (mo, ds) => (loadMonth(mo)[ds] || []).map(x => ({
      text: x.text, done: x.done, span: x.span, color: x.color, icon: x.icon,
      plan: x.plan, kind: x.kind, time: x.time, missed: x.missed,
      planHit: x.planHit, completion: x.completion, planId: x.planId,
      start: x.start, end: x.end, vocabId: x.vocabId, listenId: x.listenId,
    }));

    /* 整张日历是一张卡：顶部条（月份 + 统计 + 翻月 + 月份快跳 + 新增）
       → 图例细条 → 格子区。三段共用同一个圆角外框，不再各带一张玻璃卡。 */
    el.innerHTML = `
      <div class="calpage card">
        <div class="cal-hero">
          <div class="cal-hero-l">
            <div class="cal-mon" id="calTitle"></div>
            <div class="cal-stats" id="calStats"></div>
          </div>
          <div class="right">
            <div class="cal-pager">
              <button class="btn xs" data-mo="-1" title="上个月">‹</button>
              <button class="btn xs" data-mo="0">今天</button>
              <button class="btn xs" data-mo="1" title="下个月">›</button>
            </div>
            <div class="seg" id="moSeg"></div>
            <div class="add-wrap">
              <button class="btn sm primary" data-add>+ 新增</button>
              <div class="add-menu" id="addMenu">
                ${PM.quickAdds().map(p => `<div class="add-it" data-pick="${p.key}"><span>${p.icon}</span><div><b>${p.title}</b><small>${p.sub}</small></div></div>`).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="cal-tools">
          <div class="legend">
            <span><i style="background:${PM.C.todoOpen}"></i>待办</span>
            <span><i style="background:${PM.C.event}"></i>日程</span>
            <span><i style="background:${PM.C.planDone}"></i>训练打卡</span>
            <span><i style="background:${PM.C.studyOpen}"></i>单词 / 听力</span>
            <span class="lg-tip">虚线=未完成 · ✓实心=已完成</span>
          </div>
        </div>
        <div id="bigCal"></div>
      </div>`;

    const calBox = el.querySelector('#bigCal');

    function paintHead(mo) {
      const [y, m] = mo.split('-').map(Number);
      el.querySelector('#calTitle').innerHTML = `${m} 月 <small>${y}</small>`;
      const ev = loadMonth(mo);
      const uniq = {};
      Object.keys(ev).forEach(d => ev[d].forEach(x => {
        if (x.plan && !x.done) return;            // 没打卡的计划不算「完成」
        uniq[x.ref.table === 'todos' ? 't' + x.ref.row.id : x.id] = x;
      }));
      const all = Object.values(uniq);
      const doneN = all.filter(x => x.done).length;
      const days = new Set(Object.keys(ev).filter(d => ev[d].some(x => x.done))).size;
      const planN = Object.keys(ev).reduce((n, d) => n + (ev[d] || []).filter(x => x.kind === 'workout').length, 0);
      el.querySelector('#calStats').innerHTML = `
        <span>共 <b>${all.length}</b> 项</span>
        <span>完成 <b>${doneN}</b></span>
        <span>打卡 <b>${days}</b> 天</span>
        <span>健身 <b>${planN}</b> 次</span>`;
    }

    /* 顶部月份快捷条：以当前月为中心取 5 个月 */
    function paintSeg(mo) {
      const [y, m] = mo.split('-').map(Number);
      const cls = d => (d === mo ? 'on' : '') + (monthsWithData.has(d) ? ' has' : '');
      let h = '';
      for (let k = -2; k <= 2; k++) {
        const d = new Date(y, m - 1 + k, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        h += `<button class="${cls(key)}" data-jump="${key}">${d.getMonth() + 1} 月</button>`;
      }
      el.querySelector('#moSeg').innerHTML = h;
    }

    /* 单词任务一键打卡。
       就地重绘当前月，不能用 PM.refresh()：那会重跑 mountCalendar 的 build(mon)，
       把用户正翻看的月份一下弹回本月。 */
    async function toggleVocab(x) {
      const t = vocabTasks.find(v => String(v.id) === String(x.vocabId));
      if (!t) return;
      const to = t.done === '1' ? '0' : '1';
      try {
        await api.update('vocab_tasks', t.id, { done: to, done_at: to === '1' ? u.today() : '' });
      } catch (e) { return PM.toast('打卡失败', 'err'); }
      t.done = to; t.done_at = to === '1' ? u.today() : '';
      delete evCache[cur.month];        // 事件是按 DATA 现算的，改完要清缓存再重画
      build(cur.month);
      onChanged && onChanged();         // 合并进今日页后：顺带刷新下方「今日安排 / 进行学习」
      PM.toast(to === '1' ? '已打卡 ✅ 再点一次可撤销' : '已取消打卡');
    }

    /* 听力任务一键打卡（同 toggleVocab：原地重绘，不弹回本月） */
    async function toggleListen(x) {
      const t = listenTasks.find(v => String(v.id) === String(x.listenId));
      if (!t) return;
      const to = t.done === '1' ? '0' : '1';
      try {
        await api.update('listen_tasks', t.id, { done: to, done_at: to === '1' ? u.today() : '' });
      } catch (e) { return PM.toast('打卡失败', 'err'); }
      t.done = to; t.done_at = to === '1' ? u.today() : '';
      delete evCache[cur.month];
      build(cur.month);
      onChanged && onChanged();
      PM.toast(to === '1' ? '已打卡 ✅ 再点一次可撤销' : '已取消打卡');
    }

    /* 抽屉里改完数据：日历就地重画（不弹回本月），并通知外层 */
    function afterEdit() {
      delete evCache[cur.month];
      build(cur.month);
      onChanged && onChanged();
    }

    let calEl = null;
    function build(mo) {
      calEl = PM.calendar({
        month: mo,
        maxItems: 99,                 // 不再截断：一天有几条就显示几条
        getMarks: ds => markList(mo, ds),
        onMonth: m2 => { cur.month = m2; build(m2); paintHead(m2); paintSeg(m2); },
        onDay: ds => openDayPanel(ds, afterEdit),
        /* 条目级点击：所有类型一律打开当天右侧详情，在详情里按需打卡，
           避免点到任务条就直接打卡造成误操作 */
        onItem: (x, ds) => openDayPanel(ds, afterEdit),
      });
      calBox.innerHTML = '';
      calBox.appendChild(calEl);
      paintHead(mo); paintSeg(mo);
    }
    build(mon);

    /* 顶部月份条 / 上个月 / 回到本月 / 下个月 */
    el.querySelector('#moSeg').onclick = e => {
      const b = e.target.closest('[data-jump]'); if (!b) return;
      build(b.dataset.jump);
    };
    /* 翻月一律以「当前显示中的月份」为准（标题里读），
       不要读 cur.month —— 日历内部的 ‹ › 不会回写它，会越翻越错位 */
    const shownMonth = () => {
      const mm = (el.querySelector('#calTitle').textContent || '').match(/(\d+)\s*月\s*(\d{4})/);
      return mm ? `${mm[2]}-${String(mm[1]).padStart(2, '0')}` : cur.month;
    };
    el.querySelectorAll('.cal-pager [data-mo]').forEach(b => b.onclick = () => {
      const delta = +b.dataset.mo;
      if (delta === 0) { cur.month = mon; return build(mon); }
      const [y, m] = shownMonth().split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      cur.month = key;
      build(key);
    });

    /* ---------- 新增：日程 / 健身计划 / 打卡 / 体测 ---------- */
    const addWrap = el.querySelector('.add-wrap');
    const addMenu = el.querySelector('#addMenu');
    const closeMenu = () => addWrap.classList.remove('open');
    document.addEventListener('click', closeMenu);

    /* 新建默认落到「正在看的月份」：本月就是今天，其它月就是 1 号 */
    function seedDate() {
      return cur.month === mon ? t : `${cur.month}-01`;
    }
    const PICKS = PM.quickAdds();
    async function runPick(kind) {
      const p = PICKS.find(x => x.key === kind); if (!p) return;
      const ok = await p.run(seedDate());
      if (ok) PM.refresh();
    }

    el.querySelector('[data-add]').onclick = e => {
      e.stopPropagation();
      if (window.matchMedia('(max-width:720px)').matches) {
        PM.modal({
          title: '新增',
          body: `<div class="pick-list">${PICKS.map(p => `<div class="add-it" data-pick="${p.key}">
            <span>${p.icon}</span><div><b>${p.title}</b><small>${p.sub}</small></div></div>`).join('')}</div>`,
          onMount(el2, close) {
            el2.querySelector('.pick-list').onclick = async ev => {
              const it = ev.target.closest('[data-pick]'); if (!it) return;
              close();
              await runPick(it.dataset.pick);
            };
          },
        });
        return;
      }
      addWrap.classList.toggle('open');
    };
    addMenu.onclick = async e => {
      const it = e.target.closest('[data-pick]'); if (!it) return;
      e.stopPropagation();
      closeMenu();
      await runPick(it.dataset.pick);
    };
  }

  /* 待办/日程是否与某个月份有交集（日历页按月取数时用）。日程看区间（跨月也算），待办只看那一天 */
  function coversInMonth(r, mon) {
    if (!r.date) return false;
    const isEv = (PM.modules.find(m => m.id === 'todo') || {}).api?.isEvent;
    const ev = isEv ? isEv(r) : (r.kind === 'event');
    /* 真实月末：2 月是 28/29 天，不能用 '-31' 做字符串比较糊弄 */
    const [y, m] = mon.split('-').map(Number);
    const mStart = `${mon}-01`, mEnd = `${mon}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    if (!ev) return r.date >= mStart && r.date <= mEnd;
    const end = r.end_date || r.date;
    return r.date <= mEnd && end >= mStart;
  }

  PM.registerModule({
    id: 'today',
    name: '今日',
    icon: PM.icon('home'),
    group: '概览',
    /* flatTop：本模块的每个 nav 项都是「一级菜单」（今日总览、日历），
       不参与分组折叠；手机底栏也直接铺成两个一级入口。 */
    flatTop: true,
    /* 日历已并进「今日总览」，菜单里不再单列；
       路由 calendar 保留着，老书签 #/today/calendar 仍能打开并滚到日历那一段 */
    nav: [{ label: '今日总览', path: '', icon: PM.icon('home') }],
    routes: { '': viewToday, calendar: viewToday },
    pageTitle: '今日总览',
    /* 日历页的「+ 新增」需要直接调起编辑器 */
  });
})();
