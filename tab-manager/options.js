// options.js —— 标签管家 设置页

const DEFAULTS = {
  language: 'zh_CN',       // 界面语言：zh_CN / en / ja / ko（默认中文）
  dedupeEnabled: true,
  dedupeScope: 'current',  // 去重查找范围：'current' 仅当前窗口 / 'all' 所有窗口
  dedupeAllowlist: [],     // 去重允许列表：命中其中的域名或 URL 时，不进行切换
  autoCloseEnabled: true,
  autoCloseMinutes: 30,
  protectPinned: true,
  pinArchivePage: true,
  deleteOnRestore: true,
  frequentLimit: 8,       // 归档页"最常访问"展示的网址个数（1–30）
};

// 运行时状态：settings 的完整镜像，便于保存时整体回写
let state = { ...DEFAULTS };
let allowState = [];   // 去重允许列表（数组），独立于文本表单，单独维护
let prevLang = DEFAULTS.language;

const ids = ['dedupeEnabled', 'dedupeScope', 'autoCloseEnabled', 'autoCloseMinutes', 'protectPinned', 'pinArchivePage', 'deleteOnRestore', 'frequentLimit'];

// ---------- 去重允许列表：列表式增删 ----------
function renderAllowlist() {
  const list = document.getElementById('allowlistList');
  const empty = document.getElementById('allowlistEmpty');
  list.innerHTML = '';
  empty.hidden = allowState.length > 0;
  allowState.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'al-item';

    const text = document.createElement('span');
    text.className = 'al-text';
    text.textContent = item;          // textContent 防止注入
    li.appendChild(text);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'al-del';
    del.title = I18N.t('opt_allowlist_del_title');
    del.textContent = '×';
    del.addEventListener('click', () => removeAllowlistItem(idx));
    li.appendChild(del);

    list.appendChild(li);
  });
}

function addAllowlistItem() {
  const input = document.getElementById('allowlistInput');
  const val = input.value.trim();
  if (!val) return;
  // 去重：已存在则忽略，避免重复条目
  if (!allowState.some((s) => s.toLowerCase() === val.toLowerCase())) {
    allowState.push(val);
  }
  input.value = '';
  renderAllowlist();
  save('dedupeAllowlist');
}

function removeAllowlistItem(idx) {
  allowState.splice(idx, 1);
  renderAllowlist();
  save('dedupeAllowlist');
}

async function load() {
  await I18N.loadLang();
  I18N.applyStatic(document);
  const { settings } = await chrome.storage.local.get('settings');
  state = { ...DEFAULTS, ...(settings || {}) };
  prevLang = state.language;

  document.getElementById('dedupeEnabled').checked = state.dedupeEnabled;
  document.getElementById('dedupeScope').value = state.dedupeScope;
  allowState = (state.dedupeAllowlist || []).slice();
  renderAllowlist();
  document.getElementById('autoCloseEnabled').checked = state.autoCloseEnabled;
  document.getElementById('autoCloseMinutes').value = state.autoCloseMinutes;
  document.getElementById('protectPinned').checked = state.protectPinned;
  document.getElementById('pinArchivePage').checked = state.pinArchivePage;
  document.getElementById('deleteOnRestore').checked = state.deleteOnRestore;
  document.getElementById('frequentLimit').value = state.frequentLimit;
  document.getElementById('language').value = I18N.getLang();
}

function readForm() {
  return {
    language: document.getElementById('language').value,
    dedupeEnabled: document.getElementById('dedupeEnabled').checked,
    dedupeScope: document.getElementById('dedupeScope').value,
    dedupeAllowlist: allowState,
    autoCloseEnabled: document.getElementById('autoCloseEnabled').checked,
    autoCloseMinutes: Math.max(1, parseInt(document.getElementById('autoCloseMinutes').value, 10) || 30),
    protectPinned: document.getElementById('protectPinned').checked,
    pinArchivePage: document.getElementById('pinArchivePage').checked,
    deleteOnRestore: document.getElementById('deleteOnRestore').checked,
    frequentLimit: Math.min(30, Math.max(1, parseInt(document.getElementById('frequentLimit').value, 10) || 8)),
  };
}

let statusTimer;
async function save(changedId) {
  const s = readForm();
  // 语言切换：立即重译本页，并通知其它已打开页面（弹窗/归档页）重新渲染
  if (changedId === 'language' && s.language !== prevLang) {
    I18N.setLang(s.language);
    I18N.applyStatic(document);
    renderAllowlist();
    chrome.runtime.sendMessage({ action: 'languageChanged', language: s.language }).catch(() => {});
    prevLang = s.language;
  }

  await chrome.storage.local.set({ settings: { ...s } });

  const el = document.getElementById('status');
  el.textContent = I18N.t('opt_saved');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 1500);
}

ids.forEach((id) => {
  document.getElementById(id).addEventListener('change', () => save(id));
  document.getElementById(id).addEventListener('input', () => save(id));
});
document.getElementById('language').addEventListener('change', () => save('language'));

// 去重允许列表：新增按钮 + 输入框回车
const allowlistInput = document.getElementById('allowlistInput');
const allowlistAdd = document.getElementById('allowlistAdd');
if (allowlistAdd) allowlistAdd.addEventListener('click', addAllowlistItem);
if (allowlistInput) {
  allowlistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addAllowlistItem(); }
  });
}

// 头部「归档记录」按钮：跳转到归档页（新标签）
const openArchiveBtn = document.getElementById('openArchiveBtn');
if (openArchiveBtn) {
  openArchiveBtn.addEventListener('click', () => {
    navigateTo('archive.html');
  });
}

load();

// 支持开发者：跳转到第三方捐赠平台（新标签页打开，扩展内不处理任何支付）
const afdianBtn = document.getElementById('afdianBtn');
if (afdianBtn) afdianBtn.addEventListener('click', () => chrome.tabs.create({ url: DONATION.afdian }));
