/* ===========================================================
 * 节假日数据（中国）
 * 1) 法定节假日 + 调休补班：来自国务院办公厅通知
 * 2) 传统节日（农历）：按年列出公历日期（官方历书固定发布，避免自研历法误差）
 * 3) 公历固定节日 / 星期型节日（母亲节、父亲节、感恩节）
 *
 * 每年维护成本：法定假日 7 行 + 传统节日 11 行。
 * 用法：PM.holiday.of('2026-10-01') → { type, name, days? }
 * =========================================================== */
(function () {
  /* ---------------- 法定节假日（国办发明电〔2025〕7号） ---------------- */
  const STATUTORY = {
    '2026': [
      { name: '元旦', days: 3, off: ['01-01', '01-02', '01-03'], work: ['01-04'] },
      { name: '春节', days: 9, off: ['02-15', '02-16', '02-17', '02-18', '02-19', '02-20', '02-21', '02-22', '02-23'], work: ['02-14', '02-28'] },
      { name: '清明节', days: 3, off: ['04-04', '04-05', '04-06'], work: [] },
      { name: '劳动节', days: 5, off: ['05-01', '05-02', '05-03', '05-04', '05-05'], work: ['05-09'] },
      { name: '端午节', days: 3, off: ['06-19', '06-20', '06-21'], work: [] },
      { name: '中秋节', days: 3, off: ['09-25', '09-26', '09-27'], work: [] },
      { name: '国庆节', days: 7, off: ['10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07'], work: ['09-20', '10-10'] },
    ],
    /* 2027 年正式安排待国务院公布，以下为按惯例预排，公布后改 off/work 即可 */
    '2027': [
      { name: '元旦', days: 3, off: ['01-01', '01-02', '01-03'], work: [] },
      { name: '春节', days: 8, off: ['02-05', '02-06', '02-07', '02-08', '02-09', '02-10', '02-11', '02-12'], work: [] },
      { name: '清明节', days: 3, off: ['04-03', '04-04', '04-05'], work: [] },
      { name: '劳动节', days: 5, off: ['05-01', '05-02', '05-03', '05-04', '05-05'], work: [] },
      { name: '端午节', days: 3, off: ['06-09', '06-10', '06-11'], work: [] },
      { name: '中秋节', days: 3, off: ['09-15', '09-16', '09-17'], work: [] },
      { name: '国庆节', days: 7, off: ['10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07'], work: [] },
    ],
  };

  /* ---------------- 传统节日：农历 → 公历，按年列 ---------------- */
  const TRADITIONAL = {
    2026: {
      '01-26': '腊八节', '02-10': '小年', '02-16': '除夕', '02-17': '春节',
      '03-03': '元宵节', '03-20': '龙抬头', '06-19': '端午节', '08-19': '七夕',
      '08-27': '中元节', '09-25': '中秋节', '10-18': '重阳节',
    },
    2027: {
      '01-15': '腊八节', '01-31': '小年', '02-05': '除夕', '02-06': '春节',
      '02-20': '元宵节', '03-09': '龙抬头', '06-09': '端午节', '08-08': '七夕',
      '08-16': '中元节', '09-15': '中秋节', '10-08': '重阳节',
    },
  };

  /* ---------------- 公历固定节日 ---------------- */
  const SOLAR_FEST = {
    '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节', '05-04': '青年节',
    '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节', '09-10': '教师节',
    '10-31': '万圣夜', '11-11': '光棍节', '12-24': '平安夜', '12-25': '圣诞节',
  };
  function nthWeekday(y, m, weekday, n) {  // weekday 0=周日
    const first = new Date(y, m - 1, 1);
    const diff = (weekday - first.getDay() + 7) % 7;
    return 1 + diff + (n - 1) * 7;
  }
  function dynamicFest(y, m, d) {
    if (m === 5 && d === nthWeekday(y, 5, 0, 2)) return '母亲节';
    if (m === 6 && d === nthWeekday(y, 6, 0, 3)) return '父亲节';
    if (m === 11 && d === nthWeekday(y, 11, 4, 4)) return '感恩节';
    return '';
  }

  /* ---------------- 展平索引 ---------------- */
  const HOL = {};       // 放假
  const WORK = {};      // 补班
  Object.keys(STATUTORY).forEach(y => {
    STATUTORY[y].forEach(h => {
      /* 简称规则：三字及以上去「节」；两字（春节/元旦）保留，避免变成「春」 */
      const short = h.name.length >= 3 ? h.name.replace('节', '') : h.name;
      h.off.forEach(md => { HOL[`${y}-${md}`] = { name: short, days: h.days, full: h.name }; });
      h.work.forEach(md => { WORK[`${y}-${md}`] = { name: short, full: h.name }; });
    });
  });

  /* ---------------- 对外 ---------------- */
  const cache = {};
  function of(ds) {
    if (!ds) return null;
    if (ds in cache) return cache[ds];
    const [y, m, d] = ds.split('-').map(Number);
    const md = ds.slice(5);
    let r = null;

    if (HOL[ds]) {
      r = { type: 'holiday', name: HOL[ds].name, days: HOL[ds].days, full: HOL[ds].full };
    } else if (WORK[ds]) {
      r = { type: 'workday', name: '班', from: WORK[ds].name, full: WORK[ds].full };
    } else {
      const nm = (TRADITIONAL[y] || {})[md] || SOLAR_FEST[md] || dynamicFest(y, m, d);
      if (nm) r = { type: 'festival', name: nm };
    }
    cache[ds] = r;
    return r;
  }

  /* 某月的假期汇总 */
  function monthSummary(ym) {
    const out = [];
    Object.keys(STATUTORY).forEach(y => {
      STATUTORY[y].forEach(h => {
        const offs = h.off.map(md => `${y}-${md}`).filter(ds => ds.slice(0, 7) === ym).sort();
        if (!offs.length) return;
        out.push({
          name: h.name, short: h.name.length >= 3 ? h.name.replace('节', '') : h.name, days: h.days,
          from: offs[0], to: offs[offs.length - 1],
          monthDays: offs.length,
          workDays: h.work.map(md => `${y}-${md}`).filter(ds => ds.slice(0, 7) === ym),
        });
      });
    });
    out.sort((a, b) => a.from.localeCompare(b.from));
    return out;
  }

  /* 本月内的非假期节日（用于日历副标题「重阳 · 廿六」） */
  function monthFestivals(ym) {
    const [y] = ym.split('-').map(Number);
    const out = [];
    const tmap = TRADITIONAL[y] || {};
    Object.keys(tmap).forEach(md => {
      if (`${y}-${md}`.slice(0, 7) === ym) out.push({ date: `${y}-${md}`, name: tmap[md], kind: 'trad' });
    });
    Object.keys(SOLAR_FEST).forEach(md => {
      if (`${y}-${md}`.slice(0, 7) === ym) out.push({ date: `${y}-${md}`, name: SOLAR_FEST[md], kind: 'solar' });
    });
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  /* 下一个假期 */
  function nextHoliday(from) {
    const list = [];
    Object.keys(STATUTORY).forEach(y => STATUTORY[y].forEach(h => {
      const s = `${y}-${h.off[0]}`;
      if (s >= from) {
        list.push({
          name: h.name, short: h.name.length >= 3 ? h.name.replace('节', '') : h.name, start: s,
          end: `${y}-${h.off[h.off.length - 1]}`, days: h.days, monthDays: h.off.length,
        });
      }
    }));
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list[0] || null;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }

  PM.holiday = { of, monthSummary, monthFestivals, nextHoliday, daysBetween, STATUTORY };
})();
