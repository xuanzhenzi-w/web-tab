# Agents.md — 标签管家（Tab Manager）扩展开发规范

> 本文件供参与本项目的 AI Agent（及开发者）查阅，总结项目结构、技术约束与已确立的设计/开发约定。
> 改动代码后请同步更新本文件与项目记忆（`.workbuddy/memory/`）。

---

## 1. 项目简介

- **名称**：标签管家 Tab Manager
- **类型**：Chrome 扩展（Manifest V3）
- **用途**：管理浏览器标签——打开相同链接自动切换、合并同域名标签为标签群组、定时归档长时间未访问的标签、手动归档全部窗口、归档记录可查看/恢复。
- **加载方式**：`chrome://extensions/` 开启开发者模式 → 加载已解压的扩展程序 → 选择 `tab-manager/` 目录。

---

## 2. 目录结构与职责（硬约束）

| 路径 | 职责 | 说明 |
|---|---|---|
| `tab-manager/` | **扩展本体，唯一可加载目录** | 仅放插件运行必需文件：`manifest.json`、`background.js`、`popup.*`、`archive.*`、`options.*`、`icons/`。**禁止**混入构建脚本或打包产物（见 §7、§8）。 |
| `tools/` | 构建 / 生成脚本 | 如 `gen_icons.py`。输出路径已硬编码指向 `tab-manager/icons`。 |
| `web_tab/` 根目录 | 发布 / 分发产物 | 如 `chrome-extension-tab-manager.zip`（skill 包）。 |

---

## 3. 技术栈与架构

- **Manifest V3**：`"manifest_version": 3`，后台用 **service worker**（`background.js`，非持久页面）。
- **权限**（`manifest.json`）：`tabs`、`storage`、`alarms`、`windows`、`tabGroups`。
  - 操作标签群组必须声明 `tabGroups`，否则 `chrome.tabGroups.update` 报错。
- **模块划分**：
  - `background.js`：后台大脑。去重切换、合并同域名群组、定时巡检归档（`chrome.alarms`）、手动归档全部窗口、归档存储、消息中枢（`chrome.runtime.onMessage`）。
  - `popup.*`：工具栏弹窗管理界面（当前窗口标签列表、切换/关闭、合并、归档、跳转）。
  - `archive.*`：归档记录页（按批次成组展示、单条/整批恢复与删除、清空）。
  - `options.*`：设置页（去重开关、定时归档开关与闲置时长、固定标签保护、归档页固定）。
- **存储**：`chrome.storage.local`，键 `archive`（数组，最新在前）、键 `settings`。

---

## 4. 功能规范（已确立，改动前请先理解）

1. **同链接去重**：新开与已有标签完全相同的 URL 时，直接切换到已有标签，不新建。查找范围由设置 `dedupeScope` 控制：`current`（默认）仅在**当前窗口**内查找重复，避免误关其它窗口标签；`all` 跨**所有窗口**查找，任意窗口命中即切换过去（设置页「查找范围」下拉切换）。
   - **去重允许列表 `dedupeAllowlist`**（设置页「打开相同链接」段的多行文本框）：名单内的域名或 URL，重新打开时**跳过切换、照常打开新标签**。支持两种写法——① 纯域名（如 `example.com`，匹配该域名及其所有子域 `sub.example.com`）；② 含路径的完整 URL（精确匹配，协议/路径/查询敏感、忽略尾部斜杠）。空名单不生效。匹配逻辑见 `background.js` 的 `normalizeAllowlistItem` / `canonicalizeUrl` / `isUrlAllowlisted`。
2. **合并同域名 = 标签群组（不是关闭）**：
   - 按「窗口 + 域名」用 `chrome.tabs.group` 收进同一群组；群组标题经 `domainLabel()` 处理（去掉 `www.` 前缀、剥掉无标识后缀如 `com/net/org/cn/co.uk` 等，取品牌主体）；配色按域名轮换。
   - **分组键必须与标题一致**：用 `domainLabel(host)`（品牌主体）作为分组键，而非原始 hostname。否则 `www.x.com` 与 `mail.x.com` 会各自成组、却都显示标题 `x`，同一窗口出现两个同名分组（曾出现的 bug，已修复）。
   - 固定（pinned）标签不参与群组。
   - **解组（ungroup）**：popup 第二排的「解组」按钮调用 background 的 `ungroupWindow(windowId)`，把当前窗口所有 `groupId >= 0` 的标签一次性 `chrome.tabs.ungroup`，只拆群组、不关标签，返回拆掉的标签数。无群组时 toast 提示「当前窗口没有标签组」。
3. **定时归档闲置标签**：`chrome.alarms` 每分钟巡检，超过设置时长（默认 30 分钟）未访问的标签被关闭，链接+标题+图标记入 `archive`。当前激活页与受保护固定标签除外。
   - **归档进度条（popup）**：当 `autoCloseEnabled` 开启时，popup 列表会对每个「可能被归档」的标签（非激活、且未按设置受保护的固定标签）在卡片底部渲染一条进度条。进度 = (now − lastActive) / 闲置时长，与后台 `lastActiveMap`（`chrome.storage.session`）同源；弹窗打开期间每秒刷新（`setInterval(updateBars,1000)`）。颜色随进度变化：靛蓝 → 琥珀（≥70%）→ 红（≥92%），`title` 显示剩余分钟；未开启自动归档或当前激活/受保护固定标签则不显示。
4. **手动归档 = 归档全部窗口**：弹出确认框后，把**所有窗口**所有标签（含 `chrome://newtab`、`chrome-extension://.../archive.html` 等非 http 页面）记录并关闭；**唯一例外**是按设置开关保护的固定标签。
5. **归档记录按批次成组**：每条记录带 `batchId` + 结构化 `batchType`（`auto` / `manual_current` / `manual_window`）+ `batchWindowNum`，展示文案由归档页按当前语言翻译（见 §6）；归档页每批一张卡片，支持整批恢复/删除、单条恢复/删除、清空全部；旧数据（无批次字段或仅有中文 `batchLabel`）单独成组/原样回退兼容。
6. **归档页固定（pinned）设置**：默认开启。手动归档后统一由 background 打开/聚焦/刷新归档页；自动归档仅在归档页已打开时静默刷新（不强制弹新标签，避免每分钟打扰）。
7. **归档页单条点击直接恢复**：点击整行即前台打开恢复；行内「删除」按钮 `stopPropagation` 防止误触恢复。
8. **归档当前窗口（popup 的"归档本窗口"按钮）**：只归档目标窗口标签（一步到位，无二次确认）；**必须先**在当前窗口打开/聚焦固定的归档记录页，再关其余标签——否则窗口标签全部归档后窗口变空被 Chrome 连同关闭。归档页自身、受保护固定标签均不归档；`ensureArchiveTabInWindow(windowId)` 负责把归档页落到目标窗口（不存在则新建、在别的窗口则移入、已存在则聚焦，设置开启"固定"时确保 pinned）。
9. **归档页"最常访问"面板（2026-08-18 新增）**：位于归档页顶部卡片（搜索栏下方），展示归档记录中**按 URL 出现频次**最高的前 N 个网址（N = 设置 `frequentLimit`，默认 8，限幅 1–30，设置页「归档记录页面」段可调）。实现：`archive.js` 的 `computeFrequent(archive, limit)` 统计每个 URL 次数、取最近一次的标题/图标、按 `count desc → lastTs desc` 排序并 `slice(0, limit)`；`renderFrequent` 渲染为紧凑胶囊（favicon + 标题 + `×次数` 角标），点击即新标签打开该网址（**不删除**归档记录）；面板可折叠（点标题栏切换 `.collapsed`，纯界面态不持久化），归档为空或无重复时 `hidden`。该面板基于**完整归档**统计，不受搜索过滤影响。i18n 四语键：`frequent_title` / `frequent_sub` / `opt_frequent_limit_label` / `opt_frequent_limit_suffix`。

---

## 5. UI 设计规范（高级扁平化，统一语言）

> 三套页面（popup / archive / options）使用同一套设计令牌，禁止引入额外配色或风格。

- **设计令牌**（见 `popup.css` 的 `:root`，其余页面保持一致）：
  - 主色 `--primary: #4f46e5`（靛蓝），hover `#4338ca`，浅底 `#eef0ff`；危险 `--danger: #ef4444`。
  - 背景 `--bg: #f6f7f9`，卡片 `--surface: #fff`，边框 `--border: #ebedf2`。
  - 圆角 `--radius: 12px`（卡片）、`--radius-sm: 8px`（控件）；阴影极轻 `0 1px 2px rgba(16,18,30,.04)`。
- **风格**：克制中性色 + 单一靛蓝主色，细边框分层、充足留白、扁平无渐变、无重阴影。
- **字体**：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`；正文 13px，标题 700。
- **响应式（归档页必做）**：页面 `width:100%`，区块居中限宽 `max-width:920px`，横向内边距 `clamp(14px, 4vw, 28px)` 随屏自适应；`@media (max-width:560px)` 下批次头部与操作按钮换行铺满；header 吸顶。
- **交互**：按钮 hover 微变、卡片 hover 轻浮；圆角触区、危险操作用柔红；动效克制。
- **工具栏按钮统一样式（2026-08-17 起）**：六个功能按钮一视同仁，全部使用 `.btn-ghost`（白底 + 细边 `--border` + 深字），**不分主次、不分危险**。原 `btn-primary`（实心靛蓝）/ `btn-soft`（柔和琥珀）两档及对应 `--warning*` 变量已全部清掉，禁止复活「为美观而随机分档」的设计。悬停态统一为「浅蓝底 `--primary-soft` + 蓝色边 + 靛蓝字」，靠 hover 反馈即可，不再用静态色块传达语义。
  - 留白是高级感的来源——同样的白底细边比三色拼贴更耐看；动作的主次留给文案层级与位置（上下两排）即可。
  - 未来若真要给主操作加视觉权重，优先靠 **位置提升**（挪到第一格、独占）或 **持续性态**（active 态高亮），而非颜色分档。
- **工具栏按钮图标**：六个功能按钮（合并同域名 / 归档本窗口 / 归档全部窗口 / 解组 / 归档记录 / 设置）各带一个内联描边 SVG（viewBox 24×24，`stroke="currentColor"`、`stroke-width:1.7`、圆角端点的线性风格），图标随按钮文字色（currentColor）变化、hover 同步加深；图标语义需直观映射功能（如合并=两路汇聚、解组=虚线组框+方块移出、归档本窗口=窗口+向下箭头、归档全部=层叠窗口+向下箭头、归档记录=清单+时钟角标、设置=齿轮）。按钮文字放到 `<span class="btn-label">` 内（避免 `I18N.applyStatic` 把 `data-i18n` 写到 button 上覆盖 SVG 子节点）。
- **按钮悬停说明（已移除，2026-08-17）**：原自定义 `#tip` 气泡与 `initTooltips()`、`data-i18n-title` 属性已全部删除；工具栏按钮不再显示任何悬停/聚焦说明文案（含原生 title）。若日后要恢复悬停提示，需重新加回 `#tip` 节点 + `initTooltips()` 并在按钮上恢复 `data-i18n-title`。

---

## 6. 多语言（i18n）规范

- **设计取舍**：界面语言由用户在设置页自由切换、默认中文，因此**不使用** Chrome 内置 `_locales`（它只能跟随系统/浏览器语言，无法做到「用户自由切换且默认中文」）。改为自建 settings 驱动的翻译层。
- **语言与存储**：支持 `zh_CN`（中文，默认）、`en`（English）、`ja`（日本語）、`ko`（한국어）四语；当前语言存于 `settings.language`（默认 `zh_CN`）。切换后由 `options.js` 保存并广播 `languageChanged`，已打开的 popup / archive 页面实时重渲染。
- **翻译层 `i18n.js`**（全局前置脚本，所有页面 HTML `<head>` 第一个 `<script>`）：
  - `I18N.t(key, params)`：读取当前语言词典，支持 `{n}` 等插值（如 `"{n} 分钟前"` → `"{n} minutes ago"`）；缺失 key 回退 `zh_CN`。
  - `I18N.applyStatic(root)`：扫描 `root` 下带 `data-i18n*` 属性的元素注入文案。**新增/修改静态文案必须用下列属性声明，禁止在 HTML 写死文案**：
    - `data-i18n` → 元素 `textContent`
    - `data-i18n-title` → 元素 `title`
    - `data-i18n-ph` → 输入框 `placeholder`
    - `data-i18n-html` → 元素 `innerHTML`（用于需内嵌 `<strong>/<em>` 的强调文案）
  - 页面初始化：`await I18N.init()` 加载语言后再渲染动态列表；并监听 `chrome.runtime.onMessage` 的 `languageChanged` 重渲染。
- **动态文案规则**：所有运行时拼接的标签、提示、批量操作按钮等一律走 `I18N.t(key, {...})`，禁止在 JS 字符串里硬编码任一语种文案。改动或新增 UI 文案时，必须同步补全四语词典条目，缺失则回退中文（保证不空白但不算完成）。
- **日期时间本地化**：归档时间等用 `toLocaleString(I18N.localeTag)` 跟随所选语言显示，不要写死格式。
- **后台归档批次结构化（与 i18n 配合）**：`background.js` 归档记录不再写死中文 `batchLabel`，而是存结构化 `batchType`（`auto` | `manual_current` | `manual_window`）+ `batchWindowNum`，由归档页按**当前语言**调用 `I18N.t` 翻译展示；旧数据若仅有 `batchLabel` 中文字段则原样回退显示（兼容）。新增批次类型须同步补四语词典。

---

## 7. 图标规范

- **生成脚本**：`tools/gen_icons.py`（纯标准库，无需 PIL，4×4 超采样抗锯齿），运行后覆盖 `tab-manager/icons/`。
- **设计**：高级扁平化「标签页徽章」——靛蓝（`#4F46E5`）圆角方底 + 居中纯白标签页符号（圆角矩形 + 顶部经典 tab 小三角 + 内部靛蓝标题条），对称、留白得当、主题突出。
- **易错点（务必保留）**：
  1. 圆角方内、无标签覆盖区域须填靛蓝底，不能误判为透明（否则只剩白符号飘在透明里）。
  2. 标签坐标判定前必须先 `×size` 换算为像素，否则整片标签被算在画布外。
- **尺寸**：`icons/icon16.png`、`icon48.png`、`icon128.png` 三档。

---

## 8. Skill 模板同步与打包（复用机制）

项目已沉淀为可复用 Skill：`chrome-extension-tab-manager`，模板位于
`C:/Users/45210/.workbuddy/skills/chrome-extension-tab-manager/assets/template/`。

- **每次改动 `tab-manager/` 内的插件文件后**，须同步对应文件到上述 `template/` 目录，并重新打包：
  ```
  python <skill-creator>/scripts/package_skill.py C:/Users/45210/.workbuddy/skills/chrome-extension-tab-manager
  ```
  打包产物 `chrome-extension-tab-manager.zip` 落到 `web_tab/` 根目录。
- 目的：保证日后从 skill 复用的是最新逻辑，不会把旧行为（如"合并=关闭标签"）带回来。

---

## 9. 已知坑

- **`__pycache__` 导致加载失败**：在 `tab-manager/` 内直接跑 Python 会生成 `__pycache__`，Chrome 禁止扩展目录含下划线开头文件 → 报 `Cannot load extension with file or directory name __pycache__`。**务必在 `tab-manager/` 之外（如 `tools/`）运行 `gen_icons.py`**，或跑完立即 `rm -rf tab-manager/__pycache__`。
- **popup 中 `currentWindow` 陷阱**：弹窗内 `chrome.tabs.query({currentWindow:true})` 可能解析成弹窗自身窗口。做法：首次加载锁定 `targetWindowId`，后续查询固定用 `windowId`。
- **归档页实时性**：自动归档若每次都强制开新标签会每分钟打扰用户；改为仅当归档页已打开时静默刷新。
- **归档当前窗口须先开归档页**：`archiveCurrentWindow` 必须先在当前窗口打开（或移入/聚焦）固定的归档记录页，**再**关掉其余标签；否则当前窗口标签被全部归档后，窗口因变空而连同关闭，归档页只能落到别的窗口。`ensureArchiveTabInWindow(windowId)` 保证归档页落在目标窗口并排除在"待关闭列表"之外（归档页自身、受保护固定标签均不归档）。

---

## 10. 改动验证清单

1. JS 语法：`node --check background.js && node --check popup.js && node --check archive.js && node --check options.js`（用受管 Node `22.22.2`）。
2. manifest 合法：`node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"`。
3. 图标：在 `tools/` 下运行 `gen_icons.py` 刷新；勿在 `tab-manager/` 内运行。
4. 同步 skill 模板 + 重新打包 zip（见 §8）。
5. 浏览器内 `chrome://extensions/` 点插件「重新加载」生效。
6. 多语言：各页面 JS 仅注释可含中文硬编码（`grep -nP '[\x{4e00}-\x{9fff}]' popup.js` 应只剩注释）；新增/改动文案须补四语词典（见 §6）。

---

_最后更新：2026-08-16_
