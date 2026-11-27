/* ===========================================================
 * 设置模块 + 启动
 * =========================================================== */
(function () {
  const { u, api } = PM;

  async function viewSettings(el) {
    const [cfg, stats, mail] = await Promise.all([api.settings(), api.req('/api/stats'), api.req('/api/mail/config')]);
    el.innerHTML = `
      <div class="set-page">
        <div class="card">
          <div class="card-head"><h3>🧩 模块管理</h3><div class="sub">关闭后从侧边栏隐藏；随时可以再加回来</div></div>
          <table class="tbl">
            <thead><tr><th>模块</th><th>说明</th><th>数据表</th><th>记录</th><th>显示</th></tr></thead>
            <tbody>
              ${PM.modules.filter(m => m.id !== 'today' && m.id !== 'settings').map(m => {
                const on = !(cfg.modules && cfg.modules[m.id] && cfg.modules[m.id].on === false);
                const cnt = (m.tables || []).reduce((s, t) => s + (stats[t] || 0), 0);
                return `<tr><td><b>${m.icon} ${u.esc(m.name)}</b></td>
                  <td class="small muted" data-label="说明">${u.esc(m.desc || '')}</td>
                  <td class="small muted" data-label="数据表">${(m.tables || []).join(', ') || '—'}</td>
                  <td class="mono" data-label="记录">${cnt}</td>
                  <td><label class="row small" style="gap:6px"><input type="checkbox" data-mod="${m.id}" ${on ? 'checked' : ''}></label></td></tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="small muted" style="margin-top:10px">新增模块：在 <span class="kbd">static/js/</span> 下新建一个文件，调用
            <span class="kbd">PM.registerModule({...})</span> 并在 <span class="kbd">index.html</span> 引入即可，
            后端只需在 <span class="kbd">app.py</span> 的 SCHEMAS 中注册一行数据表。</div>
        </div>

        <div class="set-grid2">
          <div class="card">
            <div class="card-head"><h3>🌤 天气与位置</h3><div class="sub">用于今日页展示</div></div>
            <div class="field"><label>城市</label>
              <div class="row"><input class="input" id="cityIn" value="${u.esc(cfg.city || '')}" placeholder="输入城市名后搜索">
                <button class="btn" id="citySearch">搜索</button></div>
              <div id="cityRes" class="small muted" style="margin-top:6px"></div></div>
            <div class="f2">
              <div class="field"><label>纬度</label><input class="input" id="latIn" type="number" step="0.0001" value="${u.esc(cfg.latitude)}"></div>
              <div class="field"><label>经度</label><input class="input" id="lonIn" type="number" step="0.0001" value="${u.esc(cfg.longitude)}"></div>
            </div>
            <div class="row"><button class="btn primary" id="saveGeo">保存位置</button>
              <span class="small muted">数据来自 Open-Meteo（免费、无需密钥）</span></div>
          </div>

          <div class="card">
            <div class="card-head"><h3>🔔 到期提醒</h3>
              <div class="sub">页面打开时生效；没填时间的待办按 09:00</div></div>
            <div class="row wrap" id="remRow">
              <label class="row small" style="gap:6px"><input type="checkbox" id="remOn" ${PM.reminder.on() ? 'checked' : ''}> 到期提醒</label>
              <button class="btn" id="btnNotify">开启浏览器通知</button>
              <span class="small muted" id="remStat"></span>
            </div>
            <div class="small muted" style="margin-top:9px;line-height:1.7">
              💡 横幅 + 提示音：手机/电脑都可用（页面打开时）。<br>
              📱 iPhone：需「分享 → 添加到主屏幕」后从图标打开再授权（iOS 16.4+）。<br>
              💻 电脑 Chrome：授权后切到别的标签页也会弹系统通知。
            </div>
          </div>
        </div>

        <div class="card mail-card">
          <div class="card-head"><h3>📮 邮件日报</h3>
            <div class="sub">每天固定时间把今日日程 + 待办 + 逾期事项汇总成一封邮件发出，页面关了也能收到</div></div>
          <div class="f3">
            <div class="field"><label>收件邮箱</label>
              <input class="input" id="mailTo" value="${u.esc(mail.to || '')}" placeholder="用于接收日报的邮箱"></div>
            <div class="field"><label>发件邮箱（SMTP 账号）</label>
              <input class="input" id="mailUser" value="${u.esc(mail.smtp_user || '')}" placeholder="如 xxx@qq.com"></div>
            <div class="field"><label>SMTP 授权码 ${mail.smtp_pass === '__SET__' ? '<span class="tag" style="color:#10b981">已保存</span>' : ''}</label>
              <input class="input" id="mailPass" type="password" placeholder="${mail.smtp_pass === '__SET__' ? '已保存，留空表示不修改' : '邮箱设置里生成的授权码'}"></div>
          </div>
          <div class="f3" style="align-items:end">
            <div class="field"><label>每天发送时间</label>
              <input class="input" id="mailTime" type="time" value="${u.esc((mail.send_time || '09:00').slice(0, 5))}"></div>
            <div class="field"><label>启用</label>
              <label class="row small" style="gap:6px;height:38px"><input type="checkbox" id="mailOn" ${mail.enabled ? 'checked' : ''}> 每天 ${u.esc((mail.send_time || '09:00').slice(0, 5))} 自动发日报</label></div>
            <div class="field"><label>&nbsp;</label>
              <div class="row"><button class="btn primary" id="mailSave">保存配置</button>
                <button class="btn" id="mailTest">📨 测试</button></div></div>
          </div>
          <details style="margin:2px 0 0"><summary class="small muted">高级：手填 SMTP 服务器（一般不用，按邮箱域名自动匹配）</summary>
            <div class="f2" style="margin-top:8px">
              <div class="field"><label>服务器</label><input class="input" id="mailHost" value="${u.esc(mail.smtp_host || '')}" placeholder="如 smtp.qq.com"></div>
              <div class="field"><label>端口</label><input class="input" id="mailPort" value="${u.esc(mail.smtp_port || '')}" placeholder="465(SSL) 或 587(TLS)"></div>
            </div></details>
          <div class="small muted" style="margin-top:9px;line-height:1.7" id="mailStat">
            ${mail.last_sent ? `✅ 最近一次发送：${u.esc(mail.last_sent)}` : '尚未发送过'}${mail.last_error ? ` · ❌ 上次错误：${u.esc(mail.last_error)}` : ''}
          </div>
          <div class="small muted" style="margin-top:4px;line-height:1.7">
            💡 QQ 邮箱：设置 → 账户 → 开启「IMAP/SMTP 服务」→ 生成授权码；163 邮箱：设置 → POP3/SMTP/IMAP → 获取授权码。
            🔒 授权码只存在你自己的服务器上，不会出现在页面源码里。
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>💾 CSV 数据库</h3><div class="sub">所有数据以 CSV 明文存储，可随时导出备份</div></div>
          <div class="set-stats">
            ${Object.keys(stats).filter(k => !k.startsWith('_')).map(k => `
              <div class="stat mini"><div class="k">${k}</div><div class="v">${stats[k]}</div></div>`).join('')}
          </div>
          <div class="row wrap" style="margin-top:13px">
            <a class="btn primary" href="/api/export">⬇ 导出全部数据（ZIP）</a>
            <span class="small muted">上传文件 ${stats._uploads} 个 · 数据目录 ${u.esc(stats._data_dir)}</span>
          </div>
          <div class="field" style="margin:13px 0 0"><label>从 CSV 恢复某一张表（会覆盖现有数据）</label>
            <div class="row wrap">
              <select class="input" id="impTable" style="max-width:220px">
                ${Object.keys(stats).filter(k => !k.startsWith('_')).map(k => `<option>${k}</option>`).join('')}
              </select>
              <input type="file" id="impFile" accept=".csv" class="input" style="max-width:260px">
              <button class="btn" id="impBtn">导入</button>
            </div></div>
        </div>
      </div>`;

    /* 模块开关 */
    el.querySelectorAll('[data-mod]').forEach(cb => cb.onchange = async () => {
      const modules = JSON.parse(JSON.stringify(cfg.modules || {}));
      modules[cb.dataset.mod] = { ...(modules[cb.dataset.mod] || {}), on: cb.checked };
      await api.saveSettings({ modules });
      cfg.modules = modules;
      await PM.buildNav();
      PM.toast('已更新模块显示');
    });

    /* 位置 */
    el.querySelector('#citySearch').onclick = async () => {
      const q = el.querySelector('#cityIn').value.trim();
      if (!q) return;
      const r = await api.req('/api/geocode?q=' + encodeURIComponent(q));
      const box = el.querySelector('#cityRes');
      box.innerHTML = (r.results || []).map(x =>
        `<div class="li" style="padding:7px 10px;cursor:pointer" data-lat="${x.latitude}" data-lon="${x.longitude}" data-name="${u.esc(x.name)}">
          ${u.esc(x.name)} <span class="small muted">${u.esc(x.admin1 || '')} ${u.esc(x.country || '')}</span></div>`).join('')
        || '<div class="small muted">没有找到该城市</div>';
      box.querySelectorAll('[data-lat]').forEach(d => d.onclick = () => {
        el.querySelector('#latIn').value = d.dataset.lat;
        el.querySelector('#lonIn').value = d.dataset.lon;
        el.querySelector('#cityIn').value = d.dataset.name;
      });
    };
    el.querySelector('#saveGeo').onclick = async () => {
      await api.saveSettings({
        city: el.querySelector('#cityIn').value.trim(),
        latitude: parseFloat(el.querySelector('#latIn').value),
        longitude: parseFloat(el.querySelector('#lonIn').value),
      });
      PM.toast('已保存，正在刷新天气');
      await PM.loadWeather();
    };
    el.querySelector('#btnNotify').onclick = async () => {
      if (!('Notification' in window)) return PM.toast('此环境不支持系统通知（iOS 请添加到主屏幕）', 'err');
      const p = await Notification.requestPermission();
      paintRemStat();
      PM.toast(p === 'granted' ? '已开启系统通知 ✅' : '未授权，页面内提醒仍可用');
    };
    el.querySelector('#remOn').onchange = e => {
      PM.reminder.setOn(e.target.checked);
      if (e.target.checked) PM.reminder.tick();
      PM.toast(e.target.checked ? '到期提醒已开启' : '到期提醒已关闭');
    };
    function paintRemStat() {
      const p = PM.reminder.notifyPermission();
      el.querySelector('#remStat').textContent =
        p === 'granted' ? '✅ 系统通知已授权' : p === 'denied' ? '系统通知被拒绝（可用页面内提醒）'
        : p === 'unsupported' ? '此环境不支持系统通知' : '系统通知未授权';
    }
    paintRemStat();

    /* 邮件日报 */
    const mailSave = async () => {
      const body = {
        to: el.querySelector('#mailTo').value.trim(),
        smtp_user: el.querySelector('#mailUser').value.trim(),
        send_time: el.querySelector('#mailTime').value || '09:00',
        enabled: el.querySelector('#mailOn').checked,
        smtp_host: el.querySelector('#mailHost').value.trim(),
        smtp_port: el.querySelector('#mailPort').value.trim(),
      };
      const pass = el.querySelector('#mailPass').value.trim();
      if (pass) body.smtp_pass = pass;
      if (body.enabled && (!body.to || !body.smtp_user)) return PM.toast('启用前请先填收件邮箱和发件邮箱', 'err');
      if (body.enabled && !pass && mail.smtp_pass !== '__SET__') return PM.toast('启用前请填写 SMTP 授权码', 'err');
      const r = await api.req('/api/mail/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) });
      if (r.ok) PM.toast('邮件日报配置已保存 ✅');
    };
    el.querySelector('#mailSave').onclick = mailSave;
    el.querySelector('#mailTest').onclick = async () => {
      await mailSave();
      try {
        await api.req('/api/mail/test', { method: 'POST' });
        PM.toast('测试邮件已发送，请查收 📬');
        el.querySelector('#mailStat').textContent = `✅ 测试邮件已发送 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (e) {
        PM.toast('发送失败：' + (e.message || '请检查授权码/SMTP 配置'), 'err');
        el.querySelector('#mailStat').textContent = '❌ 发送失败：' + (e.message || '请检查授权码/SMTP 配置');
      }
    };

    /* CSV 导入 */
    el.querySelector('#impBtn').onclick = async () => {
      const f = el.querySelector('#impFile').files[0];
      if (!f) return PM.toast('请选择 CSV 文件', 'err');
      if (!await PM.confirm('该操作会覆盖所选表的现有数据，确定继续？')) return;
      const fd = new FormData(); fd.append('file', f);
      const r = await api.req('/api/table/' + el.querySelector('#impTable').value + '/import', { method: 'POST', body: fd });
      PM.toast(`已导入 ${r.count} 条`);
    };
  }

  PM.registerModule({
    id: 'settings',
    name: '设置',
    icon: '⚙️',
    group: '系统',
    hide: true,
    nav: [],
    routes: { '': viewSettings },
  });

  /* 为模块补充数据表说明（设置页展示用） */
  const tableMap = {
    fitness: ['workouts', 'body_metrics'],
    // 成长/学习模块已移除，重建时在这里补一行： growth: ['articles', 'scenes', 'vocabulary', 'study_logs'],
    todo: ['todos'],
    wishlist: ['wishlist'],
    notes: ['notes'],
  };
  const descMap = {
    fitness: '训练记录、体测数据',
    todo: '待办、日程与提醒',
    wishlist: '种草清单，按文件夹分类',
    notes: '重要事项记录',
  };
  PM.modules.forEach(m => { m.tables = tableMap[m.id] || []; m.desc = descMap[m.id] || ''; });

  /* 启动 */
  PM.boot();
})();
