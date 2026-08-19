// background.js —— 标签管家 后台服务 (Manifest V3 Service Worker)
// 职责：
//   1. 打开相同链接时，自动切换到已存在的标签（去重）
//   2. 记录每个标签的"最后访问时间"，用于闲置判定
//   3. 定时关闭长时间未访问的标签，并把链接+标题归档到本地存储
//   4. 提供合并同域名标签的能力（供 popup 调用）

const DEFAULT_SETTINGS = {
  language: 'zh_CN',       // 界面语言：zh_CN / en / ja / ko（默认中文）
  dedupeEnabled: true,     // 打开相同链接自动切换
  dedupeScope: 'current',  // 去重查找范围：'current' 仅当前窗口 / 'all' 所有窗口（默认仅当前窗口）
  dedupeAllowlist: [],     // 去重允许列表：命中其中的域名或 URL 时，不进行切换、照常打开新标签
  autoCloseEnabled: true,  // 定时关闭闲置标签
  autoCloseMinutes: 30,    // 闲置多少分钟后关闭
  protectPinned: true,     // 保护固定(pinned)标签
  archiveMax: 1000,        // 归档记录最多保留条数
  pinArchivePage: true,    // 固定归档记录页面：手动归档打开并固定、自动归档时自动刷新
  deleteOnRestore: true,  // 从归档记录页恢复时，同时删除该归档记录
  frequentLimit: 8,       // 归档页"最常访问"展示的网址个数（1–30）
};

// 每个标签的最后访问时间戳，按 tabId 存储；存活于会话内、可跨 Service Worker 重启
const LAST_ACTIVE_KEY = 'lastActiveMap';

// ---------- 存储辅助 ----------
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function getLastActiveMap() {
  const res = await chrome.storage.session.get(LAST_ACTIVE_KEY);
  return res[LAST_ACTIVE_KEY] || {};
}
async function setLastActiveMap(m) {
  await chrome.storage.session.set({ [LAST_ACTIVE_KEY]: m });
}

// ---------- 工具 ----------
function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}
function isExtensionUrl(url) {
  return typeof url === 'string' && url.startsWith('chrome-extension://');
}

// ---------- 去重允许列表匹配 ----------
// 把用户填写的一行允许列表项规整为 {host, path}：
//   - 无协议前缀时补 "http://" 以便 URL 解析；
//   - 仅域名（pathname 为 "/" 或空）→ path 为 ''，视作域名匹配；
//   - 含具体路径 → 提取 pathname，视作完整 URL 精确匹配。
// 解析失败（非法）返回 null，调用方跳过该项。
function normalizeAllowlistItem(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    const path = (u.pathname || '') === '/' ? '' : (u.pathname || '');
    return { host: u.hostname.toLowerCase(), path };
  } catch {
    return null;
  }
}

// 把任意 URL 规整为「协议 + host + 去尾斜杠的 path + query」形式，用于允许列表精确比较。
// 无协议时补 "https://"（浏览器标签几乎都是 https），保证 example.com/page 与
// https://example.com/page/ 等价。
function canonicalizeUrl(u) {
  u = (u || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    let path = p.pathname;
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return (p.protocol + '//' + p.host + path + (p.search || ''));
  } catch {
    return u;
  }
}

// 判断 tabUrl 是否命中允许列表。命中则去重逻辑应跳过切换。
//   - 域名项（无路径）：tab 的 hostname 与允许列表 host 完全一致，或为其子域（如 example.com 覆盖 sub.example.com）；
//   - URL 项（含路径）：tab.url 与允许列表项规范化为同一形式后完全相等（协议/路径/查询敏感，忽略尾部斜杠）。
function isUrlAllowlisted(tabUrl, list) {
  if (!list || !list.length) return false;
  let tabHost = '';
  try { tabHost = new URL(tabUrl).hostname.toLowerCase(); } catch { return false; }
  for (const raw of list) {
    const item = normalizeAllowlistItem(raw);
    if (!item) continue;
    if (item.path) {
      if (canonicalizeUrl(tabUrl) === canonicalizeUrl(raw)) return true;
    } else {
      if (tabHost === item.host || tabHost.endsWith('.' + item.host)) return true;
    }
  }
  return false;
}

// 把完整 hostname 转成"有意义"的群组标签：
// 去掉 www. 前缀，再剥掉无标识意义的后缀（com/net/org/cn 等，含多级后缀如 co.uk、com.cn），
// 取剩余部分的主体段。例：www.google.com -> google；news.bbc.co.uk -> bbc；mail.github.io -> github
const TLD_SET = new Set([
  'com','net','org','cn','io','co','gov','edu','info','biz','me','us','uk','jp','de','fr','ru',
  'dev','app','xyz','top','vip','cc','tv','ai','cloud','tech','online','site','shop','store',
  'blog','live','work','wang','ren','pub','pro','news','xyz','group','company','systems','email',
]);
function isIpAddress(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}
function domainLabel(host) {
  if (!host) return host;
  if (isIpAddress(host)) return host; // IP 无品牌主体，原样保留
  let h = host.toLowerCase().replace(/^www\./, '');
  const parts = h.split('.');
  // 从右往左剥 TLD（处理多级后缀）
  while (parts.length > 1 && TLD_SET.has(parts[parts.length - 1])) {
    parts.pop();
  }
  // 含子域时取最靠近 TLD 的"二级域"作为主体
  return parts.length ? parts[parts.length - 1] : h;
}

async function markActive(tabId, time = Date.now()) {
  if (!tabId) return;
  const m = await getLastActiveMap();
  m[tabId] = time;
  await setLastActiveMap(m);
}

// ---------- 去重：打开相同链接时切换到已存在的标签 ----------
async function dedupeCheck(tab) {
  if (!isHttpUrl(tab.url)) return;
  const settings = await getSettings();
  if (!settings.dedupeEnabled) return;
  if (isExtensionUrl(tab.url)) return;
  // 命中允许列表：跳过切换，照常打开新标签
  if (isUrlAllowlisted(tab.url, settings.dedupeAllowlist)) return;

  // 按设置查找打开了同一 URL 的标签：
  // - 'current'（默认）：仅在当前窗口内查找，避免误关其它窗口的标签；
  // - 'all'：跨所有窗口查找，任意窗口命中就切换过去。
  const query = { url: tab.url };
  if (settings.dedupeScope !== 'all') query.windowId = tab.windowId;
  const same = await chrome.tabs.query(query);
  if (same.length < 2) return;

  // 始终保留"最老"的那个（id 最小），关闭其余较新的标签，避免互相关闭造成死循环
  const keeper = same.reduce((a, b) => (a.id < b.id ? a : b));
  if (keeper.id === tab.id) return; // 当前标签就是保留对象，不动

  try {
    await chrome.windows.update(keeper.windowId, { focused: true });
    await chrome.tabs.update(keeper.id, { active: true });
    await chrome.tabs.remove(tab.id);
  } catch (e) {
    console.error('[标签管家] 去重切换失败:', e);
  }
}

// ---------- 归档 + 关闭 ----------
// 批次 id：同一"归档操作"（手动归档本窗口 / 一次定时扫描）内的所有条目共用，用于归档页分组
function newBatchId() {
  return 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function addArchive(entry) {
  const { archive = [] } = await chrome.storage.local.get('archive');
  archive.unshift(entry);
  const max = (await getSettings()).archiveMax;
  const trimmed = archive.slice(0, max);
  await chrome.storage.local.set({ archive: trimmed });
}

async function archiveAndClose(tab, batchId, batchType, batchWindowNum) {
  await addArchive({
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    closedAt: Date.now(),
    windowId: tab.windowId,
    batchId,
    batchType: batchType || '',
    batchWindowNum: batchWindowNum || '',
  });
  try {
    await chrome.tabs.remove(tab.id);
  } catch (e) {
    console.error('[标签管家] 关闭标签失败:', e);
  }
}

// 闲置自动归档：10 分钟内的多次扫描合并到同一批次，超时则新建
const AUTO_BATCH_MERGE_MS = 10 * 60 * 1000;

// 查找最近一次的"闲置自动归档"批次：若其最后写入时间距今不超过阈值，返回其 batchId（复用）；
// 否则返回 null（需新建）。archive 数组按时间倒序 unshift，故第一条 batchType==='auto' 即最新批次。
async function findRecentAutoBatchId() {
  const { archive = [] } = await chrome.storage.local.get('archive');
  for (const item of archive) {
    if (item.batchType === 'auto') {
      return Date.now() - (item.closedAt || 0) <= AUTO_BATCH_MERGE_MS ? item.batchId : null;
    }
  }
  return null; // 尚无闲置归档记录
}

// ---------- 定时关闭闲置标签 ----------
async function closeIdleTabs() {
  const settings = await getSettings();
  if (!settings.autoCloseEnabled) return;

  const thresholdMs = settings.autoCloseMinutes * 60 * 1000;
  const now = Date.now();
  const m = await getLastActiveMap();
  let changed = false;

  const tabs = await chrome.tabs.query({});
  const toClose = [];

  for (const tab of tabs) {
    if (settings.protectPinned && tab.pinned) continue;     // 固定标签永远保护
    if (tab.active) { m[tab.id] = now; changed = true; continue; } // 当前激活的不会闲置

    // 没有记录过的标签：本轮先"种下"当前时间作为宽限期，不直接关
    if (m[tab.id] == null) { m[tab.id] = now; changed = true; continue; }

    if (now - m[tab.id] > thresholdMs) toClose.push(tab);
  }

  if (changed) await setLastActiveMap(m);
  if (!toClose.length) return; // 本轮无闲置标签，跳过

  // 闲置自动归档：10 分钟内的扫描合并到同一批次，超时则新建
  const batchType = 'auto';
  const batchId = (await findRecentAutoBatchId()) || newBatchId();
  for (const tab of toClose) {
    await archiveAndClose(tab, batchId, batchType);
  }
  // 自动归档后：若"固定归档记录页面"开启且归档页已打开，自动刷新其内容
  await notifyArchiveRefresh();
}

// ---------- 合并同域名标签：归到同一个标签群组（不关闭任何标签）----------
const GROUP_COLORS = ['blue','red','yellow','green','purple','cyan','orange','pink','grey'];

async function mergeSameDomain() {
  const tabs = await chrome.tabs.query({});
  // 按「窗口 + 域名」分组（标签群组是窗口级别的，固定标签无法加入群组）
  const buckets = {};
  for (const t of tabs) {
    if (!isHttpUrl(t.url)) continue;
    if (t.pinned) continue;
    let host;
    try { host = new URL(t.url).hostname; } catch { continue; }
    // 分组键用「窗口 + 域名品牌」(domainLabel 已剥离 www./子域/无意义后缀)，
    // 必须与群组标题保持一致：否则 www.x.com 与 mail.x.com 会各自成组、却都显示 "x"，
    // 导致同一窗口出现两个同名分组（用户反馈的 bug）。
    const label = domainLabel(host);
    const key = `${t.windowId}|${label}`;
    (buckets[key] ||= []).push(t.id);
  }

  let groups = 0;
  let colorIdx = 0;
  for (const key in buckets) {
    const tabIds = buckets[key];
    if (tabIds.length < 2) continue; // 只有一个标签就无需成组
    const label = key.split('|')[1];
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: label,
        color: GROUP_COLORS[colorIdx % GROUP_COLORS.length],
      });
      groups++;
      colorIdx++;
    } catch (e) {
      console.error('[标签管家] 建立标签群组失败:', e);
    }
  }
  return groups;
}

// ---------- 手动归档：把【所有窗口】打开的标签记录并关闭，按窗口分组 ----------
// 范围覆盖全部窗口；chrome://newtab、chrome-extension://.../archive.html 等一并归档，
// 不再按协议跳过（唯一例外是按设置保护的固定标签）。
// 每个窗口归档为独立批次（各自 batchId），便于在归档页按窗口查看/恢复。
async function archiveAllWindows() {
  const settings = await getSettings();
  const windows = await chrome.windows.getAll();        // 窗口顺序，用于按窗口编号命名批次
  const tabs = await chrome.tabs.query({});             // 所有窗口所有标签
  const byWindow = new Map();
  for (const t of tabs) {
    if (settings.protectPinned && t.pinned) continue;    // 尊重"保护固定标签"设置
    if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
    byWindow.get(t.windowId).push(t);
  }

  let total = 0;
  let wNum = 0;            // 连续编号，仅对"有可归档标签"的窗口计数
  let archivedAny = false;
  for (const win of windows) {
    const group = byWindow.get(win.id);
    if (!group || !group.length) continue;              // 该窗口无可归档标签（可能全是固定标签）
    wNum++;
    const batchId = newBatchId();
    const batchType = 'manual_window';
    for (const t of group) {
      await addArchive({
        url: t.url,
        title: t.title || t.url,
        favIconUrl: t.favIconUrl || '',
        closedAt: Date.now(),
        windowId: t.windowId,
        batchId,
        batchType,
        batchWindowNum: wNum,
      });
    }
    const ids = group.map((t) => t.id);
    await chrome.tabs.remove(ids);
    total += group.length;
    archivedAny = true;
  }
  // 手动归档后：打开（或刷新）归档记录页；设置开启时固定为标签
  if (archivedAny) await openOrRefreshArchivePage();
  return total;
}

// ---------- 手动归档：只归档【当前窗口】打开的标签（一步到位，无二次确认）----------
// 关键点：先在当前窗口打开固定的归档记录页，再关掉其余标签。
// 否则当窗口标签被全部归档时，窗口会因变空而连同关闭，归档页也只剩在别的窗口打开。
async function archiveCurrentWindow(windowId) {
  const settings = await getSettings();

  // 第一步：先在目标窗口打开（或聚焦/移入）固定的归档记录页，
  // 保证后续关掉所有标签后窗口仍有归档页支撑、不会连同关闭。
  const archiveTab = await ensureArchiveTabInWindow(windowId);

  // 第二步：归档当前窗口其余标签（归档页自身绝不归档/关闭）
  const tabs = await chrome.tabs.query({ windowId });
  const toArchive = [];
  for (const t of tabs) {
    if (t.id === archiveTab.id) continue;             // 归档页自身排除
    if (settings.protectPinned && t.pinned) continue; // 尊重"保护固定标签"设置
    toArchive.push(t);
  }
  const batchId = newBatchId();
  const batchType = 'manual_current';
  for (const t of toArchive) {
    await addArchive({
      url: t.url,
      title: t.title || t.url,
      favIconUrl: t.favIconUrl || '',
      closedAt: Date.now(),
      windowId: t.windowId,
      batchId,
      batchType,
    });
  }
  const ids = toArchive.map((t) => t.id);
  if (ids.length) {
    await chrome.tabs.remove(ids);
    // 关标签后：聚焦归档页并刷新其内容，再把窗口提到前台
    try {
      await chrome.tabs.update(archiveTab.id, { active: true });
      await chrome.tabs.sendMessage(archiveTab.id, { action: 'refreshArchive' });
    } catch (e) { /* 页面尚未就绪，下次打开自会加载最新归档 */ }
    try { await chrome.windows.update(windowId, { focused: true }); } catch (e) { /* 窗口可能已不存在 */ }
  }
  return toArchive.length;
}

// ---------- 归档记录页：固定 + 自动刷新 ----------
// 找到当前已打开的归档记录页（archive.html）标签，没有则返回 null
async function findArchiveTab() {
  const url = chrome.runtime.getURL('archive.html');
  const tabs = await chrome.tabs.query({ url });
  return tabs[0] || null;
}

// 确保归档记录页标签存在于【指定窗口】内（手动归档当前窗口时使用）：
// - 已在目标窗口：直接返回（设置开启"固定"时确保其为固定标签）；
// - 存在于其它窗口：移动到目标窗口（避免原窗口变空后连同关闭）；
// - 均不存在：在目标窗口新建（设置开启"固定"时设为固定标签）。
// 返回该标签对象，供调用方把它排除在"待归档/待关闭"列表之外。
async function ensureArchiveTabInWindow(windowId) {
  const settings = await getSettings();
  const url = chrome.runtime.getURL('archive.html');

  // 1) 目标窗口内已存在归档页
  const inWin = await chrome.tabs.query({ windowId, url });
  if (inWin.length) {
    const tab = inWin[0];
    if (settings.pinArchivePage && !tab.pinned) {
      await chrome.tabs.update(tab.id, { pinned: true });
    }
    return tab;
  }

  // 2) 其它窗口已有归档页：移入目标窗口（保留固定态）
  const elsewhere = await chrome.tabs.query({ url });
  if (elsewhere.length) {
    const moved = await chrome.tabs.move(elsewhere[0].id, { windowId, index: -1 });
    if (settings.pinArchivePage && !moved.pinned) {
      await chrome.tabs.update(moved.id, { pinned: true });
    }
    return moved;
  }

  // 3) 全新创建到目标窗口
  return chrome.tabs.create({
    windowId,
    url: 'archive.html',
    pinned: !!settings.pinArchivePage,
  });
}

// 手动归档后调用：确保归档页可见。
// 已打开则聚焦并发送刷新消息；未打开则新建（设置开启"固定"时设为固定标签）。
async function openOrRefreshArchivePage() {
  const settings = await getSettings();
  const existing = await findArchiveTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    try { await chrome.tabs.sendMessage(existing.id, { action: 'refreshArchive' }); } catch (e) { /* 页面尚未就绪 */ }
    return;
  }
  await chrome.tabs.create({
    url: 'archive.html',
    pinned: !!settings.pinArchivePage,
  });
}

// 自动归档后调用：仅当归档页已打开时刷新其内容（不强制打开新标签，避免打扰）；
// 受"固定归档记录页面"设置开关控制。
async function notifyArchiveRefresh() {
  const settings = await getSettings();
  if (!settings.pinArchivePage) return;
  const tab = await findArchiveTab();
  if (!tab) return;
  try { await chrome.tabs.sendMessage(tab.id, { action: 'refreshArchive' }); } catch (e) { /* 页面尚未就绪 */ }
}

// 解组【当前窗口】的所有标签群组（不关标签，只拆 group）：
// 找到当前窗口里所有 groupId >= 0 的标签，一次性 chrome.tabs.ungroup 拆掉。
// 返回解组涉及的标签数（0 表示窗口里没有任何标签组）。
async function ungroupWindow(windowId) {
  if (windowId == null) return { ungrouped: 0 };
  const tabs = await chrome.tabs.query({ windowId });
  const ids = tabs
    .filter((t) => typeof t.groupId === 'number' && t.groupId >= 0)
    .map((t) => t.id);
  if (ids.length === 0) return { ungrouped: 0 };
  await chrome.tabs.ungroup(ids);
  return { ungrouped: ids.length };
}

// 暴露给 popup 调用
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'mergeSameDomain') {
    mergeSameDomain().then((n) => sendResponse({ groups: n }));
    return true; // 异步返回
  }
  if (msg && msg.action === 'ungroupWindow') {
    ungroupWindow(msg.windowId).then((r) => sendResponse(r));
    return true; // 异步返回
  }
  if (msg && msg.action === 'archiveAllWindows') {
    archiveAllWindows().then((n) => sendResponse({ archived: n }));
    return true; // 异步返回
  }
  if (msg && msg.action === 'archiveCurrentWindow') {
    archiveCurrentWindow(msg.windowId).then((n) => sendResponse({ archived: n }));
    return true; // 异步返回
  }
});

// ---------- 事件监听 ----------
chrome.tabs.onActivated.addListener(({ tabId }) => markActive(tabId));
chrome.tabs.onCreated.addListener((tab) => markActive(tab.id, Date.now()));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    if (tab.active) markActive(tabId);
    if (isHttpUrl(tab.url)) dedupeCheck(tab);
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const m = await getLastActiveMap();
  if (tabId in m) { delete m[tabId]; await setLastActiveMap(m); }
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) markActive(tab.id);
});

// ---------- 启动 / 安装 ----------
async function seedActiveTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  const m = await getLastActiveMap();
  for (const t of tabs) m[t.id] = Date.now();
  await setLastActiveMap(m);
}
chrome.runtime.onInstalled.addListener(seedActiveTabs);
chrome.runtime.onStartup.addListener(seedActiveTabs);

// 每分钟检查一次闲置标签
chrome.alarms.create('idleClose', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'idleClose') closeIdleTabs();
});
