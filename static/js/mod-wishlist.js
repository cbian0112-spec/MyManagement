/* ===========================================================
 * 种草清单模块：旅游出行想买 / 准备的东西，按文件夹分类
 * 表：wishlist
 * =========================================================== */
(function () {
  const { u, api } = PM;
  const DEFAULT_FOLDERS = ['旅行出行', '装备好物', '家居生活', '服饰穿搭', '数码电子', '礼物清单'];

  /* 兼容：新数据读 images（JSON 数组），旧数据只有单张 image */
  function parseImgs(w) {
    let arr = [];
    if (w && w.images) {
      try { const p = JSON.parse(w.images); if (Array.isArray(p)) arr = p; } catch (e) { /* 旧脏数据忽略 */ }
    }
    arr = arr.filter(x => typeof x === 'string' && x.trim());
    if (!arr.length && w && w.image) arr = [w.image];
    return [...new Set(arr)];
  }

  async function wishEditor(folders, current, item) {
    return new Promise(resolve => {
      const it = item || {};
      let imgs = parseImgs(it);
      PM.modal({
        title: item ? '编辑物品' : '添加种草',
        body: `
          <div class="field"><label>名称</label><input class="input" name="name" placeholder="想买/要准备什么？" value="${u.esc(it.name || '')}"></div>
          <div class="field"><label>图片（可多选，最多 9 张；第一张为封面）</label>
            <div class="row wrap">
              <label class="btn sm" style="cursor:pointer">📷 拍照
                <input type="file" accept="image/*" capture="environment" data-img style="display:none"></label>
              <label class="btn sm" style="cursor:pointer">🖼 从相册选（可多选）
                <input type="file" accept="image/*" multiple data-img style="display:none"></label>
              <input class="input" name="link" placeholder="或粘贴图片/商品链接" value="${u.esc(it.link || '')}" style="flex:1;min-width:140px">
            </div>
            <div id="wPrev" class="wish-prevs"></div>
            <div class="small muted" id="wImgHint" style="margin-top:6px">点缩略图可放大，✕ 可移除</div>
          </div>
          <div class="f3">
            <div class="field"><label>文件夹</label>
              <input class="input" name="folder" id="fldIn" list="fldList" placeholder="旅行出行" value="${u.esc(it.folder || current || '')}">
              <datalist id="fldList">${folders.map(f => `<option value="${u.esc(f)}">`).join('')}</datalist></div>
            <div class="field"><label>预算/价格</label><input class="input" name="price" type="number" step="0.01" value="${u.esc(it.price || '')}"></div>
            <div class="field"><label>优先级</label><select class="input" name="priority">
              ${[['3', '很想要'], ['2', '一般'], ['1', '再看看']].map(([k, v]) => `<option value="${k}" ${String(it.priority || '2') === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
          </div>
          <div class="field"><label>备注（用途、尺寸、出发前要带…）</label>
            <textarea class="input" name="note">${u.esc(it.note || '')}</textarea></div>
          <div class="field"><label>状态</label><select class="input" name="status">
            <option value="want" ${(it.status || 'want') === 'want' ? 'selected' : ''}>种草中</option>
            <option value="bought" ${it.status === 'bought' ? 'selected' : ''}>已入手 / 已准备</option>
          </select></div>`,
        foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
        onMount(el, close) {
          const prevBox = el.querySelector('#wPrev');
          const drawPrev = () => {
            prevBox.innerHTML = imgs.length ? imgs.map((url, i) => `
              <div class="wish-prev">
                <img src="${u.esc(url)}" data-zoom-prev="${i}" title="点击放大" alt="">
                ${i === 0 ? '<span class="wish-prev-cover">封面</span>' : ''}
                <button type="button" class="wish-prev-rm" data-rm="${i}" title="移除">✕</button>
              </div>`).join('') : '<span class="small muted">还没有图片</span>';
            el.querySelector('#wImgHint').textContent = imgs.length
              ? `已选 ${imgs.length} 张 · 点缩略图放大、✕ 移除；列表里可左右滑动切换`
              : '点缩略图可放大，✕ 可移除';
          };
          drawPrev();
          prevBox.onclick = ev => {
            const rm = ev.target.closest('[data-rm]');
            if (rm) { imgs.splice(+rm.dataset.rm, 1); drawPrev(); return; }
            const z = ev.target.closest('[data-zoom-prev]');
            if (z && imgs.length) openLightbox(imgs.slice(), +z.dataset.zoomPrev, el.querySelector('[name=name]').value);
          };
          el.querySelectorAll('[data-img]').forEach(inp => inp.onchange = async e => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            e.target.value = '';
            let ok = 0;
            for (const f of files) {
              if (imgs.length >= 9) { PM.toast('最多 9 张，已忽略多余图片', 'err'); break; }
              try {
                const r = await api.upload(f);
                imgs.push(r.url); ok++;
                drawPrev();
              } catch (err) { PM.toast(err.message || '上传失败', 'err'); }
            }
            if (ok) PM.toast(`已添加 ${ok} 张图片`);
          });
          el.querySelector('[data-save]').onclick = async () => {
            const d = PM.formData(el);
            if (!d.name.trim()) return PM.toast('请填写名称', 'err');
            d.images = JSON.stringify(imgs);
            d.image = imgs[0] || '';   /* 首图同时写入旧字段，兼容首页组件与旧数据 */
            if (d.status === 'bought' && (!item || item.status !== 'bought')) d.bought_at = u.today();
            try {
              if (item) await api.update('wishlist', item.id, d);
              else await api.create('wishlist', d);
              PM.toast('已保存'); resolve(true); close();
            } catch (e) { PM.toast(e.message, 'err'); }
          };
        },
        onClose() { resolve(false); },
      });
    });
  }

  /* 点卡片图片 → 全屏放大；同一清单多图可左右滑动 / 点箭头 / ←→ 切换 */
  function openLightbox(list, startIdx, name) {
    const arr = (typeof list === 'string' ? [list] : (Array.isArray(list) ? list : [])).filter(Boolean);
    if (!arr.length) return;
    const multi = arr.length > 1;
    let idx = Math.max(0, Math.min(startIdx || 0, arr.length - 1));
    const ov = document.createElement('div');
    ov.className = 'wish-lightbox';
    ov.innerHTML = `
      <button class="wl-x" data-close type="button" title="关闭">✕</button>
      <div class="wl-stage"><img class="wl-img" src="${u.esc(arr[idx])}" alt="${u.esc(name || '')}"></div>
      ${multi ? `<button class="wl-arrow wl-prev" data-prev type="button" aria-label="上一张">‹</button>
        <button class="wl-arrow wl-next" data-next type="button" aria-label="下一张">›</button>
        <div class="wl-count" data-count></div>
        <div class="wl-dots" data-dots></div>` : ''}
      <div class="wish-lightbox-tip">${multi ? '左右滑动切换 · ' : ''}点空白或 ✕ 关闭</div>`;
    const stage = ov.querySelector('.wl-stage');
    const imgEl = ov.querySelector('.wl-img');
    const cntEl = ov.querySelector('[data-count]');
    const dotsEl = ov.querySelector('[data-dots]');
    const prevBtn = ov.querySelector('[data-prev]');
    const nextBtn = ov.querySelector('[data-next]');

    function paint() {
      imgEl.src = arr[idx];
      if (cntEl) cntEl.textContent = `${idx + 1} / ${arr.length}`;
      if (dotsEl) dotsEl.innerHTML = arr.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
      if (prevBtn) prevBtn.classList.toggle('disabled', idx <= 0);
      if (nextBtn) nextBtn.classList.toggle('disabled', idx >= arr.length - 1);
    }
    function go(d) {
      const n = Math.max(0, Math.min(idx + d, arr.length - 1));
      if (n === idx) return;
      idx = n; paint();
    }
    const onKey = e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    const close = () => { if (ov.isConnected) ov.remove(); document.removeEventListener('keydown', onKey); };

    ov.addEventListener('click', e => {
      if (e.target.closest('[data-prev]')) return go(-1);
      if (e.target.closest('[data-next]')) return go(1);
      /* 多图时点图片不关闭（避免滑动误触）；单图保留「点图即关」 */
      if (!multi && e.target.closest('.wl-stage')) return close();
      if (e.target.closest('[data-close]') || e.target === ov) close();
    });
    /* pointer 事件统一覆盖触摸（iPad）与鼠标拖拽 */
    let px = 0, py = 0, dragging = false;
    stage.addEventListener('pointerdown', e => { px = e.clientX; py = e.clientY; dragging = true; });
    stage.addEventListener('pointerup', e => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - px, dy = e.clientY - py;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', () => { dragging = false; });

    paint();
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  }

  async function viewMain(el, q) {
    const rows = await api.list('wishlist', { order_by: 'id', desc: 1 });
    const folders = [...new Set([...rows.map(r => r.folder).filter(Boolean), ...DEFAULT_FOLDERS])];
    const cur = q.f || '';
    const status = q.s || 'want';
    let list = rows.filter(r => (r.status || 'want') === status);
    if (cur) list = list.filter(r => r.folder === cur);
    const total = rows.filter(r => (r.status || 'want') === 'want').reduce((s, r) => s + (+r.price || 0), 0);

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>种草清单</h3><div class="sub">想买的、要准备的，按文件夹归类</div>
          <div class="right">
            <button class="btn sm primary" data-act="new">+ 添加</button></div></div>
        <div class="row wrap" style="margin-bottom:12px">
          <div class="seg">
            <button class="${status === 'want' ? 'on' : ''}" data-s="want">种草中 ${rows.filter(r => (r.status || 'want') === 'want').length}</button>
            <button class="${status === 'bought' ? 'on' : ''}" data-s="bought">已入手 ${rows.filter(r => r.status === 'bought').length}</button>
          </div>
          <div class="spacer"></div>
          <span class="small muted">待购预算合计 ¥${total.toFixed(0)}</span>
        </div>
        <div class="folder-chips">
          <a class="folder-chip ${cur ? '' : 'on'}" href="#/wishlist?s=${status}">全部</a>
          ${folders.map(f => `<a class="folder-chip ${cur === f ? 'on' : ''}" href="#/wishlist?f=${encodeURIComponent(f)}&s=${status}">${u.esc(f)}</a>`).join('')}
        </div>
        <div class="wish-grid">
          ${list.map(w => { const imgs = parseImgs(w); const cover = imgs[0] || ''; return `<div class="wish-card">
            <div class="thumb" data-act="zoom" data-id="${w.id}" title="${imgs.length > 1 ? `点击放大 · 左右滑动切换 ${imgs.length} 张` : '点击放大'}" style="${cover ? `background-image:url('${u.esc(cover)}')` : ''}">${cover ? (imgs.length > 1 ? `<span class="thumb-count">🖼 ${imgs.length}</span>` : '') : '📦'}</div>
            <div class="wb">
              <div class="wn">${u.esc(w.name)}</div>
              <div class="wm"><span class="tag purple">${u.esc(w.folder || '未分类')}</span>
                ${w.price ? `<span style="color:var(--red);font-weight:600">¥${u.esc(w.price)}</span>` : ''}
                ${w.priority === '3' ? '<span class="tag red">很想要</span>' : ''}</div>
              ${w.note ? `<div class="small muted wish-note">${u.esc(w.note).slice(0, 60)}</div>` : ''}
              <div class="row wish-acts">
                ${w.link ? `<a class="btn xs" href="${u.esc(w.link)}" target="_blank" rel="noopener">链接</a>` : ''}
                <div class="spacer"></div>
                <button class="btn xs" data-act="toggle" data-id="${w.id}">${status === 'want' ? '已买' : '退回'}</button>
                <button class="btn xs" data-act="edit" data-id="${w.id}">编辑</button>
                <button class="btn xs danger" data-act="del" data-id="${w.id}">删</button>
              </div>
            </div></div>`; }).join('') ||
          `<div class="empty" style="grid-column:1/-1"><span class="big">🧳</span>${status === 'want' ? '还没有种草的东西' : '还没有已入手的物品'}</div>`}
        </div>
      </div>`;

    el.querySelector('[data-act=new]').onclick = async () => { if (await wishEditor(folders, cur)) PM.refresh(); };
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => PM.go(`#/wishlist?s=${b.dataset.s}${cur ? '&f=' + encodeURIComponent(cur) : ''}`));
    el.onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'zoom') {
        const w = rows.find(x => x.id === b.dataset.id);
        const imgs = w ? parseImgs(w) : [];
        if (imgs.length) openLightbox(imgs, 0, w.name);
        return;
      }
      if (a === 'edit') { const w = rows.find(x => x.id === b.dataset.id); if (await wishEditor(folders, cur, w)) PM.refresh(); }
      if (a === 'toggle') {
        const w = rows.find(x => x.id === b.dataset.id);
        await api.update('wishlist', w.id, { status: w.status === 'bought' ? 'want' : 'bought', bought_at: w.status === 'bought' ? '' : u.today() });
        PM.refresh();
      }
      if (a === 'del') { if (await PM.confirm('删除该物品？')) { await api.remove('wishlist', b.dataset.id); PM.refresh(); } }
    };
  }

  async function todayWidget(box) {
    const rows = await api.list('wishlist', { order_by: 'id', desc: 1 });
    const want = rows.filter(r => (r.status || 'want') === 'want');
    /* 首页部件：带封面缩略图的小卡片（无图显示 📦），一眼看到种草的是什么 */
    box.appendChild(u.el(`<div class="widget">
      <div class="widget-head"><h4>🧳 种草清单</h4><div class="right">
        <span class="tag purple">${want.length} 件待入手</span></div></div>
      <div class="widget-body">
        ${want.length ? `<div class="wish-mini">
          ${want.slice(0, 6).map(w => {
            const imgs = parseImgs(w);
            const cover = imgs[0] || '';
            return `<a class="wish-mini-it" href="#/wishlist" title="${u.esc(w.name)}">
              ${cover ? `<img src="${u.esc(cover)}" alt="">` : '<span class="wm-noimg">📦</span>'}
              <b>${u.esc(w.name)}</b>
              ${w.price ? `<i>¥${u.esc(w.price)}</i>` : ''}
            </a>`;
          }).join('')}
        </div>` : '<div class="small muted">清单是空的，看到想买的先记下来 🧳</div>'}
        <div class="row" style="margin-top:10px">
          <button class="btn sm primary" data-act="new">+ 添加</button>
          <div class="spacer"></div><a class="small" href="#/wishlist">查看全部 →</a>
        </div>
      </div></div>`));
    const folders = [...new Set([...rows.map(r => r.folder).filter(Boolean), ...DEFAULT_FOLDERS])];
    box.querySelector('[data-act=new]').onclick = async () => { if (await wishEditor(folders, '')) PM.refresh(); };
  }

  PM.registerModule({
    id: 'wishlist',
    name: '种草清单',
    mobileLabel: '种草',
    icon: PM.icon('bookmark'),
    group: '清单',
    nav: [{ label: '种草清单', path: '', icon: PM.icon('bookmark') }],
    routes: { '': viewMain },
    today: [{ id: 'wish', order: 60, render: todayWidget }],
    api: { wishEditor, DEFAULT_FOLDERS },
  });
})();
