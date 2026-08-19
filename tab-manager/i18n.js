// i18n.js —— 标签管家 多语言层（由 settings.language 驱动，默认中文）
// 支持：中文(zh_CN) / 英语(en) / 日语(ja) / 韩语(ko)
// 静态文案通过 HTML 的 data-i18n / data-i18n-title / data-i18n-ph / data-i18n-html 声明，
// 动态文案通过 I18N.t(key, params) 取用。语言变更后调用 I18N.applyStatic(document) 重刷静态文案。

// 捐赠入口链接（集中配置：替换为你自己的主页即可，各页面共用）
// 国内用户走爱发电（微信 / 支付宝）
const DONATION = {
  afdian: 'https://afdian.com/a/xuanzhengzi',     // 爱发电主页
};

const I18N = (function () {
  const SUPPORTED = ['zh_CN', 'en', 'ja', 'ko'];
  const DEFAULT_LANG = 'zh_CN';

  // 语言 -> BCP47 区域标签（用于 toLocaleString 本地化日期时间）
  const LOCALE_TAG = {
    zh_CN: 'zh-CN',
    en: 'en-US',
    ja: 'ja-JP',
    ko: 'ko-KR',
  };

  const MESSAGES = {
    zh_CN: {
      appName: '标签管家',
      popup_count_loading: '加载中…',
      popup_count: '当前窗口 {n} 个标签',
      btn_merge: '合并同域名',
      btn_merge_title: '把同一网站的多个标签归到同一个标签群组（不会关闭任何标签）',
      btn_archive_win: '归档本窗口',
      btn_archive_win_title: '把当前窗口打开的标签页（含空白新标签、归档页等）记录到归档并关闭，无需确认',
      btn_archive_all: '归档全部窗口',
      btn_archive_all_title: '把所有窗口打开的标签页（含空白新标签、归档页等）记录到归档并关闭，无需确认',
      btn_ungroup: '解组',
      btn_ungroup_title: '将当前窗口的所有域名标签组解散为单独标签',
      btn_archive: '归档记录',
      btn_archive_title: '查看被自动归档的标签',
      btn_options: '设置',
      btn_options_title: '设置',
      close_btn_title: '关闭标签',
      bar_over: '已超过归档阈值，等待下次巡检关闭',
      bar_soon: '约 {n} 分钟后自动归档',
      toast_grouped: '已为 {n} 个域名建立标签群组',
      toast_ungrouped: '已解散 {n} 个标签组',
      toast_no_ungroup: '当前窗口没有标签组',
      toast_no_group: '没有可归组的同域名标签',
      toast_archived_win: '已归档并关闭当前窗口 {n} 个标签',
      toast_archived_none: '没有可归档的标签（固定标签受保护）',
      toast_archived_all: '已归档并关闭全部窗口 {n} 个标签',

      opt_title: '标签管家 · 设置',
      sec_dedupe: '打开相同链接',
      opt_dedupe_desc: '<strong>自动切换到已打开的标签</strong><em>当新打开的页面网址已经存在于某个标签时，直接切换到那个标签并关闭新标签。</em>',
      opt_dedupe_scope_label: '查找范围',
      opt_dedupe_scope_current: '仅当前窗口',
      opt_dedupe_scope_all: '所有窗口',
      opt_allowlist_label: '不切换允许列表',
      opt_allowlist_desc: '<strong>去重允许列表</strong><em>名单内的域名或网址，重新打开时不会切换到已有标签，而是正常打开新标签。可填域名（如 example.com，含其子域）或完整网址（含具体路径），逐条添加。</em>',
      opt_allowlist_ph: 'example.com 或 https://docs.example.com/edit',
      opt_allowlist_add: '新增',
      opt_allowlist_del_title: '删除该条目',
      opt_allowlist_empty: '暂无允许列表条目',
      sec_autoclose: '定时关闭闲置标签',
      opt_autoclose_desc: '<strong>启用定时归档</strong><em>长时间没有访问（未被切换到前台）的标签会被自动关闭，并归档其链接与标题。</em>',
      opt_autoclose_prefix: '闲置超过',
      opt_autoclose_suffix: '分钟后关闭（当前激活的标签与固定标签不会被关闭）',
      opt_protect_desc: '<strong>保护固定标签</strong><em>勾选后，被固定的（pinned）标签永不被自动关闭。</em>',
      sec_archive: '归档记录页面',
      opt_pin_desc: '<strong>固定归档记录页面</strong><em>开启后：手动归档会自动打开归档页并固定为标签；自动归档时若归档页已打开，会自动刷新其内容。</em>',
      opt_delete_desc: '<strong>恢复时删除归档记录</strong><em>开启后：在归档记录页点击「恢复」或整条记录时，会同时删除该条归档记录（无需手动清理）；关闭则只恢复、保留记录。</em>',
      sec_language: '界面语言',
      opt_language_label: '界面语言',
      opt_saved: '设置已保存 ✓',

      arch_title: '归档记录',
      arch_refresh: '刷新',
      arch_refresh_title: '刷新归档列表',
      arch_search_ph: '搜索标题或网址，多个关键词空格分隔',
      arch_regex: '正则',
      arch_regex_title: '开启后将搜索内容视为 JavaScript 正则表达式',
      arch_count_match: '匹配 {matched} 条 · 共 {total} 条',
      arch_count_total: '共 {total} 条 · {groups} 批',
      arch_empty: '暂无归档记录。闲置标签被自动关闭、或手动归档本窗口后，会按批次归档到这里。',
      arch_notfound: '未找到与“{q}”匹配的归档记录。',
      arch_regex_invalid: '正则表达式语法无效',
      frequent_title: '最常访问',
      frequent_sub: '归档中出现最多的 {n} 个网址',
      opt_frequent_limit_label: '最常访问数量',
      opt_frequent_limit_suffix: '个（归档页展示最常出现的网址）',
      batch_auto: '闲置自动归档',
      batch_manual_current: '手动归档 · 本窗口',
      batch_manual_window: '手动归档 · 窗口 {num}',
      batch_archived_at: '归档于 {time}',
      batch_sub: '{count} 个标签 · {time}',
      batch_restore_all: '恢复全部',
      batch_restore_all_title: '重新打开本批所有标签',
      batch_del: '删除该批',
      batch_del_title: '删除本批次所有归档',
      confirm_del_batch: '确定删除本批次 {n} 条归档？此操作不可恢复。',
      item_restore: '恢复',
      item_restore_title: '在新标签打开',
      item_del: '删除',
      item_del_title: '删除这条归档',
      item_row_title: '点击打开恢复该标签',
      suffix_and_del: '并删除该记录',
      suffix_and_del_batch: '并删除该批记录',
      toast_reopened: '已重新打开',
      toast_reopened_batch: '已重新打开 {n} 个标签',
      toast_batch_deleted: '已删除该批次',
      toast_updated: '归档记录已更新',

      stats_title: '归档统计',
      stats_total_records: '归档记录总数',
      stats_total_domains: '归档域名总数',
      stats_total_days: '归档天数',
      stats_by_type: '归档来源分布',
      stats_type_auto: '闲置自动归档',
      stats_type_manual: '手动归档',
      stats_by_domain: '各域名记录数',
      stats_by_day: '每日归档记录数',
      stats_back: '返回归档',
      stats_loading: '加载中…',
      stats_empty: '暂无归档记录。闲置标签被自动关闭、或手动归档本窗口后，会按批次归档到这里。',
      stats_local_pages: '本地页面',
      stats_no_data: '暂无数据',
      stats_records: '条',
      stats_domains: '个域名',
      stats_day_records: '{n} 条',
      stats_more_domains: '及另外 {n} 个域名',

      sec_support: '支持开发者',
      opt_support_desc: '<strong>喜欢标签管家？</strong><em>它是一个免费、开源、不上传任何数据的扩展。若您觉得好用，欢迎通过下方爱发电链接自愿支持开发，金额随意，且完全不影响任何功能。</em>',
      support_afdian: '爱发电',
      donate_prompt: '喜欢标签管家？',
    },

    en: {
      appName: 'Tab Manager',
      popup_count_loading: 'Loading…',
      popup_count: 'Current window: {n} tabs',
      btn_merge: 'Merge by domain',
      btn_merge_title: 'Group tabs from the same site into one tab group (no tabs will be closed)',
      btn_archive_win: 'Archive this window',
      btn_archive_win_title: 'Record and close all tabs in the current window (including blank/new tabs and the archive page), no confirmation needed',
      btn_archive_all: 'Archive all windows',
      btn_archive_all_title: 'Record and close all tabs across all windows (including blank/new tabs and the archive page), no confirmation needed',
      btn_ungroup: 'Ungroup',
      btn_ungroup_title: 'Dissolve all domain tab groups in this window into individual tabs',
      btn_archive: 'Archive',
      btn_archive_title: 'View automatically archived tabs',
      btn_options: 'Settings',
      btn_options_title: 'Settings',
      close_btn_title: 'Close tab',
      bar_over: 'Past the archive threshold; waiting for the next sweep to close',
      bar_soon: 'Auto-archived in about {n} min',
      toast_grouped: 'Created tab groups for {n} domains',
      toast_ungrouped: 'Ungrouped {n} tabs',
      toast_no_ungroup: 'No tab groups in this window',
      toast_no_group: 'No same-domain tabs to group',
      toast_archived_win: 'Archived and closed {n} tabs in this window',
      toast_archived_none: 'No tabs to archive (pinned tabs protected)',
      toast_archived_all: 'Archived and closed {n} tabs across all windows',

      opt_title: 'Tab Manager · Settings',
      sec_dedupe: 'Duplicate links',
      opt_dedupe_desc: '<strong>Auto-switch to the open tab</strong><em>When a new page’s URL already exists in a tab, switch to that tab and close the new one.</em>',
      opt_dedupe_scope_label: 'Search scope',
      opt_dedupe_scope_current: 'Current window only',
      opt_dedupe_scope_all: 'All windows',
      opt_allowlist_label: 'Skip-switch allowlist',
      opt_allowlist_desc: '<strong>Dedupe allowlist</strong><em>Domains or URLs listed here will NOT switch to an existing tab when reopened; a new tab opens normally. Add entries one by one: a domain (e.g. example.com, covers its subdomains) or a full URL (with a specific path).</em>',
      opt_allowlist_ph: 'example.com or https://docs.example.com/edit',
      opt_allowlist_add: 'Add',
      opt_allowlist_del_title: 'Remove this entry',
      opt_allowlist_empty: 'No allowlist entries yet',
      sec_autoclose: 'Auto-archive idle tabs',
      opt_autoclose_desc: '<strong>Enable scheduled archiving</strong><em>Tabs you haven’t visited (brought to the foreground) for a long time are automatically closed, and their links and titles are archived.</em>',
      opt_autoclose_prefix: 'Idle for over',
      opt_autoclose_suffix: 'minutes, then close (the active tab and pinned tabs are never closed)',
      opt_protect_desc: '<strong>Protect pinned tabs</strong><em>When checked, pinned tabs are never auto-closed.</em>',
      sec_archive: 'Archive page',
      opt_pin_desc: '<strong>Pin the archive page</strong><em>When on: manual archiving opens the archive page and pins it as a tab; auto-archiving refreshes its content if already open.</em>',
      opt_delete_desc: '<strong>Delete record on restore</strong><em>When on: clicking “Restore” or a whole record on the archive page also deletes that record (no manual cleanup); off restores only and keeps the record.</em>',
      sec_language: 'Interface language',
      opt_language_label: 'Interface language',
      opt_saved: 'Settings saved ✓',

      arch_title: 'Archive',
      arch_refresh: 'Refresh',
      arch_refresh_title: 'Refresh the archive list',
      arch_search_ph: 'Search title or URL; separate multiple keywords with spaces',
      arch_regex: 'Regex',
      arch_regex_title: 'Treat the search input as a JavaScript regular expression',
      arch_count_match: 'Matched {matched} · total {total}',
      arch_count_total: 'Total {total} · {groups} batches',
      arch_empty: 'No archive records yet. Idle tabs auto-closed, or a window manually archived, are grouped here by batch.',
      arch_notfound: 'No archive records matching “{q}”.',
      arch_regex_invalid: 'Invalid regular expression syntax',
      frequent_title: 'Most visited',
      frequent_sub: 'Top {n} URLs by archive frequency',
      opt_frequent_limit_label: 'Most visited count',
      opt_frequent_limit_suffix: 'URLs shown on the archive page (most frequent)',
      batch_auto: 'Idle auto-archive',
      batch_manual_current: 'Manual archive · This window',
      batch_manual_window: 'Manual archive · Window {num}',
      batch_archived_at: 'Archived at {time}',
      batch_sub: '{count} tabs · {time}',
      batch_restore_all: 'Restore all',
      batch_restore_all_title: 'Reopen all tabs in this batch',
      batch_del: 'Delete batch',
      batch_del_title: 'Delete all archives in this batch',
      confirm_del_batch: 'Delete {n} archives in this batch? This cannot be undone.',
      item_restore: 'Restore',
      item_restore_title: 'Open in a new tab',
      item_del: 'Delete',
      item_del_title: 'Delete this archive',
      item_row_title: 'Click to open and restore this tab',
      suffix_and_del: 'and delete this record',
      suffix_and_del_batch: 'and delete this batch',
      toast_reopened: 'Reopened',
      toast_reopened_batch: 'Reopened {n} tabs',
      toast_batch_deleted: 'Batch deleted',
      toast_updated: 'Archive updated',

      stats_title: 'Archive stats',
      stats_total_records: 'Total records',
      stats_total_domains: 'Unique domains',
      stats_total_days: 'Active days',
      stats_by_type: 'By source',
      stats_type_auto: 'Idle auto-archive',
      stats_type_manual: 'Manual archive',
      stats_by_domain: 'Top domains',
      stats_by_day: 'Daily archived',
      stats_back: 'Back to archive',
      stats_loading: 'Loading…',
      stats_empty: 'No archive records yet. Idle tabs auto-closed, or a window manually archived, are grouped here by batch.',
      stats_local_pages: 'Local pages',
      stats_no_data: 'No data',
      stats_records: 'records',
      stats_domains: 'domains',
      stats_day_records: '{n}',
      stats_more_domains: 'and {n} more domains',

      sec_support: 'Support the developer',
      opt_support_desc: '<strong>Enjoying Tab Manager?</strong><em>It is free, open-source, and sends no data anywhere. If you find it useful, you can optionally support development via Afdian — any amount, voluntary, and it never affects any feature.</em>',
      support_afdian: 'Afdian',
      donate_prompt: 'Enjoying Tab Manager?',
    },

    ja: {
      appName: 'タブマネージャー',
      popup_count_loading: '読み込み中…',
      popup_count: '現在のウィンドウ: タブ {n} 件',
      btn_merge: 'ドメインで統合',
      btn_merge_title: '同じサイトのタブを1つのタブグループにまとめます（タブは閉じません）',
      btn_archive_win: 'このウィンドウをアーカイブ',
      btn_archive_win_title: '現在のウィンドウのすべてのタブ（空白タブやアーカイブページなどを含む）を記録して閉じます。確認は不要です',
      btn_archive_all: 'すべてのウィンドウをアーカイブ',
      btn_archive_all_title: 'すべてのウィンドウのタブ（空白タブやアーカイブページなどを含む）を記録して閉じます。確認は不要です',
      btn_ungroup: 'グループ解除',
      btn_ungroup_title: 'このウィンドウのすべてのドメイン タブ グループを個別のタブに解除します',
      btn_archive: 'アーカイブ',
      btn_archive_title: '自動アーカイブされたタブを表示',
      btn_options: '設定',
      btn_options_title: '設定',
      close_btn_title: 'タブを閉じる',
      bar_over: 'アーカイブ閾値を超過。次回の監視で閉じます',
      bar_soon: '約 {n} 分後に自動アーカイブ',
      toast_grouped: '{n} 個のドメインのタブグループを作成しました',
      toast_ungrouped: '{n} 個のタブグループを解除しました',
      toast_no_ungroup: 'このウィンドウにはタブグループがありません',
      toast_no_group: 'グループ化できる同一ドメインのタブはありません',
      toast_archived_win: 'このウィンドウのタブ {n} 件をアーカイブして閉じました',
      toast_archived_none: 'アーカイブできるタブはありません（ピン留めタブは保護）',
      toast_archived_all: 'すべてのウィンドウのタブ {n} 件をアーカイブして閉じました',

      opt_title: 'タブマネージャー · 設定',
      sec_dedupe: '重複するリンク',
      opt_dedupe_desc: '<strong>開いているタブに自動切替</strong><em>新しいページのURLが既存のタブと同じ場合、そのタブに切り替えて新しいタブを閉じます。</em>',
      opt_dedupe_scope_label: '検索範囲',
      opt_dedupe_scope_current: '現在のウィンドウのみ',
      opt_dedupe_scope_all: 'すべてのウィンドウ',
      opt_allowlist_label: '切替除外リスト',
      opt_allowlist_desc: '<strong>重複除外リスト</strong><em>ここに記載したドメインやURLは再び開いても既存のタブに切り替わらず、新しいタブが通常通り開きます。1件ずつ追加：ドメイン（例：example.com、サブドメインも含む）または完全なURL（具体的なパス付き）を入力します。</em>',
      opt_allowlist_ph: 'example.com または https://docs.example.com/edit',
      opt_allowlist_add: '追加',
      opt_allowlist_del_title: 'この項目を削除',
      opt_allowlist_empty: 'リストは空です',
      sec_autoclose: '放置タブの自動アーカイブ',
      opt_autoclose_desc: '<strong>定期アーカイブを有効化</strong><em>長時間アクセス（最前面に切り替え）されていないタブは自動的に閉じられ、リンクとタイトルがアーカイブされます。</em>',
      opt_autoclose_prefix: '放置時間が',
      opt_autoclose_suffix: '分を超えると閉じる（アクティブなタブとピン留めタブは閉じられません）',
      opt_protect_desc: '<strong>ピン留めタブを保護</strong><em>チェックすると、ピン留めされたタブは自動で閉じられなくなります。</em>',
      sec_archive: 'アーカイブページ',
      opt_pin_desc: '<strong>アーカイブページをピン留め</strong><em>オンの場合：手動アーカイブ時にアーカイブページを開きタブとしてピン留めします。自動アーカイブ時は開いていれば内容を更新します。</em>',
      opt_delete_desc: '<strong>復元時に記録を削除</strong><em>オンの場合：アーカイブページで「復元」やレコード全体をクリックすると、その記録も削除されます（手動削除不要）。オフの場合は復元のみで記録は残ります。</em>',
      sec_language: '表示言語',
      opt_language_label: '表示言語',
      opt_saved: '設定を保存しました ✓',

      arch_title: 'アーカイブ',
      arch_refresh: '更新',
      arch_refresh_title: 'アーカイブリストを更新',
      arch_search_ph: 'タイトルやURLで検索（複数キーワードは空白で区切る）',
      arch_regex: '正規表現',
      arch_regex_title: '検索内容をJavaScriptの正規表現として扱います',
      arch_count_match: '一致 {matched} 件 · 全 {total} 件',
      arch_count_total: '全 {total} 件 · {groups} バッチ',
      arch_empty: 'アーカイブ記録はまだありません。放置タブが自動で閉じられたり、ウィンドウを手動アーカイブすると、バッチごとにここに保存されます。',
      arch_notfound: '「{q}」に一致するアーカイブ記録が見つかりません。',
      arch_regex_invalid: '正規表現の構文が無効です',
      frequent_title: 'よく使う',
      frequent_sub: 'アーカイブで最も多い {n} 個のURL',
      opt_frequent_limit_label: 'よく使う件数',
      opt_frequent_limit_suffix: '件（アーカイブページに最も多いURLを表示）',
      batch_auto: '放置タブの自動アーカイブ',
      batch_manual_current: '手動アーカイブ · このウィンドウ',
      batch_manual_window: '手動アーカイブ · ウィンドウ {num}',
      batch_archived_at: 'アーカイブ日時 {time}',
      batch_sub: 'タブ {count} 件 · {time}',
      batch_restore_all: 'すべて復元',
      batch_restore_all_title: 'このバッチのすべてのタブを再び開く',
      batch_del: 'バッチを削除',
      batch_del_title: 'このバッチのすべてのアーカイブを削除',
      confirm_del_batch: 'このバッチのアーカイブ {n} 件を削除しますか？この操作は取り消せません。',
      item_restore: '復元',
      item_restore_title: '新しいタブで開く',
      item_del: '削除',
      item_del_title: 'このアーカイブを削除',
      item_row_title: 'クリックでこのタブを開いて復元',
      suffix_and_del: 'し、この記録を削除',
      suffix_and_del_batch: 'し、このバッチを削除',
      toast_reopened: '再び開きました',
      toast_reopened_batch: '{n} 件のタブを再び開きました',
      toast_batch_deleted: 'バッチを削除しました',
      toast_updated: 'アーカイブを更新しました',

      stats_title: 'アーカイブ統計',
      stats_total_records: 'アーカイブ総数',
      stats_total_domains: 'ドメイン数',
      stats_total_days: 'アーカイブ日数',
      stats_by_type: '取得元の内訳',
      stats_type_auto: '放置タブの自動アーカイブ',
      stats_type_manual: '手動アーカイブ',
      stats_by_domain: 'ドメイン別件数',
      stats_by_day: '日別アーカイブ件数',
      stats_back: 'アーカイブへ戻る',
      stats_loading: '読み込み中…',
      stats_empty: 'アーカイブ記録はまだありません。放置タブが自動で閉じられたり、ウィンドウを手動アーカイブすると、バッチごとにここに保存されます。',
      stats_local_pages: 'ローカルページ',
      stats_no_data: 'データなし',
      stats_records: '件',
      stats_domains: 'ドメイン',
      stats_day_records: '{n} 件',
      stats_more_domains: 'ほか {n} ドメイン',

      sec_support: '開発を応援する',
      opt_support_desc: '<strong>タブマネージャーを気に入っていただけましたか？</strong><em>本拡張は無料でオープンソース、データを外部に送信しません。役立つと思われたら、以下の愛発電リンクで開発を任意に支援していただけると嬉しいです。金額は自由で、機能への影響はありません。</em>',
      support_afdian: '愛発電',
      donate_prompt: 'タブマネージャーを気に入りましたか？',
    },

    ko: {
      appName: '탭 매니저',
      popup_count_loading: '불러오는 중…',
      popup_count: '현재 창: 탭 {n}개',
      btn_merge: '도메인별 묶기',
      btn_merge_title: '같은 사이트의 탭을 하나의 탭 그룹으로 묶습니다(탭은 닫지 않음)',
      btn_archive_win: '이 창 보관',
      btn_archive_win_title: '현재 창의 모든 탭(빈 탭, 보관 페이지 등 포함)을 기록하고 닫습니다. 확인 불필요',
      btn_archive_all: '모든 창 보관',
      btn_archive_all_title: '모든 창의 탭(빈 탭, 보관 페이지 등 포함)을 기록하고 닫습니다. 확인 불필요',
      btn_ungroup: '그룹 해제',
      btn_ungroup_title: '이 창의 모든 도메인 탭 그룹을 개별 탭으로 해제합니다',
      btn_archive: '보관 목록',
      btn_archive_title: '자동 보관된 탭 보기',
      btn_options: '설정',
      btn_options_title: '설정',
      close_btn_title: '탭 닫기',
      bar_over: '보관 임계값을 초과하여 다음 검사 시 닫힙니다',
      bar_soon: '약 {n}분 후 자동 보관',
      toast_grouped: '{n}개 도메인의 탭 그룹을 만들었습니다',
      toast_ungrouped: '{n}개의 탭 그룹을 해제했습니다',
      toast_no_ungroup: '이 창에 탭 그룹이 없습니다',
      toast_no_group: '묶을 수 있는 동일 도메인 탭이 없습니다',
      toast_archived_win: '이 창의 탭 {n}개를 보관하고 닫았습니다',
      toast_archived_none: '보관할 탭이 없습니다(고정 탭 보호)',
      toast_archived_all: '모든 창의 탭 {n}개를 보관하고 닫았습니다',

      opt_title: '탭 매니저 · 설정',
      sec_dedupe: '중복 링크',
      opt_dedupe_desc: '<strong>열린 탭으로 자동 전환</strong><em>새 페이지의 URL이 이미 탭에 있으면 해당 탭으로 전환하고 새 탭을 닫습니다.</em>',
      opt_dedupe_scope_label: '찾기 범위',
      opt_dedupe_scope_current: '현재 창만',
      opt_dedupe_scope_all: '모든 창',
      opt_allowlist_label: '전환 제외 목록',
      opt_allowlist_desc: '<strong>중복 전환 제외 목록</strong><em>목록의 도메인이나 URL은 다시 열어도 기존 탭으로 전환되지 않고 새 탭이 정상적으로 열립니다. 하나씩 추가: 도메인(예: example.com, 하위 도메인 포함) 또는 전체 URL(구체적 경로 포함)을 입력하세요.</em>',
      opt_allowlist_ph: 'example.com 또는 https://docs.example.com/edit',
      opt_allowlist_add: '추가',
      opt_allowlist_del_title: '이 항목 삭제',
      opt_allowlist_empty: '목록이 비어 있습니다',
      sec_autoclose: '유휴 탭 자동 보관',
      opt_autoclose_desc: '<strong>예약 보관 사용</strong><em>오랫동안 방문(앞으로 전환)하지 않은 탭은 자동으로 닫히고 링크와 제목이 보관됩니다.</em>',
      opt_autoclose_prefix: '유휴 시간',
      opt_autoclose_suffix: '분 초과 시 닫기(활성 탭과 고정 탭은 닫히지 않음)',
      opt_protect_desc: '<strong>고정 탭 보호</strong><em>선택하면 고정된(pinned) 탭은 자동으로 닫히지 않습니다.</em>',
      sec_archive: '보관 페이지',
      opt_pin_desc: '<strong>보관 페이지 고정</strong><em>켜면: 수동 보관 시 보관 페이지를 열고 탭으로 고정합니다. 자동 보관 시 이미 열려 있으면 내용을 새로고침합니다.</em>',
      opt_delete_desc: '<strong>복원 시 기록 삭제</strong><em>켜면: 보관 페이지에서 “복원”이나 레코드 전체를 클릭하면 해당 기록도 삭제됩니다(수동 정리 불필요). 끄면 복원만 하고 기록은 남깁니다.</em>',
      sec_language: '인터페이스 언어',
      opt_language_label: '인터페이스 언어',
      opt_saved: '설정을 저장했습니다 ✓',

      arch_title: '보관 목록',
      arch_refresh: '새로고침',
      arch_refresh_title: '보관 목록 새로고침',
      arch_search_ph: '제목이나 URL 검색, 여러 키워드는 공백으로 구분',
      arch_regex: '정규식',
      arch_regex_title: '검색 내용을 JavaScript 정규식으로 취급합니다',
      arch_count_match: '일치 {matched}건 · 전체 {total}건',
      arch_count_total: '전체 {total}건 · {groups}묶음',
      arch_empty: '보관 기록이 없습니다. 유휴 탭이 자동으로 닫히거나 창을 수동 보관하면 배치별로 여기에 저장됩니다.',
      arch_notfound: '“{q}”와(과) 일치하는 보관 기록이 없습니다.',
      arch_regex_invalid: '정규식 구문이 잘못되었습니다',
      frequent_title: '자주 방문',
      frequent_sub: '아카이브에서 가장 많이 나타난 {n}개 URL',
      opt_frequent_limit_label: '자주 방문 개수',
      opt_frequent_limit_suffix: '개（아카이브 페이지에 가장 많이 나타난 URL 표시）',
      batch_auto: '유휴 자동 보관',
      batch_manual_current: '수동 보관 · 이 창',
      batch_manual_window: '수동 보관 · 창 {num}',
      batch_archived_at: '보관 시각 {time}',
      batch_sub: '탭 {count}개 · {time}',
      batch_restore_all: '전체 복원',
      batch_restore_all_title: '이 배치의 모든 탭 다시 열기',
      batch_del: '배치 삭제',
      batch_del_title: '이 배치의 모든 보관 삭제',
      confirm_del_batch: '이 배치의 보관 {n}건을 삭제할까요? 되돌릴 수 없습니다.',
      item_restore: '복원',
      item_restore_title: '새 탭에서 열기',
      item_del: '삭제',
      item_del_title: '이 보관 삭제',
      item_row_title: '클릭하여 이 탭 열고 복원',
      suffix_and_del: '하고 이 기록 삭제',
      suffix_and_del_batch: '하고 이 배치 삭제',
      toast_reopened: '다시 열었습니다',
      toast_reopened_batch: '탭 {n}개를 다시 열었습니다',
      toast_batch_deleted: '배치를 삭제했습니다',
      toast_updated: '보관 목록을 업데이트했습니다',

      stats_title: '보관 통계',
      stats_total_records: '전체 보관 건수',
      stats_total_domains: '도메인 수',
      stats_total_days: '보관 일수',
      stats_by_type: '출처별 분포',
      stats_type_auto: '유휴 자동 보관',
      stats_type_manual: '수동 보관',
      stats_by_domain: '도메인별 건수',
      stats_by_day: '일별 보관 건수',
      stats_back: '보관 목록으로',
      stats_loading: '불러오는 중…',
      stats_empty: '보관 기록이 없습니다. 유휴 탭이 자동으로 닫히거나 창을 수동 보관하면 배치별로 여기에 저장됩니다.',
      stats_local_pages: '로컬 페이지',
      stats_no_data: '데이터 없음',
      stats_records: '건',
      stats_domains: '도메인',
      stats_day_records: '{n}건',
      stats_more_domains: '외 {n}개 도메인',

      sec_support: '개발자 후원',
      opt_support_desc: '<strong>탭 매니저가 마음에 드시나요?</strong><em>이 확장은 무료·오픈소스이며 데이터를 외부로 전송하지 않습니다. 도움이 되셨다면 아래 아이디안 링크로 개발을 자유롭게 후원해 주세요. 금액은 상관없으며 어떤 기능에도 영향이 없습니다.</em>',
      support_afdian: '아이디안',
      donate_prompt: '탭 매니저가 마음에 드시나요?',
    },
  };

  let currentLang = DEFAULT_LANG;

  async function loadLang() {
    try {
      const { settings } = await chrome.storage.local.get('settings');
      const lang = settings && settings.language;
      currentLang = (lang && MESSAGES[lang]) ? lang : DEFAULT_LANG;
    } catch (e) {
      currentLang = DEFAULT_LANG;
    }
    return currentLang;
  }

  function setLang(lang) {
    if (MESSAGES[lang]) currentLang = lang;
  }

  function getLang() { return currentLang; }

  function getSupported() { return SUPPORTED.slice(); }

  function localeTag(lang) {
    return LOCALE_TAG[lang || currentLang] || 'en-US';
  }

  // 取文案，支持 {key} 占位符替换；缺失时回退到中文，再回退到 key 本身
  function t(key, params) {
    const dict = MESSAGES[currentLang] || MESSAGES[DEFAULT_LANG];
    let str = (dict && dict[key] != null) ? dict[key]
      : (MESSAGES[DEFAULT_LANG][key] != null ? MESSAGES[DEFAULT_LANG][key] : key);
    if (params && typeof str === 'string') {
      str = str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    }
    return str;
  }

  // 根据 data-i18n* 属性注入静态文案
  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
  }

  return {
    SUPPORTED, DEFAULT_LANG, loadLang, setLang, getLang, getSupported,
    localeTag, t, applyStatic,
  };
})();

// 在扩展页面内以"替换当前标签"方式跳转到另一个扩展页面。
// 不开新标签 / 新窗口，便于 archive / stats / options 之间互相导航并随时返回。
function navigateTo(path) {
  const url = chrome.runtime.getURL(path);
  if (chrome.tabs && chrome.tabs.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id != null) chrome.tabs.update(tab.id, { url });
      else chrome.tabs.create({ url }); // 兜底（如 popup 上下文无当前标签）
    });
  } else {
    chrome.tabs.create({ url });
  }
}
