import type { MessageKey } from './en-US';
export const ZH_CN_MESSAGES = {
    "app.boot_label": "正在准备笔记本…",
    "app.document_title": "Inkstone",
    "app.meta_description": "运行在 Cloudflare 上的私有、自托管 Markdown 笔记本。",
    "api.error.bad_request": "请求内容有误",
    "api.error.conflict": "内容已在别处修改，请刷新后重试",
    "api.error.forbidden": "没有权限执行此操作",
    "api.error.internal": "服务器内部错误",
    "api.error.invalid_avatar": "头像格式无效或图片过大",
    "api.error.invalid_credentials": "用户名或密码错误",
    "api.error.invalid_two_factor_code": "验证码错误或已被使用",
    "api.error.invalid_profile_name": "显示名称格式不正确",
    "api.error.invalid_username": "用户名格式不正确",
    "api.error.not_found": "请求的内容不存在",
    "api.error.payload_too_large": "内容过大",
    "api.error.registration_closed": "当前实例未开放注册",
    "api.error.server_misconfigured": "服务器配置不完整",
    "api.error.storage_unavailable": "存储服务暂时不可用",
    "api.error.too_many_attempts": "尝试次数过多，请稍后再试",
    "api.error.two_factor_already_enabled": "二次验证已启用",
    "api.error.two_factor_challenge_expired": "本次登录验证已过期，请重新输入密码",
    "api.error.two_factor_not_enabled": "尚未启用二次验证",
    "api.error.two_factor_setup_expired": "本次设置已过期，请重新开始",
    "api.error.two_factor_unavailable": "验证器密钥暂时不可用，请改用恢复码",
    "api.error.unauthenticated": "请先登录",
    "api.error.username_taken": "用户名已被使用",
    "api.error.weak_password": "密码强度不足",
    "api.error.wrong_password": "当前密码不正确",
    "api.error.unknown": "请求失败",
    "backup.error.storage_service": "存储服务返回了错误，请检查配置后重试",
    "backup.service.access_key_invalid": "Access Key 无效",
    "backup.service.access_key_missing": "缺少 Access Key 或 Secret Key",
    "backup.service.archive_missing": "备份归档未生成",
    "backup.service.bucket_missing": "请填写 Bucket 名称",
    "backup.service.bucket_not_found": "Bucket 不存在，或 endpoint 指向了错误的服务",
    "backup.service.bucket_region_mismatch": "Bucket 所在区域与配置不符，请检查 region / endpoint",
    "backup.service.bucket_write_forbidden": "密钥无效或没有该 Bucket 的写权限",
    "backup.service.connection_failed_network": "无法建立连接：域名解析失败、端口不通或证书无效，请检查地址",
    "backup.service.connection_failed_url": "无法连接到该地址，请检查地址是否正确",
    "backup.service.connection_ok": "连接正常，读写权限都没问题",
    "backup.service.connection_timeout": "连接超时，请检查网络或地址是否可达",
    "backup.service.credentials_decrypt_failed": "备份凭证无法解密，请在设置里重新填写",
    "backup.service.credentials_required": "缺少凭证，请填写后再测试",
    "backup.service.cross_origin_redirect": "WebDAV 重定向到了其他站点，为避免泄露凭据，请填写最终 HTTPS 地址",
    "backup.service.folder_permission_missing": "没有创建目录的权限",
    "backup.service.no_enabled_targets": "没有启用的备份目标",
    "backup.service.path_missing": "路径不存在，请检查 URL",
    "backup.service.path_style_required": "服务端不支持该操作，试试打开 path-style",
    "backup.service.read_back_mismatch": "写入后读回的内容不一致，请检查存储网关或代理配置",
    "backup.service.read_back_mismatch_webdav": "写入后读回的内容不一致，请检查 WebDAV 网关或代理配置",
    "backup.service.request_rejected": "请求被拒绝，通常是 region 或 endpoint 填错",
    "backup.service.signature_mismatch": "签名不匹配：请检查 Secret Key 与 region",
    "backup.service.storage_full": "服务器空间不足",
    "backup.service.too_many_redirects": "WebDAV 重定向次数过多",
    "backup.service.transfer_incomplete": "备份传输未完成",
    "backup.service.webdav_credentials_missing": "缺少 WebDAV 用户名或密码",
    "backup.service.webdav_url_missing": "请填写 WebDAV 地址",
    "backup.service.write_access_missing": "没有写入权限",
    "backup.service.write_access_missing_after_connect": "连接成功，但没有写入权限",
    "backup.service.cleanup_failed": "读写正常，但无法清理测试文件：HTTP {status}",
    "backup.service.create_folder_failed": "创建目录 {path} 失败：HTTP {status}",
    "backup.service.http_error": "服务器返回 HTTP {status}",
    "backup.service.path_not_found": "路径不存在：{path}",
    "backup.service.read_failed": "写入成功但读取失败：{details}",
    "backup.service.upload_failed": "上传 {path} 失败：HTTP {status}",
    "backup.service.write_test_failed": "写入测试失败：HTTP {status}",
    "api.no_network_connection": "网络连接不可用",
    "api.invalid_server_response": "服务器返回了无效响应",
    "api.request_failed_status": "请求失败（{status}）",
    "api.request_timed_out": "请求超时",
    "app.missing_root_mount_point": "缺少 #root 挂载点",
    "app.something_went_wrong": "出现了一点问题",
    "app.error_boundary_description": "发生了一个意外错误，请刷新页面继续使用。",
    "app.reload": "刷新",
    "app.section_unavailable": "该区域暂时不可用",
    "auth.already_have_an_account_sign_in": "已有账号？去登录",
    "auth.between_the_paper_and_ink_the_pen_comes_to_life_an_inkstone_is_used_to_p": "纸墨之间，落笔生辉，安放所有想法。",
    "auth.confirm_password": "确认密码",
    "auth.create_owner_account": "创建所有者账号",
    "auth.create_the_owner_account_this_step_appears_only_once": "创建你的所有者账号，这一步只会出现一次",
    "auth.authenticator_code": "验证器验证码",
    "auth.back_to_password": "返回密码登录",
    "auth.enter_a_username_and_password": "请输入用户名和密码",
    "auth.enter_authenticator_code": "请输入验证器应用中的 6 位验证码",
    "auth.enter_recovery_code": "请输入一枚恢复码",
    "auth.live_split_view_markdown_preview_realtime_multi_device_sync_multiple_web": "Markdown 分屏实时预览 · 多端实时同步 · 多路 WebDAV / S3 备份",
    "auth.network_error_try_again": "网络错误，请重试",
    "auth.no_account_create_one": "没有账号？注册一个",
    "auth.password_minimum_8_characters": "密码（至少 8 位）",
    "auth.recovery_code": "恢复码",
    "auth.recovery_code_used": "已使用恢复码登录",
    "auth.recovery_codes_remaining": "还剩 {count} 枚未使用的恢复码；如有需要，请到设置中重新生成。",
    "auth.self_hosted_on_cloudflare_workers_your_data_is_yours": "私有笔记 · 数据由你掌控",
    "auth.sign_in": "登录",
    "auth.sign_up": "注册",
    "auth.this_is_a_private_instance_registration_is_closed_so_only_existing_accou": "这是一个私有实例，注册已关闭，只有现有账号可以登录",
    "auth.two_step_verification_description": "密码验证成功，请再完成一次二次验证以登录。",
    "auth.use_authenticator_code": "使用验证器验证码",
    "auth.use_recovery_code": "使用恢复码",
    "auth.verify_and_sign_in": "验证并登录",
    "command.add_current_note_to_favorites": "收藏当前笔记",
    "command.archive_current_note": "归档当前笔记",
    "command.insert_note_template": "在当前光标处插入笔记模板",
    "command.change_accent_color": "更换强调色",
    "command.check_uncheck_tasks": "勾选 / 取消勾选任务",
    "command.code_block_language_autocomplete": "代码块（可补全语言名）",
    "command.commands": "命令",
    "command.content_match": "正文匹配",
    "command.continue_lists_automatically_press_enter_on_an_empty_item_to_exit": "在列表中自动延续；空项回车退出列表",
    "command.create_note_value0": "新建笔记「{value0}」",
    "command.delete_line": "删除整行",
    "command.export_all_notes_zip": "导出全部笔记（ZIP）",
    "command.filter_by_tags": "按标签过滤结果",
    "command.select_all_matches": "选择全部 {value0} 个匹配",
    "command.select_all_tags": "选择全部 {value0} 个标签",
    "command.find_and_replace_in_this_note": "在笔记内查找替换",
    "command.heading_1_same_pattern_for_2_6": "一级标题（2~6 同理）",
    "command.insert_tag_autocomplete": "插入标签（自动补全）",
    "command.jump_to_the_next_cell_in_the_table": "在表格中跳到下一格",
    "command.keyboard_shortcuts": "快捷键一览",
    "command.keyboard_shortcuts_021cf9": "键盘快捷键",
    "command.layout_editor_only": "布局：仅编辑",
    "command.layout_preview_only": "布局：仅预览",
    "command.layout_split_view": "布局：分栏预览",
    "command.link_to_another_note_autocomplete": "链接到另一篇笔记（自动补全）",
    "command.move_line_down": "下移当前行",
    "command.move_line_up": "上移当前行",
    "command.move_the_current_note_to_trash": "把当前笔记移到回收站",
    "command.no_matching_results": "没有匹配的结果",
    "command.calendar_jump_value0": "跳转到日历 · {value0}",
    "command.calendar_this_week_value0": "日历 · 本周（{value0}）",
    "command.calendar_this_year_value0": "日历 · 今年（{value0}）",
    "command.calendar_this_quarter_value0": "日历 · 本季度（{value0}）",
    "command.calendar_this_month_value0": "日历 · 本月（{value0}）",
    "command.open_favorites": "打开收藏",
    "command.open_graph": "打开关系图谱",
    "command.open_trash": "打开回收站",
    "command.recently_opened": "最近打开",
    "command.redo": "重做",
    "command.remove_current_note_from_favorites": "取消收藏当前笔记",
    "command.search_notes_or_type_a_command": "搜索笔记，或输入命令…",
    "command.selected_tags_filtering": "按已选 {value0} 个标签过滤结果",
    "command.select": "选择",
    "command.share_current_note": "分享当前笔记",
    "command.switch_to_dark_theme": "切换到深色主题",
    "command.switch_to_light_theme": "切换到浅色主题",
    "command.triggered_as_you_type": "输入即触发",
    "command.use_nearly_every_action_without_touching_the_mouse": "几乎所有操作都可以不碰鼠标",
    "attachments.cleanup": "清理未引用",
    "attachments.cleanup_confirm": "清理未引用附件？",
    "attachments.cleanup_confirm_description": "只删除不再出现在任何笔记正文中的附件，此操作不可撤销。",
    "attachments.cleanup_failed": "清理失败",
    "attachments.cleaned_value0": "已清理 {value0} 个附件",
    "attachments.delete": "删除附件",
    "attachments.delete_confirm_value0": "删除附件「{value0}」？",
    "attachments.delete_failed": "删除附件失败",
    "attachments.deleted": "附件已删除",
    "attachments.empty": "还没有附件。在笔记里粘贴或拖入图片即可上传。",
    "attachments.filter_all": "全部",
    "attachments.filter_documents": "文档",
    "attachments.filter_images": "图片",
    "attachments.filter_other": "其他",
    "attachments.freed_value0": "释放 {value0}",
    "attachments.load_failed": "加载更多附件失败",
    "attachments.load_more": "加载更多",
    "attachments.manage": "管理附件",
    "attachments.manage_description": "查看、筛选和删除所有已上传的附件。",
    "attachments.none_match": "没有匹配的附件",
    "attachments.nothing_to_clean": "没有需要清理的附件",
    "attachments.referenced_value0": "引用 {value0} 次",
    "attachments.shown_value0": "已显示 {value0} 个附件",
    "attachments.total_value0": "共 {value0} 个附件",
    "attachments.unreferenced": "未引用",
    "common.about": "约",
    "common.access_control": "访问控制",
    "common.access_passcode": "访问口令",
    "common.action_failed": "操作失败",
    "common.backlinks": "反向链接",
    "common.bold": "加粗",
    "common.cancel": "取消",
    "common.clear": "清空",
    "common.clear_selection": "清除选择",
    "common.close": "关闭",
    "common.collapse": "收起",
    "common.command_palette": "命令面板",
    "common.continue": "继续",
    "common.copied": "已复制",
    "common.copy": "复制",
    "common.created": "创建于",
    "common.current_note": "当前笔记",
    "common.delete": "删除",
    "common.delete_failed": "删除失败",
    "common.download": "下载",
    "common.edit": "编辑",
    "common.empty_trash": "清空回收站？",
    "common.exit": "退出",
    "common.export_failed": "导出失败",
    "common.github": "GitHub",
    "common.graph": "关系图谱",
    "common.highlight": "高亮",
    "common.inline_code": "行内代码",
    "common.interface": "界面",
    "common.italic": "斜体",
    "common.loading": "加载中…",
    "common.log_out": "退出登录？",
    "common.min": "分钟",
    "common.more_actions": "更多操作",
    "common.move_to_trash": "移到回收站",
    "common.navigation": "导航",
    "common.new_folder": "新建文件夹",
    "common.new_note": "新建笔记",
    "common.note": "笔记",
    "common.off": "已关闭",
    "common.on": "已开启",
    "common.open": "打开",
    "common.open_registration": "开放注册",
    "common.open_settings": "打开设置",
    "common.ordered_list": "有序列表",
    "common.outline": "大纲",
    "common.owner": "站长",
    "common.password": "密码",
    "common.permanently_deleted_value0_notes": "已彻底删除 {value0} 篇笔记",
    "common.preview": "预览",
    "common.product_name": "Inkstone",
    "common.quote": "引用",
    "common.remove_from_favorites": "取消收藏",
    "common.restore": "恢复",
    "common.restore_failed": "恢复失败",
    "common.retry": "重试",
    "common.sans_serif": "无衬线",
    "common.save": "保存",
    "common.save_failed": "保存失败",
    "common.search_notes_or_run_a_command": "搜索笔记、执行命令",
    "common.settings": "设置",
    "common.strikethrough": "删除线",
    "common.tabs": "标签页",
    "common.task_list": "任务列表",
    "common.the_passwords_do_not_match": "两次输入的密码不一致",
    "common.unarchive": "取消归档",
    "common.undo": "撤销",
    "common.unordered_list": "无序列表",
    "common.untitled_note": "未命名笔记",
    "common.username": "用户名",
    "common.value0_notes": "{value0} 篇",
    "common.version_history": "版本历史",
    "common.wiki_links": "双链",
    "common.words": "字",
    "common.zoom_in": "放大",
    "common.zoom_out": "缩小",
    "editor.column_1_column_2_column_3": "| 列 1 | 列 2 | 列 3 |",
    "editor.create_new_note": "创建新笔记",
    "editor.start_writing": "开始写点什么…",
    "editor.tab_1": "标签 1",
    "editor.tab_2": "标签 2",
    "editor.upload_failed_value0": "<!-- 上传失败：{value0} -->",
    "editor.uploading_value0": "![上传中 {value0}…]()",
    "feedback.dismiss": "关闭提示",
    "graph.building_graph": "正在计算关系…",
    "graph.all_folders": "全部文件夹",
    "graph.all_tags": "全部标签",
    "graph.appearance": "外观",
    "graph.choose_a_note": "选择笔记…",
    "graph.connect_notes_with_wiki_links_and_their_graph_will_appear_here": "用 [[双链]] 把笔记连起来，这里就会长出一张网",
    "graph.could_not_load_graph": "无法加载关系图谱",
    "graph.create_note": "创建这篇笔记",
    "graph.depth": "链接深度",
    "graph.direction_counts": "入 {incoming} · 出 {outgoing}",
    "graph.drag_to_pan_scroll_to_zoom_click_a_node_to_open_it_use_the_selector_abov": "拖动平移 · 滚轮缩放 · 点击节点打开笔记；键盘可用上方选择器",
    "graph.graph_canvas_drag_to_pan_and_scroll_to_zoom_keyboard_users_can_open_note": "关系图谱画布：可拖动平移、滚轮缩放；键盘用户可用上方选择器打开笔记",
    "graph.links": "条链接",
    "graph.filters": "筛选",
    "graph.fit": "适应画布",
    "graph.folder": "文件夹",
    "graph.forces": "布局力",
    "graph.global": "全局",
    "graph.graph_canvas_accessible": "关系图谱画布。方向键选择节点，加减号缩放，回车打开，Home 适应画布。",
    "graph.group_by": "按颜色分组",
    "graph.group_none": "不分组",
    "graph.interaction_hint": "拖动平移 · 滚轮或双指缩放 · 点击打开 · 右键查看更多",
    "graph.link_distance": "链接长度",
    "graph.local": "局部",
    "graph.local_requires_note": "请先打开一篇笔记，再查看它的局部图谱",
    "graph.make_local_center": "以此笔记为中心",
    "graph.node_actions": "节点操作",
    "graph.node_size": "节点大小",
    "graph.notes": "篇笔记 ·",
    "graph.nothing_to_graph_yet": "还没有可以画的东西",
    "graph.open_note": "打开笔记",
    "graph.open_to_right": "在右侧打开",
    "graph.open_a_note_from_the_graph": "打开图谱中的笔记",
    "graph.repulsion": "排斥力",
    "graph.restore_defaults": "恢复默认外观",
    "graph.sidebar_tags_included": "同时匹配侧边栏已选 {value0} 个标签（{value1}）",
    "graph.clear_closes_panel": "清除时同时关闭面板",
    "graph.clear_closes_panel_hint": "清除按钮点击后是否同时关闭图谱面板",
    "graph.clear_resets_tag": "清除时同时复位标签筛选",
    "graph.clear_resets_tag_hint": "清除按钮点击后是否同时清空图谱自身的标签下拉",
    "graph.tags_cleared_panel_stays": "已清除标签选择，面板保持打开",
    "graph.tags_cleared_reset": "已清除标签选择并复位标签筛选",
    "graph.tags_cleared_reset_panel_stays": "已清除标签选择并复位标签筛选，面板保持打开",
    "graph.tags_limit_detail": "{value0} 个上限在侧边栏多选、笔记列表与命令面板过滤、图谱联合筛选和 MCP 检索工具之间共享。达到上限后，新的选择会被忽略，直到你先取消一些标签。",
    "graph.tags_limit_more": "为什么是 {value0} 个？",
    "graph.tags_match": "标签匹配",
    "graph.tags_match_all": "全部满足（AND）",
    "graph.tags_match_any": "任一满足（OR）",
    "graph.scope": "图谱范围",
    "graph.search_notes": "筛选笔记…",
    "graph.settings": "图谱设置",
    "graph.show_arrows": "显示链接方向",
    "graph.show_labels": "显示标题",
    "graph.show_orphans": "显示孤立笔记",
    "graph.show_unresolved": "显示尚未创建的笔记",
    "graph.showing_limit": "显示 {shown} / {total} 篇；继续筛选可缩小范围",
    "graph.tag": "标签",
    "graph.unresolved_short": "篇未创建",
    "graph.reset": "复位",
    "markdown.abstract": "摘要",
    "markdown.code": "代码",
    "markdown.collapse_code": "收起代码",
    "markdown.code_highlighting_timed_out_while_loading": "代码高亮组件加载超时",
    "markdown.copy_code": "复制代码",
    "markdown.could_not_load_embedded_content": "嵌入内容无法加载",
    "markdown.danger": "危险",
    "markdown.details": "详情",
    "markdown.diagram_rendering_timed_out_check_the_diagram_or_try_again_later": "图表绘制超时，请检查图表内容或稍后重试",
    "markdown.diagram_rendering_timed_out_while_loading": "图表组件加载超时",
    "markdown.embed_nesting_limit_reached": "嵌入层级过深",
    "markdown.embedded_content_is_too_large": "嵌入内容过大",
    "markdown.embedded_note_not_found": "嵌入的笔记不存在",
    "markdown.example": "示例",
    "markdown.failure": "失败",
    "markdown.front_matter_exceeds_the_64_kib_safety_limit": "Front Matter 超过 64 KiB 安全上限",
    "markdown.info": "信息",
    "markdown.inkstone_code_highlighting_failed_showing_plain_text": "[inkstone] 代码高亮加载失败，将显示纯文本：",
    "markdown.inkstone_diagram_rendering_failed_to_load": "[inkstone] 图表渲染加载失败：",
    "markdown.inkstone_math_rendering_failed_to_load": "[inkstone] 公式渲染加载失败：",
    "markdown.invalid_front_matter": "Front Matter 解析失败",
    "markdown.invalid_yaml_check_indentation_quotes_and_duplicate_keys": "YAML 语法有误，请检查缩进、引号或重复键",
    "markdown.mark_complete": "标记为已完成",
    "markdown.mark_incomplete": "标记为未完成",
    "markdown.markdown_example": "Markdown 示例",
    "markdown.math_rendering_timed_out_while_loading": "公式组件加载超时",
    "markdown.note": "提示",
    "markdown.properties": "属性",
    "markdown.question": "问题",
    "markdown.redrawing_chart": "正在重新绘制图表…",
    "markdown.rendering_diagram": "正在绘制图表…",
    "markdown.success": "成功",
    "markdown.show_more_code": "显示其余 {count} 行",
    "markdown.tasks_in_embedded_notes_are_read_only": "嵌入笔记中的任务为只读",
    "markdown.the_front_matter_root_must_be_a_yaml_mapping": "Front Matter 顶层必须是 YAML 映射",
    "markdown.the_tasks_in_the_example_are_read_only": "示例中的任务为只读",
    "markdown.tip": "技巧",
    "markdown.todo": "待办",
    "markdown.warning": "警告",
    "navigation.all_notes": "所有笔记",
    "navigation.archive": "归档",
    "navigation.favorites": "收藏",
    "navigation.folder": "文件夹",
    "navigation.recently_edited": "最近编辑",
    "navigation.tag": "标签",
    "navigation.trash": "回收站",
    "navigation.unfiled": "未归类",
    "sidebar.calendar_folder": "日历",
    "sidebar.calendar_folder_hint": "按创建时间自动归档 · 只读",
    "notes.add_to_selection": "加入多选",
    "notes.added_to_favorites": "已收藏",
    "notes.adjust_selected_tags_or_switch_match_mode": "可在侧边栏调整已选标签，或切换上方匹配方式",
    "notes.archive_is_empty": "归档是空的",
    "notes.archived": "已归档",
    "notes.active_filters": "生效的筛选",
    "notes.clear_all_filters": "清除全部筛选",
    "notes.clear_day_filter": "清除日期筛选",
    "notes.clear_filters": "清除筛选",
    "notes.clear_search_query": "清除搜索",
    "notes.clear_tag_filter": "清除标签筛选",
    "notes.clearing_failed": "清空失败",
    "notes.comfortable_list": "舒适列表",
    "notes.compact_list": "紧凑列表",
    "notes.content_conflict": "内容有冲突",
    "notes.could_not_create_note": "新建笔记失败",
    "notes.could_not_update_the_offline_queue_state": "离线队列状态保存失败",
    "notes.create_a_copy": "创建副本",
    "notes.created": "按创建时间",
    "notes.data_kept_changing_during_the_full_sync_try_again_later": "全量同步期间数据持续变化，请稍后重试",
    "notes.delete_permanently": "彻底删除",
    "notes.deleted": "已删除",
    "notes.deleted_notes_remain_until_you_restore_or_clear_them": "删除的笔记会保留到你恢复或清空它们",
    "notes.deletion_was_canceled_because_the_note_body_is_not_safely_synced": "正文尚未安全同步，已取消删除",
    "notes.deselect": "取消选择",
    "notes.drag_notes_in_or_create_new_ones_here": "把笔记拖进来，或在这里新建",
    "notes.empty_trash": "清空回收站（",
    "notes.every_note_inside_will_be_permanently_deleted_and_cannot_be_recovered": "里面的所有笔记会被彻底删除，无法恢复。",
    "notes.every_note_is_filed": "所有笔记都已归类",
    "notes.everything_is_neatly_organized": "干净利落",
    "notes.failed_to_create_copy": "创建副本失败",
    "notes.failed_to_open_note": "打开笔记失败",
    "notes.filter_in_this_view": "在此视图中筛选…",
    "notes.full_sync_pagination_data_is_incomplete": "全量同步分页信息不完整",
    "notes.sync_pagination_data_is_incomplete": "同步分页信息不完整",
    "notes.keep_notes_here_when_you_want_them_out_of_the_way_but_not_deleted": "暂时不看但又不想删的笔记可以放这里",
    "notes.keep_this_page_open_and_reconnect_as_soon_as_possible_closing_it_may_mak": "请保持页面打开并尽快恢复网络，否则关闭页面后内容可能无法恢复。",
    "notes.modified": "按修改时间",
    "notes.recently_deleted_first": "最近删除的在前",
    "notes.remember_filters": "记住筛选",
    "notes.recently_edited_first": "最近编辑的在前",
    "notes.move_to_folder": "移动到文件夹",
    "notes.move_to_value0": "移到「{value0}」",
    "notes.move_value0_notes_to_trash": "把 {value0} 篇笔记移到回收站？",
    "notes.moved": "已移动",
    "notes.moved_out": "已移出",
    "notes.moved_to_trash": "已移到回收站",
    "notes.no_favorites_yet": "还没有收藏",
    "notes.filter_by_tags": "按标签过滤",
    "notes.filtering_by_day_range_value0": "正在显示 {value0} 至 {value1} 编辑过的笔记",
    "notes.filtering_by_day_value0": "正在显示 {value0} 编辑过的笔记",
    "notes.auto_follow_edit": "自动跟随最近编辑",
    "notes.auto_follow_today": "自动跟随今天",
    "notes.no_notes_in_range_value0": "所选范围内没有笔记，最近编辑于 {value0}",
    "notes.no_notes_in_this_week": "该周没有编辑记录",
    "notes.no_notes_in_this_period": "这个时段还没有笔记",
    "notes.calendar_period_range_value0": "日期范围：{value0}",
    "notes.view_this_week": "查看当前周",
    "notes.view_this_month": "查看当前月",
    "notes.jump_to_nearest_period": "跳到最近有笔记的时段",
    "notes.view_latest_week": "查看最近编辑周",
    "notes.range_editor_day_value0": "将 {value0} 设为范围的{value1}",
    "notes.range_editor_end": "结束",
    "notes.range_editor_endpoint": "日期范围端点",
    "notes.range_editor_grid_value0": "调整范围 · {value0}",
    "notes.range_editor_hint": "点击某天设置上方选中的端点",
    "notes.range_editor_start": "起始",
    "notes.range_editor_title": "调整日期范围",
    "notes.range_preset_group": "快捷区间",
    "notes.range_preset_last_30d": "近 30 天",
    "notes.range_preset_last_7d": "近 7 天",
    "notes.range_preset_this_month": "本月",
    "notes.range_preset_this_week": "本周",
    "notes.range_preset_add": "添加区间",
    "notes.range_preset_anchor_today": "到今天",
    "notes.range_preset_custom_value0": "近 {value0} 天",
    "notes.range_preset_delete": "删除该区间",
    "notes.range_preset_move_up": "上移",
    "notes.range_preset_move_down": "下移",
    "notes.range_preset_direction": "区间朝向",
    "notes.range_preset_done": "完成",
    "notes.range_preset_edit": "编辑快捷区间",
    "notes.range_preset_editor_title": "自定义快捷区间",
    "notes.range_preset_follow_edit": "跟随编辑",
    "notes.range_preset_today": "今天",
    "notes.rolling_gap_short_value0": "{value0} 天前",
    "notes.rolling_gap_value0": "最新编辑在该窗口起点 {value0} 天前，点击跟随、长按或 Shift+点击窥视",
    "notes.rolling_gap_ahead_value0": "最新编辑在该窗口终点 {value0} 天后，点击跟随、长按或 Shift+点击窥视",
    "notes.rolling_gap_ahead_short_value0": "{value0} 天后",
    "sidebar.calendar_gap_banner_value0": "活跃度落后 {value0} 天 · 点击滑回最新编辑",
    "sidebar.calendar_gap_banner_ahead_value0": "最新编辑超前窗口 {value0} 天 · 点击滑回",
    "notes.view_latest_activity_value0": "查看 {value0}",
    "notes.no_matching_notes": "没有匹配的笔记",
    "notes.no_notes_on_this_day": "该天没有笔记",
    "notes.no_notes_on_this_day_desc": "这一天编辑过的笔记会显示在这里。",
    "notes.no_matching_tags": "没有匹配的标签",
    "notes.clear_tag_search": "清空搜索",
    "notes.no_notes_match_selected_tags": "没有笔记匹配已选标签",
    "notes.no_notes_yet": "还没有笔记",
    "notes.notes": "篇",
    "notes.notes_93aeb9": "篇）",
    "notes.nothing_has_been_edited_recently": "最近没有编辑过什么",
    "notes.offline_changes_conflict_with_the_remote_version": "离线修改与远端版本冲突",
    "notes.offline_modifications_have_been_restored_as_a_new_note": "离线修改已恢复为一篇新笔记。",
    "notes.open_a_copy": "打开副本",
    "notes.open_navigation": "打开导航",
    "notes.open_to_side": "在侧边打开",
    "notes.other": "其他",
    "notes.permanent_deletion_failed": "彻底删除失败",
    "notes.permanent_deletion_was_canceled_because_the_note_body_is_not_safely_sync": "正文尚未安全同步，已取消彻底删除",
    "notes.permanently_delete_this_note": "彻底删除这篇笔记？",
    "notes.pin": "置顶",
    "notes.press_shortcut_or_the_plus_button_to_write_your_first_note": "按 {shortcut} 或点右上角的加号，开始写第一篇",
    "notes.remove_from_folder": "移出文件夹",
    "notes.removed_from_favorites": "已取消收藏",
    "notes.restore_it_from_trash_at_any_time": "可以随时从回收站恢复。",
    "notes.restored": "已恢复",
    "notes.right_click_a_note_or_press_shortcut_to_favorite_it": "在笔记上右键，或按 {shortcut} 收藏",
    "notes.selected": "已选",
    "notes.search_query_value0": "搜索“{value0}”",
    "notes.selected_tags_filter": "按已选 {value0} 个标签过滤：",
    "notes.tag_filter_value0": "已选 {value0} 个标签",
    "notes.selected_tags_match": "已选标签匹配方式",
    "notes.tag_filter_search": "筛选标签…",
    "notes.tag_match_all": "全部",
    "notes.tag_match_any": "任一",
    "notes.sort_and_display": "排序与显示",
    "notes.sort_ascending": "改为升序",
    "notes.sort_descending": "改为降序",
    "notes.the_browser_could_not_save_your_offline_changes": "浏览器无法保存离线修改",
    "notes.the_full_sync_snapshot_expired_try_again": "全量同步快照已失效，请重试",
    "notes.the_note_body_is_not_safely_synced_so_a_complete_copy_cannot_be_created": "正文尚未安全同步，无法创建完整副本",
    "notes.the_note_count_exceeds_the_per_sync_limit": "笔记数量超过单次同步上限",
    "notes.the_original_note_has_been_deleted": "原笔记已被删除",
    "notes.the_original_note_was_deleted_elsewhere": "原笔记已在别处被删除",
    "notes.the_server_received_your_content_but_the_browser_could_not_update_its_lo": "服务器已收到内容，但浏览器本地状态未能更新。请先保持页面打开。",
    "notes.there_are_no_notes_with_this_tag": "没有使用这个标签的笔记",
    "notes.this_folder_is_still_empty": "这个文件夹还是空的",
    "notes.this_note_cannot_be_opened_offline": "离线状态下无法打开这篇笔记",
    "notes.this_note_no_longer_exists": "这篇笔记已不存在",
    "notes.this_operation_cannot_be_undone": "这个操作无法撤销。",
    "notes.title": "按标题",
    "notes.trash_is_empty": "回收站是空的",
    "notes.try_another_search_or_press_shortcut_to_search_everywhere": "换个词试试，或者用 {shortcut} 全局搜索",
    "notes.unpin": "取消置顶",
    "notes.value0_value1_notes": "{value0} {value1} 篇笔记",
    "notes.value0_was_also_changed_elsewhere_your_version_was_saved_as_a_copy_value": "「{value0}」在别处也被修改过。你的版本已另存为副本（{value1}）。",
    "notes.write_something_and_it_will_appear_here": "写点什么，它就会出现在这里",
    "notes.write_tags_in_the_note_to_link_them_automatically": "在正文里写 #标签 就会自动关联",
    "notes.your_offline_changes_were_saved_as_a_copy_the_original_note_keeps_the_re": "你的离线内容已另存为副本，原笔记保留远端版本。",
    "notes.your_unsynced_content_was_recovered_as_a_new_note": "你尚未同步的内容已恢复为一篇新笔记。",
    "overlay.confirm": "确定",
    "overlay.dialog": "对话框",
    "overlay.menu": "菜单",
    "overlay.side_panel": "侧边面板",
    "preview.could_not_copy": "复制失败",
    "preview.could_not_load_image": "无法加载这张图片",
    "preview.could_not_load_note": "无法加载这篇笔记",
    "preview.could_not_update_this_task": "无法更新这一项",
    "preview.created_title": "已创建「{title}」",
    "preview.download_original_image": "下载原图",
    "preview.image_preview": "图片预览",
    "preview.note_does_not_exist": "此笔记尚未创建",
    "preview.open_in_current_pane": "在当前窗格打开",
    "preview.open_in_side_pane": "在侧边窗格打开",
    "preview.pin_card": "钉住窗口",
    "preview.pinned_windows": "已钉住窗口",
    "preview.close_all_pinned": "关闭全部钉住窗口",
    "preview.resize_card": "调整大小",
    "preview.the_preview_is_updating_try_again_in_a_moment": "预览正在更新，请稍后再试",
    "preview.untitled": "（无标题）",
    "pwa.app_installation": "安装应用",
    "pwa.install": "安装",
    "pwa.install_description": "在独立窗口中打开 Inkstone，并让应用外壳保持离线可用。",
    "pwa.install_inkstone": "安装 Inkstone",
    "pwa.installed": "已安装",
    "pwa.offline_ready": "完整离线资源已准备好",
    "pwa.offline_ready_description": "Inkstone 的所有功能现在都能在这台设备上断网打开。",
    "pwa.complete_offline_access": "完整离线能力",
    "pwa.complete_offline_preparing_description": "Inkstone 会保持流畅，并在后台安静地补齐其余功能。",
    "pwa.complete_offline_ready": "全部功能已就绪",
    "pwa.complete_offline_ready_description": "从未打开过的功能现在也可以离线使用。",
    "pwa.complete_offline_retry_description": "已下载的资源会保留，网络恢复后将自动继续。",
    "pwa.preparing_progress": "正在准备 {completed}/{total}",
    "pwa.waiting_for_network": "等待继续",
    "pwa.refresh_now": "立即刷新",
    "pwa.update_ready": "应用更新已就绪",
    "pwa.update_ready_description": "方便时刷新即可；刷新前会先保存待处理的笔记更改。",
    "session.could_not_connect_to_the_server": "无法连接服务器",
    "session.could_not_save_settings": "设置未能保存",
    "session.logout_failed": "无法安全退出登录",
    "session.logout_pending_changes": "有 {count} 条修改尚未同步，退出登录将丢失这些修改。仍要退出吗？",
    "settings.20_gb_free_25_gb_with_referral_code": "免费 20 GB，推荐码后 25 GB",
    "settings.about": "关于",
    "settings.checked_at": "检查于",
    "settings.checking_for_updates": "正在检查…",
    "settings.current_version": "当前版本",
    "settings.deployment_updates": "部署更新",
    "settings.do_not_remind_this_version": "不再提醒此版本",
    "settings.go_to_update": "去更新",
    "settings.latest_version": "最新版本",
    "settings.open_official_repository": "打开官方仓库",
    "settings.recheck_updates": "重新检查",
    "settings.remind_me_next_time": "下次再说",
    "settings.up_to_date": "当前已经是最新版本。",
    "settings.update_check_unavailable": "暂时无法获取",
    "settings.update_dialog_description": "发现 Inkstone {version}。打开官方仓库并手动同步你的 Fork。",
    "settings.update_dialog_title": "发现新版本",
    "settings.update_manual_fork_hint": "Inkstone 不会自动修改或部署你的 Fork。请在官方仓库确认变更后手动同步。",
    "settings.accent_color": "强调色",
    "settings.background_color": "背景色",
    "settings.background_paper": "暖纸",
    "settings.background_white": "纯白",
    "settings.accent.amber": "金盏黄",
    "settings.accent.celadon": "翡翠绿",
    "settings.accent.cinnabar": "朱砂",
    "settings.accent.graphite": "雾岩灰",
    "settings.accent.indigo": "深海蓝",
    "settings.accent.terracotta": "湖水青",
    "settings.accent.wisteria": "鸢尾紫",
    "settings.access_key_id": "Access Key ID",
    "settings.account": "账户",
    "settings.action_failed_try_again": "操作失败，请重试",
    "settings.add_a_webdav_or_s3_compatible_target_or_choose_a_common_provider_preset": "添加 WebDAV 或 S3 兼容目标，也可以从常用服务预设中选择",
    "settings.add_backup_target": "添加备份目标",
    "settings.add_first_target": "添加第一个目标",
    "settings.add_target": "添加目标",
    "settings.after_a_storage_account_is_connected_keep_the_same_email_and_app_passwor": "连接好储存后，账号和应用密码都不变，只需要切换 WebDAV 地址：",
    "settings.after_creation_put_the_displayed_endpoint_into_endpoint_use_the_bucket_n": "创建后显示的 Endpoint 填到「Endpoint」；桶名字填到「Bucket」；「Region」填 Endpoint 中间那段，例如 us-west-004。",
    "settings.and_turn_on_apps_connection": "，然后开启 Turn on Apps Connection。",
    "settings.anyone_can_now_register_a_new_account": "任何人现在都可以注册新账号",
    "settings.api_token_page": "API 创建页面",
    "settings.appearance": "外观",
    "settings.asked_why_i_wanted_to_live_in_the_green_mountains_i_smiled_without_answe": "问余何意栖碧山，笑而不答心自闲。桃花流水窅然去，别有天地非人间。",
    "settings.attachment_storage": "附件共占用",
    "settings.attachments": "附件",
    "settings.automatic_backups": "自动备份",
    "settings.autosave_delay": "自动保存延迟",
    "settings.new_notes": "新笔记",
    "settings.new_note_template": "新建笔记模板",
    "settings.new_note_template_description": "插入到每篇新建笔记的开头。留空则从空白笔记开始。",
    "settings.new_note_template_hint": "可用占位符：{{title}} 笔记标题、{{createdAt}} 创建时间、{{date}} 日期、{{time}} 时间、{{today}} 今天、{{tomorrow}} 明天、{{yesterday}} 昨天、{{folder}} 当前文件夹名、{{tags}} 标签视图下的当前标签（多个标签用逗号分隔）、{{cursor}} 新建后光标位置（不会写入笔记）。",
    "settings.template_preview_folder": "文件夹",
    "settings.template_preview_tag": "标签",
    "settings.template_preview_context": "{{folder}} 来自文件夹视图、文件夹菜单或按文件夹筛选的图谱；{{tags}} 来自标签视图或侧边栏 cmd/ctrl+点击多选的标签。",
    "settings.template_preview_title": "标题",
    "settings.sync_frontmatter_title": "front matter 同步到标题",
    "settings.sync_frontmatter_title_desc": "在编辑器中修改笔记 front matter 的 `title` 属性时，同步更新工作区顶部的笔记标题。",
    "settings.sync_title_to_frontmatter": "标题同步到 front matter",
    "settings.sync_title_to_frontmatter_desc": "修改顶部笔记标题时，同步更新笔记 front matter 中的 `title` 属性。",
    "settings.title_sync": "标题同步",
    "settings.new_note_template_preview": "实时预览",
    "settings.restore_default_template": "恢复默认",
    "settings.avatar_decode_failed": "无法读取这张图片，请换一张重试",
    "settings.avatar_file_too_large": "图片不能超过 8 MB",
    "settings.avatar_file_unsupported": "请选择 PNG、JPEG 或 WebP 图片",
    "settings.avatar_processing_failed": "无法处理这张图片，请换一张重试",
    "settings.avatar_saved": "头像已保存",
    "settings.avatar_upload_hint": "支持 PNG、JPEG、WebP，最大 8 MB。",
    "settings.back_up_now": "立即备份",
    "settings.backup": "备份",
    "settings.backup_completed_value0_targets": "备份完成 · {value0} 个目标",
    "settings.backup_complete_marker_mismatch": "备份完成标记与清单不一致：{value0}",
    "settings.backup_duplicate_path": "备份目录中存在重复路径：{value0}",
    "settings.backup_failed": "备份失败",
    "settings.backup_file_checksum_failed": "备份文件校验失败：{value0}",
    "settings.backup_file_size_mismatch": "备份文件大小不匹配：{value0}",
    "settings.backup_manifest_not_found": "没有找到 Inkstone Markdown 备份清单，请选择解压后的完整备份目录（应包含 manifest.json、COMPLETE、notes 等）",
    "settings.backup_manifest_invalid": "已完成快照的清单无效或版本不受支持：{value0}",
    "settings.backup_missing_file": "完整备份缺少文件：{value0}",
    "settings.backup_no_complete_snapshot": "这个目录里没有带有效 COMPLETE 标记的完整快照",
    "settings.backup_newer_snapshot_skipped": "较新的快照（{value0}）未完成，已改为恢复最近一个完整快照",
    "settings.backup_target": "备份目标",
    "settings.backup_target_added": "已添加备份目标",
    "settings.backup_target_deleted": "已删除备份目标",
    "settings.backup_target_updated": "已更新备份目标",
    "settings.bucket": "存储桶",
    "settings.body_font": "正文字体",
    "settings.body_text_size": "正文字号",
    "settings.cannot_be_undone": "无法撤销。",
    "settings.characters": " 字符",
    "settings.change_avatar": "更换头像",
    "settings.change_password": "修改密码",
    "settings.changes_are_saved_locally_and_sync_automatically_after_reconnecting": "改动会保存在本地，联网后自动同步",
    "settings.changing_this_requires_your_current_password_and_takes_effect_immediatel": "切换时需再次验证当前密码，立即生效。",
    "settings.chinese_english_and": "中英文与",
    "settings.choose_image": "选择图片",
    "settings.clean_unreferenced_attachments": "清理未引用的附件",
    "settings.clean_unreferenced_attachments_a17dbd": "清理未引用的附件？",
    "settings.clean_up": "清理",
    "settings.cleaned_value0_attachments": "已清理 {value0} 个附件",
    "settings.cleanup_failed": "清理失败",
    "settings.click_add_a_new_application_key_enter_any_name_of_key_leave_the_other_se": "，点击 Add a New Application Key，随便输入 Name of Key，其他地方不动，然后创建。",
    "settings.click_connect_in_the_left_sidebar_and_choose_the_cloud_storage_you_want": "，在左侧栏点击“连接”，选择你要连接的储存即可。",
    "settings.click_create_a_bucket_enter_only_the_bucket_name_leave_the_other_setting": "，点击创建一个桶，只输入桶名字，其他地方不修改，然后创建。",
    "settings.close_registration_requires_password_verification": "关闭注册需要验证密码",
    "settings.comfortable": "舒适",
    "settings.common_provider_presets_optional_click_to_autofill": "常用服务预设（可选，点击自动填写）",
    "settings.compact": "紧凑",
    "settings.confirm_closing_registration": "确认关闭注册",
    "settings.confirm_new_password": "确认新密码",
    "settings.confirm_opening_registration": "确认开放注册",
    "settings.connected": "已连接",
    "settings.content_width": "内容宽度",
    "settings.copy_the_address_shown_below_into_endpoint_fill_bucket_exactly_as_shown": "把下面显示的地址填到「Endpoint」；「Bucket」如实填写；「Region」保持 auto 不改。",
    "settings.could_not_load_backup_settings": "无法读取备份配置",
    "settings.could_not_load_data_overview": "无法加载数据概览",
    "settings.create_access_key_page": "Create Access Key 页面",
    "settings.create_bucket_page": "创建存储桶页面",
    "settings.created_value0_updated_value1_skipped_value2_restored_value3_attachments": "新建 {value0} 篇，更新 {value1} 篇，跳过 {value2} 篇，恢复 {value3} 个附件，跳过 {value4} 个附件",
    "settings.current_password": "当前密码",
    "settings.daily": "每天",
    "settings.dark": "深色",
    "settings.data": "数据",
    "settings.delay_before_uploading_after_you_stop_typing_shorter_makes_more_requests": "停止输入后等待多久自动保存",
    "settings.delete_backup_target_value0": "删除备份目标「{value0}」？",
    "settings.delete_pictures_and_files_that_no_longer_appear_in_any_notes": "删除那些已经不在任何笔记里出现的图片和文件",
    "settings.diagram": "图表",
    "settings.display_name": "显示名称",
    "settings.display_name_length": "显示名称应为 1–{max} 个字符",
    "settings.display_name_saved": "显示名称已保存",
    "settings.download_json": "下载 JSON",
    "settings.download_zip": "下载 ZIP",
    "settings.each_backup_goes_independently_to_every_enabled_target_it_includes_notes": "每个目标都会收到一个可直接下载的完整 ZIP：笔记保持文件夹层级，归档、回收站和原始附件分开放置；生成和上传全程采用流式处理。",
    "settings.edit_backup_target": "编辑备份目标",
    "settings.editor": "编辑器",
    "settings.endpoint": "端点",
    "settings.editor_font": "编辑器字体",
    "settings.editor_font_size": "编辑器字号",
    "settings.empty_trash": "清空回收站",
    "settings.enabled": "启用",
    "settings.english": "英文",
    "settings.enter_only_the_bucket_name_and_create_it_directly": "，只输入存储桶名称，直接创建。",
    "settings.enter_only_the_bucket_name_leave_everything_else_unchanged_and_create_it": "，只输入桶的名字，其他地方不动，直接创建。",
    "settings.enter_referral_code_2hc5e_in_referral_bonus_at_the_bottom_of_my_page_to": "在 My Page 最下面的 Referral Bonus 填入推荐码 2HC5E，可额外获得 5 GB。",
    "settings.enter_the_complete_credentials_for_the_new_backup_type_after_switching_t": "切换备份类型后，必须填写新类型的完整凭证",
    "settings.enter_your_current_password": "请输入当前密码",
    "settings.enter_your_password": "请输入密码",
    "settings.every_6_hours": "每 6 小时",
    "settings.export": "导出",
    "settings.export_to_json": "导出为 JSON",
    "settings.export_to_zip": "导出为 ZIP",
    "settings.fade_content_outside_the_current_paragraph": "淡化当前段落之外的内容",
    "settings.files_that_have_been_backed_up_there_will_not_be_deleted": "已经备份到那边的文件不会被删除。",
    "settings.finally_click_manage_key_permissions_and_turn_on_admin_access_otherwise": "最后点击 Manage Key Permissions，把 Admin Access 打开，否则无法写入。",
    "settings.focus_mode": "专注模式",
    "settings.for_example_primary_r2_backup": "例如：R2 主备份",
    "settings.free_10_gb": "免费 10 GB",
    "settings.free_5_gb": "免费 5 GB",
    "settings.freed_value0": "释放了 {value0}",
    "settings.frequency": "频率",
    "settings.full": "满",
    "settings.generate_a_new_app_password_use_your_registration_email_as_the_webdav_us": "，生成新的应用密码。注册邮箱用作 WebDAV 用户名，应用密码用作 WebDAV 密码。",
    "settings.hourly": "每小时",
    "settings.https_only_redirects_within_the_same_site_are_handled_automatically": "只支持 HTTPS；同一站点内的跳转会自动处理",
    "settings.ignore_endpoint_url_iam_after_creation_fill_the_other_displayed_values_i": "创建后显示的 Endpoint URL IAM 不用管；其余显示出来的内容按名称填写到备份页面里。",
    "settings.ignore_the_token_value_after_creation_fill_access_key_id_into_access_key": "创建后令牌值不用管；Access Key ID 填到「Access Key ID」，Secret Access Key 填到「Secret Access Key」。",
    "settings.import": "导入",
    "settings.import_completed": "导入完成",
    "settings.import_failed": "导入失败",
    "settings.operation_completed_but_refresh_failed": "操作已完成，但页面刷新失败，请稍后重试",
    "settings.import_file": "导入文件",
    "settings.includes_every_note_folder_tag_and_attachment_for_a_complete_restore_plu": "下载与自动备份相同的完整 ZIP；超大备份可解压后选择目录，Inkstone 会分批校验并恢复",
    "settings.indent_width": "缩进宽度",
    "settings.inkstone_import_reminder": "[Inkstone] 导入提醒:",
    "settings.interface_density": "界面密度",
    "settings.sidebar_calendar_tree": "侧边栏日历目录",
    "settings.sidebar_calendar_tree_desc": "按笔记创建时间自动归档的只读目录树，显示在文件夹分区顶部。",
    "settings.show_empty_calendar_periods": "显示空时段",
    "settings.show_empty_calendar_periods_desc": "在日历树的年份和月份层级中，用灰色占位展示没有笔记的时段，让时间线上的缺口一目了然。",
    "settings.year_grid_columns": "年视图列数",
    "settings.year_grid_columns_desc": "年历热力图每行排几列月卡片；默认随侧边栏宽度自适应。",
    "settings.year_grid_columns_auto": "自适应",
    "settings.year_grid_columns_three": "3 列",
    "settings.year_grid_columns_four": "4 列",
    "settings.interface_language": "界面语言",
    "settings.joined": "加入于",
    "settings.keep_the_cursor_line_centered_on_screen": "光标所在行始终保持在屏幕中间",
    "settings.keep_the_editor_and_preview_scrolled_together": "编辑与预览两侧互相跟随",
    "settings.keyboard_shortcuts": "快捷键",
    "settings.koofr_can_also_connect_google_drive_onedrive_and_dropbox_free_users_can": "Koofr 最方便的地方，是还能接 Google Drive、OneDrive、Dropbox 这三大云盘；免费用户最多能连接两个。",
    "settings.koofr_s_own_webdav_address_is_url": "Koofr 自己的 WebDAV 地址是 https://app.koofr.net/dav/Koofr。",
    "settings.last_backup_failed": "上次备份失败",
    "settings.last_backup_succeeded": "上次备份成功",
    "settings.last_saved_value0": "最近一次写入 {value0}",
    "settings.latest_backups": "最近的备份",
    "settings.leave_blank_unless_the_provider_requires_it_for_r2_use_url": "服务商没有要求时可留空；R2 填 https://<账号ID>.r2.cloudflarestorage.com",
    "settings.leave_the_key_blank_to_leave_it_unchanged": "密钥留空表示保持不变",
    "settings.light": "浅色",
    "settings.line_height": "行高",
    "settings.link_hover_delay": "悬停预览延迟",
    "settings.link_hover_preview": "双链悬停预览",
    "settings.link_hover_preview_description": "在预览或编辑模式中悬停 [[双链]] 时，先预览目标笔记内容再决定打开",
    "settings.link_preview_length": "预览内容长度",
    "settings.loading": "正在加载…",
    "settings.loading_backup_configuration": "读取备份配置…",
    "settings.loading_backup_settings": "加载备份设置…",
    "settings.login_password": "登录密码",
    "settings.look_at_home_together": "会像这样和谐地排在一起。",
    "settings.maintenance": "维护",
    "settings.manual": "手动",
    "settings.mcp": "MCP",
    "settings.mcp_ai_search": "AI 语义搜索",
    "settings.mcp_ai_search_clear": "清空索引",
    "settings.mcp_ai_search_clear_desc": "删除本账号存储的全部向量并取消待处理任务。之后搜索会回退为关键词匹配，直到你重新建立索引。",
    "settings.mcp_ai_search_clear_title": "清空 AI 搜索索引？",
    "settings.mcp_ai_search_cleared": "已清空 {count} 条向量",
    "settings.mcp_ai_search_desc": "笔记在你自己 Cloudflare 账号内私有嵌入，向量存放在你自己的数据库，每个账号独立索引。搜索工具会自动融合关键词与语义结果，内容变化会在后台建立索引。",
    "settings.mcp_ai_search_disabled": "已关闭 AI 搜索",
    "settings.mcp_ai_search_enabled": "已开启 AI 搜索，正在建立索引…",
    "settings.mcp_ai_search_indexed": "已索引 {count} 篇笔记",
    "settings.mcp_ai_search_pending": "{count} 篇待处理",
    "settings.mcp_ai_search_reindex": "重建索引",
    "settings.mcp_ai_search_reindex_desc": "把本账号的全部笔记重新加入嵌入队列，已有向量会被替换。",
    "settings.mcp_ai_search_reindex_title": "重建 AI 搜索索引？",
    "settings.mcp_ai_search_reindexed": "已将 {count} 篇笔记加入重建队列",
    "settings.mcp_ai_search_unavailable": "不可用",
    "settings.mcp_ai_search_unavailable_desc": "这个部署还没有配置 Workers AI，因此 AI 搜索保持关闭，使用关键词搜索。在 wrangler.toml 中添加 AI 绑定即可启用。",
    "settings.mcp_api_key_copy_warning": "请立即复制此密钥——之后不会再显示",
    "settings.mcp_api_key_create": "创建密钥",
    "settings.mcp_api_key_created": "API 密钥已创建",
    "settings.mcp_api_key_name": "API 密钥名称",
    "settings.mcp_api_key_name_placeholder": "例如：我的脚本、家庭电脑",
    "settings.mcp_api_key_name_required": "请为 API 密钥填写名称",
    "settings.mcp_api_key_revoke": "撤销密钥",
    "settings.mcp_api_key_revoke_desc": "{name} 会立即失效，使用它的客户端将失去访问权限，需要创建新密钥。",
    "settings.mcp_api_key_revoke_title": "撤销这个 API 密钥？",
    "settings.mcp_api_key_revoked": "API 密钥已撤销",
    "settings.mcp_api_key_show_once": "服务器只保存密钥的哈希；如果丢失，只能创建新的。",
    "settings.mcp_api_key_unused": "从未使用",
    "settings.mcp_api_key_used": "上次使用于 {time}",
    "settings.mcp_api_keys": "API 密钥",
    "settings.mcp_api_keys_desc": "给无法走 OAuth 的小型、通用或无名 MCP 客户端使用。用普通的 Bearer 请求头认证；密钥在创建时继承上方读写权限，可随时撤销。",
    "settings.mcp_api_keys_empty": "还没有 API 密钥。为脚本或最小化 MCP 客户端创建一个吧。",
    "settings.mcp_connect_clients": "连接客户端",
    "settings.mcp_connect_desc": "示例采用各客户端当前的远程 HTTP 与 OAuth 配置格式；支持固定 scope 的客户端会按当前设置生成权限。最终权限以浏览器授权页为准，修改权限后需要重新连接或登录。",
    "settings.mcp_connected_clients": "已授权客户端",
    "settings.mcp_copied": "已复制",
    "settings.mcp_copy": "复制",
    "settings.mcp_disabled": "已停用",
    "settings.mcp_demo_desc": "这里按已配置的 Inkstone 服务器完整展示全部 MCP 选项。端点、凭据、客户端和索引统计均为示例；Demo 中所有 MCP 操作都已禁用。",
    "settings.mcp_demo_title": "仅展示的 MCP 预览",
    "settings.mcp_enable": "启用 MCP",
    "settings.mcp_enable_desc": "控制所有账号的远程 MCP 服务；停用期间，已有授权也无法继续访问。",
    "settings.mcp_endpoint": "远程 MCP 端点",
    "settings.mcp_endpoint_desc": "采用 Streamable HTTP 与 OAuth 2.1（PKCE、受保护资源发现、动态客户端注册、刷新令牌）供完整 MCP 客户端使用，同时提供可撤销的静态 API 密钥（Bearer 令牌）供小型通用客户端使用。",
    "settings.mcp_generic_client": "通用 / 无名客户端（API 密钥）",
    "settings.mcp_generic_client_snippet": "# 任意小型或无名 MCP 客户端 / 脚本 / SDK（先在上方“API 密钥”处创建一个密钥）\nclaude mcp add-json inkstone '{bearerJson}'\n\n# 或直接在任意 MCP SDK 中设置请求头：{ \"Authorization\": \"Bearer ink_...\" }\n# 用 curl 快速验证端点：\ncurl -X POST \"{endpoint}\" \\\n  -H \"Authorization: Bearer <API_KEY>\" \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Accept: application/json, text/event-stream\" \\\n  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"curl\",\"version\":\"1.0\"}}}'",
    "settings.mcp_grant_revoked": "已撤销客户端访问权",
    "settings.mcp_granted_at": "授权于 {time}",
    "settings.mcp_intro": "让 Codex、Claude Code、Hermes、OpenClaw 以及其他标准 MCP 客户端搜索、引用、读取笔记，并在明确授权后安全编辑笔记。",
    "settings.mcp_load_failed": "无法读取 MCP 设置",
    "settings.mcp_loading": "正在读取 MCP 设置…",
    "settings.mcp_no_clients": "这个账号还没有授权任何客户端。",
    "settings.mcp_permissions": "权限",
    "settings.mcp_privacy": "隐私边界",
    "settings.mcp_privacy_desc": "MCP 地址需要能从互联网访问，客户端才能连接；但每次笔记操作都必须通过 OAuth，并且只能访问登录账号自己的数据。AI Search 没有公开查询端点，每个账号使用独立索引。工具主动读取的内容会按预期返回给所连接的 AI 客户端，之后受该客户端自身的隐私政策约束。",
    "settings.mcp_private_knowledge": "私有 AI 知识库",
    "settings.mcp_reconnect_notice": "请重新连接客户端或重新登录，以刷新它持有的 OAuth 权限。",
    "settings.mcp_revoke": "撤销访问权",
    "settings.mcp_revoke_all": "全部撤销",
    "settings.mcp_revoke_all_desc": "这个账号连接的全部客户端都会退出登录，今后仍可重新授权。",
    "settings.mcp_revoke_all_title": "撤销全部客户端的访问权？",
    "settings.mcp_revoke_desc": "{name} 会立即失去访问这个账号笔记的权限。",
    "settings.mcp_revoke_title": "撤销这个客户端？",
    "settings.mcp_revoked_count": "已撤销 {count} 个客户端授权",
    "settings.mcp_scope_read": "读取",
    "settings.mcp_scope_trash": "移入回收站",
    "settings.mcp_scope_write": "写入",
    "settings.mcp_trash_access": "允许移入回收站",
    "settings.mcp_trash_access_desc": "这是独立的高风险权限，只能软删除；MCP 永远不提供永久清除功能。",
    "settings.mcp_transport": "HTTP · OAuth 2.1 / Bearer",
    "settings.mcp_updated": "MCP 设置已更新",
    "settings.mcp_write_access": "允许修改笔记库",
    "settings.mcp_write_access_desc": "可修改笔记、目录、标签、属性和附件，也可创建共享链接或运行已配置的备份；写入带有冲突保护和幂等操作 ID。",
    "settings.math": "数学公式",
    "settings.monospace": "等宽",
    "settings.name": "名称",
    "settings.name_based_avatar": "根据显示名称生成",
    "settings.narrow": "窄",
    "settings.new_accounts_can_currently_register_with_a_username_and_password": "当前允许新账号使用用户名密码注册",
    "settings.new_password": "新密码",
    "settings.new_password_must_be_at_least_8_characters": "新密码至少 8 位",
    "settings.no_backup_configured_yet": "还没有配置备份",
    "settings.no_backup_record_yet": "还没有备份记录",
    "settings.no_backup_target_yet": "还没有备份目标",
    "settings.no_enabled_backup_targets": "没有可用的备份目标",
    "settings.no_saves_yet": "尚无写入记录",
    "settings.notes": "篇 ·",
    "settings.off_default_only_existing_accounts_can_log_in": "已关闭（默认）：只有现有账号可以登录。",
    "settings.offline": "当前离线",
    "settings.only_an_email_address_is_needed_10_gb_free_and_it_can_bridge_google_driv": "只需邮箱即可注册使用。免费 10 GB，并且可以通过 WebDAV 接到 Google Drive、OneDrive、Dropbox。",
    "settings.only_an_email_address_is_needed_20_gb_free_25_gb_total_with_the_referral": "只需邮箱即可注册。免费 20 GB；填写推荐码后总计 25 GB。",
    "settings.only_an_email_address_is_needed_up_to_10_gb_free_with_standard_webdav_ac": "只需邮箱即可注册。免费最高 10 GB，并且自带标准 WebDAV 访问。",
    "settings.only_existing_accounts_can_log_in": "仅现有账号可以登录",
    "settings.only_existing_accounts_can_sign_in_new_accounts_are_rejected": "当前只有已存在的账号可以登录，其他人会被拒绝",
    "settings.only_files_that_do_not_appear_in_the_body_of_any_note_will_be_deleted_an": "只会删除没有出现在任何笔记正文里的文件，这个操作不可撤销。",
    "settings.open": "进入",
    "settings.open_anyone_can_register_with_a_username_and_password": "已开放：任何人都可以使用用户名密码注册新账号。",
    "settings.open_github_repository": "打开 GitHub 仓库",
    "settings.open_registration_requires_password_verification": "开放注册需要验证密码",
    "settings.open_signup_aff": "前往注册（含 AFF）",
    "settings.open_the_r2_console": "打开 R2 控制台",
    "settings.other_devices_have_been_logged_out": "其他设备已被登出",
    "settings.overview": "概览",
    "settings.partially_completed_value0_value1": "部分成功 · {value0}/{value1}",
    "settings.password_settings": "密码设置",
    "settings.password_updated": "密码已更新",
    "settings.personal_profile": "个人资料",
    "settings.permanently_delete_every_note_in_trash": "彻底删除回收站里的所有笔记",
    "settings.polling_interval": "检查更新频率",
    "settings.preview": "效果预览",
    "settings.preview_typography": "预览排版",
    "settings.private_instance": "私有实例",
    "settings.q_a_in_the_mountains": "山中问答",
    "settings.random_avatar": "随机生成的头像",
    "settings.random_avatar_number": "随机头像 {number}",
    "settings.random_avatars": "推荐头像",
    "settings.realtime_sync": "实时更新",
    "settings.refresh_avatars": "换一组",
    "settings.rebuild_failed": "重建失败",
    "settings.rebuild_index": "重建索引",
    "settings.rebuild_search_index": "重建搜索索引",
    "settings.rebuilt_the_index_for_value0_notes": "已重建 {value0} 篇笔记的索引",
    "settings.receive_changes_from_other_devices_quickly": "让其他设备上的修改尽快显示在这里",
    "settings.registration_closed": "已关闭注册",
    "settings.registration_open": "已开放注册",
    "settings.registration_status": "注册状态",
    "settings.region": "区域",
    "settings.restore_backup_folder": "恢复 Inkstone 备份文件夹",
    "settings.restore_backup_folder_description": "选择新 ZIP 解压后的目录，或旧版同时包含 attachments 和 snapshots 的备份根目录；Inkstone 会验证 COMPLETE 并分批恢复",
    "settings.reloaded_all_data": "已同步最新内容",
    "settings.render_and_using_katex": "显示行内公式和块级公式",
    "settings.render_mermaid_code_blocks_into_flowcharts": "将 Mermaid 代码块显示为图表",
    "settings.runs_from_cloudflare_cron_the_page_does_not_need_to_stay_open": "按照设定频率自动备份，无需保持页面打开",
    "settings.s3_backup": "S3 备份",
    "settings.s3_compatible": "S3 兼容",
    "settings.s3_compatible_object_storage_with_10_gb_free_and_no_credit_card_required": "兼容 S3 的对象存储，免费容量 10 GB，无需信用卡。",
    "settings.s3_compatible_object_storage_with_10_gb_free_but_it_requires_credit_card": "兼容 S3 的对象存储，免费容量 10 GB，需要信用卡认证。",
    "settings.s3_compatible_object_storage_with_5_gb_free_and_no_credit_card_required": "兼容 S3 的对象存储。免费容量 5 GB，无需信用卡。",
    "settings.scheduled": "定时",
    "settings.scroll_sync": "滚动同步",
    "settings.collapse_long_code_blocks": "折叠较长的代码块",
    "settings.collapse_long_code_blocks_description": "默认仅显示部分代码，需要时可展开阅读全文",
    "settings.code_block_collapse_after": "超过以下行数后折叠",
    "settings.lines": " 行",
    "settings.sec": "秒",
    "settings.select_file": "选择文件",
    "settings.select_backup_folder": "选择备份文件夹",
    "settings.selected_avatar": "当前选择",
    "settings.select_object_read_write_for_permissions_and_create_it_directly": "，权限全选“对象读和写”，直接创建。",
    "settings.secret_access_key": "Secret Access Key",
    "settings.serif": "衬线",
    "settings.show_line_numbers": "显示行号",
    "settings.show_outline_by_default": "默认显示大纲",
    "settings.show_toolbar": "显示工具栏",
    "settings.sign_in_security": "登录安全",
    "settings.sign_up": "前往注册",
    "settings.simplified_chinese": "简体中文",
    "settings.spellcheck": "拼写检查",
    "settings.standard": "标准",
    "settings.store_backups_in_this_directory_or_leave_blank_to_use_the_root_directory": "备份会放在这个目录下，留空则放在根目录",
    "settings.structured_note_data_without_attachment_binaries_download_zip_for_a_comp": "笔记结构的纯数据，不含附件二进制；完整备份请下载 ZIP",
    "settings.subdirectory": "子目录",
    "settings.supports_md_txt_zip_and_inkstone_json_exports_for_matching_ids_the_newer": "支持 .md / .txt / .zip / Inkstone 导出的 .json。同 ID 的笔记会保留较新的一份",
    "settings.sync": "同步",
    "settings.sync_now": "立即同步",
    "settings.system": "跟随系统",
    "settings.test": "测试",
    "settings.test_connection": "测试连接",
    "settings.the_local_cache_will_be_cleared_and_the_cloud_data_will_not_be_affected": "本地缓存会被清空，云端数据不受影响。",
    "settings.theme": "主题",
    "settings.then_open": "然后打开",
    "settings.there_are_no_attachments_to_clean": "没有需要清理的附件",
    "settings.this_device_will_be_signed_out_and_its_local_cache_cleared_cloud_data_is": "此设备的会话会被服务端撤销，本地缓存清空；云端数据不受影响。",
    "settings.totp_authenticator_code": "当前验证器验证码",
    "settings.totp_code_or_recovery": "验证器验证码或恢复码",
    "settings.totp_code_or_recovery_placeholder": "6 位验证码或恢复码",
    "settings.totp_confirm_code": "输入验证器应用当前显示的 6 位验证码",
    "settings.totp_confirm_disable": "关闭二次验证",
    "settings.totp_confirm_enable": "验证并开启",
    "settings.totp_copy_all": "全部复制",
    "settings.totp_copy_failed": "复制失败，请手动选择并复制。",
    "settings.totp_disable": "关闭",
    "settings.totp_disable_description": "请输入当前密码，以及验证器验证码或一枚未使用的恢复码。其他设备会被退出登录。",
    "settings.totp_disable_title": "确定关闭二次验证？",
    "settings.totp_disabled": "二次验证已关闭",
    "settings.totp_disabled_description": "开启后，新设备登录在密码之后还必须通过验证器应用验证。",
    "settings.totp_enable": "开启",
    "settings.totp_enable_password_description": "关联验证器应用前，请先确认当前密码。",
    "settings.totp_enabled": "二次验证已开启",
    "settings.totp_enabled_description": "新登录必须提供验证器验证码或恢复码，目前还剩 {count} 枚恢复码。",
    "settings.totp_enter_code_or_recovery": "请输入验证器验证码或恢复码",
    "settings.totp_enter_six_digit_code": "请输入有效的 6 位验证器验证码",
    "settings.totp_generate_new_codes": "更换恢复码",
    "settings.totp_load_failed": "无法读取二次验证状态",
    "settings.totp_loading": "正在读取二次验证状态…",
    "settings.totp_manage": "管理",
    "settings.totp_manual_secret": "手动设置密钥",
    "settings.totp_other_sessions_revoked": "其他已登录设备均已退出。",
    "settings.totp_qr_code_title": "验证器设置二维码",
    "settings.totp_recovery_codes": "恢复码",
    "settings.totp_recovery_codes_copied": "恢复码已复制",
    "settings.totp_recovery_codes_once": "每枚恢复码只能使用一次。请存放在私密且可靠的位置；之后不会再次显示。",
    "settings.totp_recovery_codes_replaced": "恢复码已更换",
    "settings.totp_recovery_file_title": "Inkstone 二次验证恢复码",
    "settings.totp_recovery_file_warning": "请妥善保密。每枚恢复码只能使用一次，可用于登录或关闭二次验证。",
    "settings.totp_regenerate_description": "更换后，之前的所有恢复码会立即失效。请使用当前密码和验证器验证码确认。",
    "settings.totp_save_recovery_codes": "现在保存这些恢复码",
    "settings.totp_saved_codes": "我已妥善保存",
    "settings.totp_scan_qr": "使用验证器应用扫码",
    "settings.totp_scan_qr_description": "任意兼容 TOTP 的验证器都可以。扫码后，输入应用当前显示的 6 位验证码完成绑定。",
    "settings.totp_secret_copied": "设置密钥已复制",
    "settings.totp_title": "二次验证（TOTP）",
    "settings.totp_unavailable_description": "服务器凭据保险库不可用，暂时无法安全开启 TOTP。",
    "settings.to_add_users_open_registration_under_settings_account_they_can_then_crea": "需要多人使用时，请到「设置 → 账户」开启注册；开启后即可使用用户名密码创建账号。",
    "settings.total_words": "总字数",
    "settings.try_this_when_your_search_results_don_t_look_right": "搜索结果不对劲时试试这个",
    "settings.type": "类型",
    "settings.typewriter_mode": "打字机模式",
    "settings.unchanged": "••••••••（不变）",
    "settings.up_to_10_gb": "最高 10 GB",
    "settings.update_failed": "更新失败",
    "settings.upload_local_image": "上传本地图片",
    "settings.uploaded_avatar": "已上传的本地图片",
    "settings.use_name_avatar": "使用姓名头像",
    "settings.username_is_sign_in_id": "@用户名是登录标识，不会随显示名称一起改变。",
    "settings.use_an_app_specific_password_when_possible": "建议使用应用专用密码",
    "settings.use_any_name_you_like_and_create_it": "，名字随意，直接创建。",
    "settings.use_connection_id_as_your_webdav_username_and_apps_password_as_your_webd": "Connection ID 用作 WebDAV 用户名，Apps Password 用作 WebDAV 密码。",
    "settings.use_keyid_as_access_key_id_and_applicationkey_as_secret_access_key": "生成结果里的 keyID 填到「Access Key ID」，applicationKey 填到「Secret Access Key」。",
    "settings.use_path_style_access_recommended_for_most_compatible_services": "使用 path-style（多数兼容服务建议开启）",
    "settings.use_url_as_the_webdav_server_url": "WebDAV 地址填写 https://webdav.pcloud.com/ 。",
    "settings.use_your_registration_email_as_the_webdav_username_and_your_account_pass": "注册邮箱用作 WebDAV 用户名，注册密码用作 WebDAV 密码。",
    "settings.username_value0_changing_the_password_signs_out_other_devices": "用户名 {value0}。修改密码后其他设备会被登出。",
    "settings.value0_backup_targets_active": "{value0} 个备份目标正在工作",
    "settings.value0_changes_will_upload_automatically_after_reconnecting": "{value0} 处改动会在联网后自动补传",
    "settings.value0_files_value1_value2": "{value0} 个文件 · {value1} · {value2}",
    "settings.value0_notes_value1": "{value0} 篇笔记，共 {value1}",
    "settings.version": "版本",
    "settings.version_history": "历史版本",
    "settings.webdav_address": "WebDAV 地址",
    "settings.webdav_backup": "WebDAV 备份",
    "settings.wide": "宽",
    "settings.writing_mode": "写作模式",
    "share.1_day": "1 天",
    "share.30_days": "30 天",
    "share.7_days": "7 天",
    "share.anyone_who_gets_the_link_will_immediately_lose_access": "任何拿到链接的人都会立刻无法访问。",
    "share.ask_the_person_who_shared_this_note_for_its_passcode": "请向分享者索取访问口令",
    "share.content_unavailable": "内容不可用",
    "share.done": "完成",
    "share.embedded_private_notes_are_not_included_in_public_shares": "嵌入内容不会显示在公开分享中",
    "share.expiration": "有效期",
    "share.expired": "已过期",
    "share.expires_value0": "{value0} 过期",
    "share.generate_public_link": "生成公开链接",
    "share.incorrect_passcode": "口令不正确",
    "share.enter_a_passcode": "请先输入访问口令",
    "share.passcode_too_short": "访问口令至少需要 4 个字符",
    "share.keep_current_expiration": "保持当前",
    "share.leave_blank_to_keep_the_current_passcode": "留空表示保持原来的口令不变",
    "share.link_revoked": "链接已撤销",
    "share.loading_share_status": "读取分享状态…",
    "share.could_not_load_sharing_status": "无法读取分享状态",
    "share.never_expires": "永久",
    "share.never_expires_71ab34": "永久有效",
    "share.open_link": "打开链接",
    "share.opening": "正在打开…",
    "share.passcode": "口令",
    "share.passcode_protected": "已加口令",
    "share.public_link": "公开链接",
    "share.public_link_created": "公开链接已生成",
    "share.public_links_are_read_only_visitors_can_see_only_the_latest_version_of_t": "公开链接为只读。访问者只能查看这篇笔记的最新内容，无法访问其他笔记。",
    "share.require_a_passcode_to_view_this_note": "开启后需要输入口令才能查看",
    "share.revoke_link": "撤销链接",
    "share.revoke_this_public_link": "撤销这个公开链接？",
    "share.set_a_passcode": "设置一个口令",
    "share.share_note": "分享笔记",
    "share.shared_via_site": "由 {site} 分享",
    "share.sharing_settings_updated": "已更新分享设置",
    "share.switch_theme": "切换主题",
    "share.tasks_in_public_shares_are_read_only": "公开分享中的任务为只读",
    "share.this_note_requires_a_password": "这篇笔记需要口令",
    "share.unchanged": "••••••（不变）",
    "share.update_settings": "更新设置",
    "share.view_content": "查看内容",
    "share.visits": "次访问",
    "shell.add_to_remove_from_favorites": "收藏 / 取消收藏",
    "shell.collapse_expand_list": "折叠 / 展开列表",
    "shell.cycle_editor_split_preview": "切换编辑 / 分栏 / 预览",
    "shell.global": "全局",
    "shell.keyboard_shortcuts": "快捷键面板",
    "shell.mobile_navigation": "手机端导航",
    "shell.offline": "离线",
    "shell.offline_changes_are_saved_locally": "离线，改动会保存在本地",
    "shell.offline_value0_changes_pending": "离线，{value0} 处改动待同步",
    "shell.quick_open": "快速跳转笔记",
    "shell.resize_navigation_panel": "调整导航栏宽度",
    "shell.resize_note_list": "调整笔记列表宽度",
    "shell.resize_note_panes": "调整两个笔记窗格的宽度",
    "shell.insert_note_template": "在当前光标处插入笔记模板",
    "shell.save_now": "立即保存",
    "shell.saving": "正在保存…",
    "shell.search_all_notes": "全文搜索",
    "shell.search_notes_or_run_a_command": "搜索笔记、执行命令…",
    "shell.show_hide_outline": "显示 / 隐藏大纲",
    "shell.synced": "已同步",
    "shell.synced_value0": "已同步 · {value0}",
    "shell.unsaved_changes": "有未保存的改动",
    "sidebar.account_and_settings": "账号与设置",
    "sidebar.calendar_day_tooltip_value0": "{value0} · {value1} 篇笔记 · 点击创建/打开日记，拖动选择日期范围",
    "sidebar.calendar_outside_window_value0": "最新编辑在该窗口 {value0} 天前",
    "sidebar.calendar_gap_click_follow": "点击把滚动窗口滑到这里",
    "sidebar.calendar_diary_created_value0": "已创建《{value0}》日记",
    "sidebar.calendar_diary_opened_value0": "已打开《{value0}》日记",
    "sidebar.calendar_expand_day": "查看当天笔记",
    "sidebar.calendar_expand_week_value0": "按周过滤（{value0}–{value1}）",
    "sidebar.calendar_year_range_hint_value0": "已选 {value0}，点击另一个月完成范围选择（Esc 取消）",
    "sidebar.calendar_jump_to_day": "在月历中显示该天",
    "sidebar.calendar_less": "少",
    "sidebar.calendar_more": "多",
    "sidebar.calendar_month_grid_aria": "月历：{value0}",
    "sidebar.calendar_month_view": "月",
    "sidebar.calendar_next_month": "下个月",
    "sidebar.calendar_next_year": "下一年",
    "sidebar.calendar_prev_month": "上个月",
    "sidebar.calendar_prev_year": "上一年",
    "sidebar.calendar_this_month": "回到本月",
    "sidebar.calendar_this_year": "回到今年",
    "sidebar.calendar_title": "日记日历",
    "sidebar.calendar_today": "今天",
    "sidebar.calendar_view": "日历视图",
    "sidebar.calendar_week_notes_value0": "本周笔记（{value0} 篇）",
    "sidebar.calendar_week_strip_value0": "近 {value0} 周",
    "sidebar.calendar_week_view": "周",
    "sidebar.calendar_year_grid_aria": "年历：{value0}",
    "sidebar.calendar_year_month_value0": "{value0} · {value1} 篇笔记",
    "sidebar.calendar_year_weekday_value0": "按 {value0} 第一个{value1}所在周过滤",
    "sidebar.calendar_year_view": "年",
    "sidebar.collapse": "折叠",
    "sidebar.collapse_navigation": "收起导航",
    "sidebar.create_first_folder": "创建第一个文件夹",
    "sidebar.diary_tag": "日记",
    "sidebar.diary_title_value0": "日记《{value0}》",
    "sidebar.create_new_note_here": "在此新建笔记",
    "sidebar.delete_folder": "删除文件夹",
    "sidebar.delete_folder_value0": "删除文件夹「{value0}」？",
    "sidebar.expand": "展开",
    "sidebar.expand_navigation": "展开导航",
    "sidebar.failed_to_create_folder": "创建文件夹失败",
    "sidebar.jump_to_graph": "打开图谱查看标签联合筛选",
    "sidebar.tags_cleared": "已清除标签选择",
    "sidebar.log_out": "退出登录",
    "sidebar.member": "成员",
    "sidebar.move_earlier": "向前移动",
    "sidebar.move_failed": "移动失败",
    "sidebar.move_later": "向后移动",
    "sidebar.move_out_one_level": "移出当前文件夹",
    "folders.appearance": "文件夹外观",
    "folders.choose_parent": "选择上级文件夹",
    "folders.color": "颜色",
    "folders.delete_contents_move_up": "其中 {value0} 篇直属笔记和 {value1} 个直属子文件夹会向上移动一级；子文件夹里的笔记仍保留在原子文件夹中。",
    "folders.icon": "图标",
    "folders.includes_subfolders": "包含所有子文件夹中的笔记",
    "folders.move_to": "移动到…",
    "folders.no_color": "不设颜色",
    "folders.no_icon": "默认图标",
    "folders.no_match": "没有匹配的文件夹",
    "folders.search": "搜索文件夹",
    "folders.top_level": "最外层",
    "sidebar.new_subfolder": "新建子文件夹",
    "sidebar.rename": "重命名",
    "sidebar.rename_failed": "重命名失败",
    "sidebar.cmd_click_selects_multiple": "Cmd/Ctrl+点击可多选标签",
    "sidebar.tag_search_select_all": "Shift+Enter 将全部匹配加入多选",
    "sidebar.remove_selected_tag": "取消选中 {value0}",
    "sidebar.show_all_value0_tags": "显示全部 {value0} 个标签",
    "sidebar.tags_selected": "已选择 {value0} 个标签",
    "sidebar.tags_selected_hint": "新建笔记将带上这些标签",
    "sidebar.switch_to_dark": "切换到深色",
    "sidebar.switch_to_light": "切换到浅色",
    "sidebar.the_value0_notes_inside_move_up_one_level_and_are_not_deleted": "里面的 {value0} 篇笔记会移动到上一层，不会被删除。",
    "sidebar.this_folder_is_empty": "这个文件夹是空的。",
    "tags.change_color": "更改颜色",
    "tags.clear_color": "清除颜色",
    "tags.color": "颜色",
    "tags.color_failed": "更新颜色失败",
    "tags.create_failed": "新建标签失败",
    "tags.create_first": "新建第一个标签",
    "tags.delete": "删除标签",
    "tags.delete_confirm_value0": "删除标签「{value0}」？该标签也会从相关笔记的正文中移除。",
    "tags.delete_failed": "删除标签失败",
    "tags.deleted": "标签已删除",
    "tags.delete_description_value0": "当前有 {value0} 篇活跃笔记使用它；归档和回收站中的匹配内容也会一并处理。操作前会为改动的笔记保留版本。",
    "tags.invalid_name": "标签名不能包含空格或 #",
    "tags.merge": "合并标签",
    "tags.merge_confirm_value0_value1": "将「{value0}」合并到「{value1}」？",
    "tags.merge_description": "两个标签会合并为一个，相关笔记正文和元数据会统一使用已有标签名。",
    "tags.new": "新建标签",
    "tags.new_placeholder": "标签名称",
    "tags.rename": "重命名",
    "tags.rename_failed": "重命名失败",
    "tags.renamed": "标签已重命名",
    "tags.selection_limit": "已达标签选择上限（最多 {value0} 个）",
    "tags.updated_note_bodies_value0": "已同步处理 {value0} 篇笔记正文；打开中的笔记也已更新。",
    "time.just_now": "刚刚",
    "time.this_month": "本月",
    "time.this_week": "本周",
    "time.today": "今天",
    "time.yesterday": "昨天",
    "workspace.a_snapshot_is_saved_every_few_minutes_or_after_larger_edits": "每隔几分钟或改动较大时，会自动留一份存档",
    "workspace.autosave_for_value0": "「{value0}」的自动存档",
    "workspace.back_to_notes": "返回笔记列表",
    "workspace.block_id": "块 ID",
    "workspace.block_reference": "块引用",
    "workspace.callout": "提示块",
    "workspace.characters": "字符",
    "workspace.close_right_note": "关闭右侧笔记",
    "workspace.choose_a_note_or_write_a_new_one": "选一篇笔记，或者写一篇新的",
    "workspace.code_block": "代码块",
    "workspace.details_block": "折叠内容",
    "workspace.differences_from_current_content": "与当前内容的差异",
    "workspace.divider": "分隔线",
    "workspace.edit_only": "仅编辑",
    "workspace.enhanced_code_block": "增强代码块",
    "workspace.export": "导出",
    "workspace.export_failed": "导出失败",
    "workspace.export_html": "导出 HTML",
    "workspace.export_markdown": "导出 Markdown",
    "workspace.export_pdf": "导出 PDF",
    "workspace.footnote": "脚注",
    "workspace.heading_value0": "{value0} 级标题",
    "workspace.inline_math": "行内公式",
    "workspace.insert_image": "插入图片",
    "workspace.insert_note_template": "插入笔记模板",
    "workspace.insert_tag": "插入标签",
    "workspace.large_content_using_a_faster_comparison": "内容较大，已使用快速对比",
    "workspace.latest": "最近一次",
    "workspace.layout": "布局",
    "workspace.left_note_pane": "左侧笔记窗格",
    "workspace.link": "链接",
    "workspace.loading_note_content": "正在载入笔记正文",
    "workspace.note_title": "笔记标题",
    "workspace.math": "公式",
    "workspace.mermaid_diagram": "Mermaid 图表",
    "workspace.more_blocks": "更多块",
    "workspace.more_inline_styles": "更多行内格式",
    "workspace.could_not_load_backlinks": "无法加载反向链接",
    "workspace.could_not_load_version": "无法加载这个版本",
    "workspace.could_not_load_version_history": "无法加载版本历史",
    "workspace.no_notes_link_here_yet_write": "还没有笔记链接到这里。在别的笔记里写",
    "workspace.no_version_history_yet": "还没有历史版本",
    "workspace.note_embed": "笔记嵌入",
    "workspace.note_syntax": "笔记语法",
    "workspace.open_a_note_from_the_list_or_press_shortcut_to_create_one": "左侧列表点一下就能打开；按 {shortcut} 新建",
    "workspace.preview_only": "仅预览",
    "workspace.remote_image": "网络图片",
    "workspace.resize_editor_and_preview_panes": "调整编辑与预览宽度",
    "workspace.right_note_pane": "右侧笔记窗格",
    "workspace.restore_this_version": "恢复到这个版本？",
    "workspace.restore_this_version_da5169": "恢复此版本",
    "workspace.restored_to_selected_version": "已恢复到所选版本",
    "workspace.share": "分享",
    "workspace.split_view": "分栏",
    "workspace.table": "表格",
    "workspace.the_current_content_will_be_automatically_saved_as_a_new_version_first_a": "当前内容会先自动存为一个新版本，不会丢失。",
    "workspace.title": "[[标题]]",
    "workspace.title_748d7d": "标题",
    "workspace.title_level": "标题层级",
    "workspace.upload_failed": "上传失败",
    "workspace.value0_unchanged_lines_hidden": "… 中间 {value0} 行未展开 …",
    "workspace.will_appear_here": "就会出现在这里。",
    "template.article_outline.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [写作]
---

## 标题

## 核心论点
> 

## 读者

## 大纲
### 1. 开头
- 

### 2. 第一节
- 核心论点：
- 论据：

### 3. 第二节
- 核心论点：
- 论据：

### 4. 结尾
- 

## 参考资料
- 
`,
    "template.article_outline.description": "搭建文章结构：论点、章节与关键论据。",
    "template.article_outline.name": "文章大纲",
    "template.book_notes.content": `---
title: 《{{title}}》读书笔记
createdAt: {{createdAt}}
tags: [读书]
---

## 书目
- 作者：
- 开始阅读：{{date}}
- 读完：

## 核心观点
1. 

## 金句摘录
> 

## 我的想法
- 

## 行动清单
- [ ] 

## 评分
⭐⭐⭐⭐⭐
`,
    "template.book_notes.description": "阅读一本书时记录金句、想法与行动清单。",
    "template.book_notes.name": "读书笔记",
    "template.brainstorm.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [头脑风暴]
---

## 主题

## 规则
- 数量优先于质量
- 过程中不批评
- 在别人的想法上继续延伸

## 原始想法
- 
- 
- 
- 

## 归类
### 类别 A
- 

### 类别 B
- 

## 优选
1. 

## 下一步
- [ ] 
`,
    "template.brainstorm.description": "先尽情收集想法，再分类、排序、收敛。",
    "template.brainstorm.name": "头脑风暴",
    "template.bug_tracker.content": `---
title: Bug：{{title}}
createdAt: {{createdAt}}
tags: [bug]
---

## 严重程度
- [ ] 致命
- [ ] 高
- [ ] 中
- [ ] 低

## 环境
- 版本：
- 系统 / 浏览器：

## 复现步骤
1. 

## 预期行为
- 

## 实际行为
- 

## 根因
- 

## 修复方案
- [ ] 

## 验证
- [ ] 修复前已复现
- [ ] 修复版本：
`,
    "template.bug_tracker.description": "一条笔记一个 Bug：复现步骤、根因与修复。",
    "template.bug_tracker.name": "Bug 追踪",
    "template.bullet_journal.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [子弹头笔记]
---

## 未来日志
- [[月份]] · {{tomorrow}}
- [[月份]] · {{tomorrow}}
- [[月份]] · {{tomorrow}}

## 月度日志

| 日期 | 任务 | 事件 | 备注 |
| --- | --- | --- | --- |
|  |  |  |  |

## 每日日志

- [ ] 任务
- [ ] 迁移的任务 · >
- [ ] 安排的任务 · <
- 事件 · o
- 备注 · -

## 符号说明
- · 任务 · > 迁移 · < 安排 · o 事件 · - 备注
- * 优先 · ! 灵感 · ? 疑问 · x 完成
`,
    "template.bullet_journal.description": "用符号快速记录任务、事件与想法，配合未来日志规划长期安排。",
    "template.bullet_journal.name": "子弹头笔记",
    "template.category.health": "健康与习惯",
    "template.category.industry": "行业专用",
    "template.category.learning": "学习与知识",
    "template.category.life": "生活记录",
    "template.category.productivity": "效率方法",
    "template.category.tasks": "任务与清单",
    "template.category.work": "工作与会议",
    "template.category.writing": "写作与创作",
    "template.tag.checklist": "清单",
    "template.tag.daily": "每日",
    "template.tag.finance": "财务",
    "template.tag.goal": "目标",
    "template.tag.health": "健康",
    "template.tag.life": "生活",
    "template.tag.review": "复盘",
    "template.tag.study": "学习",
    "template.tag.table": "表格",
    "template.tag.tech": "技术",
    "template.tag.travel": "旅行",
    "template.tag.weekly": "每周",
    "template.tag.work": "工作",
    "template.tag.writing": "写作",
    "template.class_notes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [课堂]
---

## 课程
- 讲师：
- 主题：

## 要点
1. 

## 例子
- 

## 疑问
- [ ] 

## 课后
- [ ] 复习笔记
- [ ] 完成练习
- [ ] 请教问题
`,
    "template.class_notes.description": "结构化的课堂听课笔记。",
    "template.class_notes.name": "课堂笔记",
    "template.cornell.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [康奈尔笔记]
---

| 线索栏 | 笔记栏 |
| --- | --- |
| 关键词、问题 | 正文笔记、图示、例子 |

> 左边写关键词和问题，右边记录笔记要点。
> 24 小时内复习：遮住笔记栏，根据线索栏复述内容。

## 总结

用自己的话在 1-3 句话内概括本页内容。{{cursor}}
`,
    "template.cornell.description": "经典的「线索栏—笔记栏—总结」布局，适合听课与阅读。",
    "template.cornell.name": "康奈尔笔记",
    "template.dev_daily.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [开发]
---

## 今日进展
- [ ] 
- [ ] 

## 实现细节
- 

## 提交 / 合并
- 

## 阻塞
- 

## 待确认
- 

## 明日计划
- [ ] 

## 今日收获
- 
`,
    "template.dev_daily.description": "程序员每日开发日志：进展、阻塞与下一步。",
    "template.dev_daily.name": "开发日志",
    "template.diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [日记]
---

## 心情
- 精力（1-5）：
- 心情（1-5）：

## 今日亮点
1. 

## 流水账
- 

## 感恩
- 

## 明天
- [ ] 

{{cursor}}
`,
    "template.diary.description": "带日期、心情、亮点与感恩的日记页。",
    "template.diary.name": "日记",
    "template.expense_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [记账]
---

## 今日支出
| 项目 | 分类 | 金额 |
| --- | --- | --- |
|  |  |  |

## 分类小计
- 餐饮：
- 交通：
- 购物：
- 其他：

## 预算对照
- 每日预算：
- 今日花费：
- 本月剩余：

## 备注
- 
`,
    "template.expense_log.description": "按类别记录每日支出，对照预算复盘。",
    "template.expense_log.name": "记账本",
    "template.feynman.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [费曼]
---

## 概念

## 白话解释

假装在教一个 8 岁的小孩：

> 

## 发现的知识缺口
1. 

## 简化重试

用一个比喻重新写一遍：

## 最终检查
- [ ] 不用术语能讲清楚吗？
- [ ] 能举出具体例子吗？
`,
    "template.feynman.description": "用大白话讲清一个概念，找出自己的知识盲区。",
    "template.feynman.name": "费曼学习法",
    "template.four_quadrant.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [四象限]
---

## 1. 重要且紧急 —— 立即做
- [ ] 

## 2. 重要不紧急 —— 排期做
- [ ] 

## 3. 紧急不重要 —— 委托他人
- [ ] 

## 4. 不紧急不重要 —— 放弃或减少
- [ ] 

> 原则：把时间留给第二象限，真正重要的事都住在这里。{{cursor}}
`,
    "template.four_quadrant.description": "按紧急程度与重要程度把任务分成四个象限，先做重要且紧急的事。",
    "template.four_quadrant.name": "四象限法则",
    "template.gtd.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [gtd]
---

## Inbox 收件箱
- 

## Next Actions 下一步行动
- [ ] 

## Waiting For 等待他人
- [ ] 

## Projects 项目
- [ ] 

## Someday / Maybe 将来也许
- 

## Calendar 日历
- {{today}}：
- {{tomorrow}}：

> 每周回顾：清空收件箱、更新清单，并为每个项目确定下一步的具体行动。
`,
    "template.gtd.description": "收集—厘清—整理—回顾—执行，把脑袋里的事清空到清单里。",
    "template.gtd.name": "GTD 任务管理",
    "template.habit_tracker.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [习惯]
---

## 习惯清单
- [ ] 
- [ ] 
- [ ] 

## 月度打卡

| 日期 | 习惯 1 | 习惯 2 | 习惯 3 |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## 复盘
- 漏了一天？别断链，明天继续就好。{{cursor}}
`,
    "template.habit_tracker.description": "用一张网格表记录每天的习惯完成情况。",
    "template.habit_tracker.name": "习惯打卡",
    "template.knowledge_cards.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [卡片笔记]
---

## 核心想法

> 一句话。

## 展开

## 来源
- 

## 关联
- [[相关笔记]]

## 行动
- [ ] 

> 写得像再也不会看到原始来源一样。{{cursor}}
`,
    "template.knowledge_cards.description": "一张卡片一个想法，搭建自己的知识库。",
    "template.knowledge_cards.name": "知识卡片",
    "template.marketing_plan.content": `---
title: {{title}} 营销策划
createdAt: {{createdAt}}
tags: [营销]
---

## 活动概览
- 目标：
- 目标受众：
- 上线日期：

## 渠道
- [ ] 社交媒体
- [ ] 邮件
- [ ] 内容 / SEO
- [ ] 付费广告

## 内容计划
| 日期 | 渠道 | 主题 | 状态 |
| --- | --- | --- | --- |
|  |  |  |  |

## 预算
| 项目 | 计划 | 实际 |
| --- | --- | --- |
| 广告 |  |  |
| 制作 |  |  |

## 成功指标
- 

## 复盘时间
- {{tomorrow}}
`,
    "template.marketing_plan.description": "策划一次营销活动：受众、渠道、预算与排期。",
    "template.marketing_plan.name": "营销活动策划",
    "template.meal_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [饮食]
---

## 早餐
- 

## 午餐
- 

## 晚餐
- 

## 加餐
- 

## 每日小结
- 热量：  / 
- 饮水： 杯
- 感受：
- 

> 诚实的记录胜过完美的记录。{{cursor}}
`,
    "template.meal_log.description": "记录三餐、热量与餐后感受。",
    "template.meal_log.name": "饮食记录",
    "template.meeting_minutes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [会议]
---

## 基本信息
- 时间：
- 参会人：
- 缺席：

## 议程
1. 

## 讨论要点
- 

## 决策
1. 

## 待办事项
- [ ] 负责人：  · 截止：

## 下次会议
- {{tomorrow}}
`,
    "template.meeting_minutes.description": "记录会议决策、待办事项与负责人。",
    "template.meeting_minutes.name": "会议纪要",
    "template.mistake_notebook.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [错题]
---

## 科目

## 原题

## 我的错误

## 正确解法

## 根本原因
- [ ] 粗心
- [ ] 知识点不熟
- [ ] 方法错误

## 重测日期
- {{tomorrow}}
`,
    "template.mistake_notebook.description": "记录错题与正确解法，避免重复犯错。",
    "template.mistake_notebook.name": "错题本",
    "template.morning_pages.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [日记]
---

## 自由书写

想到什么写什么，不修改、不停笔。

{{cursor}}

## 今日一句

## 今日意图
`,
    "template.morning_pages.description": "每天早晨写三页自由书写，清空大脑，捕捉灵感。",
    "template.morning_pages.name": "晨间日记",
    "template.movie_log.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [观影]
---

## 观影清单

### {{date}}
- 片名：
- 评分：⭐⭐⭐
- 短评：
- 最喜欢的场景：

## 想看清单
- [ ] 
- [ ] 

## 年度统计
- 总数：
- 最爱：
`,
    "template.movie_log.description": "记录看过的影视作品，打分并写下短评。",
    "template.movie_log.name": "观影记录",
    "template.okr.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [okr]
---

## 目标一

- [ ] KR 1.1： 
- [ ] KR 1.2： 
- [ ] KR 1.3： 

## 目标二

- [ ] KR 2.1： 
- [ ] KR 2.2： 

## 每周检视
| 周次 | 进展 | 阻碍 |
| --- | --- | --- |
|  |  |  |

> 关键结果要可衡量、有挑战、有期限，每周检视一次。
`,
    "template.okr.description": "目标与关键结果，把雄心壮志拆成可衡量的成果。",
    "template.okr.name": "OKR 目标管理",
    "template.pdca.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pdca]
---

## Plan 计划
- 目标：
- 现状：
- 根本原因：
- 准备采取的行动：

## Do 执行
- [ ] 
- [ ] 

## Check 检查
- 结果与计划的差距：
- 有效之处：
- 无效之处：

## Act 处理
- 保留：
- 调整：
- 下一轮开始：{{tomorrow}}
`,
    "template.pdca.description": "计划—执行—检查—处理的循环，用于持续改进。",
    "template.pdca.name": "PDCA 循环",
    "template.pomodoro.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [番茄钟]
---

## 今日目标

## 番茄钟记录

| # | 任务 | 打断 | 完成 |
| --- | --- | --- | --- |
| 1 |  |  | [ ] |
| 2 |  |  | [ ] |
| 3 |  |  | [ ] |
| 4 |  |  | [ ] |

## 备注
- 

> 节奏：25 分钟工作、5 分钟休息；每 4 个番茄钟休息长一点。{{cursor}}
`,
    "template.pomodoro.description": "25 分钟专注 + 短休息，用番茄钟对抗拖延。",
    "template.pomodoro.name": "番茄工作法",
    "template.prd.content": `---
title: {{title}} PRD
createdAt: {{createdAt}}
tags: [产品]
---

## 背景
- 问题：
- 为什么是现在：

## 目标
1. 

## 非目标
- 

## 目标用户
- 

## 用户故事
- 作为……，我想要……，以便……

## 功能范围
### 包含
- [ ] 

### 不包含
- 

## 验收标准
- [ ] 

## 衡量指标
- 

## 待确认
- 
`,
    "template.prd.description": "产品需求文档：背景、用户、范围与验收标准。",
    "template.prd.name": "产品需求文档",
    "template.project_review.content": `---
title: {{title}} 复盘
createdAt: {{createdAt}}
tags: [复盘]
---

## 背景
- 项目：
- 周期：
- 目标：

## 做得好
1. 

## 做得不好
1. 

## 根因分析
- 

## 继续做
- 

## 下次改进
- [ ] 

## 经验沉淀
- 
`,
    "template.project_review.description": "回顾项目中的得失，沉淀改进项。",
    "template.project_review.name": "项目复盘",
    "template.recipe.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [食谱]
---

## 菜品

## 份量

## 时间
- 备菜： 分钟
- 烹饪： 分钟

## 食材
- 

## 步骤
1. 

## 口味记录
- 评分：⭐⭐⭐
- 下次调整：

> 记得写下实际使用的调料用量。{{cursor}}
`,
    "template.recipe.description": "标准食谱卡片：食材、步骤与口味记录。",
    "template.recipe.name": "食谱",
    "template.shopping_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [购物]
---

## 生鲜食品
- [ ] 
- [ ] 

## 日用品
- [ ] 
- [ ] 

## 数码及其他
- [ ] 

## 预算
- 计划： 
- 已花： 
- 剩余： 

> 每放进购物车一件，就勾掉一件。{{cursor}}
`,
    "template.shopping_list.description": "按分类整理的购物清单，带数量与预算。",
    "template.shopping_list.name": "购物清单",
    "template.sleep_diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [睡眠]
---

## 昨夜
- 上床时间：
- 入睡时间：
- 醒来时间：
- 起床时间：

## 质量
- 总睡眠： 小时
- 质量（1-5）：
- 醒来次数：

## 影响因素
- 14 点后摄入咖啡因：
- 睡前使用屏幕：
- 今日运动：

## 今晚计划
- [ ] 开始放松：
- [ ] 熄灯：

> 保持规律作息，周末也一样。{{cursor}}
`,
    "template.sleep_diary.description": "记录入睡、起床时间与睡眠质量。",
    "template.sleep_diary.name": "睡眠日记",
    "template.speech_draft.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [演讲]
---

## 场合
- 活动：
- 时长： 分钟
- 听众：

## 一句话信息
> 

## 开场
- 钩子：
- 为什么讲这个话题：

## 主体
### 要点 1
- 

### 要点 2
- 

### 要点 3
- 

## 收尾
- 回顾：
- 行动号召：

## 演讲提示
- 语速：
- 停顿：
`,
    "template.speech_draft.description": "组织演讲稿：开场、要点与行动号召。",
    "template.speech_draft.name": "演讲稿",
    "template.story_setting.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [写作]
---

## 一句话梗概
> 

## 角色
### 主角
- 姓名：
- 想要：
- 需要：
- 缺陷：

### 反派
- 姓名：
- 想要：

## 世界观
- 背景：
- 规则：
- 冲突来源：

## 情节
### 开端
- 

### 发展
- 

### 结局
- 

## 主题
- 
`,
    "template.story_setting.description": "搭建故事的角色、世界观与情节。",
    "template.story_setting.name": "故事设定",
    "template.swot.content": `---
title: {{title}} SWOT
createdAt: {{createdAt}}
tags: [swot]
---

|  | 积极 | 消极 |
| --- | --- | --- |
| 内部 | **优势 Strengths** | **劣势 Weaknesses** |
|  |  |  |
| 外部 | **机会 Opportunities** | **威胁 Threats** |
|  |  |  |

## 策略
- SO（用优势抓住机会）：
- WO（补短板抓住机会）：
- ST（用优势化解威胁）：
- WT（避开威胁、减少劣势）：
`,
    "template.swot.description": "评估优势、劣势、机会与威胁。",
    "template.swot.name": "SWOT 分析",
    "template.task_breakdown.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [拆解]
---

## 大任务

**目标 / 完成标准：**

## 子任务
- [ ] 1. 
  - [ ] 细节
- [ ] 2. 
  - [ ] 细节
- [ ] 3. 

## 依赖与风险
- 

## 预估
- 总计： 小时
- 截止： 

> 每个子任务都要小到可以不用思考就开始。{{cursor}}
`,
    "template.task_breakdown.description": "把大任务拆成一个个可以立刻执行的小任务。",
    "template.task_breakdown.name": "任务拆解",
    "template.todo_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [待办]
---

## 今日待办
- [ ] **高优先级**
  - [ ] 
- [ ] **中优先级**
  - [ ] 
- [ ] **低优先级**
  - [ ] 

## 延后处理
- [ ] 

> 先圈出最重要的一件事，从它开始。{{cursor}}
`,
    "template.todo_list.description": "简单清晰的每日待办清单，带优先级与截止时间。",
    "template.todo_list.name": "Todo 清单",
    "template.travel_guide.content": `---
title: {{title}} 旅行攻略
createdAt: {{createdAt}}
tags: [旅行]
---

## 行程概览
- 目的地：
- 日期：
- 同行人：

## 行程安排
### 第 1 天 · {{today}}
- [ ] 上午：
- [ ] 下午：
- [ ] 晚上：

### 第 2 天 · {{tomorrow}}
- [ ] 上午：
- [ ] 下午：
- [ ] 晚上：

## 预算
| 项目 | 计划 | 实际 |
| --- | --- | --- |
| 交通 |  |  |
| 住宿 |  |  |
| 餐饮 |  |  |
| 门票 |  |  |

## 行李清单
- [ ] 证件
- [ ] 

## 预订
- [ ] 机票 / 车票
- [ ] 酒店
- [ ] 

## 备注
- 
`,
    "template.travel_guide.description": "规划行程、预算、行李与预订。",
    "template.travel_guide.name": "旅游攻略",
    "template.weekly_plan.content": `---
title: {{title}} · 本周
createdAt: {{createdAt}}
tags: [周计划]
---

## 本周重点
1. 

## 日程
| 星期 | 任务 | 备注 |
| --- | --- | --- |
| 周一 |  |  |
| 周二 |  |  |
| 周三 |  |  |
| 周四 |  |  |
| 周五 |  |  |
| 周六 |  |  |
| 周日 |  |  |

## 下周预告
- 

> 周日复盘：哪些推进了，哪些需要重新安排。{{cursor}}
`,
    "template.weekly_plan.description": "一周计划：定目标、排日程、周末复盘。",
    "template.weekly_plan.name": "周计划",
    "template.weekly_report.content": `---
title: {{title}} 周报
createdAt: {{createdAt}}
tags: [周报]
---

## 本周完成
1. 

## 进行中
- 

## 需要支持
- 

## 本周收获
- 

## 下周计划
- [ ] 

## 数据
| 指标 | 目标 | 实际 |
| --- | --- | --- |
|  |  |  |
`,
    "template.weekly_report.description": "总结本周进展、收获与下周计划。",
    "template.weekly_report.name": "周报",
    "template.workout_plan.content": `---
title: {{title}} 训练计划
createdAt: {{createdAt}}
tags: [健身]
---

## 每周安排
| 星期 | 训练重点 |
| --- | --- | --- |
| 周一 |  |
| 周三 |  |
| 周五 |  |

## 训练日志
### 推日
| 动作 | 组数 × 次数 | 重量 | 完成 |
| --- | --- | --- | --- |
|  |  |  | [ ] |

### 拉日
| 动作 | 组数 × 次数 | 重量 | 完成 |
| --- | --- | --- | --- |
|  |  |  | [ ] |

## 休息与恢复
- 睡眠： 小时
- 拉伸：[ ] 
`,
    "template.workout_plan.description": "每周训练计划：动作、组数与次数。",
    "template.workout_plan.name": "健身计划",
    "templates.all_templates": "全部模板",
    "templates.builtin": "内置",
    "templates.categories": "分类",
    "templates.category": "分类",
    "templates.category_name": "分类名称",
    "templates.create_template": "创建模板",
    "templates.created_note_from_template": "已用模板创建笔记",
    "templates.delete_category": "删除分类",
    "templates.delete_category_confirm": "删除分类「{value0}」？其中的模板会移到「未分类」。",
    "templates.delete_template": "删除模板",
    "templates.delete_template_confirm": "删除这个模板？已经创建的笔记不受影响。",
    "templates.description": "描述",
    "templates.duplicate_template": "复制模板",
    "templates.edit_template": "编辑模板",
    "templates.favorites": "收藏",
    "templates.lines_count": "{value0} 行",
    "templates.move_to_category": "移动到分类",
    "templates.name_required": "请填写名称",
    "templates.new_category": "新建分类",
    "templates.new_note_from_template": "从模板新建笔记",
    "templates.new_template": "新建模板",
    "templates.no_matching_templates": "没有匹配的模板",
    "templates.no_templates": "这里还没有模板",
    "templates.no_templates_hint": "新建一个模板，或换个分类看看",
    "templates.rename_category": "重命名分类",
    "templates.rename_template": "重命名",
    "templates.search_templates": "搜索模板…",
    "templates.template_content": "模板内容",
    "templates.template_content_hint": "支持与新建笔记模板相同的占位符：{{title}}、{{date}}、{{time}}、{{today}}、{{tomorrow}}、{{yesterday}}、{{cursor}}。",
    "templates.template_count": "{value0} 个模板",
    "templates.template_library": "模板库",
    "templates.template_name": "模板名称",
    "templates.uncategorized": "未分类",
    "templates.use_template": "使用此模板",
    "templates.copied_to_clipboard": "已复制到剪贴板",
    "templates.copy_json": "复制 JSON",
    "templates.export_library": "导出模板库",
    "templates.exported_value0_templates": "已导出 {value0} 个模板",
    "templates.import_file": "选择文件",
    "templates.import_hint": "粘贴从其他设备导出的模板库 JSON，或选择一个文件。你已有的模板会保留。",
    "templates.import_invalid": "该文件不是有效的模板库导出。",
    "templates.import_paste_placeholder": "在此粘贴模板库 JSON…",
    "templates.import_templates": "导入模板",
    "templates.import_title": "导入模板",
    "templates.imported_value0_skipped_value1": "已导入 {value0} 个模板，跳过 {value1} 个",
    "templates.no_favorite_templates": "没有收藏的模板",
    "templates.no_favorite_templates_hint": "在模板库中收藏模板后，可从这里一键新建笔记。",
    "templates.open_template_library": "打开模板库",
    "templates.tag_hint": "多个标签用逗号分隔。",
    "templates.tags": "标签",
    "templates.batch_delete_confirm_value0": "确定删除这 {value0} 个模板吗？已创建的笔记不受影响。",
    "templates.batch_deleted_value0": "已删除 {value0} 个模板",
    "templates.batch_moved_value0": "已移动 {value0} 个模板",
    "templates.batch_starred_value0": "已收藏 {value0} 个模板",
    "templates.batch_unstarred_value0": "已取消收藏 {value0} 个模板",
    "templates.clear_selection": "清空选择",
    "templates.exit_select_mode": "退出多选",
    "templates.kbd_hint": "↑↓←→ 移动 · Enter 使用 · Ctrl/⌘+点击 收藏 · / 搜索",
    "templates.select_all": "全选",
    "templates.select_hint": "点击卡片选择多个模板，再进行批量操作。Esc 退出。",
    "templates.select_mode": "多选",
    "templates.select_template": "选择模板",
    "templates.selected_count_value0": "已选 {value0} 个",
    "templates.community": "社区模板",
    "templates.community_count_value0": "社区已分享 {value0} 个模板",
    "templates.community_empty": "还没有人分享模板",
    "templates.community_empty_hint": "从你的模板库发布一个模板，让社区热闹起来。",
    "templates.community_import": "添加到我的模板库",
    "templates.community_imported": "已添加到你的模板库",
    "templates.community_load_failed": "无法加载社区模板",
    "templates.community_mine": "我的",
    "templates.community_published": "模板已发布",
    "templates.community_unpublish": "取消发布",
    "templates.community_unpublish_confirm": "从社区移除这个模板？它仍保留在你的模板库中。",
    "templates.community_unpublished": "模板已取消发布",
    "templates.help_esc": "关闭 / 退出多选",
    "templates.help_help": "显示此帮助",
    "templates.help_move": "在模板之间移动",
    "templates.help_search": "聚焦搜索",
    "templates.help_select_all": "全选可见 / 清除",
    "templates.help_select_click": "点选 / 取消点选模板",
    "templates.help_select_focused": "切换聚焦模板的选中状态",
    "templates.help_select_mode": "进入 / 退出多选模式",
    "templates.help_select_section": "多选模式",
    "templates.help_star": "收藏 / 取消收藏",
    "templates.help_tab": "在控件之间移动",
    "templates.help_use": "使用当前聚焦的模板",
    "templates.keyboard_shortcuts": "键盘快捷键",
    "templates.publish_hint": "这会将模板公开发布到本实例的社区。任何登录用户都可以使用或复制它。",
    "templates.publish_to_community": "发布到社区",
    "common.refresh": "刷新",
    "seed.welcome_note": `---
title: 欢迎使用 Inkstone
tags: [入门, Inkstone]
aliases:
  - 使用指南
---

# 欢迎使用 Inkstone

> [!TIP] 先知道这五件事
> - 这是你的私有 Markdown 笔记本；正文始终是普通文本。
> - 内容会自动保存，断网也能继续写，重新联网后自动补传。
> - 新建、移动、整理和删除等常用操作会先在本地立即生效；保存失败时安全回滚。
> - 笔记顶部标题可以独立编辑，不必与正文第一行相同。
> - MCP 完全可选，并且必须经过账号授权才能读取笔记。

左侧管理笔记，中间编辑纯文本 Markdown，右侧实时预览。没有专有文档格式，备份里的 \`.md\` 文件可以被任何文本编辑器打开。

## 现在就试试

- [ ] 点击这个复选框，确认它会同步改写左侧源码
  - [ ] 子任务也能精确勾选，不会改错上一行
- [ ] 选中文字，按 \`Ctrl + B\` 加粗
- [ ] 按 \`Ctrl + K\` 打开命令面板
- [ ] 写一个 \`#标签\`，或点击 [[我的第一篇笔记]] 创建双链笔记
- [ ] 点击笔记顶部标题，把它改成与正文不同的名称
- [ ] 新建一个子文件夹，再把它拖到其他文件夹或同级位置
- [ ] 按住 Alt 点击另一篇笔记，或选择**在侧边打开**，同时处理两篇笔记
- [ ] 在 **设置 → 关于** 把 Inkstone 安装成可离线启动的 PWA
- [ ] 打开 **设置 → MCP** 查看私有 AI 接入方式和权限
- [ ] 在 **设置 → 备份** 添加一个备份目标
- [ ] 给一篇笔记创建带口令的分享

> [!NOTE] 添加备份
> 打开 **设置 → 备份**，添加 WebDAV 或 S3 目标，测试连接后执行一次 **立即备份**。

> [!NOTE] 创建安全分享
> 打开任意笔记右上角的 **分享**，设置访问口令和有效期。受保护分享中的附件也只有通过口令验证后才能访问。

## 常用 Windows 快捷键

| 快捷键 | 作用 |
| --- | --- |
| \`Ctrl + K\` | 打开命令面板 |
| \`Ctrl + P\` | 快速打开笔记 |
| \`Ctrl + N\` | 新建笔记 |
| \`Ctrl + Shift + F\` | 全文搜索 |
| \`Ctrl + ,\` | 打开设置 |
| \`Ctrl + \\\` | 切换编辑、分栏和预览 |
| \`Ctrl + S\` | 立即保存；平时会自动保存 |
| \`Ctrl + B / I / E\` | 粗体、斜体、行内代码 |
| \`Ctrl + 1…6\` | 设置一至六级标题 |
| \`Shift + ?\` | 查看完整快捷键 |

## 为什么适合长期使用

:::: tabs
::: tab-item 写作
独立标题、源码编辑、实时预览、双向滚动、专注模式、打字机模式、大纲与版本历史。
:::

::: tab-item 组织
最多 12 层且可拖拽排序的文件夹、正文 \`#标签\`、\`[[双链]]\`、反向链接、关系图谱和中文全文搜索。桌面端可以在侧边再开一篇笔记，每个窗格独立选择编辑、分栏或预览；删除文件夹时会保留并提升子文件夹，直属笔记移到上一级。
:::

::: tab-item 搜索与 AI
命令面板、关键词搜索，以及可选的 Workers AI 语义/混合搜索。每个账号使用独立索引；AI 不可用时自动回退到关键词结果。
:::

::: tab-item 安全与备份
自托管、可安装 PWA、离线可写、多设备同步和冲突副本；可同时备份到多个 WebDAV 或 S3 目标，并导出可读 Markdown、附件与完整结构化数据。
:::
::::

## 私有 MCP（可选）

在 **设置 → MCP** 中，站长可以启用远程 MCP 服务，每个账号再决定是否允许写入或移入回收站：

- Codex、Claude Code 等完整 MCP 客户端通过带 PKCE 的 OAuth 2.1 授权；可以随时撤销单个或全部客户端。
- 脚本或不支持 OAuth 的精简客户端可以使用 \`ink_...\` API Key。Key 只显示一次，服务端只保存哈希，也可以随时撤销。
- MCP 可以搜索、分段读取、查看大纲/文件夹/标签/链接，并在明确授权后安全创建、编辑、整理、移入回收站或恢复笔记；永久删除始终不可用。
- 配置 Workers AI 后可以建立按账号隔离的语义索引，并把语义结果与关键词结果合并。索引可重建或清空，正文变化会在后台更新。

> [!WARNING] 连接外部 AI 前先确认隐私政策
> Inkstone 会隔离账号并校验权限，但已授权客户端实际读取到的内容，之后仍由该客户端处理。

## Markdown 速查

每个示例标题下面，左侧是**实际效果**，右侧是可以直接复制的**对应源码**。

### 行内样式

| 实际效果 | 对应源码 |
| --- | --- |
| **粗体** | \`**粗体**\` |
| *斜体* | \`*斜体*\` |
| ~~删除线~~ | \`~~删除线~~\` |
| ==高亮== | \`==高亮==\` |
| \`行内代码\` | \`\` \`行内代码\` \`\` |

### 链接、图片与笔记关系

~~~~md-example title="普通链接"
[打开示例网站](https://example.com)
~~~~

~~~~md-example title="图片"
![Inkstone 项目 Logo](/inkstone-logo.svg "Inkstone 项目 Logo")
~~~~

~~~~md-example title="双链"
[[我的第一篇笔记|打开或创建笔记]] · [[欢迎使用 Inkstone#Markdown 速查|跳到本节]]
~~~~

~~~~md-example title="块 ID 与块引用"
这是一段可以被精确定位的内容。 ^markdown-demo

点击 [[#^markdown-demo]] 可以跳回上面这段。
~~~~

~~~~md-example title="笔记嵌入"
这段内容会在下方被再次嵌入。 ^embed-demo

![[#^embed-demo|嵌入结果]]
~~~~

~~~~md-example title="脚注"
这句话带有一条补充说明。[^markdown-footnote]

[^markdown-footnote]: 这是脚注的实际内容；点击编号可以在正文与脚注之间跳转。
~~~~

Obsidian 注释不会出现在预览中：\`%% 单行注释 %%\`；多行内容可用单独的 \`%%\` 标记包围。

### 公式与图表

~~~~md-example title="公式"
行内公式：$E = mc^2$

$$
a^2 + b^2 = c^2
$$
~~~~

~~~~md-example title="Mermaid 图表"
\`\`\`mermaid
flowchart LR
  A[Markdown 源码] --> B[实时预览]
\`\`\`
~~~~

### 现代块级扩展

~~~~md-example title="Obsidian Callout"
> [!NOTE]- 默认折叠并使用自定义标题
> 这里可以放说明、任务、列表或其他 Markdown 内容。
>
> > [!TIP]+ 默认展开的嵌套 Callout
> > 嵌套 Callout 使用相同语法。
~~~~

~~~~md-example title="折叠内容"
::: details [点击展开]
这里的内容会在展开折叠块后显示。
:::
~~~~

~~~~md-example title="标签页"
:::: tabs
::: tab-item 第一个标签
这是第一个标签页的内容。
:::

::: tab-item 第二个标签
这是第二个标签页的内容。
:::
::::
~~~~

~~~~md-example title="带标题、行号和高亮的代码块"
\`\`\`ts title="hello.ts" line-numbers {2}
const name = 'Inkstone'
console.log(\`Hello, \${name}!\`)
\`\`\`
~~~~

## 保存、同步与恢复

内容会自动保存并同步到其他设备；断网时可以继续编辑，重新联网后会按顺序补传。普通操作会先在本地立即显示，后台保存失败才回滚；过期的同步结果不会覆盖更新的本地状态。

在 **设置 → 关于** 可以安装 PWA。新版本会先提示再刷新，并在刷新前提交待保存的笔记；只有站长会收到部署版本更新提醒。现有数据库升级会自动执行带版本号、可重复安全运行的迁移，但更新自托管实例前仍应保留最新备份。

在 **设置 → 备份** 中可添加多个 WebDAV/S3 目标并设置自动计划；在 **设置 → 数据** 中可导入或导出 \`.md\`、\`.zip\` 和完整 JSON。

> [!WARNING] 备份不是同步
> 建议至少使用两个不同服务商保存备份，并偶尔实际恢复一次，确认它真的可用。

## 最后

按 \`Ctrl + ,\` 可以修改界面语言、主题、排版、编辑器、同步和备份。读到这里，你已经知道使用 Inkstone 所需的一切；可以保留这篇速查，也可以放心删除它，开始写自己的内容。 #入门
`,
} as const satisfies Record<MessageKey, string>;
