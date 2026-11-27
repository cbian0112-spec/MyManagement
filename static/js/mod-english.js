/* ===========================================================================
 * 英语学习模块
 * ---------------------------------------------------------------
 * 子标签由 TABS 表驱动；Vocabulary 已是完整功能，其余仍是占位页。
 * Vocabulary 功能：
 *   - 五个分类：新词 / 学习中 / 已掌握 / 收藏 / 高频错词
 *   - 单词详情：音标、发音(TTS)、中文释义、英文解释、例句、搭配、近义词、我的例句
 *   - 复习：固定间隔 Learn→Recall→Review→Master（后端 REVIEW_STEPS=[1,3,7,14,30]）
 *   - 加词时可一键查词典自动填充（后端 /api/dict）
 * ======================================================================== */
(function () {
  const u = PM.u;
  const api = PM.api;
  const T = u.today();

  /* 日历图标内联 SVG：字体缺 📅 字形，emoji 会变红方块；vocab 和 listening 共用 */
  const PLAN_ICON = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.6" y="2.8" width="12.8" height="11.6" rx="2.4" stroke="currentColor" stroke-width="1.6"/>
    <path d="M1.6 6.4h12.8M5 1.4v2.6M11 1.4v2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="5.6" cy="9.4" r="1.05" fill="currentColor"/><circle cx="8.4" cy="9.4" r="1.05" fill="currentColor"/>
  </svg>`;

  /* ---------------- 子标签定义 ---------------- */
  const TABS = [
    { key: '',            label: 'Dashboard',     icon: 'gauge',       desc: '学习总览：连续天数、今日任务完成度、待复习、听力、本周时长。' },
    { key: 'vocab',       label: 'Vocabulary',    icon: 'book',        desc: '生词本（含生词记忆库入口）。' },
    { key: 'listening',   label: 'Listening',     icon: 'headphones',  desc: '听力训练：按场景精听，盲听 → 理解题 → 看原文 → 逐句跟读。' },
    { key: 'expression',  label: 'Expression',    icon: 'chat',        desc: '表达积累：好句子、地道搭配、写作口语素材分类收藏。' },
    { key: 'plan',        label: 'Learning Plan', icon: 'target',      desc: '学习计划：阶段目标、每日任务清单、完成度追踪。' },
    { key: 'kb',          label: 'Knowledge Base',icon: 'library',     desc: '知识库：导入 PPT/邮件/会议等素材，发给助手整理成生词、听力与学习卡。' },
    { key: 'pending',      label: '待确认词库',    icon: 'inbox',       desc: '新词暂存区：划词/重点词先落这里，补全音标、中文、例句后再正式入库。' },
  ];

  /* ---------------- 占位页（未实现的标签用） ---------------- */
  function pagePlaceholder(tab) {
    const others = TABS.filter(t => t.key !== tab.key);
    return `
      <div class="en-hero">
        <span class="en-hero-ico">${PM.icon(tab.icon, { size: 30 })}</span>
        <div>
          <h3>${u.esc(tab.label)}</h3>
          <p class="small muted">${u.esc(tab.desc)}</p>
        </div>
      </div>
      <div class="en-ph-card">
        <span class="big">🚧</span>
        <div class="t">这个区块还在规划中</div>
        <div class="s small muted">确定具体功能后，从这里开始填充</div>
      </div>
      <div class="li-group"><span>其他区块</span></div>
      <div class="en-links">
        ${others.map(o => `<a class="en-link" href="#/english/${o.key}">
          <span class="ico">${PM.icon(o.icon, { size: 18 })}</span>
          <span>${u.esc(o.label)}</span><i>→</i></a>`).join('')}
      </div>`;
  }

  /* =============================================================
   * Vocabulary 词汇中心
   * ============================================================= */
  const STATUS_LABEL = { new: '新词', learning: '学习中', mastered: '已掌握' };
  const NEXT_LABEL = { 0: '明天', 1: '3 天后', 2: '7 天后', 3: '14 天后', 4: '30 天后' };
  const STEPS = [1, 3, 7, 14, 30];
  const isDue = r => r.status !== 'new' && !!r.next_review && r.next_review <= T;

  /* 熟练度：每次评分留下的脚印（认识/模糊/不记得） */
  const GRADE_LABEL = { know: '😃 认识', fuzzy: '🤔 模糊', forget: '😵 不记得' };
  const GRADE_CLS = { know: 'green', fuzzy: 'orange', forget: 'red' };
  const gradeTag = r => r.last_grade
    ? `<span class="tag ${GRADE_CLS[r.last_grade] || ''}">${GRADE_LABEL[r.last_grade] || r.last_grade}</span>`
    : '<span class="tag gray">未测试</span>';

  /* 间隔进度条：1/3/7/14/30。done=已跨过的档位数，cur=当前停靠档 */
  const progBar = r => {
    const lvl = +r.level || 0;
    const done = r.status === 'mastered' ? STEPS.length : r.status === 'new' ? 0 : lvl;
    const cur = r.status === 'learning' ? lvl : -1;
    return `<div class="vw-prog" title="复习间隔进度：每答对一次前进一档（1/3/7/14/30 天）">` +
      STEPS.map((s, i) => `<i class="vp ${i < done ? 'ok' : i === cur ? 'cur' : ''}">${i < done ? '✓' : s}</i>`).join('') +
      `</div>`;
  };
  const footHtml = r => `${gradeTag(r)}${progBar(r)}`;

  /* =============================================================
   * 音节拆分（卡片上按音节分色显示，方便按「一元一辅」拼读记忆）
   * -------------------------------------------------------------
   * 两段式：SYLLABLE_DICT 是人工核定的高频词，直接取答案；
   * 词典没有的词（用户新加的）用规则推算。
   * 纯规则在真实词表上准确率不够（easily→ea-sily、framework→fra-mew-ork），
   * 所以常用词必须查表，规则只做兜底。
   * ============================================================= */
  const SYLLABLE_DICT = {
    /* 英孚 Level 1 导入词的精确切分 */
    angry: 'an-gry', friendly: 'friend-ly', funny: 'fun-ny', happy: 'hap-py',
    naughty: 'naugh-ty', noisy: 'nois-y', quiet: 'qui-et', scary: 'sca-ry',
    unfriendly: 'un-friend-ly', dirty: 'dirt-y', hairy: 'hai-ry',
    pretty: 'pret-ty', ugly: 'u-gly', monster: 'mon-ster', football: 'foot-ball',
    adapt: 'a-dapt', adopted: 'a-dopt-ed', advantage: 'ad-van-tage',
    available: 'a-vail-a-ble', availability: 'a-vail-a-bil-i-ty',
    capability: 'ca-pa-bil-i-ty', centralized: 'cen-tral-ized',
    clinical: 'clin-i-cal', complex: 'com-plex',
    comprehensive: 'com-pre-hen-sive', concept: 'con-cept',
    consistent: 'con-sis-tent', coverage: 'cov-er-age',
    digital: 'dig-i-tal', generative: 'gen-er-a-tive', generic: 'ge-ner-ic',
    industrial: 'in-dus-tri-al', intelligent: 'in-tel-li-gent',
    internal: 'in-ter-nal', legacy: 'leg-a-cy', relevant: 'rel-e-vant',
    reliable: 're-li-a-ble', specific: 'spe-cif-ic', successful: 'suc-cess-ful',
    technical: 'tech-ni-cal', unified: 'u-ni-fied', unique: 'u-nique',
    valid: 'val-id', visible: 'vis-i-ble',
    allow: 'al-low', calculate: 'cal-cu-late', capture: 'cap-ture',
    communicate: 'com-mu-ni-cate', consider: 'con-sid-er', create: 'cre-ate',
    deploy: 'de-ploy', develop: 'de-vel-op', evaluate: 'e-val-u-ate',
    expand: 'ex-pand', include: 'in-clude', install: 'in-stall',
    integrate: 'in-te-grate', integrated: 'in-te-grat-ed',
    manipulate: 'ma-nip-u-late', mention: 'men-tion', realize: 're-al-ize',
    release: 're-lease', remove: 're-move', streamline: 'stream-line',
    summarize: 'sum-ma-rize', transform: 'trans-form',
    basically: 'ba-si-cal-ly', besides: 'be-sides', easily: 'eas-i-ly',
    finally: 'fi-nal-ly', globally: 'glob-al-ly', luckily: 'luck-i-ly',
    usually: 'u-su-al-ly', whatever: 'what-ev-er', yesterday: 'yes-ter-day',
    unfortunately: 'un-for-tu-nate-ly', alongside: 'a-long-side',
    architecture: 'ar-chi-tec-ture', charge: 'charge',
    competition: 'com-pe-ti-tion', engagement: 'en-gage-ment',
    expertise: 'ex-per-tise', extension: 'ex-ten-sion',
    foundation: 'foun-da-tion', framework: 'frame-work',
    governance: 'gov-er-nance', hire: 'hire', identity: 'i-den-ti-ty',
    innovation: 'in-no-va-tion', instrument: 'in-stru-ment',
    integration: 'in-te-gra-tion', perspective: 'per-spec-tive',
    pharmaceutical: 'phar-ma-ceu-ti-cal', philosophy: 'phi-los-o-phy',
    presence: 'pres-ence', reference: 'ref-er-ence',
    requirement: 're-quire-ment', responsibility: 're-spon-si-bil-i-ty',
    shift: 'shift', vision: 'vi-sion',
  };

  const SYL_VOWELS = 'aeiou';
  const SYL_DIGRAPHS = ['eau', 'iou', 'ea', 'ee', 'oo', 'ou', 'ow', 'oa', 'oi', 'oy',
    'ai', 'ay', 'au', 'aw', 'ei', 'ey', 'ie', 'ue', 'ui', 'eu', 'ew'];
  const SYL_ONSETS = ['tch', 'dge', 'sch', 'shr', 'thr', 'chr', 'phr', 'spl', 'spr',
    'str', 'scr', 'squ', 'th', 'sh', 'ch', 'ph', 'wh', 'gh', 'ck', 'ng', 'qu',
    'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr',
    'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'dw', 'gn', 'kn', 'wr'];
  const SYL_LE_TAILS = ['stle', 'ble', 'cle', 'dle', 'fle', 'gle', 'kle', 'ple', 'tle', 'zle'];
  const SYL_SOLID_TAILS = ['tion', 'sion', 'cious', 'tious', 'gious'];
  const SYL_TAIL_FIX = [['ate', 2], ['ite', 2], ['ute', 2], ['ete', 2], ['ote', 2],
    ['ade', 2], ['ize', 2], ['ise', 2], ['ase', 2], ['ose', 2], ['use', 2], ['age', 2]];

  const isAlphaWord = w => !!w && /^[a-zA-Z]+$/.test(w);

  /* 规则推算：找元音核 → 从后往前把辅音分配给后一音节 */
  function ruleSplit(w) {
    const nuclei = [];
    let i = 0;
    const leTail = SYL_LE_TAILS.find(t => w.endsWith(t));
    while (i < w.length) {
      if (SYL_VOWELS.indexOf(w[i]) >= 0) {
        let m = null;
        for (const d of SYL_DIGRAPHS) if (w.startsWith(d, i)) { m = d; break; }
        /* 末尾单 e 是静音，不构成音节 */
        if (!m && w[i] === 'e' && i === w.length - 1 && nuclei.length) { i++; continue; }
        /* 词尾 y 前面是辅音时是元音（angry/happy/pretty…），否则当辅音 */
        if (!m && w[i] === 'y' && i === w.length - 1 && i > 0 && SYL_VOWELS.indexOf(w[i - 1]) < 0) {
          nuclei.push([i, i + 1]); i++; continue;
        }
        if (m) { nuclei.push([i, i + m.length]); i += m.length; }
        else { nuclei.push([i, i + 1]); i++; }
      } else i++;
    }
    if (leTail && nuclei.length) {
      const lePos = w.length - 2;
      if (lePos > nuclei[nuclei.length - 1][1]) nuclei.push([lePos, lePos + 1]);
    }
    if (nuclei.length <= 1) return [w];

    const cuts = [];
    for (let k = 0; k < nuclei.length - 1; k++) {
      const a = nuclei[k][1], b = nuclei[k + 1][0];
      const cons = w.slice(a, b);
      if (!cons) { cuts.push(b); continue; }
      if (cons.length === 1) { cuts.push(a); continue; }
      let keep = 1;
      for (let L = cons.length; L >= 1; L--) {
        if (L === 1 || SYL_ONSETS.indexOf(cons.slice(-L)) >= 0) { keep = L; break; }
      }
      const cut = b - keep;
      cuts.push(cut > nuclei[k][0] ? cut : a);
    }
    /* -tion/-sion 等尾部整体不拆 */
    SYL_SOLID_TAILS.forEach(st => {
      let idx = w.indexOf(st);
      while (idx >= 0) {
        for (let ci = cuts.length - 1; ci >= 0; ci--) {
          if (cuts[ci] > idx && cuts[ci] < idx + st.length) {
            cuts.splice(ci, 1);
            if (idx > 0) cuts.push(idx);
          }
        }
        idx = w.indexOf(st, idx + 1);
      }
    });
    cuts.sort((x, y) => x - y);

    let parts = [], prev = 0;
    cuts.forEach(c => { if (c > prev) { parts.push(w.slice(prev, c)); prev = c; } });
    parts.push(w.slice(prev));

    /* -ate/-ize 等尾部补切 */
    for (const [suf, keep] of SYL_TAIL_FIX) {
      const last = parts[parts.length - 1];
      if (parts.length && last.endsWith(suf) && last.length > keep + 1) {
        const head = last.slice(0, -keep);
        if (head && SYL_VOWELS.indexOf(head[head.length - 1]) >= 0) {
          parts[parts.length - 1] = head;
          parts.push(last.slice(-keep));
        }
        break;
      }
    }
    /* 尾部孤立「辅音+e」并回前段（in-te-gra-te → in-te-grate） */
    while (parts.length > 1) {
      const t = parts[parts.length - 1];
      if (t.length === 2 && SYL_VOWELS.indexOf(t[0]) < 0 && t[1] === 'e') {
        parts[parts.length - 2] += t;
        parts.pop();
      } else break;
    }
    return parts;
  }

  /* 对外：返回音节数组；短语/带符号的词返回 null（不拆） */
  function syllables(word) {
    if (!isAlphaWord(word)) return null;
    const low = word.toLowerCase();
    const hit = SYLLABLE_DICT[low];
    if (hit) {
      const parts = hit.split('-');
      /* 按长度切回原始大小写 */
      const out = [];
      let pos = 0;
      for (const p of parts) { out.push(word.slice(pos, pos + p.length)); pos += p.length; }
      return pos === word.length ? out : parts;
    }
    return ruleSplit(low);
  }

  /* 音标里常混着中文备注（"conˈsistent —— 重音在第 2 音节"），
     卡片位置窄，只取破折号前的纯音标部分；全部是中文说明时返回空串 */
  const shortPhonetic = s => {
    if (!s) return '';
    let t = String(s).split(/\s*[—–\-]{2,}\s*/)[0].trim();
    /* 去掉括号里的说明：aˈdopted (重音2) */
    t = t.replace(/\([^)]*[\u4e00-\u9fa5][^)]*\)/g, '').trim();
    /* 纯中文说明（没有音标字符）就不显示 */
    if (!/[a-zɑɒæəɜɪʊʌɔθðʃʒŋˈˌː]/i.test(t)) return '';
    return t;
  };

  /* 自定义音节拆分：用户在单词上填的「an-gry」优先于规则推算。
     支持短语（jigsaw puzzle → Jig-saw-pu-zzle）：逐段按字母比对，
     空格自动归到前一段末尾；对不上就回落到自动切分，保证不出错色块 */
  function customSyllables(word, custom) {
    if (!custom || !word) return null;
    const parts = String(custom).split('-').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const chars = String(word).split('');
    const isL = c => /[a-zA-Z]/.test(c);
    const total = chars.filter(isL).length;
    let ci = 0, used = 0;
    const out = [];
    for (const p of parts) {
      const pl = p.toLowerCase().replace(/[^a-z]/g, '');
      if (!pl) return null;
      let seg = '', taken = 0;
      while (ci < chars.length && taken < pl.length) {
        const c = chars[ci];
        if (isL(c)) {
          if (c.toLowerCase() !== pl[taken]) return null;
          taken++;
        } else if (!taken) return null;  /* 段首不应该是空格 */
        seg += c; ci++;
      }
      if (taken < pl.length) return null;
      /* 段与段之间的空格归到前一段末尾，显示更自然 */
      let tail = '';
      while (ci < chars.length && !isL(chars[ci])) { tail += chars[ci]; ci++; }
      out.push(seg + tail);
      used += pl.length;
    }
    if (used !== total) return null;
    while (ci < chars.length) { if (isL(chars[ci])) return null; ci++; }
    return out;
  }

  /* 音节分色 HTML：相邻音节交替配色，一眼能看出切在哪。
     单音节词也出一个色块——既是「整词就是一个音节」的信息，
     也保证同一行卡片高度对齐（否则单音节卡片会矮一截） */
  function syllableHtml(word, extraCls, custom) {
    const parts = customSyllables(word, custom) || syllables(word);
    if (!parts || !parts.length) return '';
    return `<div class="vw-syl ${extraCls || ''}">` + parts
      .map((p, i) => `<span class="sy s${i % 4}">${u.esc(p)}</span>`).join('') + '</div>';
  }

  /* 单词编辑弹窗（新建/编辑共用）。dictHit：刚查完词典的自动填充标记 */
  async function wordEditor(row, onSaved) {
    await loadDecks();
    const t = row || {};
    const isNew = !row;
    /* 新建时默认落到当前正在浏览的库（全部视图下落到默认库 business） */
    const defDeck = t.deck || (vocabDeck !== 'all' ? vocabDeck : 'business');
    PM.modal({
      title: isNew ? '添加单词' : '编辑单词',
      body: `
        <div class="field"><label>单词 *</label>
          <div style="display:flex;gap:8px">
            <input class="input" name="word" placeholder="输入英文单词" value="${u.esc(t.word || '')}" style="flex:1">
            <button class="btn" type="button" data-dict title="查词典自动填充">📖 查词典</button>
          </div>
          <div class="word-syl-preview" data-sylpreview></div></div>
        <div class="f2">
          <div class="field"><label>音标</label><input class="input" name="phonetic" value="${u.esc(t.phonetic || '')}" placeholder="/ˈwɜːdɪ/"></div>
          <div class="field"><label>音节拆分</label>
            <input class="input" name="syllables" value="${u.esc(t.syllables || '')}" placeholder="an-gry（短语也能拆）· 留空自动切分"></div>
        </div>
        <div class="f2">
          <div class="field"><label>词库</label>
            <select class="input deck-select" name="deck">
              ${GROUPS.map(g => `
                <optgroup label="${g}">
                  ${DECKS.filter(d => d.group === g).map(d =>
                    `<option value="${d.key}"${defDeck === d.key ? ' selected' : ''}>${d.name}${d.cn ? ' · ' + d.cn : ''}</option>`).join('')}
                </optgroup>`).join('')}
            </select></div>
        </div>
        <div class="field"><label>来源</label><input class="input" name="source" value="${u.esc(t.source || '')}" placeholder="阅读 / 听力 / 工作…"></div>
        <div class="field"><label>中文释义</label><input class="input" name="meaning_cn" value="${u.esc(t.meaning_cn || '')}"></div>
        <div class="field"><label>英文解释</label><textarea class="input" name="meaning_en" rows="2">${u.esc(t.meaning_en || '')}</textarea></div>
        <div class="field"><label>例句</label><textarea class="input" name="example" rows="2">${u.esc(t.example || '')}</textarea></div>
        <div class="field"><label>例句翻译</label><input class="input" name="example_cn" value="${u.esc(t.example_cn || '')}"></div>
        <div class="f2">
          <div class="field"><label>搭配 Collocation</label><input class="input" name="collocation" value="${u.esc(t.collocation || '')}" placeholder="make a decision…"></div>
          <div class="field"><label>近义词 Synonyms</label><input class="input" name="synonyms" value="${u.esc(t.synonyms || '')}" placeholder="wordA, wordB"></div>
        </div>
        <div class="field"><label>我的例句</label><textarea class="input" name="my_sentence" rows="2" placeholder="用这个单词自己造一句">${u.esc(t.my_sentence || '')}</textarea></div>
        <div class="field"><label>备注</label><input class="input" name="note" value="${u.esc(t.note || '')}"></div>`,
      foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
      onMount(el, close) {
        /* 输入单词/拆分时实时预览音节切分，能顺手确认切得对不对 */
        const wIn = el.querySelector('[name=word]');
        const sylIn = el.querySelector('[name=syllables]');
        const prev = el.querySelector('[data-sylpreview]');
        const renderPrev = () => {
          if (!prev) return;
          const v = wIn.value.trim();
          const ps = customSyllables(v, sylIn ? sylIn.value.trim() : '') || syllables(v);
          const custom = sylIn && sylIn.value.trim();
          if (!ps || !ps.length) {
            prev.innerHTML = v && !isAlphaWord(v)
              ? '<span class="sp-tip">短语/带符号的词不切分</span>' : '';
            return;
          }
          prev.innerHTML = '<span class="sp-k">音节</span>' + ps
            .map((p, i) => `<span class="sy s${i % 4}">${u.esc(p)}</span>`).join('')
            + `<span class="sp-tip">${custom ? (customSyllables(v, custom) ? '自定义' : '自定义格式不对，已按自动切分') : ps.length + ' 个音节'}</span>`;
        };
        if (wIn) { wIn.addEventListener('input', renderPrev); renderPrev(); }
        if (sylIn) sylIn.addEventListener('input', renderPrev);

        /* 查词典：后端聚合 dictionaryapi.dev + 有道，空字段才填，不覆盖手写内容 */
        el.querySelector('[data-dict]').onclick = async () => {
          const w = el.querySelector('[name=word]').value.trim();
          if (!w) return PM.toast('先输入单词', 'err');
          const btn = el.querySelector('[data-dict]');
          btn.disabled = true; btn.textContent = '查询中…';
          try {
            const d = await (await fetch('/api/dict/' + encodeURIComponent(w))).json();
            if (!d.ok) return PM.toast('没查到，手动填吧');
            const e = d.entry || {};
            const fill = (name, val) => {
              const inp = el.querySelector(`[name=${name}]`);
              if (val && !inp.value.trim()) inp.value = val;
            };
            fill('phonetic', e.phonetic); fill('meaning_en', e.meaning_en);
            fill('meaning_cn', e.meaning_cn); fill('example', e.example);
            renderPrev();
            PM.toast(d.from === 'local' ? '本地已有这个词' : '已填充');
          } catch (e) { PM.toast('查询失败', 'err'); }
          btn.disabled = false; btn.textContent = '📖 查词典';
        };
        el.querySelector('[data-save]').onclick = async () => {
          const d = PM.formData(el);
          if (!d.word.trim()) return PM.toast('单词不能为空', 'err');
          d.word = d.word.trim();
          d.syllables = (d.syllables || '').trim();
          if (isNew) { d.status = 'new'; d.level = '0'; d.favorite = '0'; d.wrong_count = '0'; }
          if (isNew) await api.create('vocabulary', d);
          else await api.update('vocabulary', row.id, d);
          close(); PM.toast('已保存'); onSaved && onSaved();
        };
      },
    });
  }

  /* 批量导入：每行一条「单词|音标|中文|拆分」，音标/中文/拆分可留空（拆分空则自动切分） */
  function bulkWordImport(onSaved) {
    const defDeck = vocabDeck !== 'all' ? vocabDeck : 'business';
    PM.modal({
      title: '批量导入单词',
      body: `
        <div class="f2">
          <div class="field"><label>导入到词库</label>
            <select class="input deck-select" name="deck">
              ${GROUPS.map(g => `
                <optgroup label="${g}">
                  ${DECKS.filter(d => d.group === g).map(d =>
                    `<option value="${d.key}"${defDeck === d.key ? ' selected' : ''}>${d.name}${d.cn ? ' · ' + d.cn : ''}</option>`).join('')}
                </optgroup>`).join('')}
            </select></div>
          <div class="field"><label>初始状态</label>
            <select class="input" name="status">
              <option value="new">新词</option>
              <option value="learning">学习中</option>
            </select></div>
        </div>
        <div class="field"><label>单词列表（每行一条：<b>单词|音标|中文|拆分</b>）</label>
          <textarea class="input" name="lines" rows="10" placeholder="happy|/ˈhæpi/|开心的|hap-py
teddy bear|/ˈtedi beə(r)/|泰迪熊|
quiet|/ˈkwaɪət/|安静的|qui-et" style="font-family:monospace;font-size:12.5px"></textarea>
          <div class="small muted" data-bulkinfo style="margin-top:6px">分隔符用竖线 | ；单词必填，音标/中文/拆分可留空；拆分留空则自动切分；已在词库里的词会跳过</div></div>`,
      foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>导入</button>`,
      onMount(el, close) {
        const ta = el.querySelector('[name=lines]');
        const info = el.querySelector('[data-bulkinfo]');
        const parse = () => String(ta.value || '').split('\n')
          .map(l => l.trim()).filter(Boolean)
          .map(l => l.split('|').map(s => s.trim()));
        const refreshInfo = () => {
          const rows = parse();
          const bad = rows.filter(r => !r[0]).length;
          const uniq = new Set(rows.filter(r => r[0]).map(r => r[0].toLowerCase())).size;
          info.textContent = rows.length
            ? `共 ${rows.length} 行${bad ? `，${bad} 行缺单词会被跳过` : ''}，文本内不重复 ${uniq} 个，准备导入`
            : '分隔符用竖线 | ；单词必填，音标/中文/拆分可留空；拆分留空则自动切分；已在词库里的词会跳过';
        };
        ta.addEventListener('input', refreshInfo);
        el.querySelector('[data-save]').onclick = async () => {
          const deck = el.querySelector('[name=deck]').value;
          const st = el.querySelector('[name=status]').value;
          const rows = parse().filter(r => r[0]);
          if (!rows.length) return PM.toast('没有可导入的行（每行至少要有单词）', 'err');
          /* 与库内已有词去重 */
          let existing = new Set();
          try { existing = new Set((await api.list('vocabulary')).map(r => (r.word || '').toLowerCase())); } catch (e) {}
          const today = new Date().toISOString().slice(0, 10);
          let ok = 0, skip = 0;
          PM.toast('导入中…');
          for (const [w, ph, cn, syl] of rows) {
            const key = w.toLowerCase();
            if (existing.has(key)) { skip++; continue; }
            existing.add(key);
            try {
              await api.create('vocabulary', {
                word: w, phonetic: ph || '', meaning_cn: cn || '',
                syllables: syl || '', deck, status: st,
                level: '0', favorite: '0', wrong_count: '0',
                source: '批量导入', added_at: today,
              });
              ok++;
            } catch (e) { skip++; }
          }
          close();
          PM.toast(`导入 ${ok} 条${skip ? `，跳过 ${skip} 条（重复/失败）` : ''}`);
          PM.refresh(); onSaved && onSaved();
        };
      },
    });
  }

  /* 表达编辑：phrase 是地道英文，meaning_cn 是中文意思。
     category 用自由输入 + 常用分类候选（datalist），方便归类又不强约束。 */
  function exprEditor(row, onSaved) {
    const t = row || {};
    const isNew = !row;
    const cats = ['日常', '工作', '情感', '鼓励', '饮食', '出行', '社交', '学习'];
    PM.modal({
      title: isNew ? '添加表达' : '编辑表达',
      body: `
        <div class="field"><label>地道英文 *</label>
          <input class="input" name="phrase" placeholder="如 I'm full." value="${u.esc(t.phrase || '')}"></div>
        <div class="f2">
          <div class="field"><label>音标</label><input class="input" name="phonetic" value="${u.esc(t.phonetic || '')}" placeholder="/aɪm fʊl/"></div>
          <div class="field"><label>分类</label>
            <input class="input" name="category" list="expr-cats" value="${u.esc(t.category || '')}" placeholder="日常 / 工作…">
            <datalist id="expr-cats">${cats.map(c => `<option value="${c}">`).join('')}</datalist></div>
        </div>
        <div class="field"><label>中文意思 *</label><input class="input" name="meaning_cn" value="${u.esc(t.meaning_cn || '')}" placeholder="我吃饱了。"></div>
        <div class="field"><label>英文解释</label><textarea class="input" name="meaning_en" rows="2">${u.esc(t.meaning_en || '')}</textarea></div>
        <div class="field"><label>例句</label><textarea class="input" name="example" rows="2">${u.esc(t.example || '')}</textarea></div>
        <div class="field"><label>例句翻译</label><input class="input" name="example_cn" value="${u.esc(t.example_cn || '')}"></div>
        <div class="f2">
          <div class="field"><label>来源</label><input class="input" name="source" value="${u.esc(t.source || '')}" placeholder="阅读 / 听力 / 工作…"></div>
          <div class="field"><label>备注</label><input class="input" name="note" value="${u.esc(t.note || '')}"></div>
        </div>`,
      foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
      onMount(el, close) {
        el.querySelector('[data-save]').onclick = async () => {
          const d = PM.formData(el);
          if (!d.phrase.trim()) return PM.toast('地道英文不能为空', 'err');
          if (!d.meaning_cn.trim()) return PM.toast('中文意思不能为空', 'err');
          d.phrase = d.phrase.trim();
          if (isNew) { d.status = 'new'; d.level = '0'; d.favorite = '0'; d.wrong_count = '0'; d.added_at = u.today(); }
          if (isNew) await api.create('expressions', d);
          else await api.update('expressions', row.id, d);
          close(); PM.toast('已保存'); onSaved && onSaved();
        };
      },
    });
  }

  /* 单词详情抽屉：全部字段 + 发音 + 复习打分 */
  function wordDrawer(r, onChanged) {
    const status = STATUS_LABEL[r.status] || r.status;
    const speakBtn = `<button class="btn sm" data-speak>🔊 发音</button>`;
    const reviewBox = r.status === 'new'
      ? `<div class="small muted" style="margin-top:10px">新词，还没开始复习。点下面的「认识」开始 Learn。</div>`
      : `<div class="li-group" style="margin-top:18px"><span>这次记住了吗</span></div>
         <div class="row" style="gap:8px">
           <button class="btn sm danger" data-grade="forget">😵 忘记 · 明天再来</button>
           <button class="btn sm" data-grade="fuzzy">🤔 模糊 · 原级重排</button>
           <button class="btn sm primary" data-grade="know">😃 认识 · ${NEXT_LABEL[Math.min(+r.level + 1, 4)]}</button>
         </div>`;
    PM.drawer({
      title: u.esc(r.word),
      body: `
        <div class="wd-head">
          <div class="wd-word">${u.esc(r.word)}</div>
          ${wdSyllableHtml(r.word, r.syllables)}
          <div class="wd-ph">${u.esc(r.phonetic || '—')} ${speakBtn}</div>
          <div class="wd-tags">
            <span class="tag ${r.status === 'mastered' ? 'green' : r.status === 'learning' ? 'blue' : 'orange'}">${status}</span>
            ${r.deck ? `<span class="tag deck">${u.esc(deckName(r.deck) || r.deck)}</span>` : ''}
            ${+r.wrong_count >= 2 ? `<span class="tag red">错 ${r.wrong_count} 次</span>` : ''}
            ${isDue(r) ? '<span class="tag pink">待复习</span>' : ''}
            ${r.next_review ? `<span class="tag">下次 ${u.esc(r.next_review)}</span>` : ''}
          </div>
          <div class="wd-prog">
            <span class="wd-prog-k">熟练度</span>
            ${footHtml(r)}
          </div>
        </div>
        ${r.meaning_cn ? `<div class="wd-sec"><b>中文释义</b><p>${u.esc(r.meaning_cn)}</p></div>` : ''}
        ${r.meaning_en ? `<div class="wd-sec"><b>英文解释</b><p>${u.esc(r.meaning_en)}</p></div>` : ''}
        ${r.example ? `<div class="wd-sec"><b>Example</b><p class="en-sent">${u.esc(r.example)}</p>${r.example_cn ? `<p class="small muted">${u.esc(r.example_cn)}</p>` : ''}</div>` : ''}
        ${r.collocation ? `<div class="wd-sec"><b>Collocation</b><p class="en-sent">${u.esc(r.collocation)}</p></div>` : ''}
        ${r.synonyms ? `<div class="wd-sec"><b>Synonyms</b><p>${u.esc(r.synonyms).split(/[,，]/).map(s => `<span class="tag">${u.esc(s.trim())}</span>`).join(' ')}</p></div>` : ''}
        ${r.my_sentence ? `<div class="wd-sec"><b>我的例句</b><p class="en-sent">${u.esc(r.my_sentence)}</p></div>` : ''}
        ${r.note ? `<div class="wd-sec"><b>备注</b><p>${u.esc(r.note)}</p></div>` : ''}
        ${reviewBox}`,
      foot: `<button class="btn" data-drawer-fav>${r.favorite === '1' ? '★ 取消收藏' : '☆ 收藏'}</button>
             <button class="btn" data-edit>编辑</button>
             <button class="btn danger" data-del>删除</button>`,
      onClose: onChanged,
    });
    const root = document.getElementById('drawerRoot');
    root.querySelector('[data-speak]').onclick = () => u.speak(r.word);
    /* 点单个音节听读音，方便逐段跟读 */
    root.querySelectorAll('[data-syl]').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); u.speak(btn.dataset.syl); };
    });
    root.querySelector('[data-drawer-fav]').onclick = async e => {
      const nv = r.favorite === '1' ? '0' : '1';
      await api.update('vocabulary', r.id, { favorite: nv });
      r.favorite = nv; e.target.textContent = nv === '1' ? '★ 取消收藏' : '☆ 收藏';
    };
    root.querySelector('[data-edit]').onclick = () => wordEditor(r, onChanged);
    root.querySelector('[data-del]').onclick = async () => {
      if (await PM.confirm(`删除「${r.word}」？`)) {
        await api.remove('vocabulary', r.id);
        document.querySelector('.drawer-root .mask') && document.querySelector('#drawerRoot [data-close]').click();
        onChanged();
      }
    };
    root.querySelectorAll('[data-grade]').forEach(b => b.onclick = async () => {
      const res = await (await fetch(`/api/vocab/${r.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: b.dataset.grade }),
      })).json();
      if (res.ok) { PM.toast('已记录'); onChanged(); }
    });
  }

  /* 复习模式：一张卡片过完整个队列（onMount 的 el 就是 .modal，foot 可直接改写） */
  /* mode = 'learn' 学新词 / 'review' 复习；只影响标题文案与完成页措辞 */
  async function reviewSession(queue, onDone, mode, opts) {
    const textKey = (opts && opts.textKey) || 'word';
    const table = (opts && opts.table) || 'vocabulary';
    const showSyll = !opts || opts.showSyll !== false;
    let i = 0;
    const isLearn = mode === 'learn';
    const titleWord = isLearn ? '学新词' : '复习';
    const stats = { know: 0, fuzzy: 0, forget: 0 };

    const gradeButtons = r => `
      <button class="btn danger" data-g="forget" style="flex:1"><span>😵 忘记</span><div class="small" style="font-weight:700">明天重来</div></button>
      <button class="btn" data-g="fuzzy" style="flex:1"><span>🤔 模糊</span><div class="small" style="font-weight:700">${(NEXT_LABEL[+r.level] || '明天')}再练</div></button>
      <button class="btn primary" data-g="know" style="flex:1"><span>😃 认识</span><div class="small" style="font-weight:700">${r.status === 'new' ? '开始学 · 明天' : NEXT_LABEL[Math.min(+r.level + 1, 4)]}</div></button>`;

    const show = () => {
      if (i >= queue.length) {
        PM.modal({
          title: `${titleWord}完成 🎉`,
          body: `<div style="text-align:center;padding:14px 0">
            <div style="font-size:38px">🎊</div>
            <p style="font-weight:800;margin:8px 0">这${isLearn ? '批新词' : '一轮'} ${queue.length} 个词${isLearn ? '学完了' : '过完了'}</p>
            <p class="small muted">认识 ${stats.know} · 模糊 ${stats.fuzzy} · 忘记 ${stats.forget}</p></div>`,
          foot: `<button class="btn primary" data-close>好的</button>`,
        });
        onDone && onDone({ stats, rows: queue.map(r => ({ id: r.id, graded: r._graded })) });
        return;
      }
      const r = queue[i];
      const word = r[textKey] || '';
      /* 音标优先显示纯音标部分（剥掉"—— 重音在第 2 音节"这类备注），
         没有纯音标时退回原文，至少还能看到备注 */
      const fcPh = shortPhonetic(r.phonetic) || (r.phonetic || '');
      PM.modal({
        title: `${titleWord} ${i + 1} / ${queue.length}`,
        body: `
          <div class="fc">
            <div class="fc-word">${u.esc(word)}</div>
            ${showSyll ? wdSyllableHtml(word, r.syllables) : ''}
            <div class="fc-ph">${u.esc(fcPh)} <button class="btn xs" data-speak>🔊</button></div>
            <div class="fc-ans" style="display:none">
              <div class="wd-sec"><b>释义</b><p>${u.esc(r.meaning_cn || '—')}</p></div>
              ${r.meaning_en ? `<div class="wd-sec"><b>英文</b><p>${u.esc(r.meaning_en)}</p></div>` : ''}
              ${r.example ? `<div class="wd-sec"><b>例句</b><p class="en-sent">${u.esc(r.example)}</p></div>` : ''}
              ${r.my_sentence ? `<div class="wd-sec"><b>我的例句</b><p class="en-sent">${u.esc(r.my_sentence)}</p></div>` : ''}
            </div>
          </div>`,
        foot: `<button class="btn primary" data-reveal style="width:100%">显示答案</button>`,
        onMount(el, close) {
          /* 闪卡内容少，用紧凑高度；否则默认 86vh 会拉出一大片空白，
             「显示答案」按钮悬在中间 */
          el.classList.add('modal-card');
          el.querySelector('[data-speak]').onclick = () => u.speak(word);
          /* 学习场景：卡片出现即自动播放读音（首次由点击手势授权，后续允许自动播） */
          setTimeout(() => u.speak(word), 260);
          /* 点单个音节听读音，逐段跟读 */
          el.querySelectorAll('[data-syl]').forEach(btn => {
            btn.onclick = e => { e.stopPropagation(); u.speak(btn.dataset.syl); };
          });
          const foot = el.querySelector('.modal-foot');
          const grade = async g => {
            await fetch(`/api/review/${table}/${r.id}/review`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ grade: g }),
            });
            r._graded = g;          // 记下这词这轮的评分，onDone 里可按结果做后续处理
            stats[g]++; i++;
            close(); show();
          };
          foot.querySelector('[data-reveal]').onclick = () => {
            el.querySelector('.fc-ans').style.display = '';
            foot.innerHTML = gradeButtons(r);
            foot.querySelectorAll('[data-g]').forEach(b => b.onclick = () => grade(b.dataset.g));
          };
        },
      });
    };
    show();
  }

  /* =============================================================
   * 背词计划：设定周期 / 范围 / 词库 → 排每日任务 → 在日历里打卡
   * 计划只存「怎么排」；任务里的词在开练时才实时算，
   * 因为到期的词每天都在变，预先把 word_ids 写死必然陈旧漏词。
   * ============================================================= */
  const VP_MODE = { new: '学新词', review: '复习到期', mix: '混合（先到期后新词）' };
  const VP_SHORT = { new: '新词', review: '复习', mix: '背词' };
  const WD_CN = ['一', '二', '三', '四', '五', '六', '日'];

  /* 星期匹配：weekdays = "1,3,5"（1=周一…7=周日），空串表示每天 */
  const vpMatch = (p, date) => {
    if (p.start_date && date < p.start_date) return false;
    if (p.end_date && date > p.end_date) return false;
    const days = String(p.weekdays || '').split(',').filter(Boolean).map(Number);
    if (!days.length) return true;
    return days.includes(u.weekIndex(date) === 0 ? 7 : u.weekIndex(date));
  };
  const vpTitle = (p, n) => `${VP_SHORT[p.mode] || '背词'} ${n}`;
  const vpWdText = p => String(p.weekdays || '').split(',').filter(Boolean)
    .map(n => '周' + WD_CN[+n - 1]).join(' ') || '每天';
  const deckLabel = k => (!k || k === 'all') ? '全部词库' : (deckName(k) || k);

  /* 按任务实时取词 */
  async function pickWords(task, n) {
    const rows = await api.list('vocabulary');
    const pool = (task.deck && task.deck !== 'all') ? rows.filter(r => r.deck === task.deck) : rows;
    const due = pool.filter(isDue)
      .sort((a, b) => String(a.next_review || '').localeCompare(String(b.next_review || '')));
    const fresh = pool.filter(r => r.status === 'new')
      .sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')));
    if (task.mode === 'review') return due.slice(0, n);
    if (task.mode === 'new') return fresh.slice(0, n);
    return [...due, ...fresh].slice(0, n);
  }

  /* 开始做某天的任务：走闪卡，做完自动打卡 */
  async function startTask(task, onDone) {
    const n = Math.max(1, +task.count || 10);
    const words = await pickWords(task, n);
    if (!words.length) {
      PM.toast(task.mode === 'review' ? '这个词库暂时没有到期要复习的词' : '这个词库没有新词了', 'err');
      return false;
    }
    reviewSession(words, async () => {
      await api.update('vocab_tasks', task.id, {
        done: '1', done_at: u.today(), word_ids: words.map(w => w.id).join(','),
      });
      /* 顺手写一条学习记录，跟「学习 / 记录」那块对得上（重复打卡不重复写） */
      if (task.done !== '1') {
        try {
          await api.create('study_logs', {
            date: u.today(), kind: 'vocab', ref_id: String(task.id),
            title: task.title || '背词计划', count: String(words.length), minutes: '0',
          });
        } catch (e) { /* 学习记录写失败不影响打卡 */ }
      }
      onDone && onDone();
    }, task.mode === 'new' ? 'learn' : 'review');
    return true;
  }

  /* 按计划排任务：从 max(开始日期, 今天) 起铺，按 plan_id+date 去重，
     所以同一个计划反复点「排任务」不会翻倍；已打卡的任务不动。 */
  async function genTasks(plan) {
    const rows = await api.list('vocabulary');
    const pool = (plan.deck && plan.deck !== 'all') ? rows.filter(r => r.deck === plan.deck) : rows;
    const cand = plan.mode === 'review' ? pool.filter(isDue)
      : plan.mode === 'new' ? pool.filter(r => r.status === 'new')
        : [...pool.filter(isDue), ...pool.filter(r => r.status === 'new')];
    if (!cand.length) return { made: 0, total: 0, last: '', reason: 'empty' };

    /* 已排过的日期 → 当天已占掉多少词。这里必须是 Map 而不是 Set：
       再点一次「排任务」时，已存在的那天也要照常扣掉词量，
       否则 left 一直不减，会往后再排一批重复的（实测会翻倍）。 */
    const exist = new Map((await api.list('vocab_tasks'))
      .filter(t => String(t.plan_id) === String(plan.id))
      .map(t => [t.date, +t.count || 0]));
    const per = Math.max(1, +plan.per_day || 10);
    const start = plan.start_date && plan.start_date > u.today() ? plan.start_date : u.today();
    const out = [];
    let left = cand.length, d = start, guard = 0, last = '';
    while (left > 0 && guard++ < 180) {          /* 180 天上限，防死循环 */
      if (plan.end_date && d > plan.end_date) break;
      if (vpMatch(plan, d)) {
        if (exist.has(d)) left -= Math.min(exist.get(d) || per, left);
        else {
          const n = Math.min(per, left);
          out.push({
            plan_id: String(plan.id), date: d, title: vpTitle(plan, n), count: String(n),
            mode: plan.mode, deck: plan.deck || 'all', word_ids: '', done: '0', done_at: '',
          });
          left -= n; last = d;
        }
      }
      d = u.addDays(d, 1);
    }
    if (out.length) await api.bulk('vocab_tasks', out);
    return {
      made: out.length, total: cand.length, last,
      reason: out.length ? '' : (plan.end_date && start > plan.end_date ? 'past' : 'exist'),
    };
  }

  /* 计划面板：已有计划（进度 / 排任务 / 暂停 / 删除）+ 新建表单 */
  async function planPanel(onChange) {
    await loadDecks();
    const [plans, tasks] = await Promise.all([api.list('vocab_plans'), api.list('vocab_tasks')]);
    const statOf = p => {
      const ts = tasks.filter(t => String(t.plan_id) === String(p.id));
      const todo = ts.filter(t => t.done !== '1').map(t => t.date).sort();
      return { n: ts.length, done: ts.filter(t => t.done === '1').length, next: todo[0] || '' };
    };

    PM.modal({
      title: '计划安排',
      wide: true,
      body: `
        <div class="vp-sec">
          <div class="li-group"><span>已有计划</span></div>
          ${plans.length ? plans.map(p => {
            const s = statOf(p);
            const off = p.active === '0';
            return `<div class="vp-li ${off ? 'off' : ''}">
              <div class="vp-li-main">
                <b>${u.esc(p.name || '背词计划')}</b>
                <div class="vp-li-sub">${u.esc(deckLabel(p.deck))} · ${u.esc(VP_MODE[p.mode] || p.mode)} · 每天 ${p.per_day} 个 · ${vpWdText(p)}</div>
                <div class="vp-li-sub">已排 ${s.n} 天，完成 ${s.done}${s.next ? ` · 下次 ${u.esc(u.relDate(s.next))}（${s.next.slice(5)}）` : ''}</div>
              </div>
              <div class="vp-li-act">
                <button class="btn xs" data-gen="${p.id}">排任务</button>
                <button class="btn xs" data-off="${p.id}">${off ? '启用' : '暂停'}</button>
                <button class="btn xs danger" data-del="${p.id}">删</button>
              </div>
            </div>`;
          }).join('') : '<div class="small muted" style="padding:4px 2px 10px">还没有计划，在下面新建一个 ↓</div>'}
        </div>
        <div class="vp-sec">
          <div class="li-group"><span>新建计划</span></div>
          <div class="f2">
            <div class="field"><label>词库（范围）</label>
              <select class="input" name="deck">
                <option value="all">全部词库</option>
                ${GROUPS.map(g => `<optgroup label="${g}">${DECKS.filter(d => d.group === g)
                  .map(d => `<option value="${d.key}">${d.name}${d.count != null ? `（${d.count}）` : ''}</option>`).join('')}</optgroup>`).join('')}
              </select></div>
            <div class="field"><label>任务类型</label>
              <select class="input" name="mode">
                ${Object.keys(VP_MODE).map(k => `<option value="${k}">${VP_MODE[k]}</option>`).join('')}
              </select></div>
          </div>
          <div class="f2">
            <div class="field"><label>每天数量</label>
              <input class="input" type="number" name="per_day" value="10" min="1" max="100"></div>
            <div class="field"><label>计划名称（可留空）</label>
              <input class="input" name="name" placeholder="如：每天 20 个商务词"></div>
          </div>
          <div class="field"><label>循环星期（可多选，留空 = 每天）</label>
            <div class="weekday-pick" id="vpWd">
              ${WD_CN.map((d, i) => `<div class="wd" data-wd="${i + 1}">${d}</div>`).join('')}
            </div>
            <div class="vp-quick">
              <button class="btn xs" type="button" data-q="1,2,3,4,5,6,7">每天</button>
              <button class="btn xs" type="button" data-q="1,2,3,4,5">工作日</button>
              <button class="btn xs" type="button" data-q="6,7">周末</button>
            </div>
            <input type="hidden" name="weekdays" value=""></div>
          <div class="f2">
            <div class="field"><label>开始日期</label>
              <input class="input" type="date" name="start_date" value="${u.today()}"></div>
            <div class="field"><label>结束日期（留空 = 排到词背完）</label>
              <input class="input" type="date" name="end_date"></div>
          </div>
        </div>`,
      foot: `<button class="btn" data-close>关闭</button><button class="btn primary" data-save>新建并排任务</button>`,
      onMount(el, close) {
        el.classList.add('modal-fit');   /* 高度跟内容走，别留半屏空白 */
        /* 星期多选：复用健身计划那套 .weekday-pick 样式 */
        const pick = el.querySelector('#vpWd');
        const wdIn = el.querySelector('[name=weekdays]');
        const syncWd = () => {
          wdIn.value = [...pick.querySelectorAll('.wd.on')].map(x => x.dataset.wd).join(',');
        };
        pick.onclick = e => {
          const t = e.target.closest('.wd'); if (!t) return;
          t.classList.toggle('on'); syncWd();
        };
        el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
          const set = b.dataset.q.split(',');
          pick.querySelectorAll('.wd').forEach(w => w.classList.toggle('on', set.includes(w.dataset.wd)));
          syncWd();
        });

        /* 操作完列表要刷新，直接关掉重开最省事（弹窗内容不复杂） */
        const reopen = async () => { close(); await planPanel(onChange); onChange && onChange(); };

        const afterGen = r => {
          if (r.made) PM.toast(`已排 ${r.made} 天任务${r.last ? `，排到 ${r.last.slice(5)}` : ''}`);
          else if (r.reason === 'empty') PM.toast('这个词库暂时没有可背的词', 'err');
          else if (r.reason === 'past') PM.toast('结束日期早于开始日期，没排出任务', 'err');
          else PM.toast('任务已经是最新的，没有新增');
        };
        el.querySelectorAll('[data-gen]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.gen);
          b.disabled = true; b.textContent = '排中…';
          afterGen(await genTasks(p));
          await reopen();
        });
        el.querySelectorAll('[data-off]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.off);
          await api.update('vocab_plans', p.id, { active: p.active === '0' ? '1' : '0' });
          await reopen();
        });
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.del);
          if (!await PM.confirm(`删除「${p.name || '背词计划'}」？已排的任务会一起删掉`)) return;
          /* 后端没有批量删除，只能逐条删 */
          for (const t of tasks.filter(x => String(x.plan_id) === String(p.id))) {
            await api.remove('vocab_tasks', t.id);
          }
          await api.remove('vocab_plans', p.id);
          PM.toast('已删除');
          await reopen();
        });

        el.querySelector('[data-save]').onclick = async () => {
          const d = PM.formData(el);
          d.per_day = String(Math.max(1, Math.min(100, +d.per_day || 10)));
          d.start_date = d.start_date || u.today();
          d.active = '1';
          /* 默认名只带词库+数量，不带任务类型，否则抽屉里「计划名 · 类型」会重复成「学新词 · 学新词」 */
          if (!d.name.trim()) d.name = `${deckLabel(d.deck)} · 每天 ${d.per_day} 个`;
          const res = await api.create('vocab_plans', d);
          const r = await genTasks(res.row || d);
          afterGen(r);
          await reopen();
        };
      },
    });
  }

  /* ---------------- 词汇库 ---------------- */
  /* 库只是分类容器：预置库（CEFR / Oxford）先建好空位，之后往里装词就能筛选 */
  let DECKS = [];
  async function loadDecks() {
    try {
      const j = await (await fetch('/api/vocab/decks')).json();
      if (j && j.ok) DECKS = j.decks || [];
    } catch (e) { /* 接口挂了就退化成不显示库，不影响主流程 */ }
    return DECKS;
  }
  const deckOf = k => DECKS.find(d => d.key === k) || null;
  const deckName = k => (deckOf(k) || {}).name || '';

  /* 库下拉：自绘菜单。不用原生 <select>，因为 iOS Safari 会忽略高度/内边距设置，
     导致选中文字被上下裁切；自绘按钮的高度完全由 CSS 决定，各端一致 */
  const GROUPS = ['我的词库', 'CEFR 分级', 'Oxford 词表', '英孚词库'];
  const deckPickLabel = total => {
    const d = deckOf(vocabDeck);
    return d ? `${d.name}（${d.count}）` : `全部词库（${total}）`;
  };
  /* 分组菜单：全部 + 三组，每项带词数；空库灰显但仍可选（方便看出还没装词） */
  function deckMenu(total) {
    const item = (key, name, cn, count) => {
      const on = (vocabDeck || 'all') === key;
      return `<button type="button" class="deckpick-it${on ? ' on' : ''}" data-deck-val="${key}" role="option" aria-selected="${on}">
        <span class="di-name">${u.esc(name)}</span>
        ${cn ? `<span class="di-cn">${u.esc(cn)}</span>` : ''}
        <i class="di-n">${count}</i>
        ${on ? '<span class="di-tick">✓</span>' : ''}
      </button>`;
    };
    return `<div class="deckpick-grp">
        ${item('all', '全部词库', '', total)}
      </div>` +
      GROUPS.map(g => {
        const ds = DECKS.filter(d => d.group === g);
        if (!ds.length) return '';
        return `<div class="deckpick-grp"><div class="deckpick-gh">${u.esc(g)}</div>
          ${ds.map(d => item(d.key, d.name, d.cn, d.count)).join('')}
        </div>`;
      }).join('');
  }

  /* ---------------- Vocabulary 主页面 ---------------- */
  let vocabFilter = 'all';
  let vocabDeck = 'all';
  /* 搜索词只存在内存里，不进 URL：边打字边重建 hash 会打断输入焦点，
     刷新页面 / 切分类后回到无搜索的状态也更符合直觉 */
  let vocabQuery = '';

  /* 详情页音节：比卡片大一号，并且可以点某一段单独发音（跟读用） */
  function wdSyllableHtml(word, custom) {
    const parts = customSyllables(word, custom) || syllables(word);
    if (!parts || parts.length < 2) return '';
    return `<div class="wd-syl" title="点音节可单独听发音">` + parts
      .map((p, i) => `<button type="button" class="sy s${i % 4}" data-syl="${u.esc(p)}">${u.esc(p)}</button>`)
      .join('<i class="sy-sep">·</i>') + `</div>`;
  }

  /* 匹配单词、音标、中英释义、词库名、例句与搭配；多关键词空格分隔，全部命中才算中 */
  const matchQuery = (r, terms) => {
    if (!terms.length) return true;
    const hay = [r.word, r.phonetic, r.meaning_cn, r.meaning_en,
                 r.example, r.example_cn, r.collocation, r.synonyms, r.note,
                 deckName(r.deck) || r.deck]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every(t => hay.indexOf(t) >= 0);
  };

  async function viewVocab(el, query) {
    if (query && query.filter) vocabFilter = query.filter;
    /* URL 里没带 deck 就是「全部词库」，不要沿用上次选的库 */
    vocabDeck = (query && query.deck) || 'all';
    /* 中间那项是 loadDecks()，只为并发预热 DECKS，返回值这里用不到
       （不能写成 [allRows, planRows]，那样 planRows 会拿到词库数组，
        按钮副标题就变成「已建 8 个计划」——8 是词库数，不是计划数） */
    const [allRows, , planRows] = await Promise.all([
      api.list('vocabulary'), loadDecks(), api.list('vocab_plans'),
    ]);
    /* 计划数只用于「计划安排」按钮的副标题与胶囊 */
    const planCount = (planRows || []).filter(p => p.active !== '0').length;

    /* 先按库切一遍：库是筛选的第一层，后面的统计/分类都在这个库内算 */
    const rows = vocabDeck === 'all' ? allRows : allRows.filter(r => r.deck === vocabDeck);

    /* 搜索是第二层：先算好命中集合，统计/胶囊计数都基于命中结果，
       否则会出现「显示 0 条但胶囊写着 320」的矛盾 */
    const terms = vocabQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = terms.length ? rows.filter(r => matchQuery(r, terms)) : rows;

    const due = hit.filter(isDue);
    const fresh = hit.filter(r => r.status === 'new');
    const learning = hit.filter(r => r.status === 'learning');
    const mastered = hit.filter(r => r.status === 'mastered');
    const fav = hit.filter(r => r.favorite === '1');
    const wrong = hit.filter(r => +r.wrong_count >= 2).sort((a, b) => +b.wrong_count - +a.wrong_count);
    /* 生词记忆库口径：默写标了「不认识」/ 最近一次复习选「忘记」/ 累计答错 ≥2 次 */
    const bankN = hit.filter(r => r.unknown === '1' || r.last_grade === 'forget' || +r.wrong_count >= 2).length;

    /* 分类过滤 */
    let list;
    if (vocabFilter === 'new') list = fresh;
    else if (vocabFilter === 'learning') list = learning;
    else if (vocabFilter === 'mastered') list = mastered;
    else if (vocabFilter === 'fav') list = fav;
    else if (vocabFilter === 'wrong') list = wrong;
    else list = hit;
    /* 排序：待复习的顶到最前，然后按加入时间倒序 */
    list = [...list].sort((a, b) => (isDue(b) - isDue(a))
      || String(b.added_at || '').localeCompare(String(a.added_at || '')));

    const FILTERS = [
      ['all', '全部', hit.length], ['new', '新词', fresh.length], ['learning', '学习中', learning.length],
      ['mastered', '已掌握', mastered.length], ['fav', '收藏', fav.length], ['wrong', '高频错词', wrong.length],
    ];

    /* 卡片自上而下：单词 → 切分音节（分色）→ 音标 → 中文 → 词库 → 熟练度 + 进度
       切分音节紧贴单词下方，方便「先看整词、再看怎么切、再跟着音标读」。
       状态/待复习不重复展示：底部已有熟练度 + 间隔进度，卡片上再标一次是冗余。
       标签区只在真有内容时才渲染，否则会空出一行 */
    const cardTags = r => {
      const bits = [];
      if (r.deck) bits.push(`<span class="tag deck">${u.esc(deckName(r.deck) || r.deck)}</span>`);
      if (r.unknown === '1') bits.push(`<span class="tag red">🙈 不认识</span>`);
      if (+r.wrong_count >= 2) bits.push(`<span class="tag red">错 ${r.wrong_count} 次</span>`);
      return bits.length ? `<div class="vw-tags">${bits.join('')}</div>` : '';
    };
    const card = r => `
      <div class="vw-card ${isDue(r) ? 'due' : ''}" data-word="${r.id}">
        <div class="vw-top"><b class="vw-w">${u.esc(r.word)}</b>
          <span class="vw-fav" data-fav="${r.id}" title="收藏">${r.favorite === '1' ? '★' : '☆'}</span></div>
        ${syllableHtml(r.word, '', r.syllables)}
        <div class="vw-ph">${u.esc(shortPhonetic(r.phonetic) || '')}</div>
        <div class="vw-cn">${u.esc((r.meaning_cn || '暂无释义').slice(0, 40))}</div>
        ${cardTags(r)}
        <div class="vw-foot">${footHtml(r)}</div>
      </div>`;

    /* 分类胶囊要带上当前库，切分类时库不丢 */
    const qs = k => {
      const p = [];
      if (k && k !== 'all') p.push('filter=' + k);
      if (vocabDeck && vocabDeck !== 'all') p.push('deck=' + vocabDeck);
      return p.length ? '?' + p.join('&') : '';
    };
    const cur = deckOf(vocabDeck);
    const deckHint = !cur ? '' : cur.count === 0
      ? (cur.kind === 'system' ? `预置分级库，加词时选「${cur.name}」就会进来` : '这个库还是空的')
      : `${cur.cn} · ${cur.count} 词`;
    const emptyTip = terms.length
      ? `没有找到和「${vocabQuery.trim()}」相关的单词`
      : (!rows.length
        ? (cur ? `「${cur.name}」还没有单词，加词时选择这个库即可` : '词本还是空的，添加第一个单词吧')
        : '这个分类下暂时没有单词');

    /* 统计口径：新词 / 学习中 / 已掌握 是按状态互斥划分的三档，加起来正好等于总词汇；
       「今日待复习」是另一把尺子——从后两档里挑出到期的一批，所以它不参与相加。
       之前只放「总词汇 / 待复习 / 新词 / 已掌握」，既漏了「学习中」这一档，
       又把两个维度的数字并排放，看着就像算错了，所以补成一排五张卡 + 一行口径说明 */
    const statBar = (total, dueN, newN, learnN, mastN, searching) => `
      <div class="vw-stats">
        <div class="stat" title="${searching ? '当前搜索命中的单词数' : '词库里的全部单词'}">
          <div class="k">${searching ? '搜索命中' : '总词汇'}</div><div class="v">${total}</div></div>
        <div class="stat due${dueN ? '' : ' zero'}" title="已到复习时间的词，是从「学习中」「已掌握」里挑出来的，不参与上面三档相加">
          <div class="k">今日待复习</div><div class="v">${dueN}</div></div>
        <div class="stat" title="还没开始学的词"><div class="k">新词</div><div class="v">${newN}</div></div>
        <div class="stat" title="学过但还没掌握的词"><div class="k">学习中</div><div class="v">${learnN}</div></div>
        <div class="stat" title="间隔走完 30 天、已标记掌握的词"><div class="k">已掌握</div><div class="v">${mastN}</div></div>
      </div>
      <div class="vw-stat-note">新词 ${newN} ＋ 学习中 ${learnN} ＋ 已掌握 ${mastN} ＝ ${total}${dueN ? `，其中 ${dueN} 个今天到期` : ''}</div>`;

    /* 主行动：做成大号渐变按钮，数量单独用胶囊撑出来。
       always = 这个按钮任何时候都可点（「计划安排」没计划也要能进去新建），
       它的胶囊只在 n>0 时才显示，否则会冒出一个没人看得懂的「0」。 */
    const actBtn = (kind, icon, title, sub, n, always) => `
      <button class="vw-act ${kind}${always || n > 0 ? '' : ' off'}" data-${kind} ${always || n > 0 ? '' : 'disabled'}>
        <span class="vw-act-ico">${icon}</span>
        <span class="vw-act-txt"><b>${title}</b><span class="vw-act-sub">${u.esc(sub)}</span></span>
        ${n > 0 ? `<span class="vw-act-n">${n}</span>` : ''}
      </button>`;
    /* 日历图标用内联 SVG：当前字体缺 📅 的字形，emoji 会显示成红方块 */


    el.innerHTML = `
      <div class="vw-page">
        ${statBar(hit.length, due.length, fresh.length, learning.length, mastered.length, terms.length)}
        <div class="vw-actions">
          ${actBtn('review', '🔔', '开始复习',
                   due.length ? `待复习 ${due.length} 个` : '今日已清空', due.length)}
          ${actBtn('learn', '🌱', '学新词',
                   fresh.length ? `共 ${fresh.length} 个待学` : '暂无新词',
                   Math.min(fresh.length, 10))}
          ${actBtn('dictate', '⌨️', '单词默写',
                   '隐藏拼写 · 键盘输入', 0, true)}
          ${actBtn('mem', '🧠', '生词记忆库',
                   bankN ? '忘记 · 不认识汇总' : '暂无重点关注词', bankN, true)}
          ${actBtn('plan', PLAN_ICON, '计划安排',
                   planCount ? `已建 ${planCount} 个计划` : '排周期 · 自动进日历',
                   planCount, true)}
          <div class="spacer"></div>
          <button class="btn sm" data-bulk>⬆ 批量导入</button>
          <button class="btn sm" data-add>＋ 添加单词</button>
        </div>
        <div class="vw-deckbar">
          <span class="vw-deckbar-k">词库</span>
          <div class="deckpick" data-deckpick>
            <button type="button" class="deckpick-btn" data-deck-btn aria-haspopup="listbox" aria-expanded="false">
              <span class="deckpick-txt">${u.esc(deckPickLabel(allRows.length))}</span>
              <svg class="deckpick-arrow" width="12" height="8" viewBox="0 0 12 8"><path d="M0 0l6 8 6-8z" fill="currentColor"/></svg>
            </button>
            <div class="deckpick-menu" data-deck-menu hidden>${deckMenu(allRows.length)}</div>
            <div class="deckpick-scrim" data-deck-scrim hidden></div>
          </div>
          <div class="vw-search">
            <svg class="vw-search-ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7"/>
              <path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
            <input type="search" class="vw-search-in" data-search placeholder="搜单词 / 释义" autocomplete="off"
                   enterkeyhint="search" aria-label="搜索单词">
            <button type="button" class="vw-search-clr" data-search-clr hidden aria-label="清空搜索">✕</button>
          </div>
          <span class="small muted">${deckHint}</span>
        </div>
        <div class="vw-filters">
          ${FILTERS.map(([k, label, n]) => `<a class="sn-it ${vocabFilter === k ? 'on' : ''}" href="#/english/vocab${qs(k)}">${label}<i class="n">${n}</i></a>`).join('')}
        </div>
        <div class="vw-grid">
          ${list.length ? list.map(card).join('')
            : `<div class="empty" style="grid-column:1/-1;padding:44px 10px"><span class="big">📖</span>${emptyTip}</div>`}
        </div>
      </div>`;

    /* 收起/展开都绑在控件自身，不往 document 上挂监听（页面重渲染时无需回收，
       也不会出现「收起后按钮失灵」的问题）。点页面别处收起由遮罩层负责 */
    const pick = el.querySelector('[data-deckpick]');
    const pickBtn = pick.querySelector('[data-deck-btn]');
    const pickMenu = pick.querySelector('[data-deck-menu]');
    const pickScrim = pick.querySelector('[data-deck-scrim]');
    const closeMenu = () => {
      pickMenu.hidden = true;
      pickBtn.setAttribute('aria-expanded', 'false');
      pickScrim.hidden = true;
    };
    pickBtn.onclick = e => {
      e.stopPropagation();
      const open = pickMenu.hidden;
      pickMenu.hidden = !open;
      pickScrim.hidden = !open;
      pickBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        /* 菜单在窄屏/横屏可能被底部导航挡住：下方放不下就翻到按钮上方展开 */
        pick.classList.remove('up');
        const bh = pickBtn.getBoundingClientRect().bottom;
        const need = Math.min(pickMenu.scrollHeight, window.innerHeight * 0.6);
        if (bh + need + 16 > window.innerHeight) pick.classList.add('up');
        const on = pickMenu.querySelector('.deckpick-it.on');
        if (on) on.scrollIntoView({ block: 'nearest' });
      }
    };
    pickMenu.querySelectorAll('[data-deck-val]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      closeMenu();
      vocabDeck = b.dataset.deckVal;
      const h = '#/english/vocab' + qs(vocabFilter);
      if (location.hash === h) PM.refresh(); else location.hash = h;
    });
    pickMenu.onclick = e => e.stopPropagation();
    /* 点菜单外任意区域收起：用一层透明遮罩兜住，避免依赖 document 级监听 */
    pickScrim.onclick = closeMenu;

    el.querySelector('[data-add]').onclick = () => wordEditor(null, () => PM.refresh());
    el.querySelector('[data-bulk]').onclick = () => bulkWordImport();
    el.querySelector('[data-plan]').onclick = () => planPanel(() => PM.refresh());
    el.querySelector('[data-review]').onclick = () => { if (due.length) reviewSession(due, () => PM.refresh()); };
    el.querySelector('[data-learn]').onclick = () => { if (fresh.length) reviewSession(fresh.slice(0, 10), () => PM.refresh(), 'learn'); };
    el.querySelector('[data-dictate]').onclick = () => openDictation();
    el.querySelector('[data-mem]').onclick = () => { location.hash = '#/english/memory'; };
    bindCards();

    /* ---------- 搜索：本地过滤，不请求接口，也不重建 hash ---------- */
    const inp = el.querySelector('[data-search]');
    const clr = el.querySelector('[data-search-clr]');
    if (inp) {
      inp.value = vocabQuery;
      const syncClr = () => { clr.hidden = !inp.value; };
      syncClr();
      inp.addEventListener('input', () => {
        vocabQuery = inp.value;
        syncClr();
        applySearch();
      });
      /* Esc 清空并退出输入，符合搜索框惯例 */
      inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); inp.value = ''; vocabQuery = ''; syncClr(); applySearch(); inp.blur(); }
      });
      clr.onclick = () => { inp.value = ''; vocabQuery = ''; syncClr(); applySearch(); inp.focus(); };
    }

    /* 只重绘网格和计数，不整页重建 —— 否则输入框会被替换掉、焦点丢失，没法连续打字 */
    function applySearch() {
      const t = vocabQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const hv = t.length ? rows.filter(r => matchQuery(r, t)) : rows;
      let lst;
      if (vocabFilter === 'new') lst = hv.filter(r => r.status === 'new');
      else if (vocabFilter === 'learning') lst = hv.filter(r => r.status === 'learning');
      else if (vocabFilter === 'mastered') lst = hv.filter(r => r.status === 'mastered');
      else if (vocabFilter === 'fav') lst = hv.filter(r => r.favorite === '1');
      else if (vocabFilter === 'wrong') lst = hv.filter(r => +r.wrong_count >= 2).sort((a, b) => +b.wrong_count - +a.wrong_count);
      else lst = hv;
      lst = [...lst].sort((a, b) => (isDue(b) - isDue(a))
        || String(b.added_at || '').localeCompare(String(a.added_at || '')));

      const grid = el.querySelector('.vw-grid');
      if (grid) {
        grid.innerHTML = lst.length ? lst.map(card).join('')
          : `<div class="empty" style="grid-column:1/-1;padding:44px 10px"><span class="big">🔍</span>${
              t.length ? `没有找到和「${u.esc(vocabQuery.trim())}」相关的单词` : emptyTip}</div>`;
        bindCards();
        /* 有搜索词但一条没命中时，给个一键清空的出口，省得回头找那个小 ✕ */
        if (!lst.length && t.length) {
          const tip = grid.querySelector('.empty');
          if (tip) {
            const btn = document.createElement('button');
            btn.className = 'btn sm';
            btn.style.marginTop = '14px';
            btn.textContent = '清空搜索';
            btn.onclick = () => {
              const i2 = el.querySelector('[data-search]');
              i2.value = ''; vocabQuery = '';
              const c2 = el.querySelector('[data-search-clr]'); if (c2) c2.hidden = true;
              applySearch(); i2.focus();
            };
            tip.appendChild(document.createElement('div')).appendChild(btn);
          }
        }
      }
      /* 胶囊计数跟着搜索结果走 */
      const counts = { all: hv.length,
        'new': hv.filter(r => r.status === 'new').length,
        learning: hv.filter(r => r.status === 'learning').length,
        mastered: hv.filter(r => r.status === 'mastered').length,
        fav: hv.filter(r => r.favorite === '1').length,
        wrong: hv.filter(r => +r.wrong_count >= 2).length };
      el.querySelectorAll('.vw-filters .sn-it').forEach(a => {
        const k = (a.getAttribute('href').split('filter=')[1] || 'all').split('&')[0];
        const n = a.querySelector('.n');
        if (n && counts[k] != null) n.textContent = counts[k];
      });
      /* 统计卡顺序：0 总词汇 / 1 今日待复习 / 2 新词 / 3 学习中 / 4 已掌握 */
      const st = el.querySelector('.vw-stats .stat:first-child');
      if (st) {
        st.querySelector('.k').textContent = t.length ? '搜索命中' : '总词汇';
        st.querySelector('.v').textContent = hv.length;
      }
      const seq = [hv.length, hv.filter(isDue).length, counts['new'], counts.learning, counts.mastered];
      el.querySelectorAll('.vw-stats .stat').forEach((s, i) => {
        const v = s.querySelector('.v');
        if (v && seq[i] != null) v.textContent = seq[i];
        if (i === 1) s.classList.toggle('zero', !seq[i]);
      });
      const note = el.querySelector('.vw-stat-note');
      if (note) note.textContent = `新词 ${counts['new']} ＋ 学习中 ${counts.learning} ＋ 已掌握 ${counts.mastered} ＝ ${hv.length}`
        + (seq[1] ? `，其中 ${seq[1]} 个今天到期` : '');
    }

    function bindCards() {
      el.querySelectorAll('[data-fav]').forEach(s => s.onclick = async e => {
        e.stopPropagation();
        const r = allRows.find(x => x.id === s.dataset.fav);
        if (!r) return;
        await api.update('vocabulary', r.id, { favorite: r.favorite === '1' ? '0' : '1' });
        PM.refresh();
      });
      el.querySelectorAll('[data-word]').forEach(c => c.onclick = () => {
        const r = allRows.find(x => x.id === c.dataset.word);
        if (r) wordDrawer(r, () => PM.refresh());
      });
    }
  }

  /* ================= Expression：地道表达积累 ================= */
  /* 和 Vocabulary 一样走间隔复习（status/new/learning/mastered + level/familiar + next_review），
     区别是「词」换成「地道表达」：phrase 是英语自己的说法，meaning_cn 是中文意思，
     重点是记住这对映射，而不是直译。 */
  let exprFilter = 'all';
  let exprCat = 'all';
  let exprQuery = '';

  async function viewExpression(el) {
    const allRows = await api.list('expressions');

    const inCat = r => exprCat === 'all' || r.category === exprCat;
    const terms = () => exprQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matchQ = r => {
      const t = terms();
      if (!t.length) return true;
      const hay = [r.phrase, r.phonetic, r.meaning_cn, r.meaning_en, r.example, r.example_cn, r.category, r.note]
        .filter(Boolean).join(' ').toLowerCase();
      return t.every(x => hay.indexOf(x) >= 0);
    };
    /* base = 仅按分类切（动作按钮计数用，不随搜索变）；
       hit  = base 内再按搜索词过滤（列表与统计用） */
    const base = allRows.filter(inCat);
    const hit = base.filter(matchQ);
    const due = base.filter(isDue);
    const fresh = base.filter(r => r.status === 'new');
    const learning = base.filter(r => r.status === 'learning');
    const mastered = base.filter(r => r.status === 'mastered');
    const fav = base.filter(r => r.favorite === '1');
    const wrong = base.filter(r => +r.wrong_count >= 2).sort((a, b) => +b.wrong_count - +a.wrong_count);

    const cats = [...new Set(allRows.map(r => r.category).filter(Boolean))];
    const FILTERS = [
      ['all', '全部', hit.length], ['new', '新', fresh.length], ['learning', '学习中', learning.length],
      ['mastered', '已掌握', mastered.length], ['fav', '收藏', fav.length], ['wrong', '高频错词', wrong.length],
    ];
    const statBar = (total, dueN, newN, learnN, mastN) => `
      <div class="vw-stats">
        <div class="stat"><div class="k">${exprQuery ? '搜索命中' : '总表达'}</div><div class="v">${total}</div></div>
        <div class="stat due${dueN ? '' : ' zero'}"><div class="k">今日待复习</div><div class="v">${dueN}</div></div>
        <div class="stat"><div class="k">新</div><div class="v">${newN}</div></div>
        <div class="stat"><div class="k">学习中</div><div class="v">${learnN}</div></div>
        <div class="stat"><div class="k">已掌握</div><div class="v">${mastN}</div></div>
      </div>`;
    const actBtn = (kind, icon, title, sub, n, always) => `
      <button class="vw-act ${kind}${always || n > 0 ? '' : ' off'}" data-${kind} ${always || n > 0 ? '' : 'disabled'}>
        <span class="vw-act-ico">${icon}</span>
        <span class="vw-act-txt"><b>${title}</b><span class="vw-act-sub">${u.esc(sub)}</span></span>
        ${n > 0 ? `<span class="vw-act-n">${n}</span>` : ''}
      </button>`;
    const card = r => `
      <div class="vw-card ${isDue(r) ? 'due' : ''}" data-id="${r.id}">
        <div class="vw-top"><b class="vw-w">${u.esc(r.phrase)}</b>
          <span class="vw-fav" data-fav="${r.id}" title="收藏">${r.favorite === '1' ? '★' : '☆'}</span></div>
        <div class="vw-ph">${u.esc(shortPhonetic(r.phonetic) || '')}</div>
        <div class="vw-cn">${u.esc((r.meaning_cn || '暂无释义').slice(0, 48))}</div>
        <div class="vw-tags">${r.unknown === '1' ? '<span class="tag red">🙈 不认识</span>' : ''}${r.category ? `<span class="tag deck">${u.esc(r.category)}</span>` : ''}${+r.wrong_count >= 2 ? `<span class="tag red">错 ${r.wrong_count} 次</span>` : ''}</div>
        <div class="vw-foot">${footHtml(r)}</div>
      </div>`;
    function listOf(src) {
      return [...src].sort((a, b) => (isDue(b) - isDue(a)) || String(b.added_at || '').localeCompare(String(a.added_at || '')));
    }
    let list;
    if (exprFilter === 'new') list = listOf(fresh);
    else if (exprFilter === 'learning') list = listOf(learning);
    else if (exprFilter === 'mastered') list = listOf(mastered);
    else if (exprFilter === 'fav') list = listOf(fav);
    else if (exprFilter === 'wrong') list = listOf(wrong);
    else list = listOf(hit);

    el.innerHTML = `
      <div class="vw-page">
        <div data-stat>${statBar(hit.length, hit.filter(isDue).length, fresh.length, learning.length, mastered.length)}</div>
        <div class="vw-actions">
          ${actBtn('review', '🔔', '开始复习', due.length ? `待复习 ${due.length} 个` : '今日已清空', due.length)}
          ${actBtn('learn', '🌱', '学新表达', fresh.length ? `共 ${fresh.length} 个待学` : '暂无新表达', Math.min(fresh.length, 10))}
          ${actBtn('dictate', '⌨️', '表达默写', '看中文默写英文', 0, true)}
          ${actBtn('add', '＋', '添加表达', '手动记一句', 0, true)}
        </div>
        <div class="li-nav">
          <div class="li-chips" data-cats>
            <button class="chip${exprCat === 'all' ? ' on' : ''}" data-cat="">全部分类</button>
            ${cats.map(c => `<button class="chip${exprCat === c ? ' on' : ''}" data-cat="${u.esc(c)}">${u.esc(c)}</button>`).join('')}
          </div>
          <div class="seg" data-tab>
            ${FILTERS.map(([k, l, n]) => `<button data-v="${k}" class="${exprFilter === k ? 'on' : ''}">${l}${n ? ` ${n}` : ''}</button>`).join('')}
          </div>
        </div>
        <div class="vw-search">
          <svg class="vw-search-ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7"/>
            <path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          <input type="search" class="vw-search-in" data-search placeholder="搜英文 / 中文 / 分类" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="vw-grid" data-grid>${list.length ? list.map(card).join('') : `<div class="empty">还没有表达。点「添加表达」记一句，或从知识库学习卡一键提取。</div>`}</div>
      </div>`;

    const grid = el.querySelector('[data-grid]');
    const searchIn = el.querySelector('[data-search]');
    if (searchIn) searchIn.value = exprQuery;

    el.querySelector('[data-review]').onclick = () => { if (due.length) reviewSession(due, () => PM.refresh(), null, { textKey: 'phrase', table: 'expressions' }); };
    el.querySelector('[data-learn]').onclick = () => { if (fresh.length) reviewSession(fresh.slice(0, 10), () => PM.refresh(), 'learn', { textKey: 'phrase', table: 'expressions' }); };
    el.querySelector('[data-dictate]').onclick = () => openExprDictation();
    el.querySelector('[data-add]').onclick = () => exprEditor(null, () => PM.refresh());

    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { exprCat = b.dataset.cat; PM.refresh(); });
    el.querySelectorAll('[data-tab] button').forEach(b => b.onclick = () => { exprFilter = b.dataset.v; PM.refresh(); });

    function renderGrid() {
      const h = base.filter(matchQ);
      const d = h.filter(isDue), f = h.filter(r => r.status === 'new'), l = h.filter(r => r.status === 'learning'), m = h.filter(r => r.status === 'mastered');
      el.querySelector('[data-stat]').innerHTML = statBar(h.length, d.length, f.length, l.length, m.length);
      let l2 = listOf(h);
      if (exprFilter === 'new') l2 = listOf(f); else if (exprFilter === 'learning') l2 = listOf(l);
      else if (exprFilter === 'mastered') l2 = listOf(m); else if (exprFilter === 'fav') l2 = listOf(fav);
      else if (exprFilter === 'wrong') l2 = listOf(wrong);
      grid.innerHTML = l2.length ? l2.map(card).join('') : `<div class="empty">没有匹配的表达。</div>`;
      bindCards();
    }
    function bindCards() {
      grid.querySelectorAll('[data-fav]').forEach(s => s.onclick = async e => {
        e.stopPropagation();
        const r = allRows.find(x => x.id === s.dataset.fav);
        if (!r) return;
        await api.update('expressions', r.id, { favorite: r.favorite === '1' ? '0' : '1' });
        PM.refresh();
      });
      grid.querySelectorAll('[data-id]').forEach(c => c.onclick = () => {
        const r = allRows.find(x => x.id === c.dataset.id);
        if (r) exprDrawer(r, () => PM.refresh());
      });
    }
    if (searchIn) {
      searchIn.addEventListener('input', () => { exprQuery = searchIn.value; renderGrid(); });
      searchIn.addEventListener('keydown', e => { if (e.key === 'Escape') { searchIn.value = ''; exprQuery = ''; renderGrid(); } });
    }
    bindCards();
  }

  /* 表达详情抽屉：发音 + 释义 + 例句 + 间隔复习打分 + 编辑/收藏/删除 */
  function exprDrawer(r, onChanged) {
    const status = STATUS_LABEL[r.status] || r.status;
    const reviewBox = r.status === 'new'
      ? `<div class="small muted" style="margin-top:10px">新表达，还没开始复习。点下面的「认识」开始。</div>`
      : `<div class="li-group" style="margin-top:18px"><span>这次记住了吗</span></div>
         <div class="row" style="gap:8px">
           <button class="btn sm danger" data-grade="forget">😵 忘记 · 明天再来</button>
           <button class="btn sm" data-grade="fuzzy">🤔 模糊 · 原级重排</button>
           <button class="btn sm primary" data-grade="know">😃 认识 · ${NEXT_LABEL[Math.min(+r.level + 1, 4)]}</button>
         </div>`;
    PM.drawer({
      title: u.esc(r.phrase),
      body: `
        <div class="wd-head">
          <div class="wd-word">${u.esc(r.phrase)}</div>
          <div class="wd-ph">${u.esc(r.phonetic || '—')} <button class="btn sm" data-speak>🔊 发音</button></div>
          <div class="wd-tags">
            <span class="tag ${r.status === 'mastered' ? 'green' : r.status === 'learning' ? 'blue' : 'orange'}">${status}</span>
            ${r.category ? `<span class="tag deck">${u.esc(r.category)}</span>` : ''}
            ${+r.wrong_count >= 2 ? `<span class="tag red">错 ${r.wrong_count} 次</span>` : ''}
            ${isDue(r) ? '<span class="tag pink">待复习</span>' : ''}
            ${r.next_review ? `<span class="tag">下次 ${u.esc(r.next_review)}</span>` : ''}
          </div>
          ${footHtml(r)}
        </div>
        <div class="wd-sec"><b>中文意思</b><p>${u.esc(r.meaning_cn || '—')}</p></div>
        ${r.meaning_en ? `<div class="wd-sec"><b>英文解释</b><p>${u.esc(r.meaning_en)}</p></div>` : ''}
        ${r.example ? `<div class="wd-sec"><b>例句</b><p class="en-sent">${u.esc(r.example)}</p>${r.example_cn ? `<p class="small muted">${u.esc(r.example_cn)}</p>` : ''}</div>` : ''}
        ${reviewBox}
        <div class="row" style="gap:8px;margin-top:16px">
          <button class="btn sm" data-edit>✏️ 编辑</button>
          <button class="btn sm" data-fav>${r.favorite === '1' ? '★ 取消收藏' : '☆ 收藏'}</button>
          <button class="btn sm danger" data-del>🗑 删除</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-speak]').onclick = () => u.speak(r.phrase);
        el.querySelectorAll('[data-grade]').forEach(b => b.onclick = async () => {
          await fetch(`/api/review/expressions/${r.id}/review`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: b.dataset.grade }),
          });
          close(); onChanged && onChanged();
        });
        el.querySelector('[data-edit]').onclick = () => { close(); exprEditor(r, () => onChanged && onChanged()); };
        el.querySelector('[data-fav]').onclick = async () => {
          await api.update('expressions', r.id, { favorite: r.favorite === '1' ? '0' : '1' });
          close(); onChanged && onChanged();
        };
        el.querySelector('[data-del]').onclick = async () => {
          if (!confirm('确定删除这条表达？')) return;
          await api.remove('expressions', r.id); close(); PM.toast('已删除'); onChanged && onChanged();
        };
      },
    });
  }

  /* ================= Listening：听力训练 ================= */
  /* 素材落在 listening_materials / listening_questions 两张表；
     内置种子在 listening-seed.js，首次进页时灌表，之后用户可自己增删改。
     一段听力固定 4 步：盲听 → 理解题 → 看原文 → 逐句跟读。 */

  const LI_LEVEL = { 1: '入门', 2: '进阶', 3: '挑战' };
  const LI_STEP_T = ['盲听', '理解题', '看原文', '跟读'];
  const LI_CAT = { daily: 'Daily English', business: 'Business English', advanced: 'Advanced' };

  /* 去掉 A:/B: 这类说话人前缀：TTS 会真的把 "A" 念出来，列表里也显得脏 */
  const liStrip = l => String(l || '').replace(/^\s*(A|B|C|D|Host|Guest|Interviewer)\s*[:：]\s*/, '');
  const liPlain = t => String(t || '').split('\n').map(liStrip).join('\n').trim();

  /* 原文划词选取：兼容鼠标拖选与触摸长按选词（iPad 上 mouseup 不可靠，改用 selectionchange） */
  let _liSelHandler = null, _liSelBusy = false, _liPickOpen = false, _liCooldown = 0;
  function attachLiSelect() {
    if (_liSelHandler) document.removeEventListener('selectionchange', _liSelHandler);
    let _t = null;
    _liSelHandler = () => {
      if (_liSelBusy || _liPickOpen || Date.now() < _liCooldown) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const tr = document.querySelector('.li-tr');   // 仅第 3 步「看原文」存在
      if (!tr) return;
      const a = sel.anchorNode, f = sel.focusNode;
      if ((a && !tr.contains(a)) && (f && !tr.contains(f))) return;
      const txt = (sel.toString() || '').trim();
      if (!txt) return;
      clearTimeout(_t);
      _t = setTimeout(() => {     // 选区稳定后再弹，避免拖动手柄时反复触发
        if (_liSelBusy) return;
        const s2 = window.getSelection();
        const t2 = (s2 && s2.toString() || '').trim();
        if (!t2) return;
        _liSelBusy = true;
        try { s2.removeAllRanges(); } catch (e) {}
        liPickLibrary(t2).finally(() => { _liSelBusy = false; });
      }, 350);
    };
    document.addEventListener('selectionchange', _liSelHandler);
  }

  /* 音频按 (音色+文本) 缓存：整段和逐句都走这里，同一句不会重复合成。
     后端没装 edge-tts 或网络不通时返回 null，调用方降级到浏览器朗读。 */
  const liAudioCache = new Map();    /* key -> 已生成的 url */
  const liAudioPending = new Map();  /* key -> 正在进行的 Promise */
  async function liAudio(text, voice) {
    const t = String(text || '').trim();
    if (!t) return null;
    const v = voice || 'en-US-AriaNeural';
    const key = v + '|' + t;
    if (liAudioCache.has(key)) return liAudioCache.get(key);
    /* 同一段正在合成时（比如后台预热先跑到了），直接搭同一个 Promise，不重复生成 */
    if (liAudioPending.has(key)) return liAudioPending.get(key);
    const job = (async () => {
      try {
        const r = await api.req('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          body: new URLSearchParams({ text: t, voice: v }).toString(),
        });
        if (r && r.ok && r.url) { liAudioCache.set(key, r.url); return r.url; }
      } catch (e) { /* 静默失败，交给浏览器朗读兜底 */ }
      return null;
    })();
    liAudioPending.set(key, job);
    const url = await job;
    liAudioPending.delete(key);
    return url;
  }

  /* 后台预热：音频一次合成、永久缓存，所以进页就悄悄把素材音频生成好，
     用户挑素材的那几十秒刚好够用上。并发 2 是怕把正常请求挤慢，失败一律静默。 */
  function liPrewarm(mats) {
    let i = 0;
    const step = async () => {
      while (i < mats.length) {
        const batch = mats.slice(i, i + 2);
        i += 2;
        await Promise.all(batch.map(async m => {
          try {
            const url = await liAudio(liPlain(m.transcript), m.voice);
            if (url && !m.audio) {
              m.audio = url;
              api.update('listening_materials', m.id, { audio: url }).catch(() => {});
            }
          } catch (e) { /* 预热失败不影响使用，点播放时会再试一次 */ }
        }));
      }
    };
    setTimeout(step, 900);   /* 先让主界面画出来再说 */
  }

  /* 同时只允许一段音频在播：切句、切步骤、关弹窗时都先把上一段停掉 */
  let liNow = null;
  function liStop() { try { if (liNow) liNow.pause(); } catch (e) {} liNow = null; }

  /* 极简播放器。音频是按需合成的，首次点播放要等 1–2 秒，期间按钮显示「合成中」；
     合成不出来就退回浏览器朗读，不让用户卡在原地。 */
  function liPlayer(host, opt) {
    const rates = [0.75, 1, 1.25];
    host.innerHTML =
      `<button class="li-pbtn${opt.big ? ' big' : ''}" data-p><span class="li-pi">▶</span><span class="li-pt">${opt.label || '播放'}</span></button>
       <div class="li-bar" data-bar><i></i></div>
       <div class="li-tm" data-tm>0:00</div>
       <div class="li-rates">${rates.map(r => `<button data-r="${r}" class="${r === 1 ? 'on' : ''}">${r}×</button>`).join('')}</div>`;
    const btn = host.querySelector('[data-p]');
    const bar = host.querySelector('[data-bar] i');
    const tm = host.querySelector('[data-tm]');
    const txt = opt.text, voice = opt.voice;
    let a = null, url = null, loading = false, rate = 1;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const setPlay = on => {
      btn.classList.toggle('on', on);
      btn.querySelector('.li-pi').textContent = on ? '❚❚' : '▶';
      btn.querySelector('.li-pt').textContent = on ? '暂停' : (opt.label || '播放');
    };
    async function ensure() {
      if (url) return url;
      if (loading) return null;
      loading = true;
      const lab = btn.querySelector('.li-pt');
      btn.classList.add('loading'); lab.textContent = '生成音频…';
      /* 首次合成要三四秒（并发分句，服务端算完就永久缓存）。
         超过 2 秒还没回就补一句说明，免得用户以为卡死了。 */
      const hint = setTimeout(() => {
        if (loading) { lab.textContent = '首次生成约 5 秒'; opt.onWait && opt.onWait(); }
      }, 2000);
      url = await liAudio(txt, voice);
      clearTimeout(hint);
      loading = false;
      btn.classList.remove('loading'); lab.textContent = opt.label || '播放';
      if (!url) return null;
      a = new Audio(url);
      a.loop = !!opt.loop;
      a.playbackRate = rate;
      a.addEventListener('timeupdate', () => {
        if (!a.duration) return;
        bar.style.width = (a.currentTime / a.duration * 100) + '%';
        tm.textContent = fmt(a.currentTime) + ' / ' + fmt(a.duration);
      });
      a.addEventListener('ended', () => { setPlay(false); bar.style.width = '0%'; });
      return url;
    }
    btn.onclick = async () => {
      if (a && !a.paused) { a.pause(); setPlay(false); return; }
      liStop();
      const ok = await ensure();
      if (!ok) {                       // 服务端不可用 → 浏览器朗读兜底
        PM.u.speak(opt.text, 'en-US');
        PM.toast('服务端合成不可用，已改用浏览器朗读');
        opt.onPlay && opt.onPlay();
        return;
      }
      try { liNow = a; await a.play(); setPlay(true); opt.onPlay && opt.onPlay(); }
      catch (e) { PM.u.speak(opt.text, 'en-US'); }
    };
    host.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      host.querySelectorAll('[data-r]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      rate = +b.dataset.r;
      if (a) a.playbackRate = rate;
    });
    host._stop = () => { try { if (a) { a.pause(); a.currentTime = 0; } } catch (e) {} };
    return host;
  }

  /* 首次进页把种子素材灌进表。只在表为空时做 ——
     用户把自己加的都删光了会重新灌回内置，正好当「恢复默认素材」用。 */
  async function liEnsureSeed() {
    let mats = await api.list('listening_materials');
    if (mats.length || !window.LISTENING_SEED) return mats;
    const r = await api.bulk('listening_materials', LISTENING_SEED.map(s => ({
      scene: s.scene, category: s.category, title: s.title, level: String(s.level),
      voice: s.voice, transcript: s.transcript, translation: s.translation,
      keywords: s.keywords, audio: '', words: String(s.transcript.split(/\s+/).length),
      source: '内置',
    })));
    mats = (r && r.rows) || [];
    const qs = [];
    mats.forEach((m, i) => (LISTENING_SEED[i].qs || []).forEach((q, j) => {
      qs.push({ material_id: m.id, q: q.q, a: q.a, b: q.b, c: q.c, d: q.d,
                answer: q.answer, explain: q.explain, sort: String(j) });
    }));
    if (qs.length) await api.bulk('listening_questions', qs);
    return mats;
  }

  const liSceneOf = k => {
    for (const c of (window.LISTENING_SCENES || [])) {
      const f = c.items.find(i => i.key === k);
      if (f) return f;
    }
    return { key: k, label: k || '未分类', icon: '🎧' };
  };

  /* 把重点词在原文里标出来。先转义再替换，避免把 HTML 标签打碎 */
  function liMark(txt, kws) {
    let h = u.esc(txt);
    String(kws || '').split(',').map(s => s.trim()).filter(Boolean).forEach(w => {
      const e = u.esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { h = h.replace(new RegExp('\\b(' + e + ')', 'gi'), '<mark>$1</mark>'); } catch (err) {}
    });
    return h;
  }

  /* 把选中的词/短语加入学习库：统一弹「选库确认」，避免误塞生词本。
     vocab=生词本（走间隔复习）；expr=表达积累（地道说法，可选中文释义）。 */
  async function liPickLibrary(text) {
    const w = liStrip(String(text || '')).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').trim();
    if (!w) { PM.toast('请选择英文单词或短语', 'err'); return; }
    if (w.length > 40) { PM.toast('选中的内容太长了', 'err'); return; }
    /* 去重：待确认词库或正式库（生词本/表达）已存在则提示，不重复加 */
    const [pend, vb, ex] = await Promise.all([
      api.list('pending_words'), api.list('vocabulary'), api.list('expressions'),
    ]);
    const low = w.toLowerCase();
    if (pend.some(r => String(r.text || '').toLowerCase() === low)) { PM.toast(`「${w}」已经在待确认词库里了`); return; }
    if (vb.some(r => String(r.word || '').toLowerCase() === low) || ex.some(r => String(r.phrase || '').toLowerCase() === low)) {
      PM.toast(`「${w}」已经在词库里了`); return;
    }
    return new Promise(resolve => {
      let target = 'vocab';
      const m = PM.modal({
        title: `把「<b>${u.esc(w)}</b>」加入哪个库？`,
        body: `<div class="li-add">
          <div class="li-add-hint">新词会先进入「待确认词库」暂存。补全音标、中文、例句后，再确认入库到下面的目标库。</div>
          <label class="li-radio"><input type="radio" name="lib" value="vocab" checked>
            <span><b>生词本</b><small>单个单词 / 词组，走间隔复习</small></span></label>
          <label class="li-radio"><input type="radio" name="lib" value="expr">
            <span><b>表达积累</b><small>地道短语 / 多词，记下英文说法</small></span></label>
          <div class="li-add-cn" data-cn-box style="display:none">
            <label>中文释义（可选）</label>
            <input class="input" name="cn" placeholder="如：我吃饱了">
          </div>
        </div>`,
        foot: `<button class="btn" data-no>取消</button><button class="btn primary" data-yes>加入待确认</button>`,
        /* 关键：无论用户点「加入/取消」、点遮罩还是 ✕ 关闭，都重置选词守卫。
           否则关闭弹窗后 _liSelBusy/_liPickOpen 仍停在 true，下一次划词会在第一行被拦截，
           表现就是「第一次能弹、之后怎么划都没反应」。 */
        onClose() { _liSelBusy = false; _liPickOpen = false; _liCooldown = Date.now() + 500; },
        onMount(el, close) {
          _liPickOpen = true;
          const sync = () => {
            target = el.querySelector('input[name=lib]:checked').value;
            el.querySelector('[data-cn-box]').style.display = target === 'expr' ? 'block' : 'none';
          };
          el.querySelectorAll('input[name=lib]').forEach(r => r.onchange = sync);
          el.querySelector('[data-yes]').onclick = async () => {
            sync();
            const cn = el.querySelector('[name=cn]').value.trim();
            close();
            await liAddToLib(target, w, cn);
            resolve();
          };
          el.querySelector('[data-no]').onclick = () => { close(); resolve(); };
        },
      });
    });
  }

  async function liAddToLib(target, w, cn) {
    /* 快速捕捉的新词先落「待确认词库」暂存：缺的音标/中文/例句由人工或助手补全后，
       再到「待确认词库」页确认入库，按 target 写进生词本或表达积累。 */
    const rows = await api.list('pending_words');
    if (rows.some(r => String(r.text || '').toLowerCase() === w.toLowerCase())) {
      PM.toast(`「${w}」已经在待确认词库里了`); return;
    }
    await api.create('pending_words', {
      text: w, target, phonetic: '', meaning_cn: cn || '', meaning_en: '',
      example: '', example_cn: '', source: 'listening', added_at: u.today(), status: 'pending',
    });
    PM.toast(`已加入待确认词库：${w}（去补全后入库）`);
  }

  /* 练完一篇后，问是否标记为「需要再练习」；标记后下次挑素材优先安排 */
  function liAskRePractice(cur) {
    return new Promise(resolve => {
      PM.modal({
        title: '这篇练得怎么样？',
        body: `<div class="li-re">
          <p>要不要把这篇标记为 <b>需要再练习</b>？</p>
          <p class="muted">标记后，下次挑素材会优先安排它，方便巩固薄弱环节。</p>
          <div class="li-re-tag">${cur === '1' ? '<span class="tag orange">当前已标记：需再练</span>' : '<span class="tag">当前：不特别安排</span>'}</div>
        </div>`,
        foot: `<button class="btn" data-no>不用了</button><button class="btn primary" data-yes>需要再练</button>`,
        onMount(el, close) {
          el.querySelector('[data-yes]').onclick = () => { close(); resolve('1'); };
          el.querySelector('[data-no]').onclick = () => { close(); resolve('0'); };
        },
      });
    });
  }

  /* ---------------- 4 步训练器 ---------------- */
  function liSession(mat, qs, onDone) {
    const st = { step: 1, pick: {}, plays: 0, read: {} };
    const lines = String(mat.transcript || '').split('\n').filter(l => l.trim());
    let cur = 0;

    PM.modal({
      full: true,
      title: `${u.esc(mat.title)}${mat.need_review === '1' ? ' <span class="li-need">需再练 ✓</span>' : ''}`,
      headExtra: `<div class="li-steps">${LI_STEP_T.map((t, i) =>
        `<span class="li-st" data-s="${i + 1}"><i>${i + 1}</i>${t}</span>`).join('')}</div>`,
      foot: `<button class="btn sm" data-prev>上一步</button><div class="spacer"></div>
             <span class="li-note" data-note></span>
             <button class="btn primary" data-next>下一步</button>`,
      onClose: () => { liStop(); if (_liSelHandler) document.removeEventListener('selectionchange', _liSelHandler); _liSelHandler = null; _liSelBusy = false; _liPickOpen = false; _liCooldown = 0; },
      onMount(el, close) {
        el.classList.add('modal-listening');
        attachLiSelect();
        const body = el.querySelector('.modal-body');
        const note = el.querySelector('[data-note]');
        const prevB = el.querySelector('[data-prev]');
        const nextB = el.querySelector('[data-next]');

        function sync() {
          el.querySelectorAll('.li-st').forEach(s => {
            const n = +s.dataset.s;
            s.classList.toggle('on', n === st.step);
            s.classList.toggle('past', n < st.step);
          });
          prevB.disabled = st.step === 1;
          nextB.textContent = st.step === 4 ? '完成 ✓' : '下一步';
        }
        function go(n) {
          liStop();
          if (body._stop) body._stop();
          st.step = Math.max(1, Math.min(4, n));
          draw();
        }

        /* —— Step 1：盲听 —— */
        function stepBlind() {
          const d = u.el(`<div class="li-pane">
            <div class="li-blind">
              <div class="li-ico">🎧</div>
              <div class="li-tip">先不看原文，整段听 1–2 遍。<br>只抓「谁在说话、在谈什么事」，听不懂的词先放过。</div>
              <div class="li-player" data-pl></div>
              <div class="li-meta" data-meta>已听 0 遍</div>
              <div class="li-warn">这一步没有字幕也不显示原文 —— 忍住，第 3 步才看。</div>
            </div></div>`);
          liPlayer(d.querySelector('[data-pl]'), {
            text: liPlain(mat.transcript), voice: mat.voice, big: true, label: '播放整段',
            onPlay: () => { st.plays++; d.querySelector('[data-meta]').textContent = `已听 ${st.plays} 遍`; },
          });
          return d;
        }

        /* —— Step 2：理解题 —— */
        function stepQuiz() {
          const d = u.el(`<div class="li-pane"><div class="li-qwrap"></div></div>`);
          const w = d.querySelector('.li-qwrap');
          if (!qs.length) {
            w.innerHTML = `<div class="empty">这段素材还没有理解题，直接去看原文吧。</div>`;
            return d;
          }
          w.innerHTML = qs.map((q, i) => `
            <div class="li-q" data-i="${i}">
              <div class="li-q-t"><b>Q${i + 1}</b>${u.esc(q.q)}</div>
              <div class="li-opts">${['A', 'B', 'C', 'D'].map(k =>
                `<button class="li-opt" data-k="${k}"><i>${k}</i><span>${u.esc(q[k.toLowerCase()])}</span></button>`).join('')}</div>
              <div class="li-ex"></div>
            </div>`).join('');
          w.querySelectorAll('.li-q').forEach(box => {
            const i = +box.dataset.i, q = qs[i];
            box.querySelectorAll('.li-opt').forEach(b => b.onclick = () => {
              if (st.pick[i]) return;                 // 已作答就锁定，避免反复试
              st.pick[i] = b.dataset.k;
              const right = st.pick[i] === q.answer;
              box.querySelectorAll('.li-opt').forEach(x => {
                x.classList.add('lock');
                if (x.dataset.k === q.answer) x.classList.add('right');
                else if (x.dataset.k === st.pick[i]) x.classList.add('wrong');
              });
              box.querySelector('.li-ex').innerHTML =
                `<div class="li-ex-h ${right ? 'ok' : 'no'}">${right ? '✓ 答对了' : '✗ 正确答案是 ' + q.answer}</div>
                 <div class="li-ex-b">${u.esc(q.explain || '')}</div>`;
              box.classList.add('done');
              syncQuiz();
            });
          });
          syncQuiz();
          return d;
        }
        function syncQuiz() {
          if (!qs.length) { note.textContent = ''; return; }
          const done = Object.keys(st.pick).length;
          const ok = qs.filter((q, i) => st.pick[i] === q.answer).length;
          note.textContent = `已答 ${done}/${qs.length}${done ? ` · 对 ${ok}` : ''}`;
        }

        /* —— Step 3：看原文 —— */
        function stepText() {
          const d = u.el(`<div class="li-pane">
            <div class="li-tr-bar">
              <div class="seg sm" data-lang>
                <button data-v="en" class="on">English</button>
                <button data-v="cn">中文</button>
                <button data-v="both">对照</button></div>
              <div class="spacer"></div>
              <div class="li-player mini" data-pl></div>
            </div>
            <div class="li-tr" data-tr></div>
            <div class="li-kw-box" data-kw></div>
          </div>`);
          const tr = d.querySelector('[data-tr]');
          const kwBox = d.querySelector('[data-kw]');
          const cn = String(mat.translation || '').split('\n').filter(l => l.trim());
          const paint = mode => {
            tr.innerHTML = lines.map((l, i) => `
              <div class="li-tr-line${st.read[i] ? ' read' : ''}" data-i="${i}">
                <span class="li-tr-n">${i + 1}</span>
                <span class="li-tr-txt">${liMark(l, mat.keywords)}</span>
                ${mode !== 'en' && cn[i] ? `<span class="li-tr-cn">${u.esc(cn[i])}</span>` : ''}
              </div>`).join('');
          };
          paint('en');
          d.querySelectorAll('[data-lang] button').forEach(b => b.onclick = () => {
            d.querySelectorAll('[data-lang] button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            paint(b.dataset.v);
          });
          liPlayer(d.querySelector('[data-pl]'), {
            text: liPlain(mat.transcript), voice: mat.voice, label: '整段',
          });
          /* 重点词：点一下直接收进生词本（系统精选，不必再选库） */
          const kws = String(mat.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
          kwBox.innerHTML = kws.length
            ? `<div class="li-kw-t">本段重点词 · 点一下先加入待确认词库</div>
               <div class="li-kw-hint">💡 想加对话里其它单词/短语？在上方原文里划选，或在平板上<b>长按选词</b>，再选库加入</div>
               <div class="li-kw">${kws.map(w => `<button class="li-kw-b" data-w="${u.esc(w)}">${u.esc(w)} ＋</button>`).join('')}</div>`
            : '<div class="li-kw-hint">💡 在上方原文里划选，或在平板上长按选词，可加入生词本或表达积累</div>';
          kwBox.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
            if (b.classList.contains('in')) return;
            liPickLibrary(b.dataset.w);
          });
          return d;
        }

        /* —— Step 4：Shadowing 跟读 —— */
        function stepShadow() {
          const d = u.el(`<div class="li-pane">
            <div class="li-sh-h">逐句跟读：听一句 → 暂停 → 大声跟读出来 → 标记完成。
              <span class="li-sh-p">已完成 <b data-shn>0</b> / ${lines.length}</span></div>
            <div class="li-sh-cur" data-cur></div>
            <div class="li-player" data-pl></div>
            <div class="li-sh-ctl">
              <button class="btn sm" data-pv>← 上一句</button>
              <button class="btn sm primary" data-dn>✓ 这句读完了</button>
              <button class="btn sm" data-nx>下一句 →</button>
            </div>
            <div class="li-sh-list" data-list></div>
          </div>`);
          const curBox = d.querySelector('[data-cur]');
          const listBox = d.querySelector('[data-list]');
          const nBox = d.querySelector('[data-shn]');
          let pl = null;
          const drawCur = () => {
            liStop();
            curBox.innerHTML = `<div class="li-sh-idx">第 ${cur + 1} 句</div>
              <div class="li-sh-txt">${u.esc(liStrip(lines[cur]))}</div>`;
            const host = d.querySelector('[data-pl]');
            pl = liPlayer(host, {
              text: liPlain(lines[cur]), voice: mat.voice, big: true,
              label: `播放第 ${cur + 1} 句`, loop: false,
            });
            /* 说话人前缀 A:/B: 只用来分角色，念出来和列出来都该去掉，否则满屏 "A:" */
            listBox.innerHTML = lines.map((l, i) =>
              `<div class="li-sh-li${i === cur ? ' cur' : ''}${st.read[i] ? ' read' : ''}" data-i="${i}">
                 <span class="li-sh-li-n">${i + 1}</span>
                 <span class="li-sh-li-t">${u.esc(liStrip(l))}</span>
                 ${st.read[i] ? '<span class="li-sh-li-ok">✓</span>' : ''}
               </div>`).join('');
            listBox.querySelectorAll('.li-sh-li').forEach(x => x.onclick = () => {
              cur = +x.dataset.i; drawCur();
            });
            nBox.textContent = Object.keys(st.read).length;
          };
          drawCur();
          d.querySelector('[data-pv]').onclick = () => { cur = Math.max(0, cur - 1); drawCur(); };
          d.querySelector('[data-nx]').onclick = () => { cur = Math.min(lines.length - 1, cur + 1); drawCur(); };
          d.querySelector('[data-dn]').onclick = () => {
            st.read[cur] = 1;
            if (cur < lines.length - 1) { cur++; drawCur(); }
            else { drawCur(); PM.toast('全部跟读完成 🎉'); }
          };
          body._stop = () => { if (pl && pl._stop) pl._stop(); };
          return d;
        }

        function draw() {
          sync();
          body.innerHTML = '';
          body.appendChild(st.step === 1 ? stepBlind()
            : st.step === 2 ? stepQuiz()
            : st.step === 3 ? stepText()
            : stepShadow());
          body.scrollTop = 0;
          if (st.step === 2) syncQuiz(); else note.textContent = '';
        }

        prevB.onclick = () => go(st.step - 1);
        nextB.onclick = async () => {
          if (st.step < 4) { go(st.step + 1); return; }
          const total = qs.length;
          const score = qs.filter((q, i) => st.pick[i] === q.answer).length;
          try {
            await api.create('listening_logs', {
              material_id: mat.id, date: u.today(), step: '4',
              score: String(score), total: String(total),
              minutes: String(Math.max(1, Math.round((+mat.words || 150) * 0.42 / 60))),
              done: '1',
            });
          } catch (e) {}
          PM.toast(total ? `完成！答对 ${score}/${total}` : '完成！');
          /* 完成后让用户标记是否需要再练习，方便下次优先巩固 */
          const flag = await liAskRePractice(mat.need_review);
          try { await api.update('listening_materials', mat.id, { need_review: flag }); } catch (e) {}
          onDone && onDone();
          close();
        };
        draw();
      },
    });
  }

  /* ---------------- 听力计划（同构背词计划） ---------------- */
  /* plans 存「怎么排」（范围/每天几段/循环星期），tasks 是排出来的每日任务落日历打卡。
     素材在完成时才实时挑 —— 练过的集合每天在变，预先写死 material_ids 必然陈旧。 */

  const liScopePool = (mats, scope) => !scope || scope === 'all' ? mats
    : (['daily', 'business', 'advanced'].includes(scope) ? mats.filter(m => m.category === scope)
      : mats.filter(m => m.scene === scope));
  const liScopeLabel = s => !s || s === 'all' ? '全部素材'
    : (LI_CAT[s] || (liSceneOf(s) ? liSceneOf(s).label : s));

  async function liGenTasks(plan) {
    const mats = await liEnsureSeed();
    const pool = liScopePool(mats, plan.scope);
    if (!pool.length) return { made: 0, total: 0, last: '', reason: 'empty' };
    /* 已排日期 → 已占段数。必须 Map：重排时已存在的天也要扣减，否则翻倍（背词那边踩过） */
    const exist = new Map((await api.list('listen_tasks'))
      .filter(t => String(t.plan_id) === String(plan.id))
      .map(t => [t.date, +t.count || 0]));
    const per = Math.max(1, +plan.per_day || 1);
    const start = plan.start_date && plan.start_date > u.today() ? plan.start_date : u.today();
    const out = [];
    let left = pool.length, d = start, guard = 0, last = '';
    while (left > 0 && guard++ < 180) {
      if (plan.end_date && d > plan.end_date) break;
      if (vpMatch(plan, d)) {                     /* 星期匹配复用背词的 vpMatch */
        if (exist.has(d)) left -= Math.min(exist.get(d) || per, left);
        else {
          const n = Math.min(per, left);
          out.push({ plan_id: String(plan.id), date: d, title: `听力 ${n} 段`, count: String(n),
                     scope: plan.scope || 'all', material_ids: '', done: '0', done_at: '' });
          left -= n; last = d;
        }
      }
      d = u.addDays(d, 1);
    }
    if (out.length) await api.bulk('listen_tasks', out);
    return { made: out.length, total: pool.length, last,
             reason: out.length ? '' : (plan.end_date && start > plan.end_date ? 'past' : 'exist') };
  }

  /* 开始练当天任务：优先没练过的素材，逐段开四步训练；
     一段的 listening_logs 由训练器自己写，这里只管任务打卡。 */
  async function liStartTask(task, onDone) {
    const n = Math.max(1, +task.count || 1);
    const mats = await liEnsureSeed();
    const pool = liScopePool(mats, task.scope);
    if (!pool.length) { PM.toast('这个范围还没有听力素材', 'err'); return false; }
    const [logs, allQ] = await Promise.all([api.list('listening_logs'), api.list('listening_questions')]);
    const practiced = new Set(logs.filter(l => l.done === '1').map(l => l.material_id));
    const fresh = pool.filter(m => !practiced.has(m.id));
    /* 标记为「需再练」的素材优先安排，方便巩固薄弱环节 */
    fresh.sort((a, b) => (b.need_review === '1' ? 1 : 0) - (a.need_review === '1' ? 1 : 0));
    const todayDone = new Set(logs.filter(l => l.done === '1' && l.date === u.today()).map(l => l.material_id));
    /* 今天已练的不重复挑，凑不够就从（未练过的或全部）里补 */
    const primary = (fresh.length ? fresh : pool).filter(m => !todayDone.has(m.id));
    const pick = (primary.length ? primary : pool).slice(0, n);
    if (!pick.length) { PM.toast('今天的任务都练完啦', 'ok'); return false; }
    const pickIds = pick.map(m => String(m.id));
    const openNext = async () => {
      const m = pick[0];
      const qs = allQ.filter(q => String(q.material_id) === String(m.id))
        .sort((a, b) => (+a.sort || 0) - (+b.sort || 0));
      liSession(m, qs, async () => {
        /* 练完一段：数今天在本任务素材里练了几段，够数才打卡 */
        const lg = await api.list('listening_logs');
        const c = lg.filter(l => l.done === '1' && l.date === u.today() && pickIds.includes(String(l.material_id))).length;
        if (c >= n) {
          await api.update('listen_tasks', task.id, {
            done: '1', done_at: u.today(), material_ids: pickIds.join(','),
          });
          PM.toast('今日听力任务完成 🎧');
          onDone && onDone();
        } else {
          PM.toast(`还剩 ${n - c} 段，点「开始练」继续`);
          onDone && onDone();
          openNext();                     /* 直接串下一段，不用回抽屉再点 */
        }
      });
    };
    openNext();
    return true;
  }

  /* 听力计划面板：结构照抄背词的 planPanel */
  async function liPlanPanel(onChange) {
    const [plans, tasks] = await Promise.all([api.list('listen_plans'), api.list('listen_tasks')]);
    const statOf = p => {
      const ts = tasks.filter(t => String(t.plan_id) === String(p.id));
      const todo = ts.filter(t => t.done !== '1').map(t => t.date).sort();
      return { n: ts.length, done: ts.filter(t => t.done === '1').length, next: todo[0] || '' };
    };

    PM.modal({
      title: '听力计划安排',
      wide: true,
      body: `
        <div class="vp-sec">
          <div class="li-group"><span>已有计划</span></div>
          ${plans.length ? plans.map(p => {
            const s = statOf(p);
            const off = p.active === '0';
            return `<div class="vp-li ${off ? 'off' : ''}">
              <div class="vp-li-main">
                <b>${u.esc(p.name || '听力计划')}</b>
                <div class="vp-li-sub">${u.esc(liScopeLabel(p.scope))} · 每天 ${p.per_day} 段 · ${vpWdText(p)}</div>
                <div class="vp-li-sub">已排 ${s.n} 天，完成 ${s.done}${s.next ? ` · 下次 ${u.esc(u.relDate(s.next))}（${s.next.slice(5)}）` : ''}</div>
              </div>
              <div class="vp-li-act">
                <button class="btn xs" data-gen="${p.id}">排任务</button>
                <button class="btn xs" data-off="${p.id}">${off ? '启用' : '暂停'}</button>
                <button class="btn xs danger" data-del="${p.id}">删</button>
              </div>
            </div>`;
          }).join('') : '<div class="small muted" style="padding:4px 2px 10px">还没有计划，在下面新建一个 ↓</div>'}
        </div>
        <div class="vp-sec">
          <div class="li-group"><span>新建计划</span></div>
          <div class="f2">
            <div class="field"><label>素材范围</label>
              <select class="input" name="scope">
                <option value="all">全部素材</option>
                ${(window.LISTENING_SCENES || []).map(c =>
                  `<optgroup label="${c.label}">${c.items.map(i =>
                    `<option value="${i.key}">${i.icon} ${i.label}</option>`).join('')}</optgroup>`).join('')}
              </select></div>
            <div class="field"><label>每天段数</label>
              <input class="input" type="number" name="per_day" value="1" min="1" max="5"></div>
          </div>
          <div class="field"><label>计划名称（可留空）</label>
            <input class="input" name="name" placeholder="如：每天 1 段商务听力"></div>
          <div class="field"><label>循环星期（可多选，留空 = 每天）</label>
            <div class="weekday-pick" id="liWd">
              ${WD_CN.map((d, i) => `<div class="wd" data-wd="${i + 1}">${d}</div>`).join('')}
            </div>
            <div class="vp-quick">
              <button class="btn xs" type="button" data-q="1,2,3,4,5,6,7">每天</button>
              <button class="btn xs" type="button" data-q="1,2,3,4,5">工作日</button>
              <button class="btn xs" type="button" data-q="6,7">周末</button>
            </div>
            <input type="hidden" name="weekdays" value=""></div>
          <div class="f2">
            <div class="field"><label>开始日期</label>
              <input class="input" type="date" name="start_date" value="${u.today()}"></div>
            <div class="field"><label>结束日期（留空 = 排到素材用完）</label>
              <input class="input" type="date" name="end_date"></div>
          </div>
        </div>`,
      foot: `<button class="btn" data-close>关闭</button><button class="btn primary" data-save>新建并排任务</button>`,
      onMount(el, close) {
        el.classList.add('modal-fit');
        const pick = el.querySelector('#liWd');
        const wdIn = el.querySelector('[name=weekdays]');
        const syncWd = () => { wdIn.value = [...pick.querySelectorAll('.wd.on')].map(x => x.dataset.wd).join(','); };
        pick.onclick = e => { const t = e.target.closest('.wd'); if (!t) return; t.classList.toggle('on'); syncWd(); };
        el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
          const set = b.dataset.q.split(',');
          pick.querySelectorAll('.wd').forEach(w => w.classList.toggle('on', set.includes(w.dataset.wd)));
          syncWd();
        });
        const reopen = async () => { close(); await liPlanPanel(onChange); onChange && onChange(); };
        const afterGen = r => {
          if (r.made) PM.toast(`已排 ${r.made} 天任务${r.last ? `，排到 ${r.last.slice(5)}` : ''}`);
          else if (r.reason === 'empty') PM.toast('这个范围还没有听力素材', 'err');
          else if (r.reason === 'past') PM.toast('结束日期早于开始日期，没排出任务', 'err');
          else PM.toast('任务已经是最新的，没有新增（素材排完即止，想再练一轮删掉旧计划重建）');
        };
        el.querySelectorAll('[data-gen]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.gen);
          b.disabled = true; b.textContent = '排中…';
          afterGen(await liGenTasks(p));
          await reopen();
        });
        el.querySelectorAll('[data-off]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.off);
          await api.update('listen_plans', p.id, { active: p.active === '0' ? '1' : '0' });
          await reopen();
        });
        el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          const p = plans.find(x => String(x.id) === b.dataset.del);
          if (!await PM.confirm(`删除「${p.name || '听力计划'}」？已排的任务会一起删掉`)) return;
          for (const t of tasks.filter(x => String(x.plan_id) === String(p.id))) {
            await api.remove('listen_tasks', t.id);
          }
          await api.remove('listen_plans', p.id);
          PM.toast('已删除');
          await reopen();
        });
        el.querySelector('[data-save]').onclick = async () => {
          const d = PM.formData(el);
          d.per_day = String(Math.max(1, Math.min(5, +d.per_day || 1)));
          d.start_date = d.start_date || u.today();
          d.active = '1';
          if (!d.name.trim()) d.name = `${liScopeLabel(d.scope)} · 每天 ${d.per_day} 段`;
          await api.create('listen_plans', d);
          const p = { ...d, id: (await api.list('listen_plans')).slice(-1)[0].id };
          afterGen(await liGenTasks(p));
          await reopen();
        };
      },
    });
  }

  /* —— 单条添加素材（对齐词汇页「＋ 添加单词」的交互；批量导入在知识库）—— */
  function liAddMaterial(onDone) {
    /* 场景下拉按大类分组；选中场景反查大类，音色给个对应的默认值 */
    const CAT_VOICE = { daily: 'en-US-JennyNeural', business: 'en-US-AriaNeural', advanced: 'en-GB-SoniaNeural' };
    const catOf = k => {
      for (const c of (window.LISTENING_SCENES || [])) if (c.items.some(i => i.key === k)) return c.key;
      return 'business';
    };
    PM.modal({
      title: '添加听力素材',
      wide: true,
      body: `<div class="li-form kb-form">
        <div class="f2">
          <div class="field"><label>场景</label>
            <select class="input" name="scene">
              ${(window.LISTENING_SCENES || []).map(c =>
                `<optgroup label="${c.label}">${c.items.map(i =>
                  `<option value="${i.key}">${i.icon} ${i.label}</option>`).join('')}</optgroup>`).join('')}
            </select></div>
          <div class="field"><label>难度</label>
            <select class="input" name="level"><option value="1">入门</option>
              <option value="2" selected>进阶</option><option value="3">挑战</option></select></div>
        </div>
        <div class="f2">
          <div class="field"><label>标题（留空取原文首句）</label>
            <input class="input" name="title" placeholder="例如：和供应商约交付时间"></div>
          <div class="field"><label>重点词（可选）</label>
            <input class="input" name="keywords" placeholder="逗号分隔，会在原文里高亮"></div>
        </div>
        <div class="field"><label>音色</label>
          <select class="input" name="voice">
            <option value="en-US-JennyNeural">Jenny · 美式女声</option>
            <option value="en-US-GuyNeural">Guy · 美式男声</option>
            <option value="en-US-AriaNeural">Aria · 美式女声</option>
            <option value="en-US-AndrewNeural">Andrew · 美式男声</option>
            <option value="en-GB-SoniaNeural">Sonia · 英式女声</option>
            <option value="en-GB-RyanNeural">Ryan · 英式男声</option>
          </select></div>
        <div class="field"><label>英文原文 *</label>
          <textarea class="input" name="transcript" rows="8"
            placeholder="每行一句。对话用 A: / B: 开头（朗读时不念前缀），独白每行一句即可。"></textarea></div>
        <div class="field"><label>中文翻译（可选，与原文逐行对应）</label>
          <textarea class="input" name="translation" rows="5" placeholder="A：你好，需要点什么？…"></textarea></div>
        <div class="li-form-note">保存后就能在列表里练它。要批量导入 PPT / 邮件 / 聊天记录请去
          <a href="#/english/kb" data-gokb>知识库</a>。</div>
      </div>`,
      foot: `<div class="spacer"></div><button class="btn primary" data-save>保存</button>`,
      onMount(el, close) {
        el.classList.add('modal-fit');
        const sceneSel = el.querySelector('[name=scene]');
        const voiceSel = el.querySelector('[name=voice]');
        const syncVoice = () => { voiceSel.value = CAT_VOICE[catOf(sceneSel.value)] || 'en-US-AriaNeural'; };
        syncVoice();
        sceneSel.onchange = syncVoice;
        el.querySelector('[data-gokb]').onclick = () => { close(); location.hash = '#/english/kb'; };
        el.querySelector('[data-save]').onclick = async () => {
          const d = PM.formData(el);
          const tr = (d.transcript || '').trim();
          if (!tr) { PM.toast('英文原文不能为空'); return; }
          const lines = tr.split('\n').filter(x => x.trim());
          /* 翻译行数对齐：缺的补空，多的截掉（和 AI 提炼走同一套规矩） */
          let cn = (d.translation || '').split('\n').filter(x => x.trim());
          while (cn.length < lines.length) cn.push('');
          await api.create('listening_materials', {
            scene: d.scene, category: catOf(d.scene),
            title: (d.title || '').trim() || lines[0].replace(/^\s*(A|B)\s*[:：]\s*/, '').slice(0, 40),
            level: d.level || '2', voice: d.voice,
            transcript: lines.join('\n'), translation: cn.slice(0, lines.length).join('\n'),
            keywords: (d.keywords || '').trim(), audio: '',
            words: String(tr.split(/\s+/).length), source: '手动',
          });
          PM.toast('素材已添加');
          onDone && onDone();
          close();
        };
      },
    });
  }

  /* ---------------- Listening 主视图 ---------------- */
  async function viewListening(el, query) {
    const qy = query || {};
    /* 必须先灌完种子再查题目：并发查的话，首次进页时 questions 表还是空的，
       题目会整批丢失（要刷新一次才出现）。 */
    const mats = await liEnsureSeed();
    const [allQ, logs, liPlans, liTasks] = await Promise.all([
      api.list('listening_questions'), api.list('listening_logs'),
      api.list('listen_plans'), api.list('listen_tasks'),
    ]);
    const qByM = {};
    allQ.forEach(x => { (qByM[x.material_id] = qByM[x.material_id] || []).push(x); });
    Object.values(qByM).forEach(a => a.sort((x, y) => (+x.sort || 0) - (+y.sort || 0)));

    const T = u.today();
    /* 今日听力任务：只统计启用中的计划排出来的（放 T 之后，别踩 TDZ） */
    const liOn = new Set(liPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const todayTasks = liTasks.filter(t => t.date === T && liOn.has(String(t.plan_id)));
    const doneL = logs.filter(l => l.done === '1');
    const last = {};
    doneL.forEach(l => { if (!last[l.material_id] || l.date > last[l.material_id].date) last[l.material_id] = l; });
    const practiced = new Set(Object.keys(last));
    const todayN = doneL.filter(l => l.date === T).length;
    const scored = doneL.filter(l => +l.total > 0);
    const avg = scored.length
      ? Math.round(scored.reduce((s, l) => s + (+l.score / +l.total), 0) / scored.length * 100) : 0;

    let cat = qy.cat || 'all';
    let scene = qy.scene || '';

    const dur = w => Math.round((+w || 0) * 0.42);   /* 约 143 词/分钟 */
    const cardHTML = m => {
      const n = (qByM[m.id] || []).length;
      const lg = last[m.id];
      const pct = lg && +lg.total ? Math.round(+lg.score / +lg.total * 100) : null;
      return `<div class="li-card" data-id="${m.id}">
        <div class="li-card-h">
          <span class="li-lv lv${m.level}">${LI_LEVEL[m.level] || '进阶'}</span>
          <span class="li-cat">${liSceneOf(m.scene).icon} ${liSceneOf(m.scene).label}</span>
        </div>
        <div class="li-card-t">${u.esc(m.title)}</div>
        <div class="li-card-s">${m.words || ''} 词 · ${n ? n + ' 题' : '无题'} · 约 ${dur(m.words)} 秒</div>
        <div class="li-card-f">
          ${pct != null ? `<span class="tag ${pct >= 70 ? 'green' : 'orange'}">上次 ${pct}%</span>`
            : (practiced.has(m.id) ? '<span class="tag">已练</span>' : '')}
          ${m.need_review === '1' ? '<span class="tag orange">需再练</span>' : ''}
          <div class="spacer"></div>
          <button class="btn sm ${practiced.has(m.id) ? '' : 'primary'}" data-go="${m.id}">${practiced.has(m.id) ? '再练一次' : '开始'}</button>
        </div>
      </div>`;
    };

    el.innerHTML = `<div class="en-page">
      <div class="vw-stats li-stats">
        <div class="stat"><div class="k">素材总数</div><div class="v">${mats.length}</div></div>
        <div class="stat"><div class="k">已练段落</div><div class="v">${practiced.size}</div></div>
        <div class="stat${todayN ? ' due' : ''}"><div class="k">今日已练</div><div class="v">${todayN}</div></div>
        <div class="stat${todayTasks.some(t => t.done !== '1') ? ' due' : ''}"><div class="k">今日任务</div>
          <div class="v">${todayTasks.length
            ? `${todayTasks.filter(t => t.done === '1').length}/${todayTasks.length}` : '—'}</div></div>
        <div class="stat"><div class="k">平均正确率</div><div class="v">${scored.length ? avg + '%' : '—'}</div></div>
      </div>
      <div class="vw-actions li-actions">
        <button class="vw-act listen" data-rand>
          <span class="vw-act-ico">🎧</span>
          <span class="vw-act-txt"><b>随机来一段</b><span class="vw-act-sub">不挑场景，直接开练</span></span>
        </button>
        <button class="vw-act plan" data-lplan>
          <span class="vw-act-ico">${PLAN_ICON}</span>
          <span class="vw-act-txt"><b>计划安排</b><span class="vw-act-sub">${liPlans.filter(p => p.active !== '0').length
            ? `已建 ${liPlans.filter(p => p.active !== '0').length} 个计划` : '排周期 · 自动进日历'}</span></span>
          ${todayTasks.some(t => t.done !== '1') ? `<span class="vw-act-n">${todayTasks.filter(t => t.done !== '1').length}</span>` : ''}
        </button>
        <div class="spacer"></div>
        <button class="btn sm" data-add>＋ 添加素材</button>
      </div>
      <div class="li-nav">
        <div class="seg" data-cat>
          <button data-v="all" class="on">全部</button>
          ${Object.keys(LI_CAT).map(k => `<button data-v="${k}">${LI_CAT[k].split(' ')[0]}</button>`).join('')}
        </div>
        <div class="li-chips" data-chips></div>
      </div>
      <div class="li-list"></div>
    </div>`;

    const chipsBox = el.querySelector('[data-chips]');
    const listBox = el.querySelector('.li-list');

    function drawNav() {
      const items = cat === 'all'
        ? (window.LISTENING_SCENES || []).flatMap(c => c.items)
        : ((window.LISTENING_SCENES || []).find(c => c.key === cat) || { items: [] }).items;
      chipsBox.innerHTML = `<button class="chip${scene ? '' : ' on'}" data-s="">全部场景</button>`
        + items.map(i => `<button class="chip${scene === i.key ? ' on' : ''}" data-s="${i.key}">${i.icon} ${i.label}</button>`).join('');
      chipsBox.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
        scene = b.dataset.s; drawNav(); drawList();
      });
    }
    function drawList() {
      const l = mats.filter(m => (cat === 'all' || m.category === cat) && (!scene || m.scene === scene));
      listBox.innerHTML = l.length ? l.map(cardHTML).join('')
        : `<div class="empty">这个场景下还没有素材，点「＋ 添加素材」录一段吧。</div>`;
      listBox.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
        const m = mats.find(x => x.id === b.dataset.go);
        if (m) liSession(m, qByM[m.id] || [], () => PM.refresh());
      });
    }
    el.querySelectorAll('[data-cat] button').forEach(b => b.onclick = () => {
      el.querySelectorAll('[data-cat] button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cat = b.dataset.v; scene = '';
      drawNav(); drawList();
    });
    el.querySelector('[data-rand]').onclick = () => {
      const pool = mats.filter(m => !practiced.has(m.id));
      const pick = (pool.length ? pool : mats)[Math.floor(Math.random() * (pool.length ? pool.length : mats.length))];
      if (pick) liSession(pick, qByM[pick.id] || [], () => PM.refresh());
    };
    /* 单条录入：像词汇页「添加单词」一样弹表单；批量导入在知识库 */
    el.querySelector('[data-add]').onclick = () => liAddMaterial(() => PM.refresh());
    el.querySelector('[data-lplan]').onclick = () => liPlanPanel(() => PM.refresh());
    drawNav(); drawList();
    liPrewarm(mats);
  }

  /* ================= Knowledge Base：素材中枢 ================= */
  /* 这里收一切原始素材（PPT/Notes/QA/Meeting/Email/Teams/随手记）。
     工作流：你把素材贴进来存档（待整理），或直接发给助手（对话里）——
     整理好的生词 / 听力 / 学习卡会分别出现在 Vocabulary、Listening 和下面的学习卡里。 */

  const KB_TYPES = {
    ppt:     { label: 'PPT 内容',      icon: '📊' },
    notes:   { label: 'Speaker Notes', icon: '📝' },
    qa:      { label: '常见 Q&A',      icon: '❓' },
    meeting: { label: 'Meeting 表达',  icon: '🗓️' },
    email:   { label: 'Email',         icon: '📧' },
    teams:   { label: 'Teams message', icon: '💬' },
    snapshot:{ label: '随手记',        icon: '📷' },
  };
  const pick = (o, ks) => ks.reduce((a, k) => (a[k] = o[k] || '', a), {});

  /* —— 导入素材（粘贴存档）—— */
  function kbImport(onDone) {
    PM.modal({
      title: '导入素材',
      wide: true,
      body: `<div class="li-form kb-form">
        <label class="kb-upload" data-drop>
          <input type="file" data-file accept=".pptx,.pdf,.txt,.md" hidden>
          <span class="kb-upload-ico">📎</span>
          <span class="kb-upload-t"><b>上传 PPT / PDF 文件</b><br>
            <span class="kb-upload-s">.pptx 会自动提取每页文字和演讲备注（旧版 .ppt 请先另存为 .pptx）</span></span>
          <span class="kb-upload-btn" data-fbtn>选择文件</span>
        </label>
        <div class="kb-or">或 粘贴内容</div>
        <label class="fld"><span>类型</span><select data-type>
          ${Object.keys(KB_TYPES).map(k => `<option value="${k}">${KB_TYPES[k].icon} ${KB_TYPES[k].label}</option>`).join('')}
        </select></label>
        <label class="fld"><span>标题</span><input data-title placeholder="例如：Q3 Review 汇报的 speaker notes"></label>
        <label class="fld"><span>内容 *</span><textarea data-content rows="7"
          placeholder="粘贴 PPT 文字、Speaker Notes、邮件正文、Teams 聊天记录、会议里听到的表达……"></textarea></label>
        <div class="kb-ai-tip">存档后素材会出现在列表里（状态「待整理」）。
          想把它变成生词 / 听力 / 学习卡：把内容发给助手，整理好会直接写进各模块。</div>
      </div>`,
      foot: `<div class="spacer"></div><button class="btn primary" data-save>保存</button>`,
      onMount(el, close) {
        el.classList.add('modal-fit');
        const g = s => el.querySelector(s);
        const upBox = g('[data-drop]');
        const fin = g('[data-file]');
        /* 文件上传：选好直接传，成功即存档关闭（不用再点保存） */
        const upload = async f => {
          if (!f) return;
          const fd = new FormData();
          fd.append('file', f);
          fd.append('type', g('[data-type]').value);
          const btn = g('[data-fbtn]');
          btn.textContent = '上传中…'; upBox.classList.add('busy');
          try {
            const r = await api.req('/api/kb/upload', { method: 'POST', body: fd });
            PM.toast(`已存档${r.chars > 50 ? `（提取到 ${r.chars} 字）` : '（文本待解读）'}`);
            onDone && onDone();
            close();
          } catch (e) {
            PM.toast(e.message || '上传失败');
            btn.textContent = '选择文件'; upBox.classList.remove('busy');
          }
        };
        fin.onchange = () => upload(fin.files[0]);
        /* 拖拽直接扔进来也可以 */
        upBox.ondragover = e => { e.preventDefault(); upBox.classList.add('drag'); };
        upBox.ondragleave = () => upBox.classList.remove('drag');
        upBox.ondrop = e => { e.preventDefault(); upBox.classList.remove('drag'); upload(e.dataTransfer.files[0]); };
        g('[data-save]').onclick = async () => {
          const content = g('[data-content]').value.trim();
          if (!content) { PM.toast('内容不能为空（或直接上传文件）'); return; }
          await api.create('kb_materials', {
            type: g('[data-type]').value,
            title: g('[data-title]').value.trim() || content.split('\n')[0].slice(0, 40),
            content, status: '0', summary: '',
          });
          PM.toast('素材已存档');
          onDone && onDone();
          close();
        };
      },
    });
  }

  /* —— 快速记一句（手动捕获，不用等整理）—— */
  function kbQuickCard(onDone) {
    PM.modal({
      title: '快速记一句',
      wide: true,
      body: `<div class="li-form kb-form">
        <div class="kb-ai-tip">旅行路上、美剧里、邮件里看到想学的句子，先记在这里。
          中文意思知道就顺手填；想要完整的五件套（用法 / Example / Similar / Speaking 练习），
          把句子发给助手，整理后会自动补全。</div>
        <label class="fld"><span>句子 *</span><textarea data-sen rows="3"
          placeholder="e.g. I wanted to circle back on the pricing we discussed."></textarea></label>
        <label class="fld"><span>中文意思（可选）</span><input data-cn placeholder="知道就填，不知道留空"></label>
      </div>`,
      foot: `<div class="spacer"></div><button class="btn primary" data-save>保存学习卡</button>`,
      onMount(el, close) {
        el.classList.add('modal-fit');
        el.querySelector('[data-save]').onclick = async () => {
          const g = s => el.querySelector(s);
          const sen = g('[data-sen]').value.trim();
          if (!sen) { PM.toast('先输入一句话'); return; }
          const mr = await api.create('kb_materials', { type: 'snapshot',
            title: sen.slice(0, 40), content: sen, status: '0', summary: '' });
          await api.create('kb_cards', {
            material_id: mr && mr.row ? mr.row.id : '', sentence: sen,
            meaning_cn: g('[data-cn]').value.trim(), usage: '', example: '', similar: '', speaking: '',
          });
          PM.toast('学习卡已入库');
          onDone && onDone();
          close();
        };
      },
    });
  }

  /* —— 素材详情 —— */
  function kbDetail(m, onDone) {
    const T = KB_TYPES[m.type] || { label: m.type, icon: '📄' };
    PM.modal({
      wide: true,
      title: `${T.icon} ${u.esc(m.title)}`,
      headExtra: `<span class="tag ${m.status === '1' ? 'green' : 'orange'}">${m.status === '1' ? '已整理' : '待整理'}</span>`,
      foot: `<button class="btn sm danger" data-del>删除素材</button><div class="spacer"></div>
             <button class="btn" data-close>关闭</button>`,
      onMount(el, close) {
        const body = el.querySelector('.modal-body');
        body.innerHTML = `
          <div class="kb-detail">
            <div class="kb-content">${u.esc(m.content)}</div>
            ${m.file ? `<a class="kb-file" href="${m.file}" download>${u.esc(m.summary || m.file)} ⬇</a>` : ''}
            <div class="kb-ex-bar">
              <span class="kb-ex-note">${m.status === '1'
                ? `已整理：${u.esc(m.summary || '—')}。整理出的内容在 Vocabulary / Listening / 学习卡里。`
                : `待整理 —— 把这份素材发给助手，整理结果会写进各模块，然后这里会标记为「已整理」。`}</span>
            </div>
          </div>`;
        el.querySelector('[data-del]').onclick = async () => {
          await api.remove('kb_materials', m.id);
          PM.toast('已删除');
          close(); onDone && onDone();
        };
      },
    });
  }

  /* —— 学习卡展示 —— */
  function kbCardHTML(c) {
    const F = [['usage', '用法'], ['example', 'Example'], ['similar', 'Similar'], ['speaking', 'Speaking 练习']];
    return `<div class="kb-card">
      <div class="kb-card-sen">${u.esc(c.sentence)}</div>
      ${c.meaning_cn ? `<div class="kb-card-f"><span class="kb-card-k">中文意思</span>
        <span class="kb-card-v">${u.esc(c.meaning_cn)}</span></div>` : ''}
      ${F.map(([k, lab]) => c[k] ? `<div class="kb-card-f"><span class="kb-card-k">${lab}</span>
        <span class="kb-card-v">${u.esc(c[k])}</span></div>` : '').join('')}
    </div>`;
  }

  /* —— KB 主视图 —— */
  async function viewKB(el, query) {
    const [mats, cards] = await Promise.all([
      api.list('kb_materials'), api.list('kb_cards'),
    ]);
    let tab = 'mats', type = '';

    el.innerHTML = `<div class="en-page">
      <div class="vw-stats kb-stats">
        <div class="stat"><div class="k">素材</div><div class="v">${mats.length}</div></div>
        <div class="stat"><div class="k">学习卡</div><div class="v">${cards.length}</div></div>
        <div class="stat"><div class="k">已整理</div><div class="v">${mats.filter(x => x.status === '1').length}</div></div>
        <div class="stat${mats.some(x => x.status !== '1') ? ' due' : ''}"><div class="k">待整理</div>
          <div class="v">${mats.filter(x => x.status !== '1').length}</div></div>
      </div>
      <div class="vw-actions kb-actions">
        <button class="vw-act learn" data-imp>
          <span class="vw-act-ico">＋</span>
          <span class="vw-act-txt"><b>导入素材</b><span class="vw-act-sub">PPT · Notes · Email · 聊天记录…</span></span>
        </button>
        <button class="vw-act listen" data-quick>
          <span class="vw-act-ico">✍</span>
          <span class="vw-act-txt"><b>快速记一句</b><span class="vw-act-sub">先记下来，回头再展开</span></span>
        </button>
        <div class="spacer"></div>
      </div>
      <div class="li-nav">
        <div class="seg" data-tab>
          <button data-v="mats" class="on">素材库</button>
          <button data-v="cards">学习卡</button>
        </div>
        <div class="li-chips" data-chips></div>
      </div>
      <div class="kb-body" data-body></div>
    </div>`;

    const body = el.querySelector('[data-body]');
    const chips = el.querySelector('[data-chips]');
    const refresh = () => PM.refresh();

    function drawChips() {
      chips.style.display = tab === 'mats' ? '' : 'none';
      chips.innerHTML = tab !== 'mats' ? '' :
        `<button class="chip${type ? '' : ' on'}" data-t="">全部类型</button>`
        + Object.keys(KB_TYPES).map(k =>
          `<button class="chip${type === k ? ' on' : ''}" data-t="${k}">${KB_TYPES[k].icon} ${KB_TYPES[k].label}</button>`).join('');
      chips.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
        type = b.dataset.t; drawChips(); draw();
      });
    }
    function draw() {
      if (tab === 'mats') {
        const l = mats.filter(x => !type || x.type === type);
        body.innerHTML = l.length ? `<div class="kb-list">` + l.map(x => {
          const T2 = KB_TYPES[x.type] || { label: x.type, icon: '📄' };
          return `<div class="kb-item" data-id="${x.id}">
            <span class="kb-item-ico">${T2.icon}</span>
            <div class="kb-item-main">
              <div class="kb-item-t">${u.esc(x.title)}</div>
              <div class="kb-item-s">${u.esc(x.content).slice(0, 90)}…</div>
            </div>
            <span class="tag ${x.status === '1' ? 'green' : 'orange'}">${x.status === '1' ? '已整理' : '待整理'}</span>
          </div>`;
        }).join('') + `</div>` : `<div class="empty">还没有素材。点「导入素材」，把 PPT、邮件、聊天记录粘贴进来存档。</div>`;
        body.querySelectorAll('.kb-item').forEach(it => it.onclick = () => {
          const m = mats.find(x => x.id === it.dataset.id);
          if (m) kbDetail(m, refresh);
        });
      } else {
        body.innerHTML = cards.length ? `<div class="kb-cards">` + cards.map((c, i) =>
          `<div class="kb-card-wrap"><div class="kb-card">
            ${kbCardHTML(c)}
            <button class="kb-card-del" data-del="${i}">✕</button>
            <button class="btn xs" data-speak="${i}">🔊 播读</button>
            <button class="btn xs primary" data-toexpr="${i}" title="提取到「表达积累」">＋表达</button>
          </div></div>`).join('') + `</div>`
          : `<div class="empty">还没有学习卡。点「快速记一句」先把好句子存进来。</div>`;
        body.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => {
          e.stopPropagation();
          const c = cards[+b.dataset.del];
          await api.remove('kb_cards', c.id);
          PM.toast('已删除'); refresh();
        });
        body.querySelectorAll('[data-toexpr]').forEach(b => b.onclick = async e => {
          e.stopPropagation();
          const c = cards[+b.dataset.toexpr];
          if (!c.sentence) return PM.toast('这张卡没有句子', 'err');
          const ex = await api.list('expressions');
          if (ex.some(r => (r.phrase || '').trim().toLowerCase() === c.sentence.trim().toLowerCase())) {
            return PM.toast('表达积累里已存在这句');
          }
          await api.create('expressions', {
            phrase: c.sentence.trim(), meaning_cn: c.meaning_cn || '', source: '知识库',
            status: 'new', level: '0', favorite: '0', wrong_count: '0', added_at: u.today(),
          });
          PM.toast('已提取到表达积累 🎉'); refresh();
        });
        body.querySelectorAll('[data-speak]').forEach(b => b.onclick = e => {
          e.stopPropagation();
          const c = cards[+b.dataset.speak];
          liAudio(c.sentence, 'en-US-JennyNeural').then(url => {
            if (url) { liStop(); const a = new Audio(url); liNow = a; a.play().catch(() => {}); }
            else PM.u.speak(c.sentence, 'en-US');
          });
        });
      }
    }
    el.querySelectorAll('[data-tab] button').forEach(b => b.onclick = () => {
      el.querySelectorAll('[data-tab] button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      tab = b.dataset.v; drawChips(); draw();
    });
    el.querySelector('[data-imp]').onclick = () => kbImport(refresh);
    el.querySelector('[data-quick]').onclick = () => kbQuickCard(refresh);
    drawChips(); draw();
  }

  /* ================= Dashboard：学习总览 ================= */
  /* 口径说明（也是跟统计卡数量对不上的那节课的延续）：
     · 连续天数：任何一种学习痕迹（背词记录 / 听力练习 / 任务打卡）都算「学了」；
       今天还没学不打断，从昨天往回数。
     · 今日任务：待复习算一项 + 今天排出的背词 / 听力任务；
       完成度 = 已完成项 / 总项。 */
  async function viewDashboard(el) {
    const T = u.today();
    const [vocab, slogs, llogs, vplans, vtasks, liPlans, liTasks] = await Promise.all([
      api.list('vocabulary'), api.list('study_logs'), api.list('listening_logs'),
      api.list('vocab_plans'), api.list('vocab_tasks'),
      api.list('listen_plans'), api.list('listen_tasks'),
    ]);
    const doneL = llogs.filter(l => l.done === '1');
    const vOn = new Set(vplans.filter(p => p.active !== '0').map(p => String(p.id)));
    const liOn = new Set(liPlans.filter(p => p.active !== '0').map(p => String(p.id)));
    const tv = vtasks.filter(t => t.date === T && vOn.has(String(t.plan_id)));
    const tl = liTasks.filter(t => t.date === T && liOn.has(String(t.plan_id)));

    const daySet = new Set([
      ...slogs.map(l => l.date), ...doneL.map(l => l.date),
      ...vtasks.filter(t => t.done === '1' && t.done_at).map(t => t.done_at),
      ...liTasks.filter(t => t.done === '1' && t.done_at).map(t => t.done_at),
    ].filter(Boolean));
    let streak = 0, d = T;
    if (!daySet.has(d)) d = u.addDays(d, -1);
    while (daySet.has(d) && streak < 366) { streak++; d = u.addDays(d, -1); }

    const dueN = vocab.filter(isDue).length;
    const reviewedToday = slogs.some(l => l.date === T && l.kind === 'vocab');
    const items = [];
    if (dueN) items.push({ t: `复习到期 ${dueN} 个词`, done: reviewedToday, go: '#/english/vocab', b: '去复习' });
    tv.forEach(t => items.push({ t: t.title || '背词任务', done: t.done === '1', go: '#/english/vocab', b: '开始' }));
    tl.forEach(t => items.push({ t: t.title || '听力任务', done: t.done === '1', go: '#/english/listening', b: '去听' }));
    const tot = items.length, okN = items.filter(i => i.done).length;
    const pct = tot ? Math.round(okN / tot * 100) : 100;

    /* 本周（周一→今天）：study_logs + listening_logs 的分钟数求和 */
    const wIdx = u.weekIndex(T) === 0 ? 7 : u.weekIndex(T);
    const weekStart = u.addDays(T, -(wIdx - 1));
    const bars = Array.from({ length: 7 }, (_, i) => {
      const day = u.addDays(weekStart, i);
      const m = slogs.filter(l => l.date === day).reduce((x, l) => x + (+l.minutes || 0), 0)
        + doneL.filter(l => l.date === day).reduce((x, l) => x + (+l.minutes || 0), 0);
      return { day, m };
    });
    const weekMin = bars.reduce((x, b) => x + b.m, 0);
    const maxM = Math.max(...bars.map(b => b.m), 1);
    const liToday = doneL.filter(l => l.date === T).length;
    const WD2 = ['一', '二', '三', '四', '五', '六', '日'];

    el.innerHTML = `<div class="en-page">
      <div class="vw-stats db-stats">
        <div class="stat streak"><div class="k">🔥 连续学习</div><div class="v">${streak}<small>天</small></div></div>
        <div class="stat${tot && okN < tot ? ' due' : ''}"><div class="k">✅ 今日任务</div>
          <div class="v">${tot ? okN + '/' + tot : '—'}</div></div>
        <div class="stat${dueN ? ' due' : ''}"><div class="k">📚 今日待复习</div><div class="v">${dueN}</div></div>
        <div class="stat"><div class="k">🎧 今日听力</div><div class="v">${liToday || '—'}</div></div>
        <div class="stat"><div class="k">📈 本周时长</div><div class="v">${weekMin}<small>分</small></div></div>
      </div>
      <div class="db-grid">
        <div class="db-card">
          <div class="db-card-h">📈 本周学习时长 <span>共 ${weekMin} 分钟</span></div>
          <div class="db-bars">
            ${bars.map(b => `
            <div class="db-bar${b.day === T ? ' today' : ''}${b.day > T ? ' future' : ''}">
              <span class="db-bar-n">${b.m || ''}</span>
              <div class="db-bar-c"><i style="height:${b.m ? Math.max(10, Math.round(b.m / maxM * 100)) : 0}%"></i></div>
              <span class="db-bar-d">${WD2[(u.weekIndex(b.day) === 0 ? 7 : u.weekIndex(b.day)) - 1]}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="db-card">
          <div class="db-card-h">✅ 今日任务 <span>${tot ? `完成 ${pct}%` : '今天没有安排'}</span></div>
          ${tot ? `<div class="db-prog"><i style="width:${pct}%"></i></div>` : ''}
          <div class="db-tasks">
            ${items.length ? items.map(i => `
            <div class="db-task${i.done ? ' done' : ''}">
              <span class="db-task-ck">${i.done ? '✓' : '○'}</span>
              <span class="db-task-t">${u.esc(i.t)}</span>
              ${i.done ? '' : `<button class="btn xs primary" data-go="${i.go}">${i.b}</button>`}
            </div>`).join('')
            : `<div class="small muted" style="padding:6px 2px 10px">今天没有任务 —— 去词汇或听力页建个学习计划吧</div>`}
          </div>
        </div>
      </div>
      <div class="db-links">
        <button class="btn sm" data-to="#/english/vocab">📚 词汇</button>
        <button class="btn sm" data-to="#/english/listening">🎧 听力</button>
        <button class="btn sm" data-to="#/english/pending">📥 待确认词库</button>
        <button class="btn sm" data-to="#/english/kb">🗂️ 知识库</button>
      </div>
    </div>`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
    el.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { location.hash = b.dataset.to; });
  }

  /* ================= 待确认词库（暂存区） ================= */
  /* 划词 / 重点词等快速捕捉的新词先落这里；缺的音标、中文、例句由人工或助手补全后，
     再「确认入库」按 target（vocab=生词本 / expr=表达积累）写进正式库。 */
  async function viewPending(el) {
    const rows = (await api.list('pending_words'))
      .slice().sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')));

    const targetLabel = t => t === 'expr' ? '表达积累' : '生词本';
    const missing = r => {
      const m = [];
      if (!String(r.phonetic || '').trim()) m.push('音标');
      if (!String(r.meaning_cn || '').trim()) m.push('中文');
      if (!String(r.example || '').trim()) m.push('例句');
      return m;
    };

    const render = async () => {
      const list = (await api.list('pending_words'))
        .slice().sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')));
      const cnt = list.length;
      if (!cnt) {
        el.innerHTML = `<div class="en-page">
          <div class="pw-head"><h2>待确认词库</h2><span class="tag">${cnt}</span></div>
          <div class="empty" style="padding:54px 10px"><span class="big">📥</span>
            待确认词库是空的。在听力里划词或点重点词，新词会先到这里等你补全音标、中文和例句。</div>
        </div>`;
        return;
      }
      el.innerHTML = `<div class="en-page">
        <div class="pw-head">
          <h2>待确认词库</h2><span class="tag orange">${cnt}</span>
        </div>
        <div class="pw-tip">📥 这里是新词暂存区。补全音标 / 中文 / 例句后，点「确认入库」就会按目标库（生词本 / 表达积累）正式入库，并开始间隔复习。也可以找助手帮你批量补全。</div>
        <div class="pw-list">
          ${list.map(card).join('')}
        </div>
      </div>`;
      bindCards();
    };

    const card = r => {
      const miss = missing(r);
      const tgt = targetLabel(r.target);
      const missBadges = miss.length
        ? `<div class="pw-miss">${miss.map(x => `<span class="tag red">缺${x}</span>`).join('')}</div>` : '';
      return `<div class="pw-card" data-id="${r.id}">
        <div class="pw-card-h">
          <b class="pw-text">${u.esc(r.text)}</b>
          <span class="tag deck">目标：${tgt}</span>
          ${r.source ? `<span class="tag">${u.esc(r.source)}</span>` : ''}
          <div class="spacer"></div>
          ${miss.length ? `<span class="tag red">待补全 ${miss.length} 项</span>` : '<span class="tag green">可入库</span>'}
        </div>
        ${missBadges}
        <div class="pw-fields">
          <div class="field"><label>音标</label><input class="input" name="phonetic" value="${u.esc(r.phonetic || '')}" placeholder="/fəˈnetɪk/"></div>
          <div class="field"><label>中文释义</label><input class="input" name="meaning_cn" value="${u.esc(r.meaning_cn || '')}" placeholder="必填，入库需要"></div>
          <div class="field"><label>英文释义</label><input class="input" name="meaning_en" value="${u.esc(r.meaning_en || '')}" placeholder="英文解释（可选）"></div>
          <div class="field"><label>例句</label><input class="input" name="example" value="${u.esc(r.example || '')}" placeholder="英文例句（可选）"></div>
          <div class="field"><label>例句中文</label><input class="input" name="example_cn" value="${u.esc(r.example_cn || '')}" placeholder="例句翻译（可选）"></div>
          <div class="field"><label>备注</label><input class="input" name="note" value="${u.esc(r.note || '')}" placeholder="备注（可选）"></div>
        </div>
        <div class="pw-acts">
          <button class="btn sm" data-dict>📖 查词典补全</button>
          <button class="btn sm" data-save>保存</button>
          <button class="btn sm primary" data-confirm>确认入库</button>
          <button class="btn sm danger" data-del>删除</button>
        </div>
      </div>`;
    };

    const bindCards = () => {
      el.querySelectorAll('[data-dict]').forEach(b => b.onclick = async () => {
        const card = b.closest('.pw-card');
        const id = card.dataset.id;
        const r = (await api.list('pending_words')).find(x => x.id === id);
        if (!r) return;
        b.disabled = true; b.textContent = '查询中…';
        try {
          const d = await (await fetch('/api/dict/' + encodeURIComponent(r.text))).json();
          if (!d.ok) { PM.toast('没查到，手动填吧'); }
          else {
            const e = d.entry || {};
            const fill = (name, val) => {
              const inp = card.querySelector(`[name=${name}]`);
              if (val && !inp.value.trim()) inp.value = val;
            };
            fill('phonetic', e.phonetic); fill('meaning_en', e.meaning_en);
            fill('meaning_cn', e.meaning_cn); fill('example', e.example);
            PM.toast(d.from === 'local' ? '本地已有这个词' : '已补全');
          }
        } catch (e) { PM.toast('查询失败', 'err'); }
        b.disabled = false; b.textContent = '📖 查词典补全';
      });
      el.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
        const card = b.closest('.pw-card');
        const id = card.dataset.id;
        const d = PM.formData(card);
        await api.update('pending_words', id, d);
        PM.toast('已保存'); render();
      });
      el.querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
        const card = b.closest('.pw-card');
        const id = card.dataset.id;
        const r = (await api.list('pending_words')).find(x => x.id === id);
        if (!r) return;
        if (!String(r.meaning_cn || '').trim()) {
          // 用最新输入的值再判一次（用户可能刚填了但还没保存）
          const cn = card.querySelector('[name=meaning_cn]').value.trim();
          if (!cn) { PM.toast('先补全中文释义再入库', 'err'); return; }
          r.meaning_cn = cn;
        }
        try {
          if (r.target === 'expr') {
            await api.create('expressions', {
              phrase: r.text, phonetic: r.phonetic, meaning_cn: r.meaning_cn, meaning_en: r.meaning_en,
              example: r.example, example_cn: r.example_cn, category: '听力', source: r.source || '待确认',
              status: 'new', added_at: u.today(), note: r.note,
            });
          } else {
            await api.create('vocabulary', {
              word: r.text, phonetic: r.phonetic, meaning_en: r.meaning_en, meaning_cn: r.meaning_cn,
              example: r.example, example_cn: r.example_cn, deck: 'business', source: r.source || '待确认',
              status: 'new', level: '0', favorite: '0', wrong_count: '0', added_at: u.today(), note: r.note,
            });
          }
          await api.remove('pending_words', id);
          PM.toast(`已入库到${targetLabel(r.target)}：${r.text}`);
          render();
        } catch (e) { PM.toast('入库失败', 'err'); }
      });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const card = b.closest('.pw-card');
        const id = card.dataset.id;
        const r = (await api.list('pending_words')).find(x => x.id === id);
        if (r && await PM.confirm(`删除待确认词「${r.text}」？`)) {
          await api.remove('pending_words', id);
          render();
        }
      });
    };

    await render();
  }

  /* =============================================================
   * 生词记忆库：把散在各处的「没记住」汇成一个重点复习清单
   * -------------------------------------------------------------
   * 入库（满足任一自动收进来，无需手动维护）：
   *   1) 默写时点过「🙈 不认识」（unknown=1）
   *   2) 最近一次闪卡复习选了「😵 忘记」（last_grade=forget）
   *   3) 累计答错 ≥ 2 次（wrong_count≥2，高频错词）
   * 出库：列表里点「✅ 已掌握」；或统一复习时选「😃 认识」
   *       （自动清掉不认识标记，忘记/错次口径也随之消失）
   * ============================================================= */
  let memFilter = 'all';
  const memRank = r => (r.unknown === '1' ? 4 : 0) + (r.last_grade === 'forget' ? 2 : 0) + (+r.wrong_count >= 2 ? 1 : 0);
  async function viewMemory(el) {
    const rows = await api.list('vocabulary');
    const isUnk = r => r.unknown === '1';
    const isForgot = r => r.last_grade === 'forget';
    const isWrong = r => +r.wrong_count >= 2;
    const bank = rows.filter(r => isUnk(r) || isForgot(r) || isWrong(r))
      .sort((a, b) => memRank(b) - memRank(a)
        || +b.wrong_count - +a.wrong_count
        || String(a.word || '').localeCompare(String(b.word || '')));
    const nUnk = bank.filter(isUnk).length;
    const nForgot = bank.filter(isForgot).length;
    const nWrong = bank.filter(isWrong).length;
    let list = bank;
    if (memFilter === 'unk') list = bank.filter(isUnk);
    else if (memFilter === 'forget') list = bank.filter(isForgot);
    else if (memFilter === 'wrong') list = bank.filter(isWrong);

    const CHIPS = [
      ['all', '全部', bank.length], ['unk', '🙈 不认识', nUnk],
      ['forget', '😵 最近忘记', nForgot], ['wrong', '❌ 高频错词', nWrong],
    ];
    const reasonTags = r => [
      isUnk(r) ? '<span class="tag red">🙈 不认识</span>' : '',
      isForgot(r) ? '<span class="tag orange">😵 上轮忘记</span>' : '',
      isWrong(r) ? `<span class="tag red">错 ${r.wrong_count} 次</span>` : '',
    ].filter(Boolean).join(' ');

    const row = r => `
      <div class="li mem-it" data-id="${r.id}">
        <div class="avatar-emoji">${isUnk(r) ? '🙈' : (isWrong(r) ? '❌' : '😵')}</div>
        <div class="li-main">
          <div class="li-title"><b class="mem-w">${u.esc(r.word)}</b>${r.phonetic ? `<span class="mem-ph">${u.esc(shortPhonetic(r.phonetic))}</span>` : ''}${reasonTags(r) ? `<span class="mem-tags">${reasonTags(r)}</span>` : ''}</div>
          <div class="li-sub">${u.esc((r.meaning_cn || '暂无释义').slice(0, 40))}</div>
        </div>
        <div class="li-act">
          <button class="btn xs" data-spk title="读音">🔊</button>
          <button class="btn xs primary" data-master title="移出生词库">✅ 已掌握</button>
        </div>
      </div>`;

    el.innerHTML = `
      <div class="vw-page">
        <div class="mem-backrow"><button class="btn sm" data-back>← 返回生词本</button></div>
        <div class="mem-hero">
          <span class="mem-ico">🧠</span>
          <div>
            <h3>生词记忆库</h3>
            <p class="small muted">默写点「🙈 不认识」、闪卡复习点「😵 忘记」、累计答错 ≥2 次的词会自动收进来。认住了就在下面点「✅ 已掌握」移出，或统一复习时选「😃 认识」。</p>
          </div>
        </div>
        <div class="vw-stats mem-stats">
          <div class="stat"><div class="k">重点关注</div><div class="v">${bank.length}</div></div>
          <div class="stat"><div class="k">🙈 完全不认识</div><div class="v">${nUnk}</div></div>
          <div class="stat"><div class="k">😵 最近忘记</div><div class="v">${nForgot}</div></div>
          <div class="stat"><div class="k">❌ 高频错词</div><div class="v">${nWrong}</div></div>
        </div>
        <div class="vw-actions">
          <button class="vw-act mem ${bank.length ? '' : 'off'}" data-review ${bank.length ? '' : 'disabled'}>
            <span class="vw-act-ico">🔔</span>
            <span class="vw-act-txt"><b>统一复习</b><span class="vw-act-sub">${bank.length ? `过一遍这 ${bank.length} 个重点词` : '先去学习里标记没记住的词'}</span></span>
            ${bank.length ? `<span class="vw-act-n">${bank.length}</span>` : ''}
          </button>
        </div>
        <div class="vw-filters">
          ${CHIPS.map(([k, label, n]) => `<a class="sn-it ${memFilter === k ? 'on' : ''}" data-chip="${k}">${label}<i class="n">${n}</i></a>`).join('')}
        </div>
        <div class="mem-list">
          ${list.length ? list.map(row).join('')
            : `<div class="empty" style="padding:44px 10px"><span class="big">🎉</span>${memFilter === 'all'
              ? '生词记忆库是空的 —— 学习中标记的「忘记 / 不认识」会自动出现在这里'
              : '这个分类下暂时没有词'}</div>`}
        </div>
      </div>`;

    el.querySelectorAll('[data-chip]').forEach(a => a.onclick = () => { memFilter = a.dataset.chip; PM.refresh(); });
    el.querySelector('[data-back]').onclick = () => { location.hash = '#/english/vocab'; };
    el.querySelectorAll('[data-spk]').forEach(b => b.onclick = () => {
      const r = bank.find(x => String(x.id) === String(b.closest('.mem-it').dataset.id));
      if (r) u.speak(r.word);
    });
    el.querySelectorAll('[data-master]').forEach(b => b.onclick = async () => {
      const id = b.closest('.mem-it').dataset.id;
      try {
        await api.update('vocabulary', id, { unknown: '', wrong_count: '0', last_grade: 'know' });
        PM.toast('已移出生词库 ✅');
        PM.refresh();
      } catch (e) { PM.toast('操作失败', 'err'); }
    });
    el.querySelector('[data-review]').onclick = () => {
      if (!bank.length) return;
      reviewSession(bank, async ({ rows: done }) => {
        /* 复习时选「认识」的词：自动清掉「🙈 不认识」标记（忘了的话下次默写还会进来） */
        let cleared = 0;
        for (const d of done) {
          const r = bank.find(x => String(x.id) === String(d.id));
          if (d.graded === 'know' && r && r.unknown === '1') {
            try { await api.update('vocabulary', r.id, { unknown: '' }); cleared++; } catch (e) {}
          }
        }
        PM.toast(cleared ? `复习完成，${cleared} 个词已移出「不认识」` : '复习完成');
        PM.refresh();
      });
    };
  }

  /* ---------------- 模块注册 ---------------- */
  const views = {};
  TABS.forEach(tab => {
    views[tab.key] = tab.key === 'vocab' ? viewVocab
      : tab.key === 'expression' ? viewExpression
      : tab.key === 'listening' ? viewListening
      : tab.key === 'kb' ? viewKB
      : tab.key === 'pending' ? viewPending
      : tab.key === '' ? viewDashboard
      : async function (el) {
        el.innerHTML = `<div class="en-page">${pagePlaceholder(tab)}</div>`;
      };
  });
  /* 生词记忆库不是独立菜单：路由保留，从生词本页的 🧠 入口进入 */
  views.memory = viewMemory;

  /* =============================================================
   * 默写 Dictation
   * -------------------------------------------------------------
   * - 隐藏单词，显示音标 + 中文释义 + 例句（像单词卡，但遮住拼写）
   * - 键盘输入拼写（隐藏英文），回车提交并自动判分
   * - 新词自动播放读音，保留手动 🔊 按钮
   * - 提交后判断对错并写入复习流水（正确→know，错误→forget/可改）
   * ============================================================= */
  const normWord = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  async function viewDictation(el, presets) {
    presets = presets || {};
    const table = presets.table || 'vocabulary';
    const deckField = presets.deckField || 'deck';
    const rangeLabel = presets.rangeLabel || '词库';
    let all, deckItems;
    if (presets.rows) {
      all = presets.rows;
      deckItems = presets.deckItems || [{ key: 'all', name: '全部', cn: '', count: all.length }];
    } else if (presets.table === 'expressions') {
      /* 表达式：把 phrase 映射成 card 需要的 word，复用同一套默写卡
         （隐藏英文、显示中文音标、键盘输入、判分）即可实现「只给中文默写」 */
      const ex = await api.list('expressions');
      const cats = [...new Set(ex.map(r => r.category).filter(Boolean))];
      deckItems = [{ key: 'all', name: '全部分类', cn: '', count: ex.length }]
        .concat(cats.map(c => ({ key: c, name: c, cn: '', count: ex.filter(r => r.category === c).length })));
      all = ex.map(r => ({ ...r, word: r.phrase }));
    } else {
      await loadDecks();
      all = await api.list('vocabulary');
      deckItems = [{ key: 'all', name: '全部词库', cn: '', count: all.length }]
        .concat(DECKS.map(d => ({ key: d.key, name: d.name, cn: d.cn || '', count: d.count || 0 })));
    }
    const srcItems = [
      { key: 'all', label: '全部' }, { key: 'new', label: '新词' },
      { key: 'learning', label: '学习中' }, { key: 'mastered', label: '已掌握' },
      { key: 'due', label: '待复习' }, { key: 'wrong', label: '高频错词' },
      { key: 'unknown', label: '🙈 完全不认识' },
    ];
    const cfg = { deck: 'all', src: 'all', count: 10 };

    const buildQueue = () => {
      let rows = cfg.deck === 'all' ? all : all.filter(r => r[deckField] === cfg.deck);
      if (cfg.src === 'new') rows = rows.filter(r => r.status === 'new');
      else if (cfg.src === 'learning') rows = rows.filter(r => r.status === 'learning');
      else if (cfg.src === 'mastered') rows = rows.filter(r => r.status === 'mastered');
      else if (cfg.src === 'due') rows = rows.filter(isDue);
      else if (cfg.src === 'wrong') rows = rows.filter(r => +r.wrong_count >= 2);
      else if (cfg.src === 'unknown') rows = rows.filter(r => r.unknown === '1');
      return rows.slice().sort(() => Math.random() - 0.5).slice(0, Math.max(1, +cfg.count || 10));
    };

    function settings() {
      el.innerHTML = `
        <div class="dt-set">
          <div class="dt-set-head">
            <div class="dt-set-badge">⌨️</div>
            <h3>${presets.title || '单词默写'}</h3>
            <p class="small muted">${(presets.desc || '隐藏英文，看中文释义与例句，用键盘拼出单词 —— 回车提交、自动判分；进入即自动播放读音。')}</p>
          </div>
          <div class="dt-form">
            <div class="field"><label>${rangeLabel}</label>
              <select class="input" data-deck>${deckItems.map(d => `<option value="${d.key}">${u.esc(d.name)}${d.cn ? ' · ' + u.esc(d.cn) : ''}（${d.count}）</option>`).join('')}</select></div>
            <div class="field"><label>${presets.srcItemsLabel || '来源'}</label>
              <select class="input" data-src>${srcItems.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}</select></div>
            <div class="field"><label>数量</label>
              <input class="input" type="number" min="1" max="100" value="${cfg.count}" data-count></div>
          </div>
          <button class="btn primary block dt-start" data-start>开始默写 <span>→</span></button>
          ${(() => {
            const n = all.filter(r => r.unknown === '1').length;
            return n ? `<button class="btn block dt-unk-open" data-unkopen>🙈 完全不认识 · ${n} 个，点开查看列表</button>` : '';
          })()}
          <div class="dt-tip small muted">⌨️ 全程键盘输入，不区分大小写，空格和标点会自动忽略；<b>按 Enter 提交</b>，提交后再按 Enter 进入下一词。想不起来可以点「💡 提示」逐字母给提示；实在不会就点「🙈 不认识」，会亮出答案并单独标记，方便以后拎出来重点背。</div>
        </div>`;
      el.querySelector('[data-unkopen]') && (el.querySelector('[data-unkopen]').onclick = () =>
        renderUnknownList(el, all, table, () => settings()));
      const dSel = el.querySelector('[data-deck]'), sSel = el.querySelector('[data-src]'), cIn = el.querySelector('[data-count]');
      dSel.value = cfg.deck; sSel.value = cfg.src;
      el.querySelector('[data-start]').onclick = () => {
        cfg.deck = dSel.value; cfg.src = sSel.value;
        cfg.count = Math.max(1, Math.min(100, +cIn.value || 10));
        startSession(buildQueue());
      };
    }

    function startSession(queue) {
      if (!queue.length) { PM.toast('这个筛选下没有单词', 'err'); return; }
      let i = 0; const stats = { right: 0, wrong: 0 };
      let submitted = false, cardRecorded = false, pendingDefault = 'know';

      el.innerHTML = `
        <div class="dt-session">
          <div class="dt-top">
            <button class="btn sm" data-exit>← 退出</button>
            <div class="dt-prog">第 <b data-cur>1</b> <span>/ ${queue.length} 词</span></div>
            <div class="dt-score">
              <span class="dt-score-ok" data-ok>✓ 0</span>
              <span class="dt-score-no" data-no>✕ 0</span>
            </div>
          </div>
          <div class="dt-progress"><i data-bar style="width:0%"></i></div>
          <div class="dt-card" data-card></div>
        </div>`;
      const cardHost = el.querySelector('[data-card]');
      const bar = el.querySelector('[data-bar]');
      const okEl = el.querySelector('[data-ok]'), noEl = el.querySelector('[data-no]');
      el.querySelector('[data-exit]').onclick = () => settings();

      function syncTop() {
        el.querySelector('[data-cur]').textContent = i + 1;
        bar.style.width = Math.round(i / queue.length * 100) + '%';
        okEl.textContent = '✓ ' + stats.right;
        noEl.textContent = '✕ ' + stats.wrong;
      }

      async function recordGrade(g) {
        if (cardRecorded) return; cardRecorded = true;
        try { await fetch(`/api/review/${table}/${queue[i].id}/review`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: g }),
        }); } catch (e) {}
      }
      function advance(dir) {
        if (dir > 0) { if (i < queue.length - 1) { i++; syncTop(); showCard(); } else { syncTop(); finish(); } }
        else if (i > 0) { i--; syncTop(); showCard(); }
      }
      async function goNext() {
        if (submitted && !cardRecorded) await recordGrade(pendingDefault);
        advance(1);
      }

      function showCard() {
        submitted = false; cardRecorded = false;
        const r = queue[i];
        const fcPh = shortPhonetic(r.phonetic) || (r.phonetic || '');
        const wordStr = String(r.word || '');
        const hintChars = wordStr.toLowerCase().replace(/[^a-z]/g, '');
        /* 字母格：一个字母一格，空格/连字符留一道缝；输入时逐格点亮 */
        const slots = [...wordStr].map(ch =>
          /[a-z]/i.test(ch) ? '<i class="dt-slot" data-slot></i>' : '<i class="dt-slot sep"></i>').join('');
        let hintCount = 0;
        cardHost.innerHTML = `
          <div class="dt-hidden">
            <span class="dt-lock">🔒</span>
            <span>${presets.hiddenText || '英文已隐藏 · 看释义，用键盘拼出单词'}</span>
          </div>
          <div class="dt-info">
            <div class="dt-ph">
              <span class="dt-ph-txt" data-phtxt>${fcPh ? '/' + u.esc(fcPh) + '/' : '—'}</span>
              <span class="dt-ph-btns">
                ${fcPh ? '<button class="btn xs ghost" data-eve title="显示 / 隐藏音标提示">👁</button>' : ''}
                <button class="btn xs" data-speak>🔊 读音</button>
              </span>
            </div>
            <div class="dt-cn">${u.esc(r.meaning_cn || '—')}</div>
            ${r.meaning_en ? `<div class="dt-en">${u.esc(r.meaning_en)}</div>` : ''}
            ${r.example ? `<div class="dt-ex"><b>例句</b><p class="en-sent">${u.esc(r.example)}</p>${r.example_cn ? `<p class="small muted">${u.esc(r.example_cn)}</p>` : ''}</div>` : ''}
            ${r.collocation ? `<div class="dt-ex"><b>搭配</b><p class="en-sent">${u.esc(r.collocation)}</p></div>` : ''}
          </div>
          <div class="dt-answer">
            <div class="dt-answer-label">你的拼写 <span>${hintChars.length} 个字母</span></div>
            <div class="dt-slots" data-slots>${slots}</div>
            <input class="input dt-input" data-ans placeholder="在这里输入英文…" autocomplete="off"
                   autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
            <div class="dt-actions">
              <button class="btn dt-hint" data-hint>💡 提示</button>
              <button class="btn dt-clear" data-clear>清空</button>
              <button class="btn dt-unknown" data-unknown>🙈 不认识</button>
              <button class="btn primary dt-submit" data-submit>提交 <span>↵</span></button>
            </div>
          </div>
          <div class="dt-feedback" data-fb></div>
          <div class="dt-nav">
            <button class="btn sm" data-prev ${i === 0 ? 'disabled' : ''}>← 上一词</button>
            <button class="btn sm" data-skip>跳过</button>
            <button class="btn sm primary" data-next ${i === queue.length - 1 ? 'disabled' : ''}>下一词 →</button>
          </div>`;

        const ans = cardHost.querySelector('[data-ans]');
        const hintBtn = cardHost.querySelector('[data-hint]');
        const clearBtn = cardHost.querySelector('[data-clear]');
        const submitBtn = cardHost.querySelector('[data-submit]');
        const syncSlots = () => {
          const typed = ans.value.toLowerCase().replace(/[^a-z]/g, '');
          cardHost.querySelectorAll('[data-slot]').forEach((slot, idx) => {
            const ch = typed[idx] || '';
            slot.textContent = ch;
            slot.classList.toggle('filled', !!ch);
          });
        };
        cardHost.tabIndex = -1;
        /* 提交后按 Enter 直接进下一词；输入框里的 Enter 由下面自己的监听处理 */
        cardHost.onkeydown = e => {
          if (e.target === cardHost && e.key === 'Enter' && submitted) { e.preventDefault(); goNext(); }
        };
        ans.addEventListener('input', syncSlots);
        ans.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(ans, r); }
        });
        cardHost.querySelector('[data-speak]').onclick = () => u.speak(r.word);
        const eve = cardHost.querySelector('[data-eve]');
        if (eve) eve.onclick = () => cardHost.querySelector('[data-phtxt]').classList.toggle('blur');
        clearBtn.onclick = () => { ans.value = ''; syncSlots(); ans.focus(); };
        hintBtn.onclick = () => {
          if (submitted || !hintChars.length) return;
          /* 用户已经写了的部分也算「已提示」，提示只往后补，不把已输入的清掉 */
          const typedLen = ans.value.replace(/[^a-z]/gi, '').length;
          hintCount = Math.min(hintChars.length, Math.max(hintCount, typedLen) + 1);
          ans.value = hintChars.slice(0, hintCount);
          syncSlots();
          if (hintCount >= hintChars.length) { hintBtn.disabled = true; hintBtn.textContent = '已全部提示'; }
          ans.focus();
          try { ans.setSelectionRange(ans.value.length, ans.value.length); } catch (e) {}
        };
        submitBtn.onclick = () => submit(ans, r);
        /* 🙈 完全不认识：直接亮答案、按「forget」记复习流水、并打上 unknown 标记 */
        cardHost.querySelector('[data-unknown]').onclick = async () => {
          if (submitted) return;
          submitted = true; stats.wrong++; stats.unknown = (stats.unknown || 0) + 1;
          pendingDefault = 'forget';
          syncTop();
          try { await api.update(table, r.id, { unknown: '1' }); r.unknown = '1'; } catch (e) {}
          const fb = cardHost.querySelector('[data-fb]');
          fb.innerHTML = `<div class="dt-reveal no">
              <div class="dt-reveal-head">🙈 已标记「完全不认识」</div>
              <div class="dt-reveal-word">${u.esc(r.word)}</div>
              ${wdSyllableHtml(r.word, r.syllables)}
              <div class="dt-your">这个词会进入「完全不认识列表」，方便以后单独拎出来重点背</div>
            </div>
            <div class="dt-grade">
              <button class="btn danger" data-grade="forget">😵 确实不认识</button>
              <button class="btn" data-grade="fuzzy">🤔 有点印象</button>
              <button class="btn primary" data-grade="know">😃 其实记得</button>
            </div>`;
          fb.querySelectorAll('[data-grade]').forEach(b => b.onclick = async () => {
            if (b.dataset.grade === 'know') {   /* 既然记得，就把不认识标记撤掉 */
              try { await api.update(table, r.id, { unknown: '' }); r.unknown = ''; } catch (e) {}
            }
            await recordGrade(b.dataset.grade);
            advance(1);
          });
          ans.disabled = true;
          ['data-submit', 'data-hint', 'data-clear', 'data-unknown'].forEach(sel => {
            const b = cardHost.querySelector(`[${sel}]`); if (b) b.disabled = true;
          });
          try { cardHost.focus(); } catch (e) {}
        };
        cardHost.querySelector('[data-prev]').onclick = () => advance(-1);
        cardHost.querySelector('[data-skip]').onclick = () => advance(1);
        cardHost.querySelector('[data-next]').onclick = () => goNext();
        /* 进入卡片自动聚焦输入框，顺带播放读音（首次由「开始默写」的点击手势授权） */
        setTimeout(() => { try { ans.focus(); } catch (e) {} }, 260);
        setTimeout(() => u.speak(r.word), 280);
      }

      function submit(ans, r) {
        if (submitted) return;
        const guess = normWord(ans.value);
        if (!guess) { PM.toast('先输入答案'); ans.focus(); return; }
        const isRight = guess === normWord(r.word);
        if (isRight) stats.right++; else stats.wrong++;
        submitted = true; pendingDefault = isRight ? 'know' : 'forget';
        syncTop();
        const fb = cardHost.querySelector('[data-fb]');
        const reveal = `<div class="dt-reveal ${isRight ? 'ok' : 'no'}">
            <div class="dt-reveal-head">${isRight ? '✅ 拼写正确' : '❌ 再看一眼'}</div>
            <div class="dt-reveal-word">${u.esc(r.word)}</div>
            ${wdSyllableHtml(r.word, r.syllables)}
            ${!isRight ? `<div class="dt-your">你写的是 <b>${u.esc(ans.value.trim() || '—')}</b></div>` : ''}
          </div>`;
        const gradeBtns = isRight
          ? `<button class="btn primary" data-grade="know">😃 已记住</button>`
          : `<button class="btn danger" data-grade="forget">😵 没记住</button>
             <button class="btn" data-grade="fuzzy">🤔 模糊</button>
             <button class="btn primary" data-grade="know">😃 其实记住了</button>`;
        fb.innerHTML = reveal + `<div class="dt-grade">${gradeBtns}</div>`;
        fb.querySelectorAll('[data-grade]').forEach(b => b.onclick = async () => {
          await recordGrade(b.dataset.grade);
          advance(1);
        });
        ans.disabled = true;
        cardHost.querySelector('[data-submit]').disabled = true;
        cardHost.querySelector('[data-hint]').disabled = true;
        cardHost.querySelector('[data-clear]').disabled = true;
        const ub = cardHost.querySelector('[data-unknown]'); if (ub) ub.disabled = true;
        try { cardHost.focus(); } catch (e) {}
      }

      function finish() {
        const pct = queue.length ? Math.round(stats.right / queue.length * 100) : 0;
        el.innerHTML = `
          <div class="dt-finish">
            <div class="dt-finish-emoji">${pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📚'}</div>
            <h3>本轮默写完成</h3>
            <div class="dt-finish-num">${pct}<span>%</span></div>
            <p>共 ${queue.length} 词 · 一次写对 <b>${stats.right}</b> · 需巩固 <b>${stats.wrong}</b>${stats.unknown ? ` · 🙈 标记不认识 <b>${stats.unknown}</b>` : ''}</p>
            <div class="dt-finish-bar"><i style="width:${pct}%"></i></div>
            <div class="row dt-finish-btns">
              <button class="btn" data-again>再来一轮</button>
              <button class="btn primary" data-back>返回设置</button>
            </div>
          </div>`;
        el.querySelector('[data-again]').onclick = () => startSession(buildQueue());
        el.querySelector('[data-back]').onclick = () => settings();
      }

      syncTop();
      showCard();
    }

    settings();
  }

  /* 从词汇页「单词默写」按钮唤起：以浮层（modal）形式打开，底层词汇页保留，
     关闭即回到原页面，无需独立菜单。viewDictation(el, presets) 全程把内容写进传入的宿主，
     这里给它的宿主是浮层内的内容容器，X 关闭按钮是它的兄弟节点，不会被 innerHTML 覆盖。 */
  function openDictation(presets) {
    const mask = document.createElement('div');
    mask.className = 'dt-modal-mask';
    const panel = document.createElement('div');
    panel.className = 'dt-modal';
    const x = document.createElement('button');
    x.className = 'dt-modal-x';
    x.type = 'button';
    x.textContent = '✕';
    x.setAttribute('aria-label', '关闭默写');
    const host = document.createElement('div');
    host.className = 'dt-modal-host';
    panel.appendChild(x);
    panel.appendChild(host);
    mask.appendChild(panel);
    document.body.appendChild(mask);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', onKey);
    };
    x.onclick = close;
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
    document.addEventListener('keydown', onKey);
    /* 浮层出现时把焦点移到内容区，方便键盘操作 */
    host.tabIndex = -1; host.focus();
    viewDictation(host, presets);
  }

  /* 「完全不认识」列表：渲染成同一浮层里的一个页面（不再叠第二层弹窗 ——
     iPhone 顶部安全区里两层绝对定位的 ✕ 会叠在一起互相盖住）。
     左上角「← 返回设置」退回；逐条可 🔊 读音、✅ 已认识（移除标记）。 */
  function renderUnknownList(el, rows, table, onBack) {
    const paint = () => {
      const items = rows.filter(r => r.unknown === '1');
      el.innerHTML = `
        <div class="dt-set dt-unk-view">
          <div class="dt-unk-head">
            <button class="btn sm" data-back>← 返回设置</button>
            <b class="dt-unk-title">🙈 完全不认识${items.length ? ` · ${items.length} 个` : ''}</b>
          </div>
          <p class="small muted dt-unk-desc">默写时点「🙈 不认识」的词都在这里。看着词回忆意思，认得了就点「✅ 已认识」移出列表。</p>
          <div class="dt-unk-items">${items.length ? items.map(r => `
            <div class="dt-unk-item" data-id="${r.id}">
              <div class="dt-unk-main">
                <b class="dt-unk-w">${u.esc(r.word)}</b>
                <span class="dt-unk-cn">${u.esc((r.meaning_cn || '').slice(0, 60))}</span>
              </div>
              <span class="dt-unk-btns">
                <button class="btn xs" data-spk title="读音">🔊</button>
                <button class="btn xs primary" data-known>✅ 已认识</button>
              </span>
            </div>`).join('')
          : '<div class="empty">列表是空的 🎉 默写时点「🙈 不认识」就会出现在这里。</div>'}
          </div>
        </div>`;
      el.querySelector('[data-back]').onclick = () => onBack();
      el.querySelectorAll('[data-spk]').forEach(b => b.onclick = () => {
        const row = rows.find(r => String(r.id) === String(b.closest('.dt-unk-item').dataset.id));
        if (row) u.speak(row.word);
      });
      el.querySelectorAll('[data-known]').forEach(b => b.onclick = async () => {
        const id = b.closest('.dt-unk-item').dataset.id;
        try { await api.update(table, id, { unknown: '' }); } catch (e) {}
        const row = rows.find(r => String(r.id) === String(id));
        if (row) row.unknown = '';
        paint();
      });
    };
    paint();
  }

  /* 表达式反向默写：只给中文，默写出地道英文。复用同一套默写卡（隐藏英文 / 显示中文音标 / 键盘输入）。 */
  function openExprDictation() {
    openDictation({
      title: '表达默写',
      desc: '这里反过来：显示中文意思，你来用键盘默写出地道英文。回车提交、自动判分；进入即自动播放读音。',
      rangeLabel: '分类',
      deckField: 'category',
      table: 'expressions',
      hiddenText: '英文已隐藏 —— 看中文意思，默写出对应的地道表达',
      srcItemsLabel: '来源',
    });
  }

  PM.registerModule({
    id: 'english',
    name: '英语学习',
    mobileLabel: '英语',
    icon: PM.icon('library'),
    group: '英语',
    nav: TABS.map(t => ({ label: t.label, path: t.key, icon: PM.icon(t.icon) })),
    routes: views,
    /* 「进行学习」今日部件已按要求移除：学习任务的打卡入口仍在
       英语 Dashboard 与背词/听力计划里 */
    /* 不再挂侧边栏角标：待复习数一直在那儿，看着像「没清掉的提醒」，
       真正的待办在 Dashboard 和今日总览里已经写得清清楚楚 */
    api: { wordEditor, reviewSession, isDue, planPanel, pickWords, startTask, vpMatch,
           liPlanPanel, liStartTask, isDue },
  });
})();
