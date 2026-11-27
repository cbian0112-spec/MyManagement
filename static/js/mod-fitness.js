/* ===========================================================
 * 身体模块：训练计划 + 训练记录 + 体测数据
 * 表：fitness_plans / workouts / body_metrics
 * =========================================================== */
(function () {
  const { u, api } = PM;
  const TYPES = ['力量训练', '有氧', '网球', '游泳', '快走', '跑步', '骑行', '瑜伽拉伸', '其他'];
  const TYPE_ICON = { '力量训练': '🏋️', '有氧': '🫀', '网球': '🎾', '游泳': '🏊', '快走': '🚶', '跑步': '🏃', '骑行': '🚴', '瑜伽拉伸': '🧘', '其他': '🤸' };

  const SET_MAX = 3; // 每个动作固定预留 3 组

  /* 体测表格 / 训练记录的分页状态（模块级：切 tab 不丢，刷新页面才归零） */
  let _bodyPage = 0;
  let _wPage = 0;

  /* ---------- 工具 ---------- */
  function parseItems(s) { try { return JSON.parse(s || '[]'); } catch (e) { return []; } }
  /* 兼容旧数据：老记录只有 "4×10" 这种 sets 字符串，新记录用 groups 数组 */
  function normItem(it) {
    const g = Array.isArray(it.groups) ? it.groups.slice(0, SET_MAX).map(x => x == null ? '' : String(x)) : [];
    while (g.length < SET_MAX) g.push('');
    return Object.assign({}, it, { groups: g });
  }
  function blankItem() { return { name: '', weight: '', groups: Array.from({ length: SET_MAX }, () => ''), done: 100 }; }
  /* 明细摘要：优先用分组次数，无则回退旧的 sets 文案 */
  function itemText(it) {
    const g = (it.groups || []).map(x => String(x || '').trim()).filter(Boolean);
    const parts = [it.name || '', it.weight ? it.weight + 'kg' : '', g.length ? g.join('/') + ' 次' : (it.sets || '')];
    return parts.filter(Boolean).join(' · ');
  }
  /* 训练记录明细：力量训练展示「动作 · 重量 · 每组次数（组数）」，其他类型展示距离/心率/强度 */
  function workoutDetailHTML(w) {
    const items = parseItems(w.items);
    if (!items.length) return '';
    if (w.type === '力量训练') {
      return items.filter(i => (i.name || '').trim()).map(it => {
        const g = (it.groups || []).map(x => String(x || '').trim()).filter(Boolean);
        const parts = [it.name];
        if (it.weight) parts.push(it.weight + 'kg');
        if (g.length) parts.push(g.length + ' 组 · ' + g.join('/') + ' 次');
        else if (it.sets) parts.push(it.sets);
        return `<span class="wd-chip">${u.esc(parts.filter(Boolean).join(' · '))}</span>`;
      }).join('');
    }
    const o = items[0] || {};
    const parts = [];
    if (o.distance) parts.push('距离 ' + o.distance + ' km');
    if (o.hr) parts.push('心率 ' + o.hr);
    if (o.intensity) parts.push('强度 ' + o.intensity);
    items.filter(i => (i.name || '').trim()).forEach(i => {
      const g = (i.groups || []).map(x => String(x || '').trim()).filter(Boolean);
      const p = [i.name];
      if (i.weight) p.push(i.weight + 'kg');
      if (g.length) p.push(g.length + ' 组 · ' + g.join('/') + ' 次');
      else if (i.sets) p.push(i.sets);
      parts.push(p.filter(Boolean).join(' · '));
    });
    return parts.filter(Boolean).map(p => `<span class="wd-chip">${u.esc(p)}</span>`).join('');
  }
  /* 训练记录的「时刻」：优先用记录里的 time 字段，
     老数据没有就退回 created_at（"2026-10-28 17:55:27" → "17:55"），再没有就是空 */
  const wTime = w => String((w && w.time) || '').trim()
    || String((w && w.created_at) || '').slice(11, 16);
  /* 排序：日期倒序，同一天多条再按时间倒序（晚的在上，方便一眼看到最近一次）。
     取不到时间的一律沉到末尾，同组内用 id 兜底（新记录在前）。 */
  const cmpWDesc = (a, b) => {
    const d = String(b.date || '').localeCompare(String(a.date || ''));
    if (d) return d;
    const ta = wTime(a), tb = wTime(b);
    if (ta && tb) return tb.localeCompare(ta);
    if (ta) return -1;
    if (tb) return 1;
    return (+b.id || 0) - (+a.id || 0);
  };
  const sortWorkouts = list => (list || []).slice().sort(cmpWDesc);
  /* 标题前的时间小徽标 */
  const wTimeHTML = w => { const t = wTime(w); return t ? `<span class="w-time">${u.esc(t)}</span>` : ''; };

  function weekDates(base) {
    const wi = u.weekIndex(base);
    const start = u.addDays(base, -((wi + 6) % 7)); // 周一
    return Array.from({ length: 7 }, (_, i) => u.addDays(start, i));
  }

  /* ---------- 训练记录编辑 ----------
   * planId/planName：从「训练安排」打卡进来时带上计划，这样这条记录就归属于该计划，
   * 日历里计划与打卡会合并成一条，而不是各显示一条。 */
  async function workoutEditor(date, workout, presetType, planId, planName, dup) {
    return new Promise(resolve => {
      const w = workout || {};
      const type = w.type || presetType || '力量训练';
      const items = parseItems(w.items).map(normItem);
      const body = `
        <input type="hidden" name="plan_id" value="${u.esc(dup ? '' : (planId != null ? planId : (w.plan_id || '')))}">
        <div class="f2">
          <div class="field"><label>日期</label><input class="input" type="date" name="date" value="${u.esc(w.date || date)}"></div>
          <div class="field"><label>时间</label><input class="input" type="time" name="time" value="${u.esc(wTime(w) || u.now())}"></div>
        </div>
        <div class="f2">
          <div class="field"><label>类型</label>
            <select class="input" name="type" id="wType">${TYPES.map(t => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>时长（分钟）</label><input class="input" type="number" name="duration_min" value="${u.esc(w.duration_min || '')}"></div>
        </div>
        <div class="field"><label>标题</label><input class="input" name="title" placeholder="如：胸背日 / 5公里慢跑" value="${u.esc(w.title || planName || '')}"></div>
        <div class="field"><label>完成度：<b id="cmpVal">${u.esc(w.completion || 80)}</b>%</label>
          <input type="range" min="0" max="100" step="5" name="completion" value="${u.esc(w.completion || 80)}" style="width:100%"></div>
        <div id="itemsBox"></div>
        <div class="field"><label>身体感受</label>
          <select class="input" name="feeling">
            ${['轻松', '适中', '有挑战', '力竭'].map(f => `<option ${w.feeling === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select></div>
        <div class="field"><label>备注</label><textarea class="input" name="note" placeholder="今天状态、后续调整…">${u.esc(w.note || '')}</textarea></div>`;

      const m = PM.modal({
        title: dup ? '复制训练记录 · 修改后保存为新记录' : workout ? '编辑训练记录' : `训练打卡 · ${u.cnDate(date)}`,
        body, wide: true,
        foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存打卡</button>`,
        onMount(el, close) {
          const typeSel = el.querySelector('#wType');
          const box = el.querySelector('#itemsBox');

          function renderItems() {
            const t = typeSel.value;
            if (t === '力量训练') {
              box.innerHTML = `
                <div class="card-head"><h3>力量训练明细</h3><div class="right">
                  <button class="btn xs" data-add>+ 添加动作</button></div></div>
                <div id="itemList" class="list"></div>`;
              const list = box.querySelector('#itemList');
              const draw = () => {
                list.innerHTML = items.length ? '' : '<div class="small muted">还没有动作，点击「+ 添加动作」</div>';
                items.forEach((it, i) => {
                  const groups = it.groups || [];
                  list.appendChild(u.el(`<div class="li">
                    <div class="li-main">
                      <div class="f2" style="grid-template-columns:1.7fr 1fr">
                        <input class="input" data-k="name" data-i="${i}" placeholder="动作名称，如 卧推" value="${u.esc(it.name || '')}">
                        <input class="input" data-k="weight" data-i="${i}" placeholder="重量 kg" value="${u.esc(it.weight || '')}">
                      </div>
                      <div class="set-hint">每组个数</div>
                      <div class="set-grid">
                        ${Array.from({ length: SET_MAX }, (_, g) => `
                          <div class="set-cell ${String(groups[g] || '').trim() ? 'filled' : ''}">
                            <label>第 ${g + 1} 组</label>
                            <input type="number" min="0" step="1" inputmode="numeric"
                              data-k="g${g}" data-i="${i}" placeholder="个" value="${u.esc(groups[g] || '')}">
                          </div>`).join('')}
                      </div>
                      <div class="row" style="margin-top:10px">
                        <span class="small muted">完成度</span>
                        <input type="range" min="0" max="100" step="10" data-k="done" data-i="${i}" value="${u.esc(it.done || 100)}" style="flex:1">
                        <span class="small mono" data-donev="${i}">${u.esc(it.done || 100)}%</span>
                      </div>
                    </div>
                    <button class="btn xs danger" data-del="${i}">✕</button>
                  </div>`));
                });
                list.querySelectorAll('[data-k]').forEach(inp => {
                  inp.oninput = () => {
                    const i = +inp.dataset.i, k = inp.dataset.k;
                    if (/^g\d+$/.test(k)) {
                      items[i].groups[+k.slice(1)] = inp.value;
                      inp.closest('.set-cell').classList.toggle('filled', inp.value.trim() !== '');
                    } else {
                      items[i][k] = inp.value;
                      if (k === 'done') list.querySelector(`[data-donev="${i}"]`).textContent = inp.value + '%';
                    }
                  };
                });
                list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { items.splice(+b.dataset.del, 1); draw(); });
                PM.paintRange(list);
              };
              box.querySelector('[data-add]').onclick = () => { items.push(blankItem()); draw(); };
              draw();
            } else {
              box.innerHTML = `
                <div class="f3">
                  <div class="field"><label>距离（公里）</label><input class="input" name="distance" value="${u.esc((items[0] || {}).distance || '')}"></div>
                  <div class="field"><label>平均心率</label><input class="input" name="hr" value="${u.esc((items[0] || {}).hr || '')}"></div>
                  <div class="field"><label>强度</label><select class="input" name="intensity">
                    ${['低', '中', '高'].map(x => `<option ${(items[0] || {}).intensity === x ? 'selected' : ''}>${x}</option>`).join('')}
                  </select></div>
                </div>`;
            }
          }
          typeSel.onchange = renderItems;
          renderItems();

          el.querySelector('[name=completion]').oninput = e => el.querySelector('#cmpVal').textContent = e.target.value;

          el.querySelector('[data-save]').onclick = async () => {
            const data = PM.formData(el);
            const t = data.type;
            if (t === '力量训练') data.items = JSON.stringify(items.filter(i => (i.name || '').trim()));
            else data.items = JSON.stringify([{ distance: el.querySelector('[name=distance]') ? el.querySelector('[name=distance]').value : '', hr: el.querySelector('[name=hr]') ? el.querySelector('[name=hr]').value : '', intensity: el.querySelector('[name=intensity]') ? el.querySelector('[name=intensity]').value : '' }]);
            /* 编辑旧记录时表单可能没带出 plan_id，兜住别把已有归属清掉；复制模式不带 plan_id */
            if (!data.plan_id && workout && !dup) data.plan_id = workout.plan_id || '';
            try {
              if (workout && !dup) await api.update('workouts', workout.id, data);
              else await api.create('workouts', data);
              PM.toast(dup ? '已创建副本 💪' : '打卡成功 💪'); PM.celebrate(); resolve(true); close();
            } catch (e) { PM.toast(e.message, 'err'); }
          };
        },
        onClose() { resolve(false); },
      });
      return m;
    });
  }

  /* ---------- 体测记录 ---------- */
  async function bodyEditor(date, rec) {
    return new Promise(resolve => {
      const b = rec || {};
      PM.modal({
        title: rec ? '编辑体测数据' : `体测记录 · ${u.cnDate(date)}`,
        body: `
          <div class="f2">
            <div class="field"><label>日期</label><input class="input" type="date" name="date" value="${u.esc(b.date || date)}"></div>
            <div class="field"><label>时间</label><input class="input" type="time" name="time" value="${u.esc(b.time || '')}"></div>
          </div>
          <div class="f3">
            <div class="field"><label>体重（斤）</label><input class="input" type="number" step="0.1" name="weight" placeholder="如 116" value="${u.esc(b.weight || '')}"></div>
            <div class="field"><label>体脂率（%）</label><input class="input" type="number" step="0.1" name="body_fat" value="${u.esc(b.body_fat || '')}"></div>
            <div class="field"><label>肌肉量（kg）</label><input class="input" type="number" step="0.1" name="muscle" placeholder="如 39.1" value="${u.esc(b.muscle || '')}"></div>
          </div>
          <div class="f2">
            <div class="field"><label>基础代谢（kcal）</label><input class="input" type="number" step="1" name="metabolism" placeholder="如 1350" value="${u.esc(b.metabolism || '')}"></div>
            <div class="field"><label>腰臀比</label><input class="input" type="number" step="0.01" name="whr" placeholder="如 0.78" value="${u.esc(b.whr || '')}"></div>
          </div>
          <div class="f2">
            <div class="field"><label>内脏脂肪（等级）</label><input class="input" type="number" step="0.1" name="visceral_fat" placeholder="如 4.5" value="${u.esc(b.visceral_fat || '')}"></div>
            <div class="field"><label>备注</label><input class="input" name="note" placeholder="如：晨起空腹" value="${u.esc(b.note || '')}"></div>
          </div>
          <div class="small muted" style="margin-top:-2px">体重按「斤」记；腰臀比 = 腰围 ÷ 臀围，一般女性 &lt; 0.8、男性 &lt; 0.9 为宜</div>`,
        foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
        onMount(el, close) {
          el.querySelector('[data-save]').onclick = async () => {
            const data = PM.formData(el);
            try {
              if (rec) await api.update('body_metrics', rec.id, data);
              else await api.create('body_metrics', data);
              PM.toast('已记录'); PM.celebrate(['⚖️', '✨', '📉']); resolve(true); close();
            } catch (e) { PM.toast(e.message, 'err'); }
          };
        },
        onClose() { resolve(false); },
      });
    });
  }

  /* ---------- 简易折线图 ----------
     opt.h：矮画布模式（今日页体重卡用）。只改画布高度、缩小内边距与点半径，
     并省掉底部日期标签 —— 同一张图在窄栏里不再占掉半张卡片。 */
  function lineChart(points, opt) {
    opt = opt || {};
    const W = 560, H = opt.h || 150, P = opt.h ? 10 : 24;
    const vals = points.map(p => p.v).filter(v => v != null);
    if (vals.length < 1) return '<div class="chart-empty">暂无数据 · 记一次体测就有曲线了</div>';
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1) { min -= 1; max += 1; }
    const pad = (max - min) * 0.15; min -= pad; max += pad;
    const xs = i => P + (W - P * 2) * (points.length === 1 ? .5 : i / (points.length - 1));
    const ys = v => H - P - (H - P * 2) * ((v - min) / (max - min));
    const path = points.filter(p => p.v != null).map((p, i) => `${i ? 'L' : 'M'}${xs(p.i).toFixed(1)},${ys(p.v).toFixed(1)}`).join(' ');
    const area = path + ` L${xs(points.length - 1).toFixed(1)},${H - P} L${xs(0).toFixed(1)},${H - P} Z`;
    const r = opt.h ? 2 : 3;
    const dots = points.filter(p => p.v != null).map(p => `<circle cx="${xs(p.i).toFixed(1)}" cy="${ys(p.v).toFixed(1)}" r="${r}" fill="#fff" stroke="${opt.color || '#7B57C9'}" stroke-width="2"><title>${u.esc(p.label)}: ${p.v}</title></circle>`).join('');
    const labels = opt.h ? '' : points.filter((_, i) => i % Math.ceil(points.length / 6) === 0)
      .map(p => `<text x="${xs(p.i).toFixed(1)}" y="${H - 6}" font-size="10" fill="#A99FB4" text-anchor="middle">${u.esc(String(p.label).slice(5))}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      <defs><linearGradient id="g${opt.key || ''}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opt.color || '#7B57C9'}" stop-opacity=".22"/>
        <stop offset="100%" stop-color="${opt.color || '#7B57C9'}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#g${opt.key || ''})"/>
      <path d="${path}" fill="none" stroke="${opt.color || '#7B57C9'}" stroke-width="2.2" stroke-linejoin="round"/>
      ${dots}${labels}</svg>`;
  }

  /* ---------- 页面 ---------- */
  async function viewMain(el) {
    const [workouts, body] = await Promise.all([
      api.list('workouts', { order_by: 'date', desc: 1 }),
      api.list('body_metrics', { order_by: 'date' }),
    ]);
    const t = u.today();
    const week = weekDates(t);
    const weekWorkouts = workouts.filter(w => week.includes(w.date));
    /* 体重 / 体脂各取「最近一条有值」的记录：体脂秤不是每次都测全，
       最后一条记录可能只有体重没有体脂，按整条回退会把体脂显示成 — */
    const withVal = k => body.filter(b => b[k] !== '' && b[k] != null);
    const wtArr = withVal('weight'), fatArr = withVal('body_fat');
    const lastWt = wtArr[wtArr.length - 1] || null, prevWt = wtArr[wtArr.length - 2] || null;
    const lastFat = fatArr[fatArr.length - 1] || null, prevFat = fatArr[fatArr.length - 2] || null;
    const delta = (a, b) => (a && b && a !== '' && b !== '') ? (parseFloat(a) - parseFloat(b)) : null;
    const recDate = r => (r && r.date && r.date !== t) ? ` <span class="muted">· ${r.date.slice(5)} 记录</span>` : ' <span class="muted">· 今日</span>';
    const recent30 = body.filter(b => b.date >= u.addDays(t, -30));

    el.innerHTML = `
      <div class="fit-page">
      <div class="grid g4" style="margin-bottom:16px">
        <div class="stat"><div class="k">本周训练</div><div class="v">${new Set(weekWorkouts.map(w => (w.plan_id ? 'p' + w.plan_id : 'w' + w.id) + '|' + w.date)).size}<small>次</small></div>
          <div class="d">累计 ${weekWorkouts.reduce((s, w) => s + (+w.duration_min || 0), 0)} 分钟</div></div>
        <div class="stat"><div class="k">最新体重</div><div class="v">${lastWt ? lastWt.weight : '—'}<small>斤</small></div>
          <div class="d">${fmtDelta(delta(lastWt && lastWt.weight, prevWt && prevWt.weight), '斤')}${lastWt ? recDate(lastWt) : ''}</div></div>
        <div class="stat"><div class="k">体脂率</div><div class="v">${lastFat ? lastFat.body_fat : '—'}<small>%</small></div>
          <div class="d">${fmtDelta(delta(lastFat && lastFat.body_fat, prevFat && prevFat.body_fat), '%')}${lastFat ? recDate(lastFat) : ''}</div></div>
        <div class="stat"><div class="k">连续打卡</div><div class="v">${streak(workouts.map(w => w.date))}<small>天</small></div>
          <div class="d">共 ${workouts.length} 次训练</div></div>
      </div>

      <div class="split">
        <div>
          <div class="card">
            <div class="card-head"><h3>本周训练</h3><div class="right">
              <button class="btn xs primary" data-act="add-workout" data-date="${t}">+ 训练打卡</button></div></div>
            <div class="week-plan">
              ${week.map(d => {
                const dw = sortWorkouts(workouts.filter(w => w.date === d));
                const its = dw.map(w => `<div class="wp-it done" title="${u.esc(w.title || w.type)}" data-act="edit-workout" data-id="${w.id}">✓ ${u.esc(w.title || w.type)}</div>`);
                return `<div class="wp-day ${d === t ? 'today' : ''}" data-day="${d}">
                  <div class="wp-hd">${Number(d.slice(8))}<span>周${u.weekday(d)}</span></div>
                  ${its.join('')}
                  ${!its.length ? '<div class="wp-rest">休息</div>' : ''}
                </div>`;
              }).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>训练记录</h3><div class="right">
              <button class="btn xs" data-act="add-body" data-date="${t}">+ 体测</button>
              <button class="btn xs primary" data-act="add-workout" data-date="${t}">+ 训练</button></div></div>
            <div class="list" id="wRows"></div>
            <div class="pager" id="wPager"></div>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><h3>体重趋势 · 斤（近30天）</h3></div>
            ${lineChart(recent30.map((b, i) => ({ i, v: u.num(b.weight), label: b.date })), { key: 'w' })}
            <div class="hr"></div>
            <div class="card-head" style="margin-bottom:8px"><h3>体脂率</h3></div>
            ${lineChart(recent30.map((b, i) => ({ i, v: u.num(b.body_fat), label: b.date })), { key: 'f', color: '#E2848C' })}
          </div>
          <div class="card">
            <div class="card-head"><h3>体测数据</h3><div class="right">
              <button class="btn xs primary" data-act="add-body" data-date="${t}">+ 记录</button></div></div>
            <div class="bod-list" id="bodyRows"></div>
            <div class="pager" id="bodyPager"></div>
          </div>
        </div>
      </div>
      </div>`;

    el.onclick = async e => {
      const t2 = e.target.closest('[data-act]'); if (!t2) return;
      const a = t2.dataset.act;
      if (a === 'add-workout') { if (await workoutEditor(t2.dataset.date)) PM.refresh(); }
      if (a === 'copy-workout') {
        const w = workouts.find(x => x.id === t2.dataset.id);
        if (!w) return;
        /* 复制：去掉 id，日期/时间重置为当下，其余内容原样带入编辑框 */
        const copy = { ...w, date: u.today(), time: u.now() };
        if (await workoutEditor(copy.date, copy, null, null, null, true)) PM.refresh();
      }
      if (a === 'edit-workout') {
        const w = workouts.find(x => x.id === t2.dataset.id);
        if (await workoutEditor(w.date, w)) PM.refresh();
      }
      if (a === 'del-workout') { if (await PM.confirm('确定删除这条训练记录？')) { await api.remove('workouts', t2.dataset.id); PM.toast('已删除'); PM.refresh(); } }
      if (a === 'add-body') { if (await bodyEditor(t2.dataset.date)) PM.refresh(); }
      if (a === 'edit-body') {
        const b = body.find(x => x.id === t2.dataset.id);
        if (await bodyEditor(b.date, b)) PM.refresh();
      }
      if (a === 'del-body') {
        if (await PM.confirm('确定删除这条体测记录？删除后不可恢复。')) {
          await api.remove('body_metrics', t2.dataset.id);
          const idx = body.findIndex(x => String(x.id) === String(t2.dataset.id));
          if (idx > -1) body.splice(idx, 1);
          PM.toast('已删除'); renderBodyTable();
        }
      }
    };

    /* 训练记录分页：按可用高度自动算每页条数（见下），翻「下一页」看更早的。
       _wPage 模块级保存：切 tab 回来还停在原来那一页。 */
    function renderWorkoutList() {
      const all = sortWorkouts(workouts);
      const box = el.querySelector('#wRows');
      const pager = el.querySelector('#wPager');
      const mkRow = w => {
        const det = workoutDetailHTML(w);
        return `<div class="li">
          <div class="avatar-emoji">${TYPE_ICON[w.type] || '🤸'}</div>
          <div class="li-main">
            <div class="li-title">${wTimeHTML(w)}${u.esc(w.title || w.type)} <span class="tag">${u.esc(w.type)}</span></div>
            <div class="li-sub">${u.relDate(w.date)} · ${w.duration_min ? w.duration_min + ' 分钟' : '—'} · 完成度 ${w.completion || 0}% ${w.feeling ? '· ' + u.esc(w.feeling) : ''}</div>
            <div class="bar" style="margin-top:6px;max-width:220px"><i style="width:${w.completion || 0}%"></i></div>
            ${det ? `<div class="wd-detail">${det}</div>` : ''}
          </div>
          <div class="li-act">
            <button class="btn xs" data-act="copy-workout" data-id="${w.id}" title="复制为新记录">复制</button>
            <button class="btn xs" data-act="edit-workout" data-id="${w.id}">编辑</button>
            <button class="btn xs danger" data-act="del-workout" data-id="${w.id}">删</button>
          </div>
        </div>`;
      };
      if (!all.length) {
        box.innerHTML = '<div class="empty"><span class="big">🏋️</span>还没有训练记录，开始第一次打卡吧</div>';
        pager.innerHTML = '';
        return;
      }
      /* 按高度分页：先把全部行渲染出来量高度，再按卡片可用高度贪心装填，
         装得下几条每页就放几条（默认第一页撑满，不留白）。
         可用高度 = 卡片当前高度（与右侧体测列等高）− 列表起点到底部的距离 − 分页条 */
      const card = box.closest('.card') || box.parentElement;
      /* 先清空量「卡片自身最小高度」和「并排另一列的高度」（取大者作为目标高度） */
      box.innerHTML = ''; pager.innerHTML = '';
      const cr = card.getBoundingClientRect();
      const col = card.parentElement;             // 本列（训练卡 + 下方其它卡）
      const colR = col.getBoundingClientRect();
      /* 并排另一列的高度 = 目标列高；单列布局时按视口高度填满一屏 */
      let target = 0, side = false;
      [...col.parentElement.children].forEach(sib => {
        if (sib === col) return;
        const sr = sib.getBoundingClientRect();
        if (Math.abs(sr.top - colR.top) < 40) { side = true; target = Math.max(target, sr.height); }
      });
      if (!side) target = 0;   // 单列：下面按「列表占约一屏」算
      target = Math.max(target, cr.height);       // 本列其它卡 + 训练卡最小高度
      const targetAbs = side ? (colR.top + target) : (box.getBoundingClientRect().top + window.innerHeight * 0.92);   // 列底部（绝对坐标）
      box.innerHTML = all.map(mkRow).join('');
      const kids = [...box.children];
      const hs = kids.map(k => k.getBoundingClientRect().height);
      const gap = parseFloat(getComputedStyle(box).rowGap || getComputedStyle(box).gap) || 0;
      const pagerH = pager.getBoundingClientRect().height || 36;
      const colOther = Math.max(0, colR.bottom - card.getBoundingClientRect().bottom);   // 本列训练卡下方其它卡的高度
      const below = Math.max(120, targetAbs - colOther - box.getBoundingClientRect().top - pagerH - 22);
      let pageSize = 0, acc = 0;
      for (let i = 0; i < hs.length; i++) {
        const need = hs[i] + (pageSize ? gap : 0);
        if (pageSize && acc + need > below) break;
        acc += need; pageSize++;
      }
      pageSize = Math.max(1, pageSize);
      const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
      if (_wPage >= totalPages) _wPage = totalPages - 1;
      if (_wPage < 0) _wPage = 0;
      const start = _wPage * pageSize;
      const rows = all.slice(start, start + pageSize);
      box.innerHTML = rows.map(mkRow).join('');
      const first = rows[0].date, last = rows[rows.length - 1].date;
      const label = (first === last) ? first.slice(5).replace('-', '/') : `${first.slice(5).replace('-', '/')} ~ ${last.slice(5).replace('-', '/')}`;
      pager.innerHTML = `<span class="small muted">共 ${all.length} 条 · 每页 ${pageSize} 条 · 第 ${_wPage + 1}/${totalPages} 页 · ${label}</span>
        <div class="spacer"></div>
        <button class="btn xs" data-wprev ${_wPage <= 0 ? 'disabled' : ''}>上一页</button>
        <button class="btn xs" data-wnext ${_wPage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>`;
      const wp = pager.querySelector('[data-wprev]'), wn = pager.querySelector('[data-wnext]');
      if (wp) wp.onclick = () => { if (_wPage > 0) { _wPage--; renderWorkoutList(); } };
      if (wn) wn.onclick = () => { if (_wPage < totalPages - 1) { _wPage++; renderWorkoutList(); } };
    }
    renderWorkoutList();

    /* 体测数据分页：每页 5 条，最近优先（_bodyPage 为模块级，切 tab 不丢，刷新才归零） */
    function renderBodyTable() {
      const rev = body.slice().reverse();
      const pageSize = 5;
      const totalPages = Math.max(1, Math.ceil(rev.length / pageSize));
      if (_bodyPage >= totalPages) _bodyPage = totalPages - 1;
      if (_bodyPage < 0) _bodyPage = 0;
      const rows = rev.slice(_bodyPage * pageSize, _bodyPage * pageSize + pageSize);
      const box = el.querySelector('#bodyRows');
      box.innerHTML = rows.length ? rows.map(b => {
        /* 左侧大数字 = 体脂健康分（100 − 体脂率），与附件一致；无体脂则显示 — */
        const score = (b.body_fat !== '' && b.body_fat != null) ? Math.round(100 - parseFloat(b.body_fat)) : '—';
        const wKg = b.weight ? (parseFloat(b.weight) / 2).toFixed(1).replace(/\.0$/, '') : '—';
        return `<div class="bod-row">
          <div class="bod-score">${score}</div>
          <div class="bod-main">
            <div class="bod-top">
              <span class="bod-date">${u.esc(b.date)}${b.time ? ' ' + u.esc(b.time) : ''}</span>
              <div class="bod-btns">
                <button class="btn xs" data-act="edit-body" data-id="${b.id}">编辑</button>
                <button class="btn xs danger" data-act="del-body" data-id="${b.id}">删</button>
              </div>
            </div>
            <div class="bod-metrics">
              <span class="bod-m"><i class="bi bi-w">重</i><b>${wKg}<small>kg</small></b></span>
              <span class="bod-m"><i class="bi bi-w">脂</i><b>${b.body_fat ? u.esc(b.body_fat) : '—'}<small>%</small></b></span>
              <span class="bod-m"><i class="bi bi-w">代</i><b>${b.metabolism ? u.esc(b.metabolism) : '—'}<small>kcal</small></b></span>
            </div>
          </div>
        </div>`;
      }).join('')
        : '<div class="bod-empty small muted">暂无记录，点「+ 记录」添一笔</div>';
      const pager = el.querySelector('#bodyPager');
      pager.innerHTML = `<span class="small muted">共 ${rev.length} 条 · 第 ${_bodyPage + 1}/${totalPages} 页</span>
        <div class="spacer"></div>
        <button class="btn xs" data-bprev ${_bodyPage <= 0 ? 'disabled' : ''}>上一页</button>
        <button class="btn xs" data-bnext ${_bodyPage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>`;
      const bp = pager.querySelector('[data-bprev]'), bn = pager.querySelector('[data-bnext]');
      if (bp) bp.onclick = () => { if (_bodyPage > 0) { _bodyPage--; renderBodyTable(); } };
      if (bn) bn.onclick = () => { if (_bodyPage < totalPages - 1) { _bodyPage++; renderBodyTable(); } };
    }
    renderBodyTable();
    /* 右列渲染完后再算一次（首帧时右列还没高度，会把每页条数算少）；窗口尺寸变化时重算 */
    renderWorkoutList();
    let _rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(_rz); _rz = setTimeout(() => { if (el.isConnected) renderWorkoutList(); }, 180);
    });
  }

  function fmtDelta(d, unit) {
    if (d === null) return '<span class="muted">— 暂无对比</span>';
    const s = (d > 0 ? '+' : '') + d.toFixed(1) + unit;
    const cls = d < 0 ? 'var(--green)' : 'var(--red)';
    return `<span style="color:${cls}">${s}</span> <span class="muted">较上次</span>`;
  }
  function streak(dates) {
    const set = new Set(dates);
    let n = 0, d = u.today();
    if (!set.has(d)) d = u.addDays(d, -1);
    while (set.has(d)) { n++; d = u.addDays(d, -1); }
    return n;
  }

  /* ---------- 某日详情（日历点进来） ---------- */
  async function viewDay(el, q) {
    const date = q.date || u.today();
    const [ws, bs] = await Promise.all([
      api.list('workouts', { where: { date } }),
      api.list('body_metrics', { where: { date } }),
    ]);
    const wsSorted = sortWorkouts(ws);   /* 同一天多条：晚的排上面 */
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>${u.cnDate(date)} 周${u.weekday(date)}</h3>
          <div class="right"><button class="btn sm" data-act="back">← 返回今日</button></div></div>
        <div class="row wrap" style="margin-bottom:14px">
          <button class="btn primary" data-act="add-workout">+ 训练打卡</button>
          <button class="btn" data-act="add-body">+ 体测记录</button>
        </div>
        <div class="grid g2">
          <div>
            <div class="small muted" style="margin-bottom:8px">训练</div>
            ${wsSorted.map(w => {
              return `<div class="li"><div class="avatar-emoji">${TYPE_ICON[w.type] || ''}</div>
              <div class="li-main"><div class="li-title">${wTimeHTML(w)}${u.esc(w.title || w.type)} ✓</div>
              <div class="li-sub">${w.duration_min || 0} 分钟 · 完成度 ${w.completion || 0}%</div>
              ${(parseItems(w.items)).length ? `<div class="small muted" style="margin-top:4px">${parseItems(w.items).map(i => u.esc(itemText(normItem(i)))).join(' / ')}</div>` : ''}
              </div>
              <div class="li-act"><button class="btn xs" data-act="copy-workout" data-id="${w.id}" title="复制为新记录">复制</button>
              <button class="btn xs" data-act="edit-workout" data-id="${w.id}">编辑</button>
              <button class="btn xs danger" data-act="del-workout" data-id="${w.id}">删</button></div></div>`;
            }).join('') || '<div class="empty small">当日无训练记录</div>'}
          </div>
          <div>
            <div class="small muted" style="margin-bottom:8px">体测</div>
            ${bs.map(b => `<div class="li"><div class="li-main">
              <div class="li-title">${b.weight ? b.weight + ' 斤' : '—'} ${b.body_fat ? '· 体脂 ' + b.body_fat + '%' : ''}</div>
              <div class="li-sub">${u.esc(b.time || '')} ${[
                b.metabolism ? '代谢 ' + b.metabolism + ' kcal' : '',
                b.whr ? '腰臀比 ' + b.whr : '',
                b.visceral_fat ? '内脂 ' + b.visceral_fat : '',
                u.esc(b.note || ''),
              ].filter(Boolean).join(' · ')}</div></div>
              <div class="bod-btns">
                <button class="btn xs" data-act="edit-body" data-id="${b.id}">编辑</button>
                <button class="btn xs danger" data-act="del-body" data-id="${b.id}">删</button>
              </div></div>`).join('') || '<div class="empty small">当日无体测记录</div>'}
          </div>
        </div>
      </div>`;
    el.onclick = async e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const a = btn.dataset.act;
      if (a === 'back') PM.go('#/today');
      if (a === 'add-workout') { if (await workoutEditor(date)) PM.refresh(); }
      if (a === 'add-body') { if (await bodyEditor(date)) PM.refresh(); }
      if (a === 'edit-workout') { if (await workoutEditor(date, ws.find(x => x.id === btn.dataset.id))) PM.refresh(); }
      if (a === 'copy-workout') {
        const w = ws.find(x => x.id === btn.dataset.id);
        if (!w) return;
        const copy = { ...w, date: u.today(), time: u.now() };
        if (await workoutEditor(copy.date, copy, null, null, null, true)) PM.refresh();
      }
      if (a === 'edit-body') { if (await bodyEditor(date, bs.find(x => x.id === btn.dataset.id))) PM.refresh(); }
      if (a === 'del-body') {
        if (await PM.confirm('确定删除这条体测记录？删除后不可恢复。')) {
          await api.remove('body_metrics', btn.dataset.id);
          PM.toast('已删除'); PM.refresh();
        }
      }
      if (a === 'del-workout') { if (await PM.confirm('删除该记录？')) { await api.remove('workouts', btn.dataset.id); PM.refresh(); } }
    };
  }

  /* ---------- 注册 ---------- */
  /* quickAdd 的闭包在模块作用域之外求值，这里显式转发 */
  const openWorkout = (t) => workoutEditor(t);
  const openBody = (t) => bodyEditor(t);

  PM.registerModule({
    id: 'fitness',
    name: '身体',
    icon: PM.icon('dumbbell'),
    group: '身体',
    nav: [
      { label: '训练与体测', path: '', icon: PM.icon('dumbbell') },
    ],
    /* 日历页的「+ 新增」需要直接调起编辑器（训练安排功能已删除：习惯事后补记，不做计划） */
    quickAdd: [
      { key: 'workout', icon: '🏋️', title: '训练打卡', sub: '记录今天练了什么', run: openWorkout },
      { key: 'body', icon: '⚖️', title: '体重体脂', sub: '记一笔身体数据', run: openBody },
    ],
    routes: { '': viewMain, 'day': viewDay, 'plans': () => { location.hash = '#/fitness'; } },
    // 今日页部件
    today: [
      { id: 'fitness-today', order: 30, render: todayWidget },
    ],
    api: { workoutEditor, bodyEditor, lineChart, TYPE_ICON, parseItems, streak,
           wTime, wTimeHTML, sortWorkouts },
  });

  async function todayWidget(box) {
    const t = u.today();
    const [ws, body] = await Promise.all([
      api.list('workouts', { where: { date: t } }), api.list('body_metrics', { order_by: 'date' }),
    ]);
    const last = body.length ? body[body.length - 1] : null;
    const done = sortWorkouts(ws);   /* 当天所有打卡记录，晚的在上 */
    box.appendChild(u.el(`<div class="widget">
      <div class="widget-head"><h4>💪 今日训练</h4><div class="right">
        <span class="tag ${done.length ? 'green' : 'orange'}">${done.length ? '已完成 ' + done.length + ' 次' : '待打卡'}</span></div></div>
      <div class="widget-body">
        ${done.map(w => `<div class="li" style="margin-top:8px"><div class="avatar-emoji">${TYPE_ICON[w.type] || ''}</div>
          <div class="li-main"><div class="li-title">${wTimeHTML(w)}${u.esc(w.title || w.type)} ✓</div>
          <div class="li-sub">${w.duration_min || 0} 分钟 · 完成度 ${w.completion || 0}%</div></div>
          <button class="btn xs" data-act="quick-edit" data-id="${w.id}">详情</button></div>`).join('')
          || '<div class="small muted">今天还没训练，练完记得来打卡</div>'}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" data-act="add-workout">+ 训练打卡</button>
          <div class="spacer"></div>
          <a class="small" href="#/fitness" style="color:var(--primary)">训练与体测 →</a>
        </div>
      </div></div>`));
    box.querySelector('[data-act=add-workout]').onclick = async () => { if (await workoutEditor(t)) PM.refresh(); };
    box.onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'quick-edit') {
        const w = ws.find(x => x.id === b.dataset.id);
        if (await workoutEditor(t, w)) PM.refresh();
      }
    };
    return last;
  }
})();
