/* ===========================================================
 * 事务模块：待办 / 日程 / 提醒
 * 表：todos
 * =========================================================== */
(function () {
  const { u, api } = PM;
  const PRIO = { '3': '高', '2': '中', '1': '低' };
  const PRIO_CLS = { '3': 'red', '2': 'orange', '1': '' };
  const REPEATS = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月', custom: '自定义星期' };

  /* ------------------------------------------------------------------
   * 待办 vs 日程
   * 待办(todo)  = 要完成的事。时间只是「最晚提醒 / 截止」，未完成就全部列出，不受日期限制。
   * 日程(event) = 某天（或某几天）要做的事。只在当天展示，可跨天。
   * 类型以 kind 字段为准；旧数据没这个字段时按「有没有跨天区间」兜底。
   * ---------------------------------------------------------------- */
  const kindOf = r => r.kind || (r.end_date && r.date && r.end_date > r.date ? 'event' : 'todo');
  const isEvent = r => kindOf(r) === 'event';
  const isTodo = r => kindOf(r) !== 'event';

  /* 是否为跨天日程（日程且有结束日期且晚于开始日期） */
  const isSpan = r => isEvent(r) && !!(r.end_date && r.date && r.end_date > r.date);

  /* 某天是否落在这条记录的「有效范围」里。
     日程：区间内的每一天都算（旅行中途也算在旅行）；
     待办：不按区间看，只在截止日及之后算「该做了」，之前不占日历格子。 */
  const covers = (r, ds) => isEvent(r)
    ? (!!r.date && ds >= r.date && ds <= (r.end_date || r.date))
    : (!!r.date && ds >= r.date);

  /* 日期范围文案：跨天只写首尾日期，不再附加「N 天」——数字在清单里没信息量 */
  const rangeText = r => {
    if (!r.date) return '无日期';
    if (!isSpan(r)) return u.relDate(r.date);
    return `${r.date.slice(5)} → ${r.end_date.slice(5)}`;
  };

  /* 待办紧迫度分组：逾期(0) > 今天(1) > 以后(2) > 没设日期(3) */
  function urgencyKey(r, t) {
    const d = r.date || '';
    if (!d) return 3;
    if (d < t) return 0;
    if (d === t) return 1;
    return 2;
  }
  const URGENCY_LABEL = ['逾期', '今天', '以后', '随时可做'];

  /* 逾期天数（正数=已过期多少天，未逾期返回 0） */
  const overdueDays = (r, t) => {
    if (!r.date || r.date >= t) return 0;
    return Math.round((u.parse(t) - u.parse(r.date)) / 86400000);
  };


  async function todoEditor(date, todo, preset) {
    return new Promise(resolve => {
      const t = todo || {};
      /* preset：从「+ 加日程」之类入口进来时预置初始值（不是一条已存在的记录） */
      const kind0 = todo ? kindOf(t) : ((preset && preset.kind) || 'todo');
      PM.modal({
        title: todo ? '编辑' : '新建',
        body: `
          <div class="seg" id="kindSeg" style="margin-bottom:16px">
            <button type="button" data-kind="todo" class="${kind0 === 'todo' ? 'on' : ''}">待办</button>
            <button type="button" data-kind="event" class="${kind0 === 'event' ? 'on' : ''}">日程</button>
          </div>
          <div class="small muted" id="kindHint" style="margin:-8px 0 14px">${
            kind0 === 'event'
              ? '日程：某天要做的事，只在当天显示。跨天的会连贯标在日历上，比如 12-05 → 12-12 去北海道。'
              : '待办：要完成的事，未完成的会一直留在清单里。日期只是「最晚什么时候做完」，方便提前准备。'
          }</div>
          <input type="hidden" name="kind" value="${kind0}">
          <div class="field"><label>标题</label><input class="input" name="title" placeholder="要做什么？" value="${u.esc(t.title || '')}"></div>

          <div class="f3" id="rowDates">
            <div class="field"><label id="lbDate">${kind0 === 'event' ? '开始日期' : '截止日期'}</label>
              <input class="input" type="date" name="date" value="${u.esc(t.date || (kind0 === 'event' ? date : ''))}"></div>
            <div class="field" id="fEnd" style="display:${kind0 === 'event' ? '' : 'none'}"><label>结束日期（可选）</label>
              <input class="input" type="date" name="end_date" value="${u.esc(t.end_date || '')}"></div>
            <div class="field"><label id="lbTime">${kind0 === 'event' ? '时间' : '截止时间'}（可选）</label>
              <input class="input" type="time" name="time" value="${u.esc(t.time || '')}"></div>
          </div>

          <div class="f2" id="rowTodoOnly" style="display:${kind0 === 'event' ? 'none' : ''}">
            <div class="field"><label>优先级</label><select class="input" name="priority">
              ${Object.keys(PRIO).reverse().map(k => `<option value="${k}" ${String(t.priority || '2') === k ? 'selected' : ''}>${PRIO[k]}</option>`).join('')}
            </select></div>
            <div class="field"><label>重复</label><select class="input" id="repSel">
              ${Object.keys(REPEATS).map(k => `<option value="${k}" ${(t.repeat || 'none') === k ? 'selected' : ''}>${REPEATS[k]}</option>`).join('')}
            </select></div>
          </div>
          <input type="hidden" name="repeat" id="repHidden" value="${u.esc(t.repeat || 'none')}">
          <div class="field" id="customDays" style="display:${t.repeat === 'custom' && kind0 !== 'event' ? 'grid' : 'none'}">
            <label>选择星期</label>
            <div class="weekday-pick" id="rpPick">
              ${['一', '二', '三', '四', '五', '六', '日'].map((d, i) =>
                `<div class="wd ${String(t.repeat_days || '').split(',').includes(String(i + 1)) ? 'on' : ''}" data-wd="${i + 1}">${d}</div>`).join('')}
            </div>
            <input type="hidden" name="repeat_days" value="${u.esc(t.repeat_days || '')}">
          </div>
          <div class="f2">
            <div class="field"><label>标签</label><input class="input" name="tag" placeholder="工作 / 生活 / 学习" value="${u.esc(t.tag || '')}"></div>
            <div class="field"><label>备注</label><input class="input" name="note" value="${u.esc(t.note || '')}"></div>
          </div>`,
        foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
        onMount(el, close) {
          const kindIn = el.querySelector('[name=kind]');
          const hint = el.querySelector('#kindHint');

          /* 类型切换：待办 → 只有截止日期；日程 → 起止区间、无优先级无重复 */
          const applyKind = k => {
            kindIn.value = k;
            el.querySelectorAll('#kindSeg button').forEach(b => b.classList.toggle('on', b.dataset.kind === k));
            el.querySelector('#fEnd').style.display = k === 'event' ? '' : 'none';
            el.querySelector('#rowTodoOnly').style.display = k === 'event' ? 'none' : '';
            el.querySelector('#lbDate').textContent = k === 'event' ? '开始日期' : '截止日期';
            el.querySelector('#lbTime').textContent = (k === 'event' ? '时间' : '截止时间') + '（可选）';
            if (k === 'event') el.querySelector('#customDays').style.display = 'none';
            else if (el.querySelector('#repSel') && el.querySelector('#repSel').value === 'custom') el.querySelector('#customDays').style.display = 'grid';
            hint.textContent = k === 'event'
              ? '日程：某天要做的事，只在当天显示。跨天的会连贯标在日历上，比如 12-05 → 12-12 去北海道。'
              : '待办：要完成的事，未完成的会一直留在清单里。日期只是「最晚什么时候做完」，方便提前准备。';
            /* 切到日程时补一个日期（否则会存成无日期日程，日历上看不见）；
               切回待办不清空用户已经填的日期，只在他没填时保持空白 */
            const dI = el.querySelector('[name=date]');
            if (k === 'event' && !dI.value) dI.value = date;
            el.querySelector('[name=end_date]').min = dI.value || '';
          };
          el.querySelector('#kindSeg').onclick = e => {
            const b = e.target.closest('[data-kind]'); if (!b) return;
            applyKind(b.dataset.kind);
          };

          const repSel = el.querySelector('#repSel');
          if (repSel) repSel.onchange = e => {
            el.querySelector('#repHidden').value = e.target.value;
            el.querySelector('#customDays').style.display = e.target.value === 'custom' ? 'grid' : 'none';
          };

          const pick = el.querySelector('#rpPick');
          pick.onclick = e => {
            const w = e.target.closest('.wd'); if (!w) return;
            w.classList.toggle('on');
            el.querySelector('[name=repeat_days]').value = [...pick.querySelectorAll('.wd.on')].map(x => x.dataset.wd).join(',');
          };

          /* 结束日期不能早于开始日期 */
          const dIn = el.querySelector('[name=date]'), eIn = el.querySelector('[name=end_date]');
          dIn.onchange = () => { eIn.min = dIn.value; if (eIn.value && eIn.value < dIn.value) eIn.value = dIn.value; };
          if (dIn.value) eIn.min = dIn.value;

          el.querySelector('[data-save]').onclick = async () => {
            const d = PM.formData(el);
            if (!d.title || !d.title.trim()) return PM.toast('请填写标题', 'err');
            const isEv = d.kind === 'event';
            if (isEv) {
              /* 日程：不必填开始日期（就是「哪天」），结束日期必须 >= 开始 */
              if (d.end_date && d.date && d.end_date < d.date) return PM.toast('结束日期不能早于开始日期', 'err');
              if (!d.end_date || d.end_date === d.date) d.end_date = '';
              /* 日程没有优先级/重复概念，清掉，避免残留旧值影响排序 */
              d.priority = '';
              d.repeat = 'none';
              d.repeat_days = '';
            } else {
              d.end_date = '';
              /* 截止日期可以不填 → 表示「随时可做」 */
              d.repeat = d.repeat || 'none';
            }
            try {
              if (todo) await api.update('todos', todo.id, d);
              else await api.create('todos', { ...d, done: '0', done_at: '' });
              PM.toast('已保存'); resolve(true); close();
            } catch (e) { PM.toast(e.message, 'err'); }
          };
        },
        onClose() { resolve(false); },
      });
    });
  }

  /* 重复待办：把已到期的重复项生成今日实例 */
  async function materialize() {
    const t = u.today();
    const rows = await api.list('todos');
    const changed = [];
    for (const r of rows) {
      if (r.done !== '1') continue;
      if (isEvent(r)) continue;           /* 日程不参与重复生成 */
      if (!r.repeat || r.repeat === 'none') continue;
      if (r.date === t) continue;
      // 已完成且日期已过 → 生成下一次
      let nd = null;
      if (r.repeat === 'daily') nd = u.addDays(r.date, 1);
      if (r.repeat === 'weekly') nd = u.addDays(r.date, 7);
      if (r.repeat === 'monthly') { const d = u.parse(r.date); d.setMonth(d.getMonth() + 1); nd = u.ymd(d); }
      if (r.repeat === 'custom') {
        const days = String(r.repeat_days || '').split(',').map(Number).filter(Boolean);
        for (let i = 1; i <= 8; i++) {
          const c = u.addDays(r.date, i);
          if (days.includes(u.weekIndex(c) === 0 ? 7 : u.weekIndex(c))) { nd = c; break; }
        }
      }
      if (nd && nd <= t) {
        await api.create('todos', {
          title: r.title, kind: 'todo', date: nd, time: r.time, priority: r.priority,
          repeat: r.repeat, repeat_days: r.repeat_days, tag: r.tag, note: r.note, done: '0',
        });
        await api.update('todos', r.id, { repeat_done: '1' });
        changed.push(r.id);
      }
    }
    return changed;
  }


  /* ------------------------------------------------------------------
   * 事务主页：左边今日日程，右边待办清单（网页端左右，手机端上下）
   * 待办 = 要完成的事，未完成的全部列出，按紧迫度分组
   * 日程 = 只看今天这一天
   * ---------------------------------------------------------------- */
  async function viewMain(el, q) {
    await materialize();
    const t = u.today();
    const rows = await api.list('todos');

    /* ---- 左侧：日程按时间线全量铺开 ----
       老问题：只显示「今天 + 7 天内」，更远的日程彻底看不到，已完成的也直接消失。
       现在按「正在进行 → 今天 → 7 天内 → 更远 → 已过去 → 已完成」分组，
       每组只在非空时渲染，未完成和已完成都不再藏起来。 */
    const allEvents = rows.filter(r => isEvent(r));
    const evOpen = allEvents.filter(r => r.done !== '1');
    const byStart = (a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
    const evSort = list => list.slice().sort(byStart);
    const weekEnd = u.addDays(t, 7);

    /* 正在进行：跨天、昨天或更早开始，今天仍在区间内（如旅行中途） */
    const evRunning = evSort(evOpen.filter(r => isSpan(r) && r.date < t && covers(r, t)));
    const runningIds = new Set(evRunning.map(r => r.id));
    /* 今天：区间覆盖今天，且不属上面那组 */
    const evToday = evOpen.filter(r => covers(r, t) && !runningIds.has(r.id))
      .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
    /* 未来：7 天内 / 7 天之后（后者以前完全不显示） */
    const evSoon = evSort(evOpen.filter(r => r.date > t && r.date <= weekEnd));
    const evLater = evSort(evOpen.filter(r => r.date > weekEnd));
    /* 已过去但没标记完成：区间已在今天之前，仍要看得见，方便补勾或删掉 */
    const evPast = evSort(evOpen.filter(r => !covers(r, t) && (r.end_date || r.date) < t));
    /* 已完成：最近的排前面 */
    const evDone = allEvents.filter(r => r.done === '1').sort((a, b) => byStart(b, a));

    /* ---- 右侧：待办，按紧迫度分组 ---- */
    const todosAll = rows.filter(r => isTodo(r));
    const todoOpen = todosAll.filter(r => r.done !== '1');
    const todoDone = todosAll.filter(r => r.done === '1')
      .sort((a, b) => String(b.done_at || b.date || '').localeCompare(String(a.done_at || a.date || '')));
    const groups = [[], [], [], []];
    todoOpen.forEach(r => groups[urgencyKey(r, t)].push(r));
    groups.forEach(g => g.sort((a, b) =>
      String(a.time || '99:99').localeCompare(String(b.time || '99:99'))
      || String(b.priority || '').localeCompare(String(a.priority || ''))));

    const oneRow = (r, opt) => {
      opt = opt || {};
      const od = overdueDays(r, t);
      const bits = [];
      if (isSpan(r)) {
        bits.push(`${u.esc(r.date.slice(5))} → ${u.esc(r.end_date.slice(5))}`);
      } else if (r.date) {
        /* 未来日程要在日期前带出星期，否则「11-01」看不出是周几。
           已完成的不算逾期——都做完了还标红「逾期 8 天」是自相矛盾的。 */
        const rl = u.relDate(r.date);
        const wd = opt.showWeekday ? ` · 周${u.weekday(r.date)}` : '';
        bits.push((od && r.done !== '1') ? `<b style="color:#C2456F">逾期 ${od} 天</b>` : rl + wd);
      } else {
        bits.push('没设截止');
      }
      if (r.time) bits.push(`${isEvent(r) ? '' : '截止 '}${u.esc(r.time)}`);
      if (r.note) bits.push(u.esc(r.note));
      /* 已完成的补上完成日期：划掉那行如果只有「昨天」会看不出是哪天做的 */
      if (r.done === '1' && r.done_at) bits.push(`完成于 ${u.esc(String(r.done_at).slice(0, 10))}`);
      const showCheck = opt.check !== false;
      /* 今天截止（还没做完）→ 整行高亮，避免它被一堆未来待办淹没 */
      const dueToday = isTodo(r) && r.date === t && r.done !== '1';
      return `<div class="li ${r.done === '1' ? 'done' : ''}${dueToday ? ' due-today' : ''}">
        ${showCheck ? `<div class="check ${r.done === '1' ? 'on' : ''}" data-act="toggle" data-id="${r.id}">✓</div>`
                    : '<div class="ev-dot"></div>'}
        <div class="li-main">
          <div class="li-title">${u.esc(r.title)}
            ${dueToday ? '<span class="tag orange">今天截止</span>' : ''}
            ${r.priority === '3' && !isEvent(r) ? '<span class="tag red">重要</span>' : ''}
            ${isEvent(r) ? '<span class="tag blue">日程</span>' : ''}
            ${r.repeat && r.repeat !== 'none' ? `<span class="tag blue">${REPEATS[r.repeat]}</span>` : ''}
            ${r.tag ? `<span class="tag">${u.esc(r.tag)}</span>` : ''}</div>
          <div class="li-sub">${bits.join(' · ')}</div>
        </div>
        <div class="li-act">
          <button class="btn xs" data-act="edit" data-id="${r.id}">编辑</button>
          <button class="btn xs danger" data-act="del" data-id="${r.id}">删</button>
        </div></div>`;
    };

    const totalOpen = todoOpen.length;
    /* 已完成的默认展开（以前要手动点「展开」才看得到，等于被藏起来了）；
       点「收起」跳 ?done=0 折叠，再点「展开」回到默认。 */
    const doneOpen = q.done !== '0';

    /* 日程分组：按时间线从上到下，已完成垫底。空组不渲染。 */
    const evGroups = [
      { list: evRunning, label: '正在进行' },
      { list: evToday, label: '今天' },
      { list: evSoon, label: '接下来 7 天', weekday: true },
      { list: evLater, label: '更远的日程', weekday: true },
      { list: evPast, label: '已过去 · 未标记完成' },
      { list: evDone, label: '已完成', cls: 'done-group', weekday: true },
    ];
    const evHTML = evGroups
      .filter(g => g.list.length)
      .map(g => `<div class="li-group ${g.cls || ''}"><span>${g.label}</span><i class="n">${g.list.length}</i></div>
        <div class="list">${g.list.map(r => oneRow(r, { check: false, showWeekday: g.weekday })).join('')}</div>`)
      .join('');

    el.innerHTML = `
      <div class="todo-split">
        <!-- 日程：今天 + 以后 + 已完成，全部列出 -->
        <div class="card fit">
          <div class="card-head"><h3>日程</h3>
            <div class="sub">${allEvents.length ? `共 ${allEvents.length} 条 · 未完成 ${evOpen.length}` : '还没有日程'}</div>
            <div class="right"><button class="btn sm primary" data-act="new-event">+ 加日程</button></div></div>
          ${evHTML || '<div class="empty" style="padding:26px 6px"><span class="big">📆</span>还没有日程，点右上「+ 加日程」</div>'}
          <div class="split-fill"></div>
          <div class="row" style="margin-top:12px">
            <span class="small muted">按日期由近到远 · 已完成在最后</span>
            <div class="spacer"></div>
            <a class="small" href="#/today/calendar">打开日历 →</a>
          </div>
        </div>

        <!-- 待办清单 -->
        <div class="card fit">
          <div class="card-head"><h3>待办清单</h3>
            <div class="sub">${totalOpen ? `还有 ${totalOpen} 项没做完` : '全部搞定 ✿'}</div>
            <div class="right"><button class="btn sm primary" data-act="new">+ 新建待办</button>
              <button class="btn sm notify-btn" data-act="notify" title="浏览器提醒">🔔</button></div></div>
          ${totalOpen ? groups.map((g, i) => g.length ? `
            <div class="li-group ${i === 0 ? 'overdue' : ''}"><span>${URGENCY_LABEL[i]}</span><i class="n">${g.length}</i></div>
            <div class="list">${g.map(r => oneRow(r)).join('')}</div>` : '').join('')
            : '<div class="empty" style="padding:30px 10px"><span class="big">🎉</span>待办都清空了，休息一下</div>'}
          ${todoDone.length ? `
            <div class="li-group done-group"><span>已完成</span><i class="n">${todoDone.length}</i>
              <button class="btn xs" data-act="toggle-done" style="margin-left:auto">${doneOpen ? '收起' : '展开'}</button></div>
            ${doneOpen ? `<div class="list">${todoDone.map(r => oneRow(r)).join('')}</div>` : ''}` : ''}
          <div class="split-fill"></div>
          <div class="row" style="margin-top:12px">
            <span class="small muted">${totalOpen ? '按截止时间由近到远排列' : '今天可以什么都不做'}</span>
          </div>
        </div>
      </div>`;

    el.onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'new') { if (await todoEditor(t)) PM.refresh(); }
      if (a === 'new-event') { if (await todoEditor(t, null, { kind: 'event' })) PM.refresh(); }
      /* 默认展开 → 点一次收起（?done=0），再点回到默认展开 */
      if (a === 'toggle-done') { PM.go('#/todo' + (q.done === '0' ? '' : '?done=0')); return; }
      if (a === 'edit') {
        const r = rows.find(x => x.id === b.dataset.id);
        if (await todoEditor(r.date, r)) PM.refresh();
      }
      if (a === 'toggle') {
        const r = rows.find(x => x.id === b.dataset.id);
        await api.update('todos', r.id, { done: r.done === '1' ? '0' : '1', done_at: r.done === '1' ? '' : u.today() });
        if (r.done !== '1') PM.celebrate(['✅', '🎉', '👏', '✨']);
        PM.refresh();
      }
      if (a === 'del') { if (await PM.confirm('删除这一条？')) { await api.remove('todos', b.dataset.id); PM.refresh(); } }
      if (a === 'notify') requestNotify();
    };
  }

  async function requestNotify() {
    if (!('Notification' in window)) return PM.toast('当前浏览器不支持桌面通知', 'err');
    const p = await Notification.requestPermission();
    PM.toast(p === 'granted' ? '提醒已开启' : '未授权通知权限');
    if (p === 'granted') checkRemind();
  }

  async function checkRemind() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const t = u.today();
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const rows = await api.list('todos');
    rows.filter(r => covers(r, t) && r.time && r.done !== '1' && r.time === hm)
      .forEach(r => new Notification('待办提醒', { body: `${r.time} ${r.title}`, icon: '/favicon.ico' }));
  }
  setInterval(checkRemind, 60000);

  async function todayWidget(box) {
    const t = u.today();
    const rows = await api.list('todos');
    /* 今日子件分两块：今天要做的日程 + 待办里最紧迫的几条（含逾期） */
    const evs = rows.filter(r => isEvent(r) && covers(r, t) && r.done !== '1')
      .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
    const pend = rows.filter(r => isTodo(r) && r.done !== '1')
      .sort((a, b) => urgencyKey(a, t) - urgencyKey(b, t)
        || String(a.time || '99:99').localeCompare(String(b.time || '99:99'))
        || String(b.priority || '').localeCompare(String(a.priority || '')));
    const over = pend.filter(r => overdueDays(r, t) > 0).length;
    const tagCls = over ? 'red' : (pend.length ? 'orange' : 'green');
    const tagTxt = over ? `${over} 项逾期` : (pend.length ? `${pend.length} 项待办` : '全部完成');

    box.appendChild(u.el(`<div class="widget">
      <div class="widget-head"><h4>✅ 今日待办</h4><div class="right">
        <span class="tag ${tagCls}">${tagTxt}</span></div></div>
      <div class="widget-body">
        ${evs.length ? `<div class="li-group"><span>日程</span><i class="n">${evs.length}</i></div>
        <div class="list">${evs.slice(0, 3).map(r => `<div class="li ti ti-ev">
          <span class="ti-bar"></span>
          <div class="li-main"><div class="li-title">${u.esc(r.title)}</div>
            <div class="li-sub">${isSpan(r) ? '📆 ' + rangeText(r) : '当天'}</div></div>
          <span class="ti-pill time">${r.time ? u.esc(r.time) : '全天'}</span></div>`).join('')}</div>` : ''}
        ${pend.length ? `<div class="li-group" style="margin-top:13px"><span>待办</span><i class="n">${pend.length}</i></div>
        <div class="list">${pend.slice(0, 4).map(r => {
          const od = overdueDays(r, t);
          const due = isTodo(r) && r.date === t;
          const pill = od ? `<span class="ti-pill warn">逾期 ${od} 天</span>`
            : (due ? '<span class="ti-pill today">今天截止</span>' : (r.date ? `<span class="ti-pill">${u.esc(u.relDate(r.date))}</span>` : ''));
          return `<div class="li ti${od ? ' ti-od' : ''}">
            <span class="ti-bar"></span>
            <div class="check" data-todo="${r.id}">✓</div>
            <div class="li-main"><div class="li-title">${u.esc(r.title)}</div>
              <div class="li-sub">${r.tag ? u.esc(r.tag) : (due ? '今天要完成' : '未设截止')}</div></div>
            ${pill}</div>`;
        }).join('')}</div>` : ''}
        ${!evs.length && !pend.length ? '<div class="small muted">今天没有安排，添加一条吧</div>' : ''}
        <div class="row" style="margin-top:10px">
          <button class="btn sm primary" data-act="new">+ 添加待办</button>
          <div class="spacer"></div><a class="small" href="#/todo">全部 →</a>
        </div>
      </div></div>`));
    box.querySelector('[data-act=new]').onclick = async () => { if (await todoEditor(t)) PM.refresh(); };
    box.onclick = async e => {
      const c = e.target.closest('[data-todo]'); if (!c) return;
      const r = rows.find(x => x.id === c.dataset.todo); if (!r) return;
      await api.update('todos', r.id, { done: '1', done_at: t });
      PM.celebrate(['✅', '🎉', '👏', '✨']);
      PM.refresh();
    };
  }

  /* quickAdd 的闭包在模块作用域之外求值，这里显式转发。
     注意签名是 (date, todo)——传一条已有记录就是编辑，传 null 才是新建。 */
  const openTodo = (t) => todoEditor(t, t);

  PM.registerModule({
    id: 'todo',
    name: '事务',
    icon: PM.icon('check'),
    group: '清单',
    nav: [{ label: '待办与日程', path: '', icon: PM.icon('check') }],
    routes: { '': viewMain },
    today: [{ id: 'todo', order: 20, render: todayWidget }],
    quickAdd: [
      { key: 'todo', icon: PM.icon('check'), title: '待办 / 日程', sub: '待办不限日期，日程只看当天', run: openTodo },
    ],
    /* 角标要和页面对得上：待办未完成（全部，含逾期）+ 今天还没做的日程 */
    badge: async () => {
      const t = u.today();
      const rows = await api.list('todos');
      const todoN = rows.filter(r => isTodo(r) && r.done !== '1').length;
      const evN = rows.filter(r => isEvent(r) && covers(r, t) && r.done !== '1').length;
      return todoN + evN;
    },
    api: { todoEditor, materialize, isSpan, isEvent, isTodo, kindOf, covers, rangeText, urgencyKey, overdueDays },
  });
})();
