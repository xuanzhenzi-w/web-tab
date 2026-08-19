// stats.js —— 归档统计页：总数 / 域名数 / 天数 / 来源分布 / 域名榜 / 每日趋势

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function langTag() {
  return I18N.localeTag(I18N.getLang());
}

// 本地化日期时间（跟随当前界面语言）
function fmtTime(ts, tag) {
  try {
    return new Date(ts).toLocaleString(tag || 'zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
           `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}

// 短日期（月/日），用于柱状图标签
function fmtDay(date, tag) {
  try {
    return date.toLocaleDateString(tag || 'zh-CN', { month: '2-digit', day: '2-digit' });
  } catch (e) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(date.getMonth() + 1)}/${p(date.getDate())}`;
  }
}

// 从 url 提取域名；chrome:// 等无 host 的、或非法 url 一律视为「本地页面」
function domainOf(url) {
  try {
    const h = new URL(url).hostname;
    return h ? h : null;
  } catch (e) {
    return null;
  }
}

// 本地日期键（YYYY-MM-DD，按用户时区）
function dateKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function legendDot(kind, labelKey, count) {
  const cls = kind === 'auto' ? 'dot-auto' : 'dot-manual';
  return `<span class="lg"><span class="dot ${cls}"></span>` +
         `${I18N.t(labelKey)} <span class="lg-num">${count}</span></span>`;
}

function rankRow(name, cnt, ratio) {
  const row = document.createElement('div');
  row.className = 'rank-row';
  const n = document.createElement('div');
  n.className = 'rank-name';
  n.textContent = name;
  n.title = name;
  const c = document.createElement('div');
  c.className = 'rank-count';
  c.textContent = cnt;
  const track = document.createElement('div');
  track.className = 'rank-track';
  const fill = document.createElement('div');
  fill.className = 'rank-fill';
  fill.style.width = (ratio * 100) + '%';
  track.appendChild(fill);
  row.appendChild(n);
  row.appendChild(c);
  row.appendChild(track);
  return row;
}

async function loadStats() {
  const tag = langTag();
  const { archive = [] } = await chrome.storage.local.get('archive');
  const total = archive.length;

  // 清理上一次的空态 & 恢复面板显示
  const wrap = document.querySelector('.wrap');
  const prevEmpty = wrap.querySelector(':scope > .empty');
  if (prevEmpty) prevEmpty.remove();
  document.getElementById('overview').style.display = '';
  document.querySelectorAll('.panel').forEach((p) => { p.style.display = ''; });

  // —— 聚合 ——
  const domains = new Map();        // hostname / null -> count
  const days = new Set();           // 归档日期键
  const batchIds = new Set();       // 批次唯一数
  let autoCount = 0, manualCount = 0;
  for (const it of archive) {
    const dom = domainOf(it.url);
    domains.set(dom, (domains.get(dom) || 0) + 1);
    if (it.closedAt) days.add(dateKey(it.closedAt));
    batchIds.add(it.batchId || ('legacy_' + it.url));
    if (it.batchType === 'auto') autoCount++; else manualCount++;
  }
  // 域名总数只统计真实域名（不含「本地页面」）
  const realDomainCount = [...domains.keys()].filter((k) => k !== null).length;

  // 概览卡
  document.getElementById('updated').textContent =
    I18N.t('arch_count_total', { total, groups: batchIds.size });
  document.getElementById('ovRecords').textContent = total;
  document.getElementById('ovDomains').textContent = realDomainCount;
  document.getElementById('ovDays').textContent = days.size;

  // 空态：隐藏概览与所有面板，显示整页提示
  if (total === 0) {
    document.getElementById('overview').style.display = 'none';
    document.querySelectorAll('.panel').forEach((p) => { p.style.display = 'none'; });
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = I18N.t('stats_empty');
    wrap.appendChild(e);
    return;
  }

  // —— 来源分布（自动 vs 手动）——
  const typeTotal = total || 1;
  document.getElementById('segAuto').style.width = (autoCount / typeTotal * 100) + '%';
  document.getElementById('segManual').style.width = (manualCount / typeTotal * 100) + '%';
  document.getElementById('typeLegend').innerHTML =
    legendDot('auto', 'stats_type_auto', autoCount) +
    legendDot('manual', 'stats_type_manual', manualCount);

  // —— 域名榜（横向条，TOP 12）——
  const sorted = [...domains.entries()].sort((a, b) => b[1] - a[1]);
  const maxDom = sorted[0][1];
  const rank = document.getElementById('domainRank');
  rank.innerHTML = '';
  const top = sorted.slice(0, 12);
  for (const [dom, cnt] of top) {
    const name = dom || I18N.t('stats_local_pages');
    rank.appendChild(rankRow(name, cnt, cnt / maxDom));
  }
  if (sorted.length > 12) {
    const more = document.createElement('div');
    more.className = 'rank-more';
    more.style.cssText = 'font-size:12px;color:var(--text-2);text-align:center;margin-top:6px;';
    more.textContent = I18N.t('stats_more_domains', { n: sorted.length - 12 });
    rank.appendChild(more);
  }

  // —— 每日趋势（最近 14 天柱状图）——
  const byDay = new Map();
  for (const it of archive) {
    if (it.closedAt) {
      const k = dateKey(it.closedAt);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }
  }
  let maxDay = 1;
  for (const v of byDay.values()) if (v > maxDay) maxDay = v;

  const dayChart = document.getElementById('dayChart');
  dayChart.innerHTML = '';
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const cnt = byDay.get(dateKey(d.getTime())) || 0;
    const col = document.createElement('div');
    col.className = 'bar-col';

    const val = document.createElement('div');
    val.className = 'bar-value';
    val.textContent = cnt > 0 ? String(cnt) : '';

    const pillar = document.createElement('div');
    pillar.className = 'bar-pillar';
    pillar.style.height = (cnt / maxDay * 100) + '%';
    pillar.title = `${fmtDay(d, tag)} · ${I18N.t('stats_day_records', { n: cnt })}`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = fmtDay(d, tag);

    col.appendChild(val);
    col.appendChild(pillar);
    col.appendChild(label);
    dayChart.appendChild(col);
  }
}

(async function init() {
  await I18N.loadLang();
  I18N.applyStatic(document);

  document.getElementById('refreshBtn').addEventListener('click', loadStats);
  document.getElementById('backBtn').addEventListener('click', () => {
    navigateTo('archive.html');
  });

  // 后台手动/自动归档后刷新归档页时会发 refreshArchive；配置页切换语言时发 languageChanged
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.action === 'refreshArchive' || msg.action === 'languageChanged') {
      if (msg.action === 'languageChanged') {
        I18N.setLang(msg.language || I18N.DEFAULT_LANG);
        I18N.applyStatic(document);
      }
      loadStats();
      if (msg.action === 'refreshArchive') toast(I18N.t('toast_updated'));
    }
  });

  loadStats();
})();
