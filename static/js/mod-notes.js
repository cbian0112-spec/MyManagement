/* ===========================================================
 * 记录事项模块：重要事项 / 灵感 / 备忘
 * 表：notes
 * =========================================================== */
(function () {
  const { u, api } = PM;
  const CATS = ['重要事项', '灵感想法', '会议记录', '生活备忘', '年度目标'];

  async function noteEditor(note) {
    return new Promise(resolve => {
      PM.modal({
        title: note ? '编辑记录' : '新建记录',
        wide: true,
        body: `
          <div class="f2">
            <div class="field"><label>标题</label><input class="input" name="title" value="${u.esc(note ? note.title : '')}"></div>
            <div class="field"><label>分类</label>
              <input class="input" name="category" list="catList" value="${u.esc(note ? note.category : '重要事项')}">
              <datalist id="catList">${CATS.map(c => `<option value="${c}">`).join('')}</datalist></div>
          </div>
          <div class="field"><label>内容</label>
            <textarea class="input" name="content" style="min-height:260px" placeholder="记录今天重要的事…">${u.esc(note ? note.content : '')}</textarea></div>
          <label class="row small" style="gap:6px"><input type="checkbox" name="pinned" ${note && note.pinned === '1' ? 'checked' : ''}> 置顶</label>`,
        foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
        onMount(el, close) {
          el.querySelector('[data-save]').onclick = async () => {
            const d = PM.formData(el);
            d.pinned = d.pinned === '1' ? '1' : '0';
            try {
              if (note) await api.update('notes', note.id, d);
              else await api.create('notes', d);
              PM.toast('已保存'); resolve(true); close();
            } catch (e) { PM.toast(e.message, 'err'); }
          };
        },
        onClose() { resolve(false); },
      });
    });
  }

  async function viewMain(el, q) {
    const rows = await api.list('notes', { order_by: 'id', desc: 1 });
    const cats = [...new Set([...CATS, ...rows.map(r => r.category).filter(Boolean)])];
    const cur = q.c || '';
    let list = cur ? rows.filter(r => (r.category || '') === cur) : rows;
    list = [...list].sort((a, b) => (b.pinned === '1') - (a.pinned === '1'));

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>记录事项</h3><div class="sub">共 ${rows.length} 条</div>
          <div class="right"><button class="btn sm primary" data-act="new">+ 新建记录</button></div></div>
        <div class="folder-chips">
          <a class="folder-chip ${cur ? '' : 'on'}" href="#/notes">全部</a>
          ${cats.map(c => `<a class="folder-chip ${cur === c ? 'on' : ''}" href="#/notes?c=${encodeURIComponent(c)}">${u.esc(c)}</a>`).join('')}
        </div>
        <div class="grid g2">
          ${list.map(n => `<div class="card" style="margin:0;box-shadow:none">
            <div class="card-head" style="margin-bottom:6px">
              <h3>${n.pinned === '1' ? '📌 ' : ''}${u.esc(n.title || '无标题')}</h3>
              <div class="right"><span class="tag pink">${u.esc(n.category || '未分类')}</span></div></div>
            <div class="small" style="color:var(--text-2);white-space:pre-wrap;max-height:120px;overflow:hidden">${u.esc((n.content || '').slice(0, 300))}</div>
            <div class="row" style="margin-top:10px">
              <span class="small muted">${(n.created_at || '').slice(0, 10)}</span><div class="spacer"></div>
              <button class="btn xs" data-act="open" data-id="${n.id}">查看</button>
              <button class="btn xs" data-act="edit" data-id="${n.id}">编辑</button>
              <button class="btn xs danger" data-act="del" data-id="${n.id}">删</button>
            </div></div>`).join('') ||
          '<div class="empty" style="grid-column:1/-1"><span class="big">📝</span>还没有记录</div>'}
        </div>
      </div>`;

    el.querySelector('[data-act=new]').onclick = async () => { if (await noteEditor()) PM.refresh(); };
    el.onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      const n = rows.find(x => x.id === b.dataset.id);
      if (a === 'edit') { if (await noteEditor(n)) PM.refresh(); }
      if (a === 'open') {
        PM.modal({
          title: n.title || '记录', wide: true,
          body: `<div class="small muted" style="margin-bottom:10px">${u.esc(n.category || '')} · ${u.esc((n.created_at || '').slice(0, 16))}</div>
                 <div style="white-space:pre-wrap;line-height:1.9">${u.esc(n.content || '')}</div>`,
          foot: `<button class="btn" data-close>关闭</button><button class="btn primary" data-edit>编辑</button>`,
          onMount(m, close) { m.querySelector('[data-edit]').onclick = async () => { close(); if (await noteEditor(n)) PM.refresh(); }; },
        });
      }
      if (a === 'del') { if (await PM.confirm('删除这条记录？')) { await api.remove('notes', b.dataset.id); PM.refresh(); } }
    };
  }

  async function todayWidget(box) {
    const t = u.today();
    const rows = await api.list('notes', { order_by: 'id', desc: 1 });
    const pinned = rows.filter(r => r.pinned === '1').slice(0, 3);
    const recent = rows.filter(r => (r.created_at || '').slice(0, 10) === t);
    box.appendChild(u.el(`<div class="widget">
      <div class="widget-head"><h4>📝 记录事项</h4><div class="right">
        <span class="tag pink">${rows.length} 条</span></div></div>
      <div class="widget-body">
        ${pinned.map(n => `<div class="li" style="padding:8px 10px"><div class="li-main">
          <div class="li-title" style="font-size:13px">📌 ${u.esc(n.title || '无标题')}</div>
          <div class="li-sub">${u.esc((n.content || '').slice(0, 40))}</div></div></div>`).join('')
          || '<div class="small muted">暂无置顶事项</div>'}
        <div class="row" style="margin-top:10px">
          <button class="btn sm primary" data-act="new">+ 记一笔</button>
          <span class="small muted">今日新增 ${recent.length} 条</span>
          <div class="spacer"></div><a class="small" href="#/notes">全部 →</a>
        </div>
      </div></div>`));
    box.querySelector('[data-act=new]').onclick = async () => { if (await noteEditor()) PM.refresh(); };
  }

  PM.registerModule({
    id: 'notes',
    name: '记录事项',
    mobileLabel: '记录',
    icon: PM.icon('note'),
    group: '清单',
    nav: [{ label: '记录事项', path: '', icon: PM.icon('note') }],
    routes: { '': viewMain },
    api: { noteEditor },
  });
})();
