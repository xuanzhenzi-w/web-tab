// popup.js —— 标签管家 弹窗管理界面

const FALLBACK_FAV =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%23c7cad8'/%3E%3C/svg%3E";

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 目标窗口：首次加载由 currentWindow 解析为"弹出此弹窗的浏览器窗口"，
// 之后所有查询都锁定同一 windowId，避免刷新/实时同步时误查到弹窗自身窗口。
let targetWindowId = null;
let reloadTimer = null;

// 与 background 保持一致的归档设置默认值
const SETTINGS_DEFAULTS = {
  autoCloseEnabled: true,   // 定时关闭闲置标签
  autoCloseMinutes: 30,     // 闲置多少分钟后关闭
  protectPinned: true,      // 保护固定(pinned)标签
};
let curSettings = { ...SETTINGS_DEFAULTS };
let lastActiveMap = {};      // tabId -> 最后访问时间戳（与 background 同源）

// 读取最新设置与「最后访问时间」映射，供进度条计算使用
async function refreshData() {
  try {
    const s = await chrome.storage.local.get('settings');
    curSettings = { ...SETTINGS_DEFAULTS, ...(s.settings || {}) };
    const r = await chrome.storage.session.get('lastActiveMap');
    lastActiveMap = (r && r.lastActiveMap) || {};
  } catch (e) { /* 忽略存储读取异常 */ }
}

// 弹窗打开期间每秒刷新一次自动归档进度条
function updateBars() {
  const now = Date.now();
  document.querySelectorAll('.tab-item').forEach((li) => {
    const fill = li.querySelector('.archive-bar-fill');
    if (!fill) return;
    const last = Number(li.dataset.last) || now;
    const thr = Number(li.dataset.thr) || 1;
    let p = thr > 0 ? (now - last) / thr : 0;
    p = Math.max(0, Math.min(1, p));
    fill.style.width = (p * 100).toFixed(1) + '%';
    let color = 'var(--primary)';
    if (p >= 0.92) color = 'var(--danger)';
    else if (p >= 0.7) color = 'var(--warning)';
    fill.style.background = color;
    const barEl = li.querySelector('.archive-bar');
    if (barEl) {
      const remain = Math.max(0, Math.ceil((thr - (now - last)) / 60000));
      barEl.title = p >= 1 ? I18N.t('bar_over') : I18N.t('bar_soon', { n: remain });
    }
  });
}

async function loadTabs() {
  await refreshData();
  let tabs;
  if (targetWindowId == null) {
    tabs = await chrome.tabs.query({ currentWindow: true });
    if (tabs.length) targetWindowId = tabs[0].windowId;
  } else {
    tabs = await chrome.tabs.query({ windowId: targetWindowId });
  }
  const list = document.getElementById('tabList');
  const count = document.getElementById('count');
  list.innerHTML = '';
  count.textContent = I18N.t('popup_count', { n: tabs.length });

  for (const tab of tabs) {
    const li = document.createElement('li');
    li.className = 'tab-item' + (tab.active ? ' active' : '');

    const fav = document.createElement('img');
    fav.className = 'fav';
    fav.src = tab.favIconUrl || FALLBACK_FAV;
    fav.onerror = () => { fav.src = FALLBACK_FAV; };

    const info = document.createElement('div');
    info.className = 'info';
    const t = document.createElement('div');
    t.className = 't-title';
    t.textContent = tab.title || tab.url;
    t.title = tab.title || tab.url;
    const u = document.createElement('div');
    u.className = 't-url';
    u.textContent = tab.url;
    u.title = tab.url;
    info.appendChild(t);
    info.appendChild(u);

    const close = document.createElement('button');
    close.className = 'close-btn';
    close.textContent = '✕';
    close.title = I18N.t('close_btn_title');
    close.addEventListener('click', async (e) => {
      e.stopPropagation();
      await chrome.tabs.remove(tab.id);
      loadTabs();
    });

    li.appendChild(fav);
    li.appendChild(info);
    li.appendChild(close);

    // 自动归档进度条：仅当开启定时归档、且此标签确实可能被归档时显示
    const thresholdMs = curSettings.autoCloseMinutes * 60 * 1000;
    const showBar = curSettings.autoCloseEnabled
      && !tab.active
      && !(curSettings.protectPinned && tab.pinned);
    if (showBar) {
      const last = lastActiveMap[tab.id] != null ? lastActiveMap[tab.id] : Date.now();
      const bar = document.createElement('div');
      bar.className = 'archive-bar';
      const fill = document.createElement('div');
      fill.className = 'archive-bar-fill';
      let p = thresholdMs > 0 ? (Date.now() - last) / thresholdMs : 0;
      p = Math.max(0, Math.min(1, p));
      fill.style.width = (p * 100).toFixed(1) + '%';
      bar.appendChild(fill);
      li.dataset.last = String(last);
      li.dataset.thr = String(thresholdMs);
      li.appendChild(bar);
    }

    li.addEventListener('click', async () => {
      await chrome.tabs.update(tab.id, { active: true });
      window.close();
    });

    list.appendChild(li);
  }
}

// 解组【当前窗口】所有标签组：把 groupId >= 0 的标签全部解散为单独标签
document.getElementById('ungroupBtn').addEventListener('click', async () => {
  if (targetWindowId == null) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetWindowId = active ? active.windowId : null;
  }
  const resp = await chrome.runtime.sendMessage({ action: 'ungroupWindow', windowId: targetWindowId });
  const n = (resp && resp.ungrouped) || 0;
  toast(n > 0 ? I18N.t('toast_ungrouped', { n }) : I18N.t('toast_no_ungroup'));
  loadTabs();
});

document.getElementById('mergeBtn').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ action: 'mergeSameDomain' });
  const n = (resp && resp.groups) || 0;
  toast(n > 0 ? I18N.t('toast_grouped', { n }) : I18N.t('toast_no_group'));
  loadTabs();
});

// 归档【当前窗口】所有标签：一步到位，无二次确认
document.getElementById('archiveWinBtn').addEventListener('click', async () => {
  if (targetWindowId == null) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetWindowId = active ? active.windowId : null;
  }
  const resp = await chrome.runtime.sendMessage({ action: 'archiveCurrentWindow', windowId: targetWindowId });
  const n = (resp && resp.archived) || 0;
  if (n > 0) {
    toast(I18N.t('toast_archived_win', { n }));
    // 归档记录页由后台统一打开（设置开启时固定为标签）/ 刷新
    window.close();
  } else {
    toast(I18N.t('toast_archived_none'));
    loadTabs();
  }
});

// 归档【全部窗口】所有标签：一步到位，无二次确认
document.getElementById('archiveAllBtn').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ action: 'archiveAllWindows' });
  const n = (resp && resp.archived) || 0;
  if (n > 0) {
    toast(I18N.t('toast_archived_all', { n }));
    window.close();
  } else {
    toast(I18N.t('toast_archived_none'));
    loadTabs();
  }
});

document.getElementById('archiveBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'archive.html' });
  window.close();
});

document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// 接收配置页发来的语言切换通知，立即重刷静态文案并重新渲染列表
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === 'languageChanged') {
    I18N.setLang(msg.language || I18N.DEFAULT_LANG);
    I18N.applyStatic(document);
    loadTabs();
  }
});

(async function init() {
  await I18N.loadLang();
  I18N.applyStatic(document);
  document.getElementById('count').textContent = I18N.t('popup_count_loading');
  loadTabs();

  // 自动归档进度条随时间增长，弹窗打开期间每秒刷新一次
  setInterval(updateBars, 1000);

  // 实时同步：弹窗打开期间，标签新增/关闭/激活/标题变化会自动重绘列表，
  // 这样"刷新"按钮只是手动兜底，列表也不会在弹窗停留期间变得陈旧。
  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadTabs, 150);
  }
  chrome.tabs.onCreated.addListener(scheduleReload);
  chrome.tabs.onRemoved.addListener(scheduleReload);
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (targetWindowId == null || tab.windowId === targetWindowId) scheduleReload();
  });
  chrome.tabs.onActivated.addListener(({ windowId }) => {
    if (windowId === targetWindowId) scheduleReload();
  });
})();

// 支持开发者：跳转到第三方捐赠平台（新标签页打开，扩展内不处理任何支付）
const afdianLink = document.getElementById('afdianLink');
if (afdianLink) afdianLink.addEventListener('click', () => chrome.tabs.create({ url: DONATION.afdian }));
