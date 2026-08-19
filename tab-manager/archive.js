// archive.js —— 归档记录页：按"归档批次"分组查看 / 恢复 / 删除

const FALLBACK_FAV =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='8' fill='%23c7cad8'/%3E%3C/svg%3E";

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 本地化日期时间：跟随当前界面语言
function fmtTime(ts, langTag) {
  try {
    return new Date(ts).toLocaleString(langTag || 'zh-CN', {
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

// 读取"恢复时是否同时删除归档记录"设置，默认开启
async function getDeleteOnRestore() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings ? settings.deleteOnRestore !== false : true;
}

// 读取"最常访问"展示数量（设置项 frequentLimit，默认 8，限幅 1–30）
async function getFrequentLimit() {
  const { settings } = await chrome.storage.local.get('settings');
  const n = settings && settings.frequentLimit;
  return (typeof n === 'number' && n >= 1) ? Math.min(30, Math.round(n)) : 8;
}

// 按 URL 统计归档频次，返回出现最多的前 limit 个（含最近一次的标题/图标）
function computeFrequent(archive, limit) {
  const map = new Map();
  for (const it of archive) {
    if (!it.url) continue;
    const e = map.get(it.url) || { count: 0, lastTs: 0, title: it.title, favIconUrl: it.favIconUrl };
    e.count += 1;
    if (it.closedAt > e.lastTs) {
      e.lastTs = it.closedAt;
      e.title = it.title;
      e.favIconUrl = it.favIconUrl;
    }
    map.set(it.url, e);
  }
  return [...map.entries()]
    .map(([url, e]) => ({ url, ...e }))
    .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
    .slice(0, limit);
}

// 渲染"最常访问"面板：紧凑胶囊，点击即在新标签打开该网址（不删除归档记录）
function renderFrequent(archive, limit) {
  const panel = document.getElementById('frequentPanel');
  const chips = document.getElementById('frequentChips');
  const sub = document.getElementById('frequentSub');
  chips.innerHTML = '';
  const top = computeFrequent(archive, limit);
  if (top.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  sub.textContent = I18N.t('frequent_sub', { n: top.length });
  for (const item of top) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.title = item.title || item.url;
    const fav = document.createElement('img');
    fav.className = 'chip-fav';
    fav.src = item.favIconUrl || FALLBACK_FAV;
    fav.onerror = () => { fav.src = FALLBACK_FAV; };
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = item.title || item.url;
    const badge = document.createElement('span');
    badge.className = 'chip-badge';
    badge.textContent = '×' + item.count;
    chip.append(fav, label, badge);
    chip.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
      toast(I18N.t('toast_reopened'));
    });
    chips.appendChild(chip);
  }
}

// 恢复单条：新标签打开链接；若设置开启则同时删除该归档记录
async function restoreOne(globalIdx, url) {
  chrome.tabs.create({ url });
  toast(I18N.t('toast_reopened'));
  if (await getDeleteOnRestore()) {
    const { archive: arr = [] } = await chrome.storage.local.get('archive');
    arr.splice(globalIdx, 1);
    await chrome.storage.local.set({ archive: arr });
    loadArchive();
  }
}

// ---------- 搜索状态 ----------
let searchQuery = '';        // 搜索关键字（原始输入）
let searchRegex = false;     // 是否按正则匹配
let searchInvalid = false;   // 正则语法是否无效

// 判断单条归档是否匹配当前搜索条件。
// 关键词模式：空格拆分为多个 term，全部命中（AND）才算匹配，匹配 title + url。
// 正则模式：整串作为正则源；语法无效时标记 searchInvalid 并返回 true（显示全部）。
function matchItem(item) {
  const q = searchQuery.trim();
  if (!q) return true;
  const hay = `${item.title || ''} ${item.url || ''}`.toLowerCase();
  if (searchRegex) {
    try {
      return new RegExp(searchQuery, 'i').test(hay);
    } catch (e) {
      searchInvalid = true;
      return true;
    }
  }
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

// 把扁平归档数组按批次分组；兼容没有 batchId 的旧数据（每条自成一组）
// 同时携带 batchType / batchWindowNum 供按当前语言翻译批次标题
function groupByBatch(archive) {
  const map = new Map();
  archive.forEach((item, i) => {
    const key = item.batchId || ('legacy_' + i);
    if (!map.has(key)) {
      map.set(key, {
        batchId: item.batchId || '',
        batchType: item.batchType || '',
        batchWindowNum: item.batchWindowNum || '',
        batchLabel: item.batchLabel || '',
        idxs: [],          // 组内每条在全局数组中的下标（用于删除）
        items: [],
        time: item.closedAt,
      });
    }
    const g = map.get(key);
    g.idxs.push(i);
    g.items.push(item);
    if (item.closedAt < g.time) g.time = item.closedAt; // 取最早时间作为批次时间
  });
  // 最新批次排在前面
  return [...map.values()].sort((a, b) => b.time - a.time);
}

// 批次标题：新数据按 batchType 翻译；旧数据（仅有中文 batchLabel）原样展示或退回时间
function batchDisplayLabel(g, langTag) {
  if (g.batchType === 'auto') return I18N.t('batch_auto');
  if (g.batchType === 'manual_current') return I18N.t('batch_manual_current');
  if (g.batchType === 'manual_window') return I18N.t('batch_manual_window', { num: g.batchWindowNum });
  return g.batchLabel || I18N.t('batch_archived_at', { time: fmtTime(g.time, langTag) });
}

async function loadArchive() {
  const langTag = I18N.localeTag(I18N.getLang());
  const { archive = [] } = await chrome.storage.local.get('archive');
  const deleteOnRestore = await getDeleteOnRestore(); // 恢复时是否同步删除记录（默认开启）
  const limit = await getFrequentLimit();             // 最常访问展示数量
  const list = document.getElementById('archiveList');
  const count = document.getElementById('count');
  list.innerHTML = '';

  // 渲染"最常访问"面板（与搜索过滤无关，始终基于完整归档统计）
  renderFrequent(archive, limit);

  const groups = groupByBatch(archive);

  // 应用搜索过滤：每个批次内只保留命中的条目；整批无命中则不显示
  searchInvalid = false;
  const filteredGroups = groups
    .map((g) => {
      const keep = [];
      g.items.forEach((item, k) => {
        if (matchItem(item)) keep.push(k);
      });
      if (keep.length === 0) return null;
      return { ...g, items: keep.map((k) => g.items[k]), idxs: keep.map((k) => g.idxs[k]) };
    })
    .filter(Boolean);

  // 正则无效时给输入框标红并提示，但列表仍显示全部（不强行清空）
  const searchInput = document.getElementById('searchInput');
  const errEl = document.getElementById('searchError');
  if (searchInvalid) {
    searchInput.classList.add('invalid');
    errEl.textContent = I18N.t('arch_regex_invalid');
    errEl.classList.add('show');
  } else {
    searchInput.classList.remove('invalid');
    errEl.classList.remove('show');
  }

  const total = archive.length;
  const matched = filteredGroups.reduce((s, g) => s + g.items.length, 0);
  if (searchQuery.trim()) {
    count.textContent = I18N.t('arch_count_match', { matched, total });
  } else {
    count.textContent = I18N.t('arch_count_total', { total, groups: groups.length });
  }

  if (total === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = I18N.t('arch_empty');
    list.appendChild(li);
    return;
  }

  if (filteredGroups.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = I18N.t('arch_notfound', { q: searchQuery.trim() });
    list.appendChild(li);
    return;
  }

  for (const g of filteredGroups) {
    const groupEl = document.createElement('li');
    groupEl.className = 'batch';

    // ---- 批次头部 ----
    const head = document.createElement('div');
    head.className = 'batch-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'batch-title-wrap';
    const title = document.createElement('div');
    title.className = 'batch-title';
    title.textContent = batchDisplayLabel(g, langTag);
    const sub = document.createElement('div');
    sub.className = 'batch-sub';
    sub.textContent = I18N.t('batch_sub', { count: g.items.length, time: fmtTime(g.time, langTag) });
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const ops = document.createElement('div');
    ops.className = 'batch-ops';
    const restoreAll = document.createElement('button');
    restoreAll.textContent = I18N.t('batch_restore_all');
    restoreAll.title = I18N.t('batch_restore_all_title') + (deleteOnRestore ? I18N.t('suffix_and_del_batch') : '');
    restoreAll.addEventListener('click', async () => {
      for (const it of g.items) chrome.tabs.create({ url: it.url });
      toast(I18N.t('toast_reopened_batch', { n: g.items.length }));
      if (deleteOnRestore) {
        const { archive: arr = [] } = await chrome.storage.local.get('archive');
        const idxs = new Set(g.idxs);
        const next = arr.filter((_, i) => !idxs.has(i));
        await chrome.storage.local.set({ archive: next });
        loadArchive();
      }
    });
    const delGroup = document.createElement('button');
    delGroup.className = 'del';
    delGroup.textContent = I18N.t('batch_del');
    delGroup.title = I18N.t('batch_del_title');
    delGroup.addEventListener('click', async () => {
      if (!confirm(I18N.t('confirm_del_batch', { n: g.items.length }))) return;
      const { archive: arr = [] } = await chrome.storage.local.get('archive');
      const idxs = new Set(g.idxs);
      const next = arr.filter((_, i) => !idxs.has(i));
      await chrome.storage.local.set({ archive: next });
      loadArchive();
      toast(I18N.t('toast_batch_deleted'));
    });
    ops.appendChild(restoreAll);
    ops.appendChild(delGroup);

    head.appendChild(titleWrap);
    head.appendChild(ops);
    groupEl.appendChild(head);

    // ---- 批次内条目 ----
    const body = document.createElement('ul');
    body.className = 'batch-body';
    g.items.forEach((item, k) => {
      const li = document.createElement('li');
      li.className = 'arc-item';

      const fav = document.createElement('img');
      fav.className = 'fav';
      fav.src = item.favIconUrl || FALLBACK_FAV;
      fav.onerror = () => { fav.src = FALLBACK_FAV; };

      const info = document.createElement('div');
      info.className = 'info';
      const t = document.createElement('div');
      t.className = 'a-title';
      t.textContent = item.title || item.url;
      t.title = item.title || item.url;
      const meta = document.createElement('div');
      meta.className = 'a-meta';
      meta.textContent = item.url;
      meta.title = item.url;
      info.appendChild(t);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'arc-actions';
      const restore = document.createElement('button');
      restore.textContent = I18N.t('item_restore');
      restore.title = I18N.t('item_restore_title') + (deleteOnRestore ? I18N.t('suffix_and_del') : '');
      restore.addEventListener('click', async (e) => {
        e.stopPropagation(); // 避免触发整行点击的"打开恢复"
        await restoreOne(g.idxs[k], item.url);
      });
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = I18N.t('item_del');
      del.title = I18N.t('item_del_title');
      del.addEventListener('click', async (e) => {
        e.stopPropagation(); // 避免误触整行的"打开恢复"
        const { archive: arr = [] } = await chrome.storage.local.get('archive');
        arr.splice(g.idxs[k], 1);
        await chrome.storage.local.set({ archive: arr });
        loadArchive();
      });
      actions.appendChild(restore);
      actions.appendChild(del);

      li.appendChild(fav);
      li.appendChild(info);
      li.appendChild(actions);
      // 整条记录可点击直接恢复（打开该链接）
      li.title = I18N.t('item_row_title') + (deleteOnRestore ? I18N.t('suffix_and_del') : '');
      li.addEventListener('click', async () => {
        await restoreOne(g.idxs[k], item.url);
      });
      body.appendChild(li);
    });
    groupEl.appendChild(body);

    list.appendChild(groupEl);
  }
}

// 搜索：关键词（空格分隔，多词 AND）或正则模式；输入做轻量防抖，正则切换即时生效
const searchInput = document.getElementById('searchInput');
const regexToggle = document.getElementById('regexToggle');
let searchTimer;
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadArchive, 100);
});
regexToggle.addEventListener('change', () => {
  searchRegex = regexToggle.checked;
  loadArchive();
});

(async function init() {
  await I18N.loadLang();
  I18N.applyStatic(document);

  document.getElementById('refreshBtn').addEventListener('click', loadArchive);

  // "最常访问"面板折叠/展开（纯界面状态，不持久化）
  const frequentPanel = document.getElementById('frequentPanel');
  document.getElementById('frequentToggle').addEventListener('click', () => {
    const collapsed = frequentPanel.classList.toggle('collapsed');
    document.getElementById('frequentToggle').setAttribute('aria-expanded', String(!collapsed));
  });

  // 打开归档统计页（当前标签内替换，不开新标签）
  document.getElementById('statsBtn').addEventListener('click', () => {
    navigateTo('stats.html');
  });

  // 打开配置页面（选项页，当前标签内替换，不开新标签）
  document.getElementById('openOptionsBtn').addEventListener('click', () => {
    navigateTo('options.html');
  });

  // 支持开发者：跳转到第三方捐赠平台（新标签页打开，扩展内不处理任何支付）
  const afdianLink = document.getElementById('afdianLink');
  if (afdianLink) afdianLink.addEventListener('click', () => chrome.tabs.create({ url: DONATION.afdian }));

  // 接收后台发来的刷新指令（手动归档聚焦已存在的归档页、或自动归档时同步内容）
  // 以及配置页发来的语言切换通知，立即重刷静态文案并重新渲染列表
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'refreshArchive') {
      loadArchive();
      toast(I18N.t('toast_updated'));
    } else if (msg && msg.action === 'languageChanged') {
      I18N.setLang(msg.language || I18N.DEFAULT_LANG);
      I18N.applyStatic(document);
      loadArchive();
    }
  });

  loadArchive();
})();
