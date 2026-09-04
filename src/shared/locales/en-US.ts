export const EN_US_MESSAGES = {
    "app.boot_label": "Preparing your notebook…",
    "app.document_title": "Inkstone",
    "app.meta_description": "A private, self-hosted Markdown notebook built on Cloudflare.",
    "api.error.bad_request": "The request is invalid",
    "api.error.conflict": "This content was changed elsewhere. Refresh and try again",
    "api.error.forbidden": "You do not have permission to perform this action",
    "api.error.internal": "Internal server error",
    "api.error.invalid_avatar": "The avatar is invalid or too large",
    "api.error.invalid_credentials": "Incorrect username or password",
    "api.error.invalid_two_factor_code": "The verification code is incorrect or has already been used",
    "api.error.invalid_profile_name": "The display name is invalid",
    "api.error.invalid_username": "The username format is invalid",
    "api.error.not_found": "The requested item does not exist",
    "api.error.payload_too_large": "The content is too large",
    "api.error.registration_closed": "Registration is closed for this instance",
    "api.error.server_misconfigured": "The server configuration is incomplete",
    "api.error.storage_unavailable": "Storage is temporarily unavailable",
    "api.error.too_many_attempts": "Too many attempts. Try again later",
    "api.error.two_factor_already_enabled": "Two-step verification is already enabled",
    "api.error.two_factor_challenge_expired": "The sign-in verification expired. Enter your password again",
    "api.error.two_factor_not_enabled": "Two-step verification is not enabled",
    "api.error.two_factor_setup_expired": "The setup session expired. Start again",
    "api.error.two_factor_unavailable": "The authenticator secret is unavailable. Use a recovery code instead",
    "api.error.unauthenticated": "Please sign in first",
    "api.error.username_taken": "That username is already in use",
    "api.error.weak_password": "The password is too weak",
    "api.error.wrong_password": "The current password is incorrect",
    "api.error.unknown": "Request failed",
    "backup.error.storage_service": "The storage service returned an error. Check the configuration and try again",
    "backup.service.access_key_invalid": "The Access Key is invalid",
    "backup.service.access_key_missing": "Access Key or Secret Key is missing",
    "backup.service.archive_missing": "The backup archive was not generated",
    "backup.service.bucket_missing": "Enter a bucket name",
    "backup.service.bucket_not_found": "The bucket does not exist or the endpoint is incorrect",
    "backup.service.bucket_region_mismatch": "The bucket region does not match. Check region and endpoint",
    "backup.service.bucket_write_forbidden": "The key is invalid or lacks write access to this bucket",
    "backup.service.connection_failed_network": "Could not connect. Check DNS, the port, and the TLS certificate",
    "backup.service.connection_failed_url": "Could not connect. Check the URL",
    "backup.service.connection_ok": "Connection succeeded with read and write access",
    "backup.service.connection_timeout": "Connection timed out. Check the network and URL",
    "backup.service.credentials_decrypt_failed": "Backup credentials could not be decrypted. Enter them again in Settings",
    "backup.service.credentials_required": "Enter credentials before testing",
    "backup.service.cross_origin_redirect": "WebDAV redirected to another origin. Enter the final HTTPS URL to protect credentials",
    "backup.service.folder_permission_missing": "Permission to create folders is missing",
    "backup.service.no_enabled_targets": "No backup targets are enabled",
    "backup.service.path_missing": "The path does not exist. Check the URL",
    "backup.service.path_style_required": "The service does not support this operation. Enable path-style access",
    "backup.service.read_back_mismatch": "The data read after writing did not match. Check the storage gateway or proxy",
    "backup.service.read_back_mismatch_webdav": "The data read after writing did not match. Check the WebDAV gateway or proxy",
    "backup.service.request_rejected": "The request was rejected. Check region and endpoint",
    "backup.service.signature_mismatch": "Signature mismatch. Check the Secret Key and region",
    "backup.service.storage_full": "The server is out of storage",
    "backup.service.too_many_redirects": "Too many WebDAV redirects",
    "backup.service.transfer_incomplete": "Backup transfer did not complete",
    "backup.service.webdav_credentials_missing": "WebDAV username or password is missing",
    "backup.service.webdav_url_missing": "Enter a WebDAV URL",
    "backup.service.write_access_missing": "Write access is missing",
    "backup.service.write_access_missing_after_connect": "Connected, but write access is missing",
    "backup.service.cleanup_failed": "Read and write succeeded, but the test file could not be removed: HTTP {status}",
    "backup.service.create_folder_failed": "Creating folder {path} failed: HTTP {status}",
    "backup.service.http_error": "Server returned HTTP {status}",
    "backup.service.path_not_found": "Path not found: {path}",
    "backup.service.read_failed": "Write succeeded but read failed: {details}",
    "backup.service.upload_failed": "Upload {path} failed: HTTP {status}",
    "backup.service.write_test_failed": "Write test failed: HTTP {status}",
    "api.no_network_connection": "No network connection",
    "api.invalid_server_response": "The server returned an invalid response",
    "api.request_failed_status": "Request failed ({status})",
    "api.request_timed_out": "The request timed out",
    "app.missing_root_mount_point": "Missing #root mount point",
    "app.something_went_wrong": "Something went wrong",
    "app.error_boundary_description": "An unexpected error occurred. Please reload the page to continue.",
    "app.reload": "Reload",
    "app.section_unavailable": "This section is temporarily unavailable",
    "auth.already_have_an_account_sign_in": "Already have an account? Sign in",
    "auth.between_the_paper_and_ink_the_pen_comes_to_life_an_inkstone_is_used_to_p": "Between the paper and ink, the pen comes to life. An inkstone is used to place all thoughts.",
    "auth.confirm_password": "Confirm Password",
    "auth.create_owner_account": "Create owner account",
    "auth.create_the_owner_account_this_step_appears_only_once": "Create the owner account. This step appears only once.",
    "auth.authenticator_code": "Authenticator code",
    "auth.back_to_password": "Back to password",
    "auth.enter_a_username_and_password": "Enter a username and password",
    "auth.enter_authenticator_code": "Enter the 6-digit code from your authenticator app",
    "auth.enter_recovery_code": "Enter one of your recovery codes",
    "auth.live_split_view_markdown_preview_realtime_multi_device_sync_multiple_web": "Live split-view Markdown preview · Realtime multi-device sync · Multiple WebDAV / S3 backups",
    "auth.network_error_try_again": "Network error. Try again",
    "auth.no_account_create_one": "No account? Create one",
    "auth.password_minimum_8_characters": "Password (minimum 8 characters)",
    "auth.recovery_code": "Recovery code",
    "auth.recovery_code_used": "Recovery code used",
    "auth.recovery_codes_remaining": "You have {count} unused recovery code(s) remaining. Replace them in Settings if needed.",
    "auth.self_hosted_on_cloudflare_workers_your_data_is_yours": "Private notes · Your data stays under your control",
    "auth.sign_in": "Sign in",
    "auth.sign_up": "Sign up",
    "auth.this_is_a_private_instance_registration_is_closed_so_only_existing_accou": "This is a private instance. Registration is closed, so only existing accounts can sign in.",
    "auth.two_step_verification_description": "Your password was accepted. Enter a second verification code to finish signing in.",
    "auth.use_authenticator_code": "Use authenticator code",
    "auth.use_recovery_code": "Use recovery code",
    "auth.verify_and_sign_in": "Verify and sign in",
    "command.add_current_note_to_favorites": "Add current note to favorites",
    "command.archive_current_note": "Archive current note",
    "command.insert_note_template": "Insert note template at the cursor",
    "command.change_accent_color": "Change accent color",
    "command.year_grid_columns": "Switch year view columns",
    "command.year_grid_columns_switched_value0": "Year view columns: {value0}",
    "command.year_grid_columns_undone": "Reverted year view columns",
    "command.check_uncheck_tasks": "Check/uncheck tasks",
    "command.code_block_language_autocomplete": "Code block (language autocomplete)",
    "command.commands": "Commands",
    "command.content_match": "Content match",
    "command.continue_lists_automatically_press_enter_on_an_empty_item_to_exit": "Continue lists automatically; press Enter on an empty item to exit",
    "command.create_note_value0": "Create note “{value0}”",
    "command.delete_line": "Delete line",
    "command.export_all_notes_zip": "Export all notes (ZIP)",
    "command.filter_by_tags": "Filter results by tags",
    "command.select_all_matches": "Select all {value0} matches",
    "command.select_all_tags": "Select all {value0} tags",
    "command.find_and_replace_in_this_note": "Find and replace in this note",
    "command.heading_1_same_pattern_for_2_6": "Heading 1 (same pattern for 2–6)",
    "command.insert_tag_autocomplete": "Insert tag (autocomplete)",
    "command.jump_to_the_next_cell_in_the_table": "Jump to the next cell in the table",
    "command.keyboard_shortcuts": "Keyboard shortcuts",
    "command.keyboard_shortcuts_021cf9": "Keyboard shortcuts",
    "command.layout_editor_only": "Layout: Editor only",
    "command.layout_preview_only": "Layout: Preview only",
    "command.layout_split_view": "Layout: Split view",
    "command.link_to_another_note_autocomplete": "Link to another note (autocomplete)",
    "command.move_line_down": "Move line down",
    "command.move_line_up": "Move line up",
    "command.move_the_current_note_to_trash": "Move the current note to trash",
    "command.no_matching_results": "No matching results",
    "command.calendar_jump_value0": "Go to calendar · {value0}",
    "command.calendar_this_week_value0": "Calendar · this week ({value0})",
    "command.calendar_year_hints": "Sidebar calendar · Year view",
    "command.calendar_year_weekday_move": "Move across the focused month's weekday columns",
    "command.calendar_year_weekday_move_keywords": "year,month,weekday,column,move,arrow",
    "command.calendar_year_weekday_filter": "Filter the note list by that week",
    "command.calendar_year_weekday_filter_keywords": "week,filter,list,enter",
    "command.calendar_year_weekday_exit": "Return to the month card",
    "command.calendar_year_weekday_exit_keywords": "card,exit,return,esc",
    "command.calendar_year_month_move": "Move between month cards",
    "command.calendar_year_month_move_keywords": "year,month,card,move,arrow,navigate",
    "command.calendar_this_year_value0": "Calendar · this year ({value0})",
    "command.calendar_this_quarter_value0": "Calendar · this quarter ({value0})",
    "command.calendar_this_month_value0": "Calendar · this month ({value0})",
    "command.open_favorites": "Open favorites",
    "command.open_graph": "Open graph",
    "command.open_trash": "Open trash",
    "command.recently_opened": "Recently opened",
    "command.redo": "Redo",
    "command.remove_current_note_from_favorites": "Remove current note from favorites",
    "command.search_notes_or_type_a_command": "Search notes or type a command…",
    "command.selected_tags_filtering": "Results filtered by {value0} selected tags",
    "command.select": "Select",
    "command.share_current_note": "Share current note",
    "command.shortcuts_filter_placeholder": "Filter shortcuts…",
    "command.shortcuts_clear_filter": "Clear shortcut filter",
    "command.shortcuts_no_results": "No shortcuts match your search",
    "command.switch_to_dark_theme": "Switch to dark theme",
    "command.switch_to_light_theme": "Switch to light theme",
    "command.triggered_as_you_type": "Triggered as you type",
    "command.use_nearly_every_action_without_touching_the_mouse": "Use nearly every action without touching the mouse",
    "attachments.add_tag": "Add Tag",
    "attachments.all_files": "All Files",
    "attachments.archives": "Archives & Code",
    "attachments.batch_delete": "Delete",
    "attachments.batch_delete_confirm": "Delete {value0} selected attachments?",
    "attachments.batch_download": "Download",
    "attachments.batch_move": "Move",
    "attachments.categories": "Categories",
    "attachments.category_breakdown": "Category Breakdown",
    "attachments.cleanup": "Clean up unreferenced",
    "attachments.cleanup_confirm": "Clean up unreferenced attachments?",
    "attachments.cleanup_confirm_description": "Only attachments that no longer appear in any note body will be deleted. This cannot be undone.",
    "attachments.cleanup_failed": "Cleanup failed",
    "attachments.cleaned_value0": "Cleaned up {value0} attachments",
    "attachments.copy_link": "Copy Link",
    "attachments.copy_markdown": "Copy Markdown",
    "attachments.dashboard": "Dashboard",
    "attachments.delete": "Delete attachment",
    "attachments.delete_confirm_value0": "Delete attachment \"{value0}\"?",
    "attachments.delete_failed": "Could not delete attachment",
    "attachments.deleted": "Attachment deleted",
    "attachments.detail_info": "Details",
    "attachments.documents": "Documents",
    "attachments.drag_drop_hint": "Drag and drop files here to upload",
    "attachments.drive_title": "Attachment Drive",
    "attachments.empty": "No attachments yet. Paste or drag an image into a note to upload one.",
    "attachments.filename": "Filename",
    "attachments.filter_all": "All",
    "attachments.filter_documents": "Documents",
    "attachments.filter_images": "Images",
    "attachments.filter_other": "Other",
    "attachments.freed_value0": "Freed {value0}",
    "attachments.insert_into_note": "Insert into Note",
    "attachments.largest_files": "Largest Files",
    "attachments.load_failed": "Could not load more attachments",
    "attachments.load_more": "Load more",
    "attachments.manage": "Manage attachments",
    "attachments.manage_description": "View, filter, and delete every uploaded attachment.",
    "attachments.manage_tags": "Manage Tags",
    "attachments.media": "Audio & Video",
    "attachments.move_to": "Move to Folder",
    "attachments.no_referencing_notes": "No notes reference this attachment",
    "attachments.none_match": "No matching attachments",
    "attachments.nothing_to_clean": "No attachments to clean up",
    "attachments.photos": "Photos",
    "attachments.pin": "Pin",
    "attachments.pinned_files": "Pinned",
    "attachments.qr_code_hint": "Scan with phone camera or QR scanner to open or download directly",
    "attachments.qr_code_title": "QR Code",
    "attachments.quota_info": "Total Cloud Storage Quota",
    "attachments.referenced_value0": "{value0} references",
    "attachments.referencing_notes": "Referencing Notes",
    "attachments.remaining_space": "Remaining space: {value0}",
    "attachments.rename": "Rename",
    "attachments.search_placeholder": "Search filename or tag…",
    "attachments.selected_count": "{value0} selected",
    "attachments.shown_value0": "Showing {value0} attachments",
    "attachments.size_all": "All Sizes",
    "attachments.size_large": "Large (> 10MB)",
    "attachments.size_medium": "Medium (1MB ~ 10MB)",
    "attachments.size_small": "Small (< 1MB)",
    "attachments.sort_date_asc": "Oldest",
    "attachments.sort_date_desc": "Newest",
    "attachments.sort_name_asc": "Name (A-Z)",
    "attachments.sort_name_desc": "Name (Z-A)",
    "attachments.sort_size_asc": "Size (Asc)",
    "attachments.sort_size_desc": "Size (Desc)",
    "attachments.star": "Star",
    "attachments.starred_files": "Starred",
    "attachments.stats_title": "Storage",
    "attachments.storage_donut_title": "Storage Usage",
    "attachments.storage_stats": "Storage Usage",
    "attachments.storage_summary": "{value0} files · {value1}",
    "attachments.structure": "Structure",
    "attachments.sync_note_references": "Update references in notes",
    "attachments.today": "Today",
    "attachments.top_extensions": "Top Formats",
    "attachments.total_files": "Total Files",
    "attachments.total_value0": "{value0} attachments",
    "attachments.type_all": "All Types",
    "attachments.unpin": "Unpin",
    "attachments.unreferenced": "Unreferenced",
    "attachments.unreferenced_count_value0": "Unreferenced: {value0}",
    "attachments.unreferenced_files": "Unreferenced",
    "attachments.unstar": "Unstar",
    "attachments.upload_file": "Upload File",
    "attachments.upload_guide_hint": "Supports images, documents, media, and archives up to 50MB",
    "attachments.used": "Used",
    "attachments.view_grid": "Grid Gallery",
    "attachments.view_list": "List Table",
    "attachments.yesterday": "Yesterday",
    "attachments.zoom_lg": "Large",
    "attachments.zoom_md": "Medium",
    "attachments.zoom_sm": "Small",
    "common.about": "About ",
    "common.access_control": "Access control",
    "common.access_passcode": "Access passcode",
    "common.action_failed": "Action failed",
    "common.backlinks": "Backlinks",
    "common.bold": "Bold",
    "common.cancel": "Cancel",
    "common.checking": "Checking…",
    "common.clear": "Clear",
    "common.clear_selection": "Clear selection",
    "common.close": "Close",
    "common.collapse": "Collapse",
    "common.command_palette": "Command palette",
    "common.continue": "Continue",
    "common.copied": "Copied",
    "common.copy": "Copy",
    "common.created": "Created",
    "common.current_note": "Current note",
    "common.delete": "Delete",
    "common.delete_failed": "Delete failed",
    "common.download": "Download",
    "common.edit": "Edit",
    "common.emoji": "Emoji",
    "common.empty_trash": "Empty trash?",
    "common.exit": "Exit",
    "common.export_failed": "Export failed",
    "common.github": "GitHub",
    "common.graph": "Graph",
    "common.highlight": "Highlight",
    "common.inline_code": "inline code",
    "common.interface": "Interface",
    "common.italic": "Italic",
    "common.loading": "Loading…",
    "common.log_out": "Log out?",
    "common.min": " min",
    "common.more_actions": "More actions",
    "common.move_to_trash": "Move to trash",
    "common.navigation": "Navigation",
    "common.new_folder": "New folder",
    "common.new_note": "New note",
    "common.note": "Note",
    "common.off": "Off",
    "common.on": "On",
    "common.open": "Open",
    "common.open_registration": "Open registration",
    "common.open_settings": "Open settings",
    "common.ordered_list": "Ordered list",
    "common.outline": "Outline",
    "common.owner": "Owner",
    "common.password": "Password",
    "common.permanently_deleted_value0_notes": "Permanently deleted {value0} notes",
    "common.preview": "Preview",
    "common.product_name": "Inkstone",
    "common.quote": "Quote",
    "common.remove_from_favorites": "Remove from favorites",
    "common.restore": "Restore",
    "common.restore_failed": "Restore failed",
    "common.retry": "Retry",
    "common.sans_serif": "Sans serif",
    "common.save": "Save",
    "common.save_failed": "Save failed",
    "common.saved": "Saved",
    "common.search_notes_or_run_a_command": "Search notes or run a command",
    "common.settings": "Settings",
    "common.strikethrough": "Strikethrough",
    "common.table_of_contents": "Table of Contents",
    "common.tabs": "Tabs",
    "common.task_list": "Task list",
    "common.the_passwords_do_not_match": "The passwords do not match",
    "common.unarchive": "Unarchive",
    "common.undo": "Undo",
    "common.underline": "Underline",
    "common.unordered_list": "Unordered list",
    "common.untitled_note": "Untitled note",
    "common.username": "Username",
    "common.value0_notes": "{value0} notes",
    "common.version_history": "Version history",
    "common.wiki_links": "Wiki links",
    "common.words": " words",
    "common.zoom_in": "Zoom in",
    "common.zoom_out": "Zoom out",
    "editor.column_1_column_2_column_3": "| Column 1 | Column 2 | Column 3 |",
    "editor.create_new_note": "Create new note",
    "editor.start_writing": "Start writing…",
    "editor.tab_1": "Tab 1",
    "editor.tab_2": "Tab 2",
    "editor.upload_failed_value0": "<!-- Upload failed: {value0} -->",
    "editor.uploading_value0": "![Uploading {value0}…]()",
    "feedback.dismiss": "Dismiss",
    "graph.building_graph": "Building graph…",
    "graph.all_folders": "All folders",
    "graph.all_tags": "All tags",
    "graph.appearance": "Appearance",
    "graph.choose_a_note": "Choose a note…",
    "graph.connect_notes_with_wiki_links_and_their_graph_will_appear_here": "Connect notes with [[wiki links]] and their graph will appear here",
    "graph.could_not_load_graph": "Could not load the graph",
    "graph.create_note": "Create this note",
    "graph.depth": "Link depth",
    "graph.direction_counts": "{incoming} in · {outgoing} out",
    "graph.drag_to_pan_scroll_to_zoom_click_a_node_to_open_it_use_the_selector_abov": "Drag to pan · Scroll to zoom · Click a node to open it · Use the selector above with a keyboard",
    "graph.graph_canvas_drag_to_pan_and_scroll_to_zoom_keyboard_users_can_open_note": "Graph canvas: drag to pan and scroll to zoom; keyboard users can open notes with the selector above",
    "graph.links": " links",
    "graph.filters": "Filters",
    "graph.fit": "Fit to canvas",
    "graph.folder": "Folder",
    "graph.forces": "Forces",
    "graph.global": "Global",
    "graph.graph_canvas_accessible": "Graph canvas. Use arrow keys to select nodes, plus and minus to zoom, Enter to open, and Home to fit.",
    "graph.group_by": "Color by",
    "graph.group_none": "No grouping",
    "graph.interaction_hint": "Drag to pan · Scroll or pinch to zoom · Click to open · Right-click for more",
    "graph.link_distance": "Link distance",
    "graph.local": "Local",
    "graph.local_requires_note": "Open a note before viewing its local graph",
    "graph.make_local_center": "Use as local center",
    "graph.node_actions": "Node actions",
    "graph.node_size": "Node size",
    "graph.notes": " notes · ",
    "graph.nothing_to_graph_yet": "Nothing to graph yet",
    "graph.open_note": "Open note",
    "graph.open_to_right": "Open to the right",
    "graph.open_a_note_from_the_graph": "Open a note from the graph",
    "graph.repulsion": "Repulsion",
    "graph.restore_defaults": "Restore default appearance",
    "graph.sidebar_tags_included": "Also matches {value0} sidebar-selected tags ({value1})",
    "graph.clear_closes_panel": "Clear also closes the panel",
    "graph.clear_closes_panel_hint": "Whether the Clear button also closes the graph panel after clearing",
    "graph.clear_resets_tag": "Clear also resets the tag filter",
    "graph.clear_resets_tag_hint": "Whether the Clear button also resets the graph's own tag dropdown",
    "graph.tags_cleared_panel_stays": "Tag selection cleared; the panel stays open",
    "graph.tags_cleared_reset": "Tag selection cleared and the tag filter reset",
    "graph.tags_cleared_reset_panel_stays": "Tag selection cleared and the tag filter reset; the panel stays open",
    "graph.tags_limit_detail": "The {value0}-tag cap is shared across the sidebar selection, the note list and command palette filters, the graph's combined tag filter, and the MCP search tool. Once reached, further selections are ignored until you remove some tags.",
    "graph.tags_limit_more": "Why {value0}?",
    "graph.tags_match": "Tag match",
    "graph.tags_match_all": "All of them (AND)",
    "graph.tags_match_any": "Any of them (OR)",
    "graph.scope": "Graph scope",
    "graph.search_notes": "Filter notes…",
    "graph.settings": "Graph settings",
    "graph.show_arrows": "Show link direction",
    "graph.show_labels": "Show titles",
    "graph.show_orphans": "Show orphan notes",
    "graph.show_unresolved": "Show unresolved notes",
    "graph.showing_limit": "Showing {shown} of {total}; add filters to narrow the graph",
    "graph.tag": "Tag",
    "graph.unresolved_short": " unresolved",
    "graph.reset": "Reset",
    "markdown.abstract": "Abstract",
    "markdown.code": "Code",
    "markdown.collapse_code": "Collapse code",
    "markdown.code_highlighting_timed_out_while_loading": "Code highlighting timed out while loading",
    "markdown.copy_code": "Copy code",
    "markdown.could_not_load_embedded_content": "Could not load embedded content",
    "markdown.danger": "Danger",
    "markdown.details": "Details",
    "markdown.diagram_rendering_timed_out_check_the_diagram_or_try_again_later": "Diagram rendering timed out. Check the diagram or try again later",
    "markdown.diagram_rendering_timed_out_while_loading": "Diagram rendering timed out while loading",
    "markdown.embed_nesting_limit_reached": "Embed nesting limit reached",
    "markdown.embedded_content_is_too_large": "Embedded content is too large",
    "markdown.external_image_blocked": "External image blocked",
    "markdown.embedded_note_not_found": "Embedded note not found",
    "markdown.example": "Example",
    "markdown.failure": "Failure",
    "markdown.front_matter_exceeds_the_64_kib_safety_limit": "Front Matter exceeds the 64 KiB safety limit",
    "markdown.info": "Info",
    "markdown.inkstone_code_highlighting_failed_showing_plain_text": "[Inkstone] Code highlighting failed; showing plain text:",
    "markdown.inkstone_diagram_rendering_failed_to_load": "[Inkstone] Diagram rendering failed to load:",
    "markdown.inkstone_math_rendering_failed_to_load": "[Inkstone] Math rendering failed to load:",
    "markdown.invalid_front_matter": "Invalid Front Matter",
    "markdown.invalid_yaml_check_indentation_quotes_and_duplicate_keys": "Invalid YAML; check indentation, quotes, and duplicate keys",
    "markdown.mark_complete": "Mark complete",
    "markdown.mark_incomplete": "Mark incomplete",
    "markdown.markdown_example": "Markdown example",
    "markdown.math_rendering_timed_out_while_loading": "Math rendering timed out while loading",
    "markdown.note": "Note",
    "markdown.properties": "Properties",
    "markdown.question": "Question",
    "markdown.redrawing_chart": "Redrawing chart...",
    "markdown.rendering_diagram": "Rendering diagram…",
    "markdown.rendering_chart": "Rendering chart...",
    "markdown.chart_rendering_failed": "Failed to render chart",
    "markdown.success": "Success",
    "markdown.show_more_code": "Show {count} more lines",
    "markdown.tasks_in_embedded_notes_are_read_only": "Tasks in embedded notes are read-only",
    "markdown.the_front_matter_root_must_be_a_yaml_mapping": "The Front Matter root must be a YAML mapping",
    "markdown.the_tasks_in_the_example_are_read_only": "The tasks in the example are read-only",
    "markdown.tip": "Tip",
    "markdown.todo": "Todo",
    "markdown.warning": "Warning",
    "navigation.all_notes": "All notes",
    "navigation.archive": "Archive",
    "navigation.favorites": "Favorites",
    "navigation.folder": "Folder",
    "navigation.pinned": "Pinned",
    "navigation.recently_edited": "Recently edited",
    "navigation.share": "Share",
    "navigation.published": "Published",
    "navigation.tag": "Tag",
    "navigation.trash": "Trash",
    "navigation.unfiled": "Unfiled",
    "sidebar.calendar_folder": "Calendar",
    "sidebar.calendar_folder_hint": "Auto-filed by creation time · read-only",
    "sidebar.todo_folder": "To-dos",
    "sidebar.todo_folder_hint_value0": "Tagged {value0} · auto-filed by creation time · read-only",
    "notes.add_to_selection": "Add to selection",
    "notes.added_to_favorites": "Added to favorites",
    "notes.adjust_selected_tags_or_switch_match_mode": "Adjust the selected tags in the sidebar, or switch the match mode above",
    "notes.archive_is_empty": "Archive is empty",
    "notes.archived": "Archived",
    "notes.unarchived": "Unarchived",
    "notes.filters_cleared": "Filters cleared",
    "notes.active_filters": "Active filters",
    "notes.clear_all_filters": "Clear all filters",
    "notes.clear_day_filter": "Clear day filter",
    "notes.clear_filters": "Clear filters",
    "notes.clear_search_query": "Clear search",
    "notes.clear_tag_filter": "Clear tag filter",
    "notes.clearing_failed": "Clearing failed",
    "notes.comfortable_list": "Comfortable list",
    "notes.compact_list": "Compact list",
    "notes.content_conflict": "Content conflict",
    "notes.could_not_create_note": "Could not create note",
    "notes.could_not_update_the_offline_queue_state": "Could not update the offline queue state",
    "notes.create_a_copy": "Create a copy",
    "notes.created": "Created",
    "notes.data_kept_changing_during_the_full_sync_try_again_later": "Data kept changing during the full sync. Try again later",
    "notes.delete_permanently": "Delete permanently",
    "notes.deleted": "Deleted",
    "notes.deleted_notes_remain_until_you_restore_or_clear_them": "Deleted notes remain until you restore or clear them",
    "notes.deletion_was_canceled_because_the_note_body_is_not_safely_synced": "Deletion was canceled because the note body is not safely synced",
    "notes.deselect": "Deselect",
    "notes.drag_notes_in_or_create_new_ones_here": "Drag notes in, or create new ones here",
    "notes.empty_trash": "Empty trash (",
    "notes.every_note_inside_will_be_permanently_deleted_and_cannot_be_recovered": "Every note inside will be permanently deleted and cannot be recovered.",
    "notes.every_note_is_filed": "Every note is filed",
    "notes.everything_is_neatly_organized": "Everything is neatly organized",
    "notes.failed_to_create_copy": "Failed to create copy",
    "notes.failed_to_open_note": "Failed to open note",
    "notes.filter_in_this_view": "Filter in this view…",
    "notes.full_sync_pagination_data_is_incomplete": "Full-sync pagination data is incomplete",
    "notes.sync_pagination_data_is_incomplete": "Sync pagination data is incomplete",
    "notes.keep_notes_here_when_you_want_them_out_of_the_way_but_not_deleted": "Keep notes here when you want them out of the way but not deleted",
    "notes.keep_this_page_open_and_reconnect_as_soon_as_possible_closing_it_may_mak": "Keep this page open and reconnect as soon as possible. Closing it may make these changes unrecoverable.",
    "notes.modified": "Modified",
    "notes.recently_deleted_first": "Recently deleted first",
    "notes.remember_filters": "Remember filters",
    "notes.recently_edited_first": "Recently edited first",
    "notes.move_to_folder": "Move to folder",
    "notes.move_to_value0": "Move to \"{value0}\"",
    "notes.move_value0_notes_to_trash": "Move {value0} notes to trash?",
    "notes.moved": "Moved",
    "notes.moved_out": "Moved out",
    "notes.moved_to_trash": "Moved to trash",
    "notes.no_favorites_yet": "No favorites yet",
    "notes.no_pinned_notes": "No pinned notes",
    "notes.no_pinned_notes_desc": "Pin notes from the context menu or editor to keep them here",
    "notes.no_shared_notes": "No shared notes",
    "notes.no_shared_notes_desc": "Notes with public sharing enabled will appear here",
    "notes.filter_by_tags": "Filter by tags",
    "notes.filtering_by_day_range_value0": "Showing notes edited {value0} – {value1}",
    "notes.filtering_by_day_value0": "Showing notes edited on {value0}",
    "notes.auto_follow_edit": "Follows your most recent edits",
    "notes.auto_follow_today": "Anchors to today",
    "notes.no_notes_in_range_value0": "No notes in this range — the most recent edit is {value0}",
    "notes.no_notes_in_this_week": "No edits in this week",
    "notes.no_notes_in_this_period": "No notes in this period yet",
    "notes.calendar_period_range_value0": "Date range: {value0}",
    "notes.view_this_week": "View this week",
    "notes.view_this_month": "View this month",
    "notes.jump_to_nearest_period": "Jump to the nearest period with notes",
    "notes.view_latest_week": "View the latest activity week",
    "notes.range_editor_day_value0": "Set {value0} as the {value1} of the range",
    "notes.range_editor_end": "End",
    "notes.range_editor_endpoint": "Date range endpoint",
    "notes.range_editor_grid_value0": "Adjust range · {value0}",
    "notes.range_editor_hint": "Click a day to set the selected endpoint",
    "notes.range_editor_start": "Start",
    "notes.range_editor_title": "Adjust date range",
    "notes.range_preset_group": "Quick ranges",
    "notes.range_preset_last_30d": "Last 30 days",
    "notes.range_preset_last_7d": "Last 7 days",
    "notes.range_preset_this_month": "This month",
    "notes.range_preset_this_week": "This week",
    "notes.range_preset_add": "Add range",
    "notes.range_preset_anchor_today": "End today",
    "notes.range_preset_custom_value0": "Last {value0} days",
    "notes.range_preset_delete": "Remove this range",
    "notes.range_preset_move_up": "Move preset up",
    "notes.range_preset_move_down": "Move preset down",
    "notes.range_preset_direction": "Range direction",
    "notes.range_preset_done": "Done",
    "notes.range_preset_edit": "Edit quick ranges",
    "notes.range_preset_editor_title": "Customize quick ranges",
    "notes.range_preset_follow_edit": "Follow edits",
    "notes.range_preset_today": "Today",
    "notes.rolling_gap_short_value0": "{value0}d ago",
    "notes.rolling_gap_value0": "Newest edit is {value0} days before this window — click to follow it, hold or Shift+click to peek",
    "notes.rolling_gap_ahead_value0": "Newest edit is {value0} days after this window — click to follow it, hold or Shift+click to peek",
    "notes.rolling_gap_ahead_short_value0": "{value0}d ahead",
    "sidebar.calendar_gap_banner_value0": "activity lags {value0} days behind this window — click to follow",
    "sidebar.calendar_gap_banner_ahead_value0": "newest edit is {value0} days ahead of this window — click to follow",
    "notes.view_latest_activity_value0": "View {value0}",
    "notes.no_matching_notes": "No matching notes",
    "notes.no_notes_on_this_day": "No notes on this day",
    "notes.no_notes_on_this_day_desc": "Notes edited on this day will appear here.",
    "notes.no_matching_tags": "No matching tags",
    "notes.clear_tag_search": "Clear search",
    "notes.no_notes_match_selected_tags": "No notes match the selected tags",
    "notes.no_notes_yet": "No notes yet",
    "notes.notes": " notes",
    "notes.notes_93aeb9": " notes)",
    "notes.nothing_has_been_edited_recently": "Nothing has been edited recently",
    "notes.offline_changes_conflict_with_the_remote_version": "Offline changes conflict with the remote version",
    "notes.offline_modifications_have_been_restored_as_a_new_note": "Offline modifications have been restored as a new note.",
    "notes.open_a_copy": "Open a copy",
    "notes.open_navigation": "Open navigation",
    "notes.open_to_side": "Open to side",
    "notes.other": "Other",
    "notes.permanent_deletion_failed": "Permanent deletion failed",
    "notes.permanent_deletion_was_canceled_because_the_note_body_is_not_safely_sync": "Permanent deletion was canceled because the note body is not safely synced",
    "notes.permanently_delete_this_note": "Permanently delete this note?",
    "notes.pin": "Pin",
    "notes.pinned": "Pinned",
    "notes.press_shortcut_or_the_plus_button_to_write_your_first_note": "Press {shortcut} or the plus button to write your first note",
    "notes.remove_from_folder": "Remove from folder",
    "notes.removed_from_favorites": "Removed from favorites",
    "notes.restore_it_from_trash_at_any_time": "Restore it from trash at any time.",
    "notes.restored": "Restored",
    "notes.right_click_a_note_or_press_shortcut_to_favorite_it": "Right-click a note or press {shortcut} to favorite it",
    "notes.selected": "Selected ",
    "notes.search_query_value0": "Search \"{value0}\"",
    "notes.selected_tags_filter": "Filtering by {value0} selected tags:",
    "notes.tag_filter_value0": "{value0} tags selected",
    "notes.selected_tags_match": "Selected-tag match mode",
    "notes.tag_filter_search": "Filter tags…",
    "notes.tag_match_all": "All",
    "notes.tag_match_any": "Any",
    "notes.sort_and_display": "Sort and display",
    "notes.sort_ascending": "Sort ascending",
    "notes.sort_descending": "Sort descending",
    "notes.the_browser_could_not_save_your_offline_changes": "The browser could not save your offline changes",
    "notes.the_full_sync_snapshot_expired_try_again": "The full-sync snapshot expired. Try again",
    "notes.the_note_body_is_not_safely_synced_so_a_complete_copy_cannot_be_created": "The note body is not safely synced, so a complete copy cannot be created",
    "notes.the_note_count_exceeds_the_per_sync_limit": "The note count exceeds the per-sync limit",
    "notes.the_original_note_has_been_deleted": "The original note has been deleted",
    "notes.the_original_note_was_deleted_elsewhere": "The original note was deleted elsewhere",
    "notes.the_server_received_your_content_but_the_browser_could_not_update_its_lo": "The server received your content, but the browser could not update its local state. Keep this page open for now.",
    "notes.there_are_no_notes_with_this_tag": "There are no notes with this tag",
    "notes.this_folder_is_still_empty": "This folder is still empty",
    "notes.this_note_cannot_be_opened_offline": "This note cannot be opened offline",
    "notes.this_note_no_longer_exists": "This note no longer exists",
    "notes.this_operation_cannot_be_undone": "This operation cannot be undone.",
    "notes.title": "Title",
    "notes.trash_is_empty": "Trash is empty",
    "notes.try_another_search_or_press_shortcut_to_search_everywhere": "Try another search, or press {shortcut} to search everywhere",
    "notes.unpin": "Unpin",
    "notes.unpinned": "Unpinned",
    "notes.value0_value1_notes": "{value0} {value1} notes",
    "notes.value0_was_also_changed_elsewhere_your_version_was_saved_as_a_copy_value": "“{value0}” was also changed elsewhere. Your version was saved as a copy ({value1}).",
    "notes.write_something_and_it_will_appear_here": "Write something and it will appear here",
    "notes.write_tags_in_the_note_to_link_them_automatically": "Write #tags in the note to link them automatically",
    "notes.your_offline_changes_were_saved_as_a_copy_the_original_note_keeps_the_re": "Your offline changes were saved as a copy; the original note keeps the remote version.",
    "notes.your_unsynced_content_was_recovered_as_a_new_note": "Your unsynced content was recovered as a new note.",
    "overlay.confirm": "Confirm",
    "overlay.dialog": "Dialog",
    "overlay.menu": "Menu",
    "overlay.side_panel": "Side panel",
    "preview.could_not_copy": "Could not copy",
    "preview.could_not_load_image": "Could not load this image",
    "preview.could_not_load_note": "Could not load this note",
    "preview.could_not_update_this_task": "Could not update this task",
    "preview.created_title": "Created “{title}”",
    "preview.download_original_image": "Download original image",
    "preview.file_preview_unsupported": "This file type cannot be previewed directly. Please download to view.",
    "preview.image_preview": "Image preview",
    "preview.loading": "Loading...",
    "preview.note_does_not_exist": "This note doesn't exist yet",
    "preview.open_in_current_pane": "Open in current pane",
    "preview.open_in_new_tab": "Open in new tab",
    "preview.open_in_side_pane": "Open in side pane",
    "preview.pin_card": "Pin window",
    "preview.pinned_windows": "Pinned windows",
    "preview.close_all_pinned": "Close all pinned windows",
    "preview.resize_card": "Resize",
    "preview.rotate": "Rotate",
    "preview.the_preview_is_updating_try_again_in_a_moment": "The preview is updating. Try again in a moment",
    "preview.untitled": "(untitled)",
    "preview.view_rendered": "Rendered View",
    "preview.view_source": "View Source",
    "preview.view_table": "Table View",
    "preview.zoom_in": "Zoom In",
    "preview.zoom_out": "Zoom Out",
    "preview.zoom_reset": "Fit Screen",
    "properties.add_property": "Add property",
    "properties.add_tag": "Add tag",
    "properties.delete_property": "Delete property",
    "properties.property_name": "Property name",
    "properties.property_value": "Property value",
    "pwa.app_installation": "Installed app",
    "pwa.install": "Install",
    "pwa.install_description": "Open Inkstone in its own window and keep the app shell available offline.",
    "pwa.install_inkstone": "Install Inkstone",
    "pwa.installed": "Installed",
    "pwa.offline_ready": "All offline resources are ready",
    "pwa.offline_ready_description": "Every Inkstone feature can now open on this device without a network connection.",
    "pwa.complete_offline_access": "Complete offline access",
    "pwa.complete_offline_preparing_description": "Inkstone stays responsive while the remaining features download quietly in the background.",
    "pwa.complete_offline_ready": "All features ready",
    "pwa.complete_offline_ready_description": "Features you have not opened yet are also available offline.",
    "pwa.complete_offline_retry_description": "Downloaded resources are kept. Inkstone will continue automatically when the connection returns.",
    "pwa.preparing_progress": "Preparing {completed}/{total}",
    "pwa.waiting_for_network": "Waiting to continue",
    "pwa.refresh_now": "Refresh now",
    "pwa.update_ready": "An app update is ready",
    "pwa.update_ready_description": "Refresh when convenient. Pending note changes are saved first.",
    "session.could_not_connect_to_the_server": "Could not connect to the server",
    "session.could_not_save_settings": "Could not save settings",
    "session.logout_failed": "Could not log out safely",
    "session.logout_pending_changes": "{count} unsaved change(s) could not be synced. Signing out will lose them. Sign out anyway?",
    "settings.20_gb_free_25_gb_with_referral_code": "20 GB free, 25 GB with referral code",
    "settings.about": "about",
    "settings.checked_at": "Checked",
    "settings.checking_for_updates": "Checking…",
    "settings.current_version": "Current version",
    "settings.deployment_updates": "Deployment updates",
    "settings.do_not_remind_this_version": "Don't remind me about this version",
    "settings.go_to_update": "Go to update",
    "settings.latest_version": "Latest version",
    "settings.open_official_repository": "Open official repository",
    "settings.recheck_updates": "Check again",
    "settings.remind_me_next_time": "Remind me next time",
    "settings.up_to_date": "This installation is up to date.",
    "settings.update_check_unavailable": "Temporarily unavailable",
    "settings.update_dialog_description": "Inkstone {version} is available. Open the official repository and manually sync your Fork.",
    "settings.update_dialog_title": "A new version is available",
    "settings.update_manual_fork_hint": "Inkstone never changes or deploys your Fork automatically. Review the official repository, then sync it manually.",
    "settings.accent_color": "Accent color",
    "settings.background_color": "Background",
    "settings.background_paper": "Warm paper",
    "settings.background_white": "Pure white",
    "settings.accent.amber": "Marigold",
    "settings.accent.celadon": "Jade",
    "settings.accent.cinnabar": "Cinnabar",
    "settings.accent.graphite": "Slate",
    "settings.accent.indigo": "Deep sea",
    "settings.accent.terracotta": "Lagoon",
    "settings.accent.wisteria": "Iris",
    "settings.access_key_id": "Access Key ID",
    "settings.account": "Account",
    "settings.action_failed_try_again": "Action failed. Try again",
    "settings.add_a_webdav_or_s3_compatible_target_or_choose_a_common_provider_preset": "Add a WebDAV or S3-compatible target, or choose a common provider preset",
    "settings.add_backup_target": "Add backup target",
    "settings.add_first_target": "Add first target",
    "settings.add_target": "Add target",
    "settings.after_a_storage_account_is_connected_keep_the_same_email_and_app_passwor": "After a storage account is connected, keep the same email and app password, and only switch the WebDAV address:",
    "settings.after_creation_put_the_displayed_endpoint_into_endpoint_use_the_bucket_n": "After creation, put the displayed Endpoint into Endpoint, use the bucket name for Bucket, and use the middle segment of the endpoint, such as us-west-004, for Region.",
    "settings.and_turn_on_apps_connection": " and turn on Apps Connection.",
    "settings.anyone_can_now_register_a_new_account": "Anyone can now register a new account",
    "settings.api_token_page": "API token page",
    "settings.appearance": "Appearance",
    "settings.asked_why_i_wanted_to_live_in_the_green_mountains_i_smiled_without_answe": "Asked why I wanted to live in the green mountains, I smiled without answering and my heart was at ease. The peach blossoms and flowing water disappear, and there is no other world than this world.",
    "settings.attachment_storage": "Attachment storage",
    "settings.attachments": "Attachments",
    "settings.automatic_backups": "Automatic backups",
    "settings.autosave_delay": "Autosave delay",
    "settings.new_notes": "New notes",
    "settings.new_note_template": "New note template",
    "settings.new_note_template_description": "Inserted at the top of every new note. Leave empty to start from a blank note.",
    "settings.new_note_template_hint": "Placeholders: {{title}} note title, {{createdAt}} creation time, {{date}} date, {{time}} time, {{today}} today, {{tomorrow}} tomorrow, {{yesterday}} yesterday, {{folder}} current folder, {{tags}} current tag in a tag view (comma-separated for multiple), {{cursor}} caret position after creation (not written into the note).",
    "settings.template_preview_folder": "Folder",
    "settings.template_preview_tag": "Tag",
    "settings.template_preview_context": "{{folder}} is filled from folder views, folder menus, or a folder-scoped graph; {{tags}} from a tag view or tags selected with cmd/ctrl+click.",
    "settings.template_preview_title": "Title",
    "settings.sync_frontmatter_title": "Sync front matter to title",
    "settings.sync_frontmatter_title_desc": "When the front matter `title` property changes in the editor, update the note title at the top of the workspace.",
    "settings.sync_title_to_frontmatter": "Sync title to front matter",
    "settings.sync_title_to_frontmatter_desc": "When the note title at the top changes, update the `title` property of the note's front matter.",
    "settings.title_sync": "Title sync",
    "settings.new_note_template_preview": "Live preview",
    "settings.restore_default_template": "Restore default",
    "settings.avatar_decode_failed": "This image could not be read. Try another file",
    "settings.avatar_file_too_large": "The image must be 8 MB or smaller",
    "settings.avatar_file_unsupported": "Choose a PNG, JPEG, or WebP image",
    "settings.avatar_processing_failed": "The image could not be prepared. Try another file",
    "settings.avatar_saved": "Avatar saved",
    "settings.avatar_upload_hint": "PNG, JPEG, or WebP, up to 8 MB.",
    "settings.back_up_now": "Back up now",
    "settings.backup": "Backup",
    "settings.backup_completed_value0_targets": "Backup completed · {value0} targets",
    "settings.backup_complete_marker_mismatch": "The COMPLETE marker does not match the manifest: {value0}",
    "settings.backup_duplicate_path": "The backup folder contains a duplicate path: {value0}",
    "settings.backup_failed": "Backup failed",
    "settings.backup_file_checksum_failed": "Backup file checksum failed: {value0}",
    "settings.backup_file_size_mismatch": "Backup file size does not match: {value0}",
    "settings.backup_manifest_not_found": "No Inkstone Markdown backup manifest was found. Select the complete extracted backup folder containing manifest.json, COMPLETE, and notes.",
    "settings.backup_manifest_invalid": "The completed snapshot has an invalid or unsupported manifest: {value0}",
    "settings.backup_missing_file": "The complete backup is missing a file: {value0}",
    "settings.backup_no_complete_snapshot": "This folder has no complete snapshot with a valid COMPLETE marker.",
    "settings.backup_newer_snapshot_skipped": "A newer snapshot ({value0}) was incomplete, so the newest complete snapshot was restored instead.",
    "settings.backup_target": "Backup target",
    "settings.backup_target_added": "Backup target added",
    "settings.backup_target_deleted": "Backup target deleted",
    "settings.backup_target_updated": "Backup target updated",
    "settings.bucket": "Bucket",
    "settings.body_font": "Body font",
    "settings.body_text_size": "Body text size",
    "settings.cannot_be_undone": "Cannot be undone.",
    "settings.characters": " chars",
    "settings.change_avatar": "Change avatar",
    "settings.change_password": "Change password",
    "settings.changes_are_saved_locally_and_sync_automatically_after_reconnecting": "Changes are saved locally and sync automatically after reconnecting",
    "settings.changing_this_requires_your_current_password_and_takes_effect_immediatel": "Changing this requires your current password and takes effect immediately.",
    "settings.chinese_english_and": "Chinese, English, and",
    "settings.choose_image": "Choose image",
    "settings.clean_unreferenced_attachments": "Clean unreferenced attachments",
    "settings.clean_unreferenced_attachments_a17dbd": "Clean unreferenced attachments?",
    "settings.clean_up": "Clean up",
    "settings.cleaned_value0_attachments": "Cleaned {value0} attachments",
    "settings.cleanup_failed": "Cleanup failed",
    "settings.click_add_a_new_application_key_enter_any_name_of_key_leave_the_other_se": ", click Add a New Application Key, enter any Name of Key, leave the other settings unchanged, and create it.",
    "settings.click_connect_in_the_left_sidebar_and_choose_the_cloud_storage_you_want": ", click Connect in the left sidebar, and choose the cloud storage you want to attach.",
    "settings.click_create_a_bucket_enter_only_the_bucket_name_leave_the_other_setting": ", click Create a Bucket, enter only the bucket name, leave the other settings unchanged, and create it.",
    "settings.close_registration_requires_password_verification": "Close registration requires password verification",
    "settings.comfortable": "Comfortable",
    "settings.common_provider_presets_optional_click_to_autofill": "Common provider presets (optional; click to autofill)",
    "settings.compact": "Compact",
    "settings.confirm_closing_registration": "Confirm closing registration",
    "settings.confirm_new_password": "Confirm new password",
    "settings.confirm_opening_registration": "Confirm opening registration",
    "settings.connected": "Connected",
    "settings.content_width": "Content width",
    "settings.copy_the_address_shown_below_into_endpoint_fill_bucket_exactly_as_shown": "Copy the address shown below into Endpoint, fill Bucket exactly as shown, and leave Region as auto.",
    "settings.could_not_load_backup_settings": "Could not load backup settings",
    "settings.could_not_load_data_overview": "Could not load data overview",
    "settings.create_access_key_page": "Create Access Key page",
    "settings.create_bucket_page": "Create bucket page",
    "settings.created_value0_updated_value1_skipped_value2_restored_value3_attachments": "Created {value0}, updated {value1}, skipped {value2}, restored {value3} attachments, and skipped {value4} attachments",
    "settings.current_password": "Current password",
    "settings.daily": "Daily",
    "settings.dark": "Dark",
    "settings.data": "Data",
    "settings.delay_before_uploading_after_you_stop_typing_shorter_makes_more_requests": "How long to wait after you stop typing before saving",
    "settings.delete_backup_target_value0": "Delete backup target \"{value0}\"?",
    "settings.delete_pictures_and_files_that_no_longer_appear_in_any_notes": "Delete pictures and files that no longer appear in any notes",
    "settings.diagram": "Diagram",
    "settings.display_name": "Display name",
    "settings.display_name_length": "Display name must contain 1-{max} characters",
    "settings.display_name_saved": "Display name saved",
    "settings.download_json": "Download JSON",
    "settings.download_zip": "Download ZIP",
    "settings.each_backup_goes_independently_to_every_enabled_target_it_includes_notes": "Each target receives one complete downloadable ZIP. Notes retain their folder hierarchy, archived and trashed notes and original attachments stay separate, and generation plus upload are fully streamed.",
    "settings.edit_backup_target": "Edit backup target",
    "settings.editor": "Editor",
    "settings.endpoint": "Endpoint",
    "settings.editor_font": "Editor font",
    "settings.editor_font_size": "Editor font size",
    "settings.empty_trash": "Empty trash",
    "settings.enabled": "Enabled",
    "settings.english": "English",
    "settings.enter_only_the_bucket_name_and_create_it_directly": ", enter only the bucket name, and create it directly.",
    "settings.enter_only_the_bucket_name_leave_everything_else_unchanged_and_create_it": ", enter only the bucket name, leave everything else unchanged, and create it.",
    "settings.enter_referral_code_2hc5e_in_referral_bonus_at_the_bottom_of_my_page_to": "Enter referral code 2HC5E in Referral Bonus at the bottom of My Page to receive 5 GB extra.",
    "settings.enter_the_complete_credentials_for_the_new_backup_type_after_switching_t": "Enter the complete credentials for the new backup type after switching types",
    "settings.enter_your_current_password": "Enter your current password",
    "settings.enter_your_password": "Enter your password",
    "settings.every_6_hours": "Every 6 hours",
    "settings.export": "Export",
    "settings.export_to_json": "Export to JSON",
    "settings.export_to_zip": "Export to ZIP",
    "settings.fade_content_outside_the_current_paragraph": "Fade content outside the current paragraph",
    "settings.files_that_have_been_backed_up_there_will_not_be_deleted": "Files that have been backed up there will not be deleted.",
    "settings.finally_click_manage_key_permissions_and_turn_on_admin_access_otherwise": "Finally, click Manage Key Permissions and turn on Admin Access, otherwise writing backups will fail.",
    "settings.focus_mode": "Focus mode",
    "settings.for_example_primary_r2_backup": "For example: Primary R2 backup",
    "settings.free_10_gb": "Free 10 GB",
    "settings.free_5_gb": "Free 5 GB",
    "settings.freed_value0": "Freed {value0}",
    "settings.frequency": "Frequency",
    "settings.full": "Full",
    "settings.generate_a_new_app_password_use_your_registration_email_as_the_webdav_us": ", generate a new app password. Use your registration email as the WebDAV username and the app password as the WebDAV password.",
    "settings.hourly": "Hourly",
    "settings.https_only_redirects_within_the_same_site_are_handled_automatically": "HTTPS only. Redirects within the same site are handled automatically",
    "settings.ignore_endpoint_url_iam_after_creation_fill_the_other_displayed_values_i": "Ignore Endpoint URL IAM after creation. Fill the other displayed values into the backup page using the matching field names.",
    "settings.ignore_the_token_value_after_creation_fill_access_key_id_into_access_key": "Ignore the token value after creation. Fill Access Key ID into Access Key ID, and Secret Access Key into Secret Access Key.",
    "settings.import": "Import",
    "settings.import_completed": "Import completed",
    "settings.import_failed": "Import failed",
    "settings.operation_completed_but_refresh_failed": "The operation completed, but the page could not refresh. Try again shortly",
    "settings.import_file": "Import file",
    "settings.includes_every_note_folder_tag_and_attachment_for_a_complete_restore_plu": "Downloads the same complete ZIP used by automatic backup. Extract very large backups and select the folder for bounded restore batches.",
    "settings.indent_width": "Indent width",
    "settings.inkstone_import_reminder": "[Inkstone] Import reminder:",
    "settings.interface_density": "Interface density",
    "settings.sidebar_calendar_tree": "Sidebar calendar and to-do folders",
    "settings.sidebar_calendar_tree_desc": "The read-only trees that auto-file notes by creation time (the to-do tree collects notes carrying the tag configured below), shown at the top of the folder section.",
    "settings.show_empty_calendar_periods": "Show empty periods",
    "settings.show_empty_calendar_periods_desc": "Gray out year and month levels that have no notes in the calendar and to-do trees, so gaps in your timeline stay visible.",
    "settings.todo_tag": "To-do tag",
    "settings.todo_tag_desc": "Notes carrying this tag (comma-separate several) are filed into the to-do tree.",
    "settings.todo_tag_placeholder_value0": "Empty defaults to “{value0}”",
    "settings.year_grid_columns": "Year view columns",
    "settings.year_grid_columns_desc": "How many month cards the yearly heatmap packs per row; auto adapts to the sidebar width.",
    "settings.year_grid_columns_preview": "Preview",
    "settings.year_grid_columns_preview_tip": "Click a month to open it",
    "settings.year_grid_columns_jump_value0": "Open the calendar at {value0}",
    "settings.undo_toast_focus": "Focus undo toasts",
    "settings.undo_toast_focus_desc": "Auto-focus the undo button when a toast with one appears; typing and open dialogs are never interrupted.",
    "settings.year_grid_columns_auto": "Auto",
    "settings.year_grid_columns_three": "3 columns",
    "settings.year_grid_columns_four": "4 columns",
    "settings.interface_language": "Interface language",
    "settings.joined": "Joined",
    "settings.keep_the_cursor_line_centered_on_screen": "Keep the cursor line centered on screen",
    "settings.keep_the_editor_and_preview_scrolled_together": "Keep the editor and preview scrolled together",
    "settings.keyboard_shortcuts": "Keyboard shortcuts",
    "settings.koofr_can_also_connect_google_drive_onedrive_and_dropbox_free_users_can": "Koofr can also connect Google Drive, OneDrive, and Dropbox. Free users can connect up to two storage accounts.",
    "settings.koofr_s_own_webdav_address_is_url": "Koofr's own WebDAV address is https://app.koofr.net/dav/Koofr.",
    "settings.last_backup_failed": "Last backup failed",
    "settings.last_backup_succeeded": "Last backup succeeded",
    "settings.last_saved_value0": "Last saved {value0}",
    "settings.latest_backups": "Latest backups",
    "settings.leave_blank_unless_the_provider_requires_it_for_r2_use_url": "Leave blank unless the provider requires it. For R2, use https://<account-id>.r2.cloudflarestorage.com",
    "settings.leave_the_key_blank_to_leave_it_unchanged": "Leave the key blank to leave it unchanged",
    "settings.light": "Light",
    "settings.line_height": "Line height",
    "settings.link_hover_delay": "Hover preview delay",
    "settings.link_hover_preview": "Wiki-link hover preview",
    "settings.link_hover_preview_description": "Hover a [[wiki link]] in the preview or the editor to see the linked note before opening it",
    "settings.external_images": "External images",
    "settings.external_images_description": "External HTTPS images in notes are blocked by default (including via raw HTML) so third parties cannot track readers' IP/UA; share pages always block them regardless of this setting. Enable to load them and relax the page CSP accordingly",
    "settings.link_preview_length": "Preview content length",
    "settings.loading": "Loading…",
    "settings.loading_backup_configuration": "Loading backup configuration…",
    "settings.loading_backup_settings": "Loading backup settings…",
    "settings.login_password": "Login password",
    "settings.look_at_home_together": "look at home together.",
    "settings.maintenance": "Maintenance",
    "settings.manual": "Manual",
    "settings.mcp": "MCP",
    "settings.mcp_ai_search": "AI semantic search",
    "settings.mcp_ai_search_clear": "Clear index",
    "settings.mcp_ai_search_clear_desc": "Removes every stored vector for this account and cancels pending indexing. Search falls back to keywords until you rebuild the index.",
    "settings.mcp_ai_search_clear_title": "Clear the AI search index?",
    "settings.mcp_ai_search_cleared": "Cleared {count} embeddings",
    "settings.mcp_ai_search_desc": "Notes are embedded privately on your Cloudflare account and stored in your own database, one index per account. The search tools merge keyword and semantic results automatically. Content changes are indexed in the background.",
    "settings.mcp_ai_search_disabled": "AI search disabled",
    "settings.mcp_ai_search_enabled": "AI search enabled, building the index…",
    "settings.mcp_ai_search_indexed": "{count} notes indexed",
    "settings.mcp_ai_search_pending": "{count} pending",
    "settings.mcp_ai_search_reindex": "Rebuild index",
    "settings.mcp_ai_search_reindex_desc": "Queues every note in this account for re-embedding. Existing vectors are replaced.",
    "settings.mcp_ai_search_reindex_title": "Rebuild the AI search index?",
    "settings.mcp_ai_search_reindexed": "Queued {count} notes for re-indexing",
    "settings.mcp_ai_search_unavailable": "Unavailable",
    "settings.mcp_ai_search_unavailable_desc": "Workers AI is not configured for this deployment, so AI search stays off and keyword search is used. Add the AI binding in wrangler.toml to enable it.",
    "settings.mcp_api_key_copy_warning": "Copy this key now — it will never be shown again",
    "settings.mcp_api_key_create": "Create key",
    "settings.mcp_api_key_created": "API key created",
    "settings.mcp_api_key_name": "API key name",
    "settings.mcp_api_key_name_placeholder": "e.g. my-script, home-laptop",
    "settings.mcp_api_key_name_required": "Enter a name for the API key",
    "settings.mcp_api_key_revoke": "Revoke key",
    "settings.mcp_api_key_revoke_desc": "{name} will immediately stop working. Clients using it lose access until you create a replacement.",
    "settings.mcp_api_key_revoke_title": "Revoke this API key?",
    "settings.mcp_api_key_revoked": "API key revoked",
    "settings.mcp_api_key_show_once": "The key is only stored hashed on the server; if you lose it you must create a new one.",
    "settings.mcp_api_key_unused": "never used",
    "settings.mcp_api_key_used": "used {time}",
    "settings.mcp_api_keys": "API keys",
    "settings.mcp_api_keys_desc": "For small, generic, or unnamed MCP clients that cannot run OAuth. Authenticate with a plain Bearer header; keys inherit the read/write permissions above at creation time and can be revoked at any time.",
    "settings.mcp_api_keys_empty": "No API keys yet. Create one for scripts or minimal MCP clients.",
    "settings.mcp_connect_clients": "Connect a client",
    "settings.mcp_connect_desc": "Examples use each client's current remote HTTP and OAuth format. Clients that can pin scopes reflect the settings above; the browser consent page confirms the final permissions. Reconnect or sign in again after changing them.",
    "settings.mcp_connected_clients": "Authorized clients",
    "settings.mcp_copied": "Copied",
    "settings.mcp_copy": "Copy",
    "settings.mcp_disabled": "Disabled",
    "settings.mcp_demo_desc": "This page mirrors a configured Inkstone server so you can inspect every MCP option. The endpoint, credentials, clients, and index statistics are examples; all MCP actions are disabled in the demo.",
    "settings.mcp_demo_title": "Display-only MCP preview",
    "settings.mcp_enable": "Enable MCP",
    "settings.mcp_enable_desc": "Controls the remote MCP service for every account. Existing grants stop working while it is disabled.",
    "settings.mcp_endpoint": "Remote MCP endpoint",
    "settings.mcp_endpoint_desc": "Streamable HTTP with OAuth 2.1 (PKCE, protected-resource discovery, dynamic client registration, refresh tokens) for full MCP clients, plus revocable static API keys (Bearer tokens) for small generic clients.",
    "settings.mcp_generic_client": "Generic / unnamed client (API key)",
    "settings.mcp_generic_client_snippet": "# Any small or unnamed MCP client / script / SDK (create an API key in the section above first)\nclaude mcp add-json inkstone '{bearerJson}'\n\n# Or set the Authorization header directly in any MCP SDK: { \"Authorization\": \"Bearer ink_...\" }\n# Quick endpoint check with curl:\ncurl -X POST \"{endpoint}\" \\\n  -H \"Authorization: Bearer <API_KEY>\" \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Accept: application/json, text/event-stream\" \\\n  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"curl\",\"version\":\"1.0\"}}}'",
    "settings.mcp_grant_revoked": "Client access revoked",
    "settings.mcp_granted_at": "authorized {time}",
    "settings.mcp_intro": "Let Codex, Claude Code, Hermes, OpenClaw, and other standard MCP clients search, cite, read, and—with explicit permission—safely edit your notes.",
    "settings.mcp_load_failed": "Could not load MCP settings",
    "settings.mcp_loading": "Loading MCP settings…",
    "settings.mcp_no_clients": "No client has been authorized for this account.",
    "settings.mcp_permissions": "Permissions",
    "settings.mcp_privacy": "Privacy boundary",
    "settings.mcp_privacy_desc": "The MCP URL is reachable from the internet so your clients can connect, but every note operation requires OAuth and is limited to the signed-in account. AI Search has no public query endpoint and uses a separate index per account. Content a tool reads is intentionally returned to the connected AI client and is then governed by that client's privacy policy.",
    "settings.mcp_private_knowledge": "Private AI knowledge base",
    "settings.mcp_reconnect_notice": "Reconnect the client or sign in again to refresh its OAuth scopes.",
    "settings.mcp_revoke": "Revoke access",
    "settings.mcp_revoke_all": "Revoke all",
    "settings.mcp_revoke_all_desc": "Every connected client for this account will be signed out. You can authorize them again later.",
    "settings.mcp_revoke_all_title": "Revoke all client access?",
    "settings.mcp_revoke_desc": "{name} will immediately lose access to this account's notes.",
    "settings.mcp_revoke_title": "Revoke this client?",
    "settings.mcp_revoked_count": "Revoked {count} client grants",
    "settings.mcp_scope_read": "Read",
    "settings.mcp_scope_trash": "Trash",
    "settings.mcp_scope_write": "Write",
    "settings.mcp_trash_access": "Allow moving notes to trash",
    "settings.mcp_trash_access_desc": "Separate high-risk permission for soft-delete only. MCP never exposes permanent purge.",
    "settings.mcp_transport": "HTTP · OAuth 2.1 / Bearer",
    "settings.mcp_updated": "MCP settings updated",
    "settings.mcp_write_access": "Allow modifying the note library",
    "settings.mcp_write_access_desc": "May modify notes, folders, tags, properties, and attachments, and may create shares or run configured backups. Writes use conflict protection and stable operation IDs.",
    "settings.math": "Math",
    "settings.monospace": "Monospace",
    "settings.name": "Name",
    "settings.name_based_avatar": "Based on your display name",
    "settings.narrow": "Narrow",
    "settings.new_accounts_can_currently_register_with_a_username_and_password": "New accounts can currently register with a username and password",
    "settings.new_password": "New password",
    "settings.new_password_must_be_at_least_8_characters": "New password must be at least 8 characters",
    "settings.no_backup_configured_yet": "No backup configured yet",
    "settings.no_backup_record_yet": "No backup record yet",
    "settings.no_backup_target_yet": "No backup target yet",
    "settings.no_enabled_backup_targets": "No enabled backup targets",
    "settings.no_saves_yet": "No saves yet",
    "settings.notes": " notes · ",
    "settings.off_default_only_existing_accounts_can_log_in": "Off (default): Only existing accounts can log in.",
    "settings.offline": "Offline",
    "settings.only_an_email_address_is_needed_10_gb_free_and_it_can_bridge_google_driv": "Only an email address is needed. 10 GB free, and it can bridge Google Drive, OneDrive, and Dropbox through WebDAV.",
    "settings.only_an_email_address_is_needed_20_gb_free_25_gb_total_with_the_referral": "Only an email address is needed. 20 GB free, 25 GB total with the referral code.",
    "settings.only_an_email_address_is_needed_up_to_10_gb_free_with_standard_webdav_ac": "Only an email address is needed. Up to 10 GB free, with standard WebDAV access.",
    "settings.only_existing_accounts_can_log_in": "Only existing accounts can log in",
    "settings.only_existing_accounts_can_sign_in_new_accounts_are_rejected": "Only existing accounts can sign in; new accounts are rejected",
    "settings.only_files_that_do_not_appear_in_the_body_of_any_note_will_be_deleted_an": "Only files that do not appear in the body of any note will be deleted, and this operation is irreversible.",
    "settings.open": "Open",
    "settings.open_anyone_can_register_with_a_username_and_password": "Open: anyone can register with a username and password.",
    "settings.open_github_repository": "Open GitHub repository",
    "settings.open_registration_requires_password_verification": "Open registration requires password verification",
    "settings.open_signup_aff": "Open signup (AFF)",
    "settings.open_the_r2_console": "Open the R2 console",
    "settings.other_devices_have_been_logged_out": "Other devices have been logged out",
    "settings.overview": "Overview",
    "settings.partially_completed_value0_value1": "Partially completed · {value0}/{value1}",
    "settings.password_settings": "Password Settings",
    "settings.password_updated": "Password updated",
    "settings.personal_profile": "Personal profile",
    "settings.permanently_delete_every_note_in_trash": "Permanently delete every note in trash",
    "settings.polling_interval": "Check for updates",
    "settings.preview": "Preview",
    "settings.preview_typography": "Preview typography",
    "settings.private_instance": "Private instance",
    "settings.q_a_in_the_mountains": "Q&A in the mountains",
    "settings.random_avatar": "Random generated avatar",
    "settings.random_avatar_number": "Random avatar {number}",
    "settings.random_avatars": "Suggested avatars",
    "settings.realtime_sync": "Realtime updates",
    "settings.refresh_avatars": "Refresh five",
    "settings.rebuild_failed": "Rebuild failed",
    "settings.rebuild_index": "Rebuild index",
    "settings.rebuild_search_index": "Rebuild search index",
    "settings.rebuilt_the_index_for_value0_notes": "Rebuilt the index for {value0} notes",
    "settings.receive_changes_from_other_devices_quickly": "Show changes from your other devices as soon as possible",
    "settings.registration_closed": "Registration closed",
    "settings.registration_open": "Registration open",
    "settings.registration_status": "Registration status",
    "settings.region": "Region",
    "settings.restore_backup_folder": "Restore Inkstone backup folder",
    "settings.restore_backup_folder_description": "Select a folder extracted from the new ZIP, or a legacy backup root containing attachments and snapshots. Inkstone verifies COMPLETE and restores it in bounded batches.",
    "settings.reloaded_all_data": "Up to date",
    "settings.render_and_using_katex": "Display inline and block math",
    "settings.render_mermaid_code_blocks_into_flowcharts": "Display Mermaid code blocks as diagrams",
    "settings.runs_from_cloudflare_cron_the_page_does_not_need_to_stay_open": "Back up automatically on the selected schedule; this page does not need to stay open",
    "settings.s3_backup": "S3 backup",
    "settings.s3_compatible": "S3 compatible",
    "settings.s3_compatible_object_storage_with_10_gb_free_and_no_credit_card_required": "S3-compatible object storage with 10 GB free and no credit card required.",
    "settings.s3_compatible_object_storage_with_10_gb_free_but_it_requires_credit_card": "S3-compatible object storage with 10 GB free, but it requires credit card verification.",
    "settings.s3_compatible_object_storage_with_5_gb_free_and_no_credit_card_required": "S3-compatible object storage with 5 GB free and no credit card required.",
    "settings.scheduled": "Scheduled",
    "settings.scroll_sync": "Scroll sync",
    "settings.collapse_long_code_blocks": "Collapse long code blocks",
    "settings.collapse_long_code_blocks_description": "Show a compact preview and let readers expand code when needed",
    "settings.code_block_collapse_after": "Collapse after",
    "settings.lines": " lines",
    "settings.sec": " sec",
    "settings.select_file": "Select file",
    "settings.select_backup_folder": "Select backup folder",
    "settings.selected_avatar": "Selected avatar",
    "settings.select_object_read_write_for_permissions_and_create_it_directly": ", select Object Read & Write for permissions, and create it directly.",
    "settings.secret_access_key": "Secret Access Key",
    "settings.serif": "serif",
    "settings.show_line_numbers": "Show line numbers",
    "settings.show_outline_by_default": "Show outline by default",
    "settings.show_toolbar": "Show toolbar",
    "settings.sign_in_security": "Sign-in security",
    "settings.sign_up": "Sign up",
    "settings.simplified_chinese": "Simplified Chinese",
    "settings.spellcheck": "Spellcheck",
    "settings.standard": "Standard",
    "settings.store_backups_in_this_directory_or_leave_blank_to_use_the_root_directory": "Store backups in this directory, or leave blank to use the root directory",
    "settings.structured_note_data_without_attachment_binaries_download_zip_for_a_comp": "Structured note data without attachment binaries. Download ZIP for a complete backup",
    "settings.subdirectory": "subdirectory",
    "settings.supports_md_txt_zip_and_inkstone_json_exports_for_matching_ids_the_newer": "Supports .md, .txt, .zip, and Inkstone .json exports. For matching IDs, the newer note wins.",
    "settings.sync": "Sync",
    "settings.sync_now": "Sync now",
    "settings.system": "System",
    "settings.test": "Test",
    "settings.test_connection": "Test connection",
    "settings.the_local_cache_will_be_cleared_and_the_cloud_data_will_not_be_affected": "The local cache will be cleared, and the cloud data will not be affected.",
    "settings.theme": "Theme",
    "settings.then_open": "Then open",
    "settings.there_are_no_attachments_to_clean": "There are no attachments to clean",
    "settings.this_device_will_be_signed_out_and_its_local_cache_cleared_cloud_data_is": "This device will be signed out and its local cache cleared. Cloud data is unaffected.",
    "settings.totp_authenticator_code": "Current authenticator code",
    "settings.totp_code_or_recovery": "Authenticator or recovery code",
    "settings.totp_code_or_recovery_placeholder": "6-digit code or recovery code",
    "settings.totp_confirm_code": "Enter the 6-digit code shown in the app",
    "settings.totp_confirm_disable": "Disable two-step verification",
    "settings.totp_confirm_enable": "Verify and enable",
    "settings.totp_copy_all": "Copy all",
    "settings.totp_copy_failed": "Could not copy. Select and copy the value manually.",
    "settings.totp_disable": "Disable",
    "settings.totp_disable_description": "Enter your password and either a current authenticator code or an unused recovery code. Other devices will be signed out.",
    "settings.totp_disable_title": "Disable two-step verification?",
    "settings.totp_disabled": "Two-step verification disabled",
    "settings.totp_disabled_description": "Add an authenticator app code after your password to protect new sign-ins.",
    "settings.totp_enable": "Enable",
    "settings.totp_enable_password_description": "Confirm your current password before linking an authenticator app.",
    "settings.totp_enabled": "Two-step verification enabled",
    "settings.totp_enabled_description": "New sign-ins require an authenticator or recovery code. {count} recovery code(s) remain.",
    "settings.totp_enter_code_or_recovery": "Enter an authenticator or recovery code",
    "settings.totp_enter_six_digit_code": "Enter a valid 6-digit authenticator code",
    "settings.totp_generate_new_codes": "Replace recovery codes",
    "settings.totp_load_failed": "Could not load two-step verification status",
    "settings.totp_loading": "Loading two-step verification…",
    "settings.totp_manage": "Manage",
    "settings.totp_manual_secret": "Manual setup key",
    "settings.totp_other_sessions_revoked": "Other signed-in devices have been logged out.",
    "settings.totp_qr_code_title": "Authenticator setup QR code",
    "settings.totp_recovery_codes": "Recovery codes",
    "settings.totp_recovery_codes_copied": "Recovery codes copied",
    "settings.totp_recovery_codes_once": "Each code works once. Store them somewhere private; they will not be shown again.",
    "settings.totp_recovery_codes_replaced": "Recovery codes replaced",
    "settings.totp_recovery_file_title": "Inkstone two-step verification recovery codes",
    "settings.totp_recovery_file_warning": "Keep these codes private. Each code can be used once to sign in or disable two-step verification.",
    "settings.totp_regenerate_description": "Replacing these codes immediately invalidates every previous recovery code. Confirm with your password and authenticator.",
    "settings.totp_save_recovery_codes": "Save these recovery codes now",
    "settings.totp_saved_codes": "I saved these codes",
    "settings.totp_scan_qr": "Scan with your authenticator app",
    "settings.totp_scan_qr_description": "Use any TOTP-compatible app, then enter its current 6-digit code to confirm setup.",
    "settings.totp_secret_copied": "Setup key copied",
    "settings.totp_title": "Two-step verification (TOTP)",
    "settings.totp_unavailable_description": "The server credential vault is unavailable, so TOTP cannot be enabled safely.",
    "settings.to_add_users_open_registration_under_settings_account_they_can_then_crea": "To add users, open registration under Settings → Account. They can then create an account with a username and password.",
    "settings.total_words": "Total words",
    "settings.try_this_when_your_search_results_don_t_look_right": "Try this when your search results don't look right",
    "settings.type": "Type",
    "settings.typewriter_mode": "Typewriter mode",
    "settings.unchanged": "•••••••• (unchanged)",
    "settings.up_to_10_gb": "Up to 10 GB",
    "settings.update_failed": "Update failed",
    "settings.upload_local_image": "Upload a local image",
    "settings.uploaded_avatar": "Uploaded local image",
    "settings.use_name_avatar": "Use name avatar",
    "settings.username_is_sign_in_id": "@username is your sign-in ID and does not change with your display name.",
    "settings.use_an_app_specific_password_when_possible": "Use an app-specific password when possible",
    "settings.use_any_name_you_like_and_create_it": ", use any name you like, and create it.",
    "settings.use_connection_id_as_your_webdav_username_and_apps_password_as_your_webd": "Use Connection ID as your WebDAV username and Apps Password as your WebDAV password.",
    "settings.use_keyid_as_access_key_id_and_applicationkey_as_secret_access_key": "Use keyID as Access Key ID and applicationKey as Secret Access Key.",
    "settings.use_path_style_access_recommended_for_most_compatible_services": "Use path-style access (recommended for most compatible services)",
    "settings.use_url_as_the_webdav_server_url": "Use https://webdav.pcloud.com/ as the WebDAV server URL.",
    "settings.use_your_registration_email_as_the_webdav_username_and_your_account_pass": "Use your registration email as the WebDAV username and your account password as the WebDAV password.",
    "settings.username_value0_changing_the_password_signs_out_other_devices": "Username: {value0}. Changing the password signs out other devices.",
    "settings.value0_backup_targets_active": "{value0} backup targets active",
    "settings.value0_changes_will_upload_automatically_after_reconnecting": "{value0} changes will upload automatically after reconnecting",
    "settings.value0_files_value1_value2": "{value0} files · {value1} · {value2}",
    "settings.value0_notes_value1": "{value0} notes · {value1}",
    "settings.version": "Version",
    "settings.version_history": "Version history",
    "settings.webdav_address": "WebDAV address",
    "settings.webdav_backup": "WebDAV backup",
    "settings.wide": "Wide",
    "settings.writing_mode": "Writing mode",
    "share.1_day": "1 day",
    "share.30_days": "30 days",
    "share.7_days": "7 days",
    "share.anyone_who_gets_the_link_will_immediately_lose_access": "Anyone who gets the link will immediately lose access.",
    "share.back": "Back",
    "share.cancel_share": "Unshare",
    "share.ask_the_person_who_shared_this_note_for_its_passcode": "Ask the person who shared this note for its passcode",
    "share.content_unavailable": "Content unavailable",
    "share.done": "Done",
    "share.embedded_private_notes_are_not_included_in_public_shares": "Embedded private notes are not included in public shares",
    "share.expiration": "Expiration",
    "share.expired": "Expired",
    "share.expires_value0": "Expires {value0}",
    "share.generate_public_link": "Generate public link",
    "share.incorrect_passcode": "Incorrect passcode",
    "share.enter_a_passcode": "Enter a passcode first",
    "share.passcode_too_short": "The passcode must be at least 4 characters",
    "share.keep_current_expiration": "Keep current",
    "share.leave_blank_to_keep_the_current_passcode": "Leave blank to keep the current passcode",
    "share.link_revoked": "Link revoked",
    "share.loading_share_status": "Loading share status…",
    "share.could_not_load_sharing_status": "Could not load sharing status",
    "share.never_expires": "Never expires",
    "share.never_expires_71ab34": "Never expires",
    "share.open_link": "Open link",
    "share.opening": "Opening…",
    "share.passcode": "Passcode",
    "share.passcode_protected": "Passcode protected",
    "share.public_link": "Public link",
    "share.public_link_created": "Public link created",
    "share.public_links_are_read_only_visitors_can_see_only_the_latest_version_of_t": "Public links are read-only. Visitors can view only the latest content of this note and cannot access other notes.",
    "share.require_a_passcode_to_view_this_note": "Require a passcode to view this note",
    "share.revoke_link": "Revoke link",
    "share.revoke_this_public_link": "Revoke this public link?",
    "share.set_a_passcode": "Set a passcode",
    "share.share_note": "Share note",
    "share.shared_via_site": "Shared via {site}",
    "share.sharing_settings_updated": "Sharing settings updated",
    "share.switch_theme": "Switch theme",
    "share.tasks_in_public_shares_are_read_only": "Tasks in public shares are read-only",
    "share.this_note_requires_a_password": "This note requires a password",
    "share.unchanged": "•••••• (unchanged)",
    "share.update_settings": "Update settings",
    "share.view_content": "View content",
    "share.view_qr": "View Share QR Code",
    "share.visits": " visits",
    "share.active_shares_count": "Active shares",
    "share.active_shares_hint": "Active and unexpired public links",
    "share.access_password": "Password Protection",
    "share.search_placeholder": "Search note title, link, or tag…",
    "share.status_expired": "Expired",
    "share.no_folders": "No folders",
    "share.no_folder": "No Folder (Root)",
    "share.no_tags": "No tags",
    "share.analytics_dashboard_subtitle": "Visitor trends, unique audiences, and geographic demographics across all shared notes",
    "share.analytics_dashboard_title": "Analytics Dashboard",
    "share.batch_disable": "Batch Pause",
    "share.batch_enable": "Batch Enable",
    "share.batch_move_success": "Moved {count} shares",
    "share.batch_move_to_folder": "Move to Folder",
    "share.batch_revoke": "Batch Revoke",
    "share.batch_revoke_confirm": "Once revoked, visitors will no longer be able to access these notes via their links.",
    "share.batch_revoke_title": "Revoke {count} share links?",
    "share.batch_set_expiry": "Set Expiry",
    "share.batch_toggle_label": "Batch toggle share status",
    "share.folder_empty_hint": "No shares in this folder",
    "share.tag_empty_hint": "No shares with this tag",
    "share.folder_batch_enabled_toast": "All note shares in this folder are enabled",
    "share.folder_batch_disabled_toast": "All note shares in this folder are paused",
    "share.tag_batch_enabled_toast": "All note shares with this tag are enabled",
    "share.tag_batch_disabled_toast": "All note shares with this tag are paused",
    "share.category_all": "All Shares",
    "share.category_active": "Active Shares",
    "share.category_dashboard": "Dashboard",
    "share.category_expired": "Expired",
    "share.category_expiring": "Expiring",
    "share.category_password": "Password Protected",
    "share.category_paused": "Paused Shares",
    "share.category_permanent": "Permanent",
    "share.client_environment": "Client Environment",
    "share.copy_link": "Copy link",
    "share.copy_qr_image": "Copy QR Image",
    "share.create_new_share": "Share Note",
    "share.custom_slug": "Custom Short Link",
    "share.custom_slug_hint": "Set a custom memorable slug (letters, numbers, hyphens, underscores)",
    "share.custom_slug_invalid": "Custom slug must be 3-64 letters, numbers, hyphens, or underscores",
    "share.custom_slug_placeholder": "e.g. weekly-report-2026",
    "share.custom_slug_taken": "This short link is already taken by another share",
    "share.device_desktop": "Desktop",
    "share.device_mobile": "Mobile",
    "share.device_tablet": "Tablet",
    "share.device_type": "Device Type",
    "share.devices_and_systems": "Devices & Systems",
    "share.download_png": "Download PNG",
    "share.download_svg": "Download SVG",
    "share.edit_share_settings": "Share Settings",
    "share.expiration_title": "Link Expiration",
    "share.folders_isolation": "Folders",
    "blog.hub_title": "Blog Center",
    "blog.menu_label": "Blog",
    "blog.publish_to_blog": "Publish to Blog",
    "blog.published": "Published",
    "blog.draft": "Draft",
    "blog.view_in_blog": "View in Blog",
    "blog.copy_link": "Copy Blog Link",
    "blog.comments_and_stats": "Comments & Stats",
    "blog.post_settings": "Post Settings",
    "blog.sync_post": "Sync Latest Content",
    "blog.unpublish": "Unpublish Post",
    "blog.confirm_unpublish": "Are you sure you want to unpublish this post?",
    "blog.unpublish_description": "The post will no longer be visible on your public blog. The original note remains intact and can be republished anytime.",
    "blog.sync_success": "Post content synced to the latest note revision",
    "blog.link_copied": "Blog link copied to clipboard",
    "blog.dashboard": "Dashboard",
    "blog.posts": "Posts",
    "blog.comments": "Comments",
    "blog.categories": "Categories",
    "blog.settings": "Settings",
    "blog.total_posts": "Total Posts",
    "blog.total_views": "Total Views",
    "blog.total_comments": "Total Comments",
    "blog.pending_comments": "Pending Comments",
    "blog.new_post": "Publish Post",
    "blog.publish_modal_title": "Publish to Blog",
    "blog.edit_modal_title": "Edit Post Settings",
    "blog.slug": "Post Slug",
    "blog.slug_hint": "Used for URL path, supports letters, numbers, and hyphens",
    "blog.slug_placeholder": "e.g. my-first-post",
    "blog.cover": "Cover Image",
    "blog.cover_hint": "Image URL or Markdown format, or extract from note body",
    "blog.cover_placeholder": "URL or ![Alt](URL)",
    "blog.use_first_image": "Use first image from body",
    "blog.category": "Category",
    "blog.no_category": "Uncategorized",
    "blog.select_category": "Select category",
    "blog.tags": "Blog Tags",
    "blog.tags_placeholder": "Type and press enter to add",
    "blog.excerpt": "Excerpt",
    "blog.excerpt_placeholder": "Brief summary; left empty to extract from note body",
    "blog.allow_comments": "Allow comments",
    "blog.pin_to_top": "Pin to top",
    "blog.publish_now": "Publish Now",
    "blog.update_post": "Save Changes",
    "blog.manage_blog": "Manage Blog and Posts",
    "blog.comments_moderation": "Comment Moderation",
    "blog.status_all": "All",
    "blog.status_pending": "Pending",
    "blog.status_approved": "Approved",
    "blog.status_rejected": "Rejected",
    "blog.status_spam": "Spam",
    "blog.approve": "Approve",
    "blog.reject": "Reject",
    "blog.mark_spam": "Mark as Spam",
    "blog.delete_comment": "Delete Comment",
    "blog.batch_approve": "Batch Approve",
    "blog.batch_reject": "Batch Reject",
    "blog.batch_delete": "Batch Delete",
    "blog.author": "Author",
    "blog.content": "Content",
    "blog.submitted_at": "Submitted At",
    "blog.article": "Article",
    "blog.no_comments": "No comments found",
    "blog.no_posts": "No posts found",
    "blog.category_name": "Category Name",
    "blog.category_slug": "Category Slug",
    "blog.add_category": "New Category",
    "blog.edit_category": "Edit Category",
    "blog.delete_category": "Delete Category",
    "blog.site_name": "Blog Title",
    "blog.subtitle": "Subtitle",
    "blog.bio": "Author Bio",
    "blog.author_name": "Author Name",
    "blog.require_approval": "Require approval before comments are visible",
    "blog.frontend_url": "Blog Frontend URL",
    "blog.frontend_url_hint": "For previewing and sharing links (e.g. http://localhost:4321 or your domain)",
    "blog.save_settings": "Save Blog Settings",
    "blog.settings_saved": "Blog settings saved successfully",
    "blog.blog_hub": "Blog Hub",
    "blog.blog_menu": "Blog",
    "blog.category_name_placeholder": "e.g. Technology",
    "blog.category_color": "Category Color",
    "blog.existing_categories": "Existing Categories",
    "blog.no_categories_hint": "No categories yet, create one above",
    "blog.posts_count_unit": "posts",
    "blog.confirm_delete_comment": "Are you sure you want to permanently delete this comment? This cannot be undone.",
    "blog.comment_deleted": "Comment permanently deleted",
    "blog.confirm_batch_delete_comments": "Are you sure you want to delete {value0} selected comments?",
    "blog.batch_action_success": "Batch action completed",
    "blog.search_comments_placeholder": "Search comments, authors or posts...",
    "blog.selected_comments_count": "{value0} comments selected",
    "blog.select_all_list": "Select all in list",
    "blog.comment_ip": "IP:",
    "blog.default_subtitle": "Serenity and craftsmanship · Powered by Inkstone & Astro",
    "blog.visit_frontend": "Visit Blog Site",
    "blog.total_views_desc": "Total page views across all blog posts",
    "blog.total_comments_desc": "Total visitor comments and interactions",
    "blog.pending_status": "Pending",
    "blog.go_to_moderation": "Open Moderation Hub →",
    "blog.all_pending_review": "Review All",
    "blog.all_comments_reviewed": "All comments have been reviewed",
    "blog.commented_on": "on \"{value0}\"",
    "blog.recent_posts": "Recent Posts",
    "blog.manage_posts_count": "Manage Posts",
    "blog.reads_label": "Reads:",
    "blog.comments_label": "Comments:",
    "blog.confirm_delete_post": "Are you sure you want to delete post \"{value0}\"?",
    "blog.confirm_delete_post_detail": "Are you sure you want to delete post \"{value0}\"? It will be unlisted and removed from blog, while the original note remains untouched.",
    "blog.post_deleted": "Blog post deleted",
    "blog.no_excerpt": "No excerpt",
    "blog.all_categories": "All Categories",
    "blog.frontend_site": "Blog Site",
    "blog.frontend_engine": "Astro",
    "blog.search_posts_placeholder": "Search posts by title or slug...",
    "blog.view_table": "Table View",
    "blog.view_grid": "Grid Card View",
    "blog.post_title": "Post Title",
    "blog.slug_available": "Available",
    "blog.frontmatter_cover_hint": "(Frontmatter: Cover)",
    "blog.pin_to_top_hint": "Pin to top of blog home page",
    "blog.add_tag": "Add",
    "blog.allow_comments_hint": "Visitors can leave comments under this post, subject to moderation",
    "blog.frontend_preview": "Preview in Blog",
    "blog.site_basic_info": "Basic Site Information",
    "blog.site_name_placeholder": "Inkstone Blog",
    "blog.site_subtitle_placeholder": "Quiet waters run deep, ink on stone",
    "blog.author_profile_settings": "Author Profile",
    "blog.author_name_placeholder": "Author Nickname",
    "blog.author_avatar": "Avatar Image URL",
    "blog.avatar_placeholder": "https://... or leave empty for auto avatar",
    "blog.author_bio_placeholder": "Sharing thoughts, stories and tech notes...",
    "blog.comments_and_display_rules": "Comments and Display Rules",
    "blog.require_approval_hint": "When enabled, comments must be approved by the author before appearing on the public blog",
    "blog.posts_per_page": "Posts Per Page",
    "blog.posts_per_page_hint": "Number of articles loaded per page on public blog",
    "blog.social_links": "Social Media Links",
    "blog.github_placeholder": "GitHub username or URL",
    "blog.twitter_placeholder": "Twitter / X username",
    "blog.email_placeholder": "Public email address",
    "blog.website_placeholder": "Personal website URL",
    "blog.col_title": "Title",
    "blog.col_status": "Status",
    "blog.col_comments": "Comments",
    "blog.col_created_at": "Published At",
    "blog.col_actions": "Actions",
    "blog.confirm_delete_category_desc": "Are you sure you want to delete category \"{value0}\"? Posts in this category will become uncategorized.",
    "blog.confirm_batch_unpublish": "Are you sure you want to unpublish {value0} selected posts?",
    "blog.confirm_batch_delete": "Are you sure you want to permanently delete {value0} selected posts and their comments? This cannot be undone.",
    "blog.selected_posts_count": "{value0} posts selected",
    "blog.batch_publish": "Batch Publish",
    "blog.batch_unpublish": "Batch Unpublish",
    "blog.change_category": "Change Category...",
    "blog.remove_category": "Remove Category",
    "share.hub_title": "Share Hub",
    "share.keep_current": "Keep current",
    "share.leave_blank_to_keep_passcode": "Leave blank to keep current passcode",
    "share.manage_shares": "Manage All Shares",
    "share.manage_shares_description": "Review sharing status, short links, QR codes, and analytics across all notes",
    "share.metric_pv": "Pageviews (PV)",
    "share.metric_uv": "Unique Visitors (UV)",
    "share.never_visited": "Never visited",
    "share.no_data_yet": "No access data in this time range",
    "share.no_shares_found": "No shares found",
    "share.no_shares_hint": "Enable sharing on notes to view links, QR codes, and analytics here",
    "share.no_visits_yet": "No visit records yet",
    "share.note_analytics_title": "Note Analytics",
    "share.not_shared": "Not shared",
    "share.operating_system": "Operating System",
    "share.password_hint": "Require visitors to enter a passcode to view the note",
    "share.password_protected": "Password Protected",
    "share.publish": "Enable Sharing",
    "share.public_access": "Public",
    "share.qr_code_hint": "Scan the QR code to view this note directly on mobile or external browsers",
    "share.qr_code_title": "Share QR Code",
    "share.qr_copied": "Image copied",
    "share.range_all": "All time",
    "share.realtime_stream": "Latest 20 visits",
    "share.recent_activity_title": "Live Activity Stream",
    "share.selected_count": "{count} notes selected",
    "share.share_status": "Share Status",
    "share.shares_unit": "notes",
    "share.sort_created_desc": "Recently Created",
    "share.sort_recent_visit": "Recently Visited",
    "share.sort_title_asc": "Note Title (A-Z)",
    "share.sort_views_asc": "Least Views",
    "share.sort_views_desc": "Most Views",
    "share.status_active": "Active",
    "share.status_active_desc": "Note is publicly accessible via link",
    "share.status_all": "All Status",
    "share.status_paused": "Paused",
    "share.status_paused_desc": "Temporarily paused, visitors cannot view note",
    "share.table_actions": "Actions",
    "share.table_last_visit": "Last Visited",
    "share.table_link": "Share Link",
    "share.table_note_title": "Note Title",
    "share.table_pv_uv": "Views / UV",
    "share.table_security_expiry": "Security & Expiry",
    "share.table_status": "Status",
    "share.tag_placeholder": "Type tag and press enter…",
    "share.tags_isolation": "Tags",
    "share.timeline_pv_desc": "Hourly or daily pageviews over the selected period",
    "share.timeline_trend_title": "Traffic Trends",
    "share.timeline_uv_desc": "Hourly or daily unique visitors over the selected period",
    "share.top_countries_title": "Geographic Distribution",
    "share.top_notes_title": "Top Notes",
    "share.top_referrers_title": "Traffic Sources",
    "share.total_pv_views": "Total Pageviews (PV)",
    "share.total_shares_count": "Total Shares",
    "share.total_uv_visitors": "Unique Visitors (UV)",
    "share.total_views_pv": "Total Views (PV)",
    "share.total_visitors_uv": "Unique Visitors (UV)",
    "share.traffic_sources": "Referrers",
    "share.view_grid": "Grid View",
    "share.view_note_analytics": "View note analytics",
    "share.view_table": "Table View",
    "share.views_per_day": "Visits / Day",
    "share.visitor_geography": "Countries & Regions",
    "share.filter_traffic_title": "Traffic Filters",
    "share.filter_traffic_desc": "Exclude automated scrapers and self-views to keep view counts accurate.",
    "share.filter_real_visitors_badge": "Real Visitors",
    "share.filter_all_traffic_badge": "All Traffic",
    "share.filter_custom_traffic_badge": "Custom Filter",
    "share.filter_bots_title": "Filter Bots & Crawlers",
    "share.filter_bots_desc": "Exclude search engine crawlers (Google, Bing, Baidu, etc.), curl, and automated scripts",
    "share.filter_self_title": "Filter Self-Referrals",
    "share.filter_self_desc": "Exclude transitions originating from inside this domain",
    "share.filter_owner_title": "Filter Author Visits",
    "share.filter_owner_desc": "Logged-in author clicks and test previews are excluded from view counts",
    "share.filter_persist_hint": "Settings are saved locally and applied across dashboard and shares list",
    "share.filter_stats_summary": "Filtered {bots} bot hits, {self} self-referrals, and {owner} author views",
    "share.filter_real_traffic_active": "Real visitor mode active",
    "share.badge_bot": "Bot",
    "share.badge_human": "Real",
    "share.badge_owner": "Author",
    "share.badge_self_referrer": "Self",
    "share.category_pinned": "Pinned",
    "share.category_starred": "Starred",
    "share.clean_all_logs": "Clear all visit logs",
    "share.clean_bots_only": "Clean crawler logs only",
    "share.clean_logs_btn": "Clean Logs",
    "share.clean_logs_title": "Clean Visit Logs",
    "share.clean_now": "Clean Now",
    "share.clean_older_30d": "Clean logs older than 30 days",
    "share.clean_older_than_retention": "Clean expired logs",
    "share.clean_success": "Successfully deleted {count} logs",
    "share.col_client": "Client",
    "share.col_fp": "Fingerprint",
    "share.col_location": "Location",
    "share.col_note": "Note / Slug",
    "share.col_referrer": "Referrer",
    "share.col_time": "Visit Time",
    "share.col_type": "Type",
    "share.confirm_clear_all_logs": "Are you sure you want to clear all visit logs? This action cannot be undone.",
    "share.confirm_clear_bot_logs": "Are you sure you want to delete all crawler and bot logs?",
    "share.confirm_clear_older_logs": "Are you sure you want to delete visit logs older than {days} days?",
    "share.direct_access": "Direct access",
    "share.export_csv": "Export CSV",
    "share.export_success": "Visit logs exported successfully",
    "share.filter_all_traffic": "All Traffic",
    "share.filter_bot_only": "Crawlers & Bots",
    "share.filter_exclude_bots": "Filter Bots & Crawlers",
    "share.filter_exclude_bots_hint": "Exclude search engine bots (Google/Bing/Baidu) and scripts",
    "share.filter_exclude_owner": "Filter Author Visits",
    "share.filter_exclude_owner_hint": "Exclude author test visits when logged in",
    "share.filter_exclude_self": "Filter Self Referrals",
    "share.filter_exclude_self_hint": "Exclude internal same-origin cross-page referrals",
    "share.filter_owner_only": "Author Visits",
    "share.filter_real_only": "Real Readers",
    "share.generate_random_slug": "Generate random slug",
    "share.max_records_label": "Max Log Records",
    "share.max_records_val": "Up to {count}",
    "share.next_page": "Next",
    "share.no_logs_found": "No visit logs found matching filters",
    "share.no_logs_to_export": "No logs available to export",
    "share.page_info": "Page {page} of {totalPages}",
    "share.pin_note": "Pin note",
    "share.prev_page": "Previous",
    "share.random_slug_btn": "Random",
    "share.retention_days_label": "Log Retention Period",
    "share.retention_days_val": "{days} days",
    "share.retention_unlimited": "Keep Forever",
    "share.search_logs_placeholder": "Search note, slug, city, referrer...",
    "share.settings_modal_desc": "Configure traffic filtering preferences, visit log retention period, and storage limits",
    "share.settings_modal_title": "Share & Log Settings",
    "share.settings_retention_title": "Log Storage & Retention",
    "share.settings_saved": "Settings saved successfully",
    "share.settings_traffic_filter_title": "Traffic Filtering Rules",
    "share.sort_expires_asc": "Expiring soonest",
    "share.sort_pinned_first": "Pinned first",
    "share.star_note": "Star note",
    "share.total_records": "{count} total records",
    "share.unpin_note": "Unpin note",
    "share.unstar_note": "Unstar note",
    "share.view_all_logs": "View All Logs",
    "share.visit_logs_desc": "Inspect full visitor streams, referrers, and client devices with multi-dimensional filtering, CSV export, and retention cleanup",
    "share.visit_logs_title": "Visit Logs",
    "shell.add_to_remove_from_favorites": "Add to / remove from favorites",
    "shell.collapse_expand_list": "Collapse/expand list",
    "shell.cycle_editor_split_preview": "Cycle editor / split / preview",
    "shell.global": "Global",
    "shell.keyboard_shortcuts": "Keyboard shortcuts",
    "shell.mobile_navigation": "Mobile navigation",
    "shell.offline": "Offline",
    "shell.offline_changes_are_saved_locally": "Offline · changes are saved locally",
    "shell.offline_value0_changes_pending": "Offline · {value0} changes pending",
    "shell.quick_open": "Quick open",
    "shell.resize_navigation_panel": "Resize navigation panel",
    "shell.resize_note_list": "Resize note list",
    "shell.resize_note_panes": "Resize note panes",
    "shell.insert_note_template": "Insert note template at the caret",
    "shell.save_now": "Save now",
    "shell.saving": "Saving…",
    "shell.search_all_notes": "Search all notes",
    "shell.search_notes_or_run_a_command": "Search notes or run a command…",
    "shell.show_hide_outline": "Show/hide outline",
    "shell.synced": "Synced",
    "shell.synced_value0": "Synced · {value0}",
    "shell.unsaved_changes": "Unsaved changes",
    "sidebar.account_and_settings": "Account and settings",
    "sidebar.calendar_day_tooltip_value0": "{value0} · {value1} notes · click for the diary, drag to select a range",
    "sidebar.calendar_outside_window_value0": "newest edit is {value0} days before this window",
    "sidebar.calendar_gap_click_follow": "click to slide the rolling window here",
    "sidebar.calendar_diary_created_value0": "Diary created for {value0}",
    "sidebar.calendar_diary_opened_value0": "Opened the diary for {value0}",
    "sidebar.calendar_expand_day": "View day's notes",
    "sidebar.calendar_expand_week_value0": "Filter by week {value0} – {value1}",
    "sidebar.calendar_year_range_hint_value0": "Selected {value0} — click another month to complete the range (Esc to cancel)",
    "sidebar.calendar_jump_to_day": "Show this day in the month view",
    "sidebar.calendar_less": "Less",
    "sidebar.calendar_more": "More",
    "sidebar.calendar_month_grid_aria": "Month grid: {value0}",
    "sidebar.calendar_month_view": "Month",
    "sidebar.calendar_next_month": "Next month",
    "sidebar.calendar_next_year": "Next year",
    "sidebar.calendar_prev_month": "Previous month",
    "sidebar.calendar_prev_year": "Previous year",
    "sidebar.calendar_this_month": "Back to this month",
    "sidebar.calendar_this_year": "Back to this year",
    "sidebar.calendar_title": "Diary",
    "sidebar.calendar_today": "Today",
    "sidebar.calendar_view": "Calendar view",
    "sidebar.calendar_week_notes_value0": "This week's notes ({value0})",
    "sidebar.calendar_week_strip_value0": "Last {value0} weeks",
    "sidebar.calendar_week_view": "Weeks",
    "sidebar.calendar_year_grid_aria": "Year grid: {value0}",
    "sidebar.calendar_year_month_value0": "{value0} · {value1} notes",
    "sidebar.calendar_year_weekday_value0": "Filter the week of the first {value1} in {value0}",
    "sidebar.calendar_year_view": "Year",
    "sidebar.collapse": "Collapse",
    "sidebar.collapse_navigation": "Collapse navigation",
    "sidebar.create_first_folder": "Create first folder",
    "sidebar.diary_tag": "diary",
    "sidebar.diary_title_value0": "Diary {value0}",
    "sidebar.create_new_note_here": "Create new note here",
    "sidebar.delete_folder": "Delete folder",
    "sidebar.delete_folder_value0": "Delete folder \"{value0}\"?",
    "sidebar.expand": "Expand",
    "sidebar.expand_navigation": "Expand navigation",
    "sidebar.failed_to_create_folder": "Failed to create folder",
    "sidebar.jump_to_graph": "Open the graph to see the combined tag filter",
    "sidebar.tags_cleared": "Tag selection cleared",
    "sidebar.log_out": "Log out",
    "sidebar.member": "Member",
    "sidebar.move_earlier": "Move earlier",
    "sidebar.move_failed": "Move failed",
    "sidebar.move_later": "Move later",
    "sidebar.move_out_one_level": "Move out one level",
    "folders.appearance": "Folder appearance",
    "folders.choose_parent": "Choose parent folder",
    "folders.color": "Color",
    "folders.delete_contents_move_up": "{value0} direct notes and {value1} child folders will move up one level. Notes inside child folders stay in those folders.",
    "folders.icon": "Icon",
    "folders.includes_subfolders": "Includes notes in subfolders",
    "folders.move_to": "Move to…",
    "folders.no_color": "No color",
    "folders.no_icon": "Default icon",
    "folders.no_match": "No matching folders",
    "folders.search": "Search folders",
    "folders.top_level": "Top level",
    "folders.move_to_header": "Move to:",
    "folders.create_new": "Create new",
    "folders.manage_folders": "Manage folders",
    "folders.manage_description": "View, rename, customize, and delete all folders.",
    "folders.create_and_move_desc": "Create a new folder and move the selected note(s) into it.",
    "folders.no_folders": "No folders yet",
    "folders.notes_count": "{value0} notes",
    "folders.open_folder": "Open folder",
    "folders.set_as_inbox": "Set as default inbox",
    "folders.unset_inbox": "Unset default inbox",
    "folders.inbox": "Default inbox",
    "folders.inbox_set_toast": "Set \"{value0}\" as default inbox",
    "folders.inbox_cleared_toast": "Cleared default inbox",
    "folders.export_zip": "Export as Zip archive",
    "folders.export_zip_success": "Folder exported successfully ({value0} notes)",
    "folders.export_zip_empty": "No notes to export in this folder",
    "folders.default_template": "Default template",
    "folders.bind_template": "Bind default template",
    "folders.unbind_template": "Unbind template",
    "folders.no_template": "No template (Blank)",
    "folders.template_bound_toast": "Bound template \"{value0}\" to folder",
    "folders.template_unbound_toast": "Unbound default template",
    "folders.custom_icon_placeholder": "Custom emoji...",
    "folders.clean_empty": "Clean empty folders",
    "folders.clean_empty_value0": "Clean empty folders ({value0})",
    "folders.clean_empty_confirm_value0": "Are you sure you want to delete these {value0} empty folders containing no notes or subfolders? This action cannot be undone.",
    "folders.clean_empty_success": "Successfully cleaned {value0} empty folders",
    "folders.expand_all": "Expand all folders",
    "folders.collapse_all": "Collapse all folders",
    "tags.expand_all": "Expand all tags",
    "tags.collapse_all": "Collapse all tags",
    "sidebar.new_subfolder": "New subfolder",
    "sidebar.rename": "Rename",
    "sidebar.rename_failed": "Rename failed",
    "sidebar.cmd_click_selects_multiple": "Cmd/Ctrl+click to select multiple tags",
    "sidebar.tag_search_select_all": "Shift+Enter selects all matches",
    "sidebar.remove_selected_tag": "Remove {value0} from selection",
    "sidebar.show_all_value0_tags": "Show all {value0} tags",
    "sidebar.tags_selected": "Selected {value0} tags",
    "sidebar.tags_selected_hint": "New notes will carry these tags",
    "sidebar.switch_to_dark": "Switch to dark",
    "sidebar.switch_to_light": "Switch to light",
    "sidebar.the_value0_notes_inside_move_up_one_level_and_are_not_deleted": "The {value0} notes inside move up one level and are not deleted.",
    "sidebar.this_folder_is_empty": "This folder is empty.",
    "tags.change_color": "Change color",
    "tags.clear_color": "Clear color",
    "tags.clean_unused": "Clean unused tags",
    "tags.clean_unused_confirm_value0": "Are you sure you want to delete these {value0} unused tags?",
    "tags.clean_unused_value0": "Clean unused tags ({value0})",
    "tags.color": "Color",
    "tags.color_failed": "Could not update color",
    "tags.create": "Create",
    "tags.create_failed": "Could not create tag",
    "tags.create_first": "Create your first tag",
    "tags.delete": "Delete tag",
    "tags.delete_confirm_value0": "Delete tag \"{value0}\"? It will also be removed from the related note bodies.",
    "tags.delete_failed": "Could not delete tag",
    "tags.deleted": "Tag deleted",
    "tags.delete_description_value0": "It is used by {value0} active notes. Matching content in archived notes and trash will also be handled, with a version kept for every changed note.",
    "tags.filter_by_tag": "Filter by tag: #{value0}",
    "tags.invalid_name": "Tag names cannot contain spaces or #",
    "tags.manage_description": "Create, rename, color, pin, or delete tags.",
    "tags.manage_tags": "Manage tags",
    "tags.merge": "Merge tags",
    "tags.merge_choose_target_desc": "Choose a target tag to merge \"{value0}\" into:",
    "tags.merge_confirm_value0_value1": "Merge \"{value0}\" into \"{value1}\"?",
    "tags.merge_description": "The two tags will become one, and related note bodies and metadata will use the existing tag name.",
    "tags.merge_into": "Merge tag",
    "tags.new": "New tag",
    "tags.new_placeholder": "Tag name",
    "tags.no_match": "No matching tags found",
    "tags.no_other_tags_to_merge": "No other tags available to merge into",
    "tags.no_untagged_notes": "No untagged notes",
    "tags.no_untagged_notes_desc": "All notes have been organized and tagged.",
    "tags.notes_count": "{value0} notes",
    "tags.open_tag": "Open tag",
    "tags.pin": "Pin tag",
    "tags.pin_failed": "Could not pin tag",
    "tags.pinned": "Tag pinned",
    "tags.remove_from_note": "Remove tag from note",
    "tags.rename": "Rename",
    "tags.rename_failed": "Could not rename tag",
    "tags.renamed": "Tag renamed",
    "tags.selection_limit": "Tag selection limit ({value0} max) reached",
    "tags.tag_removed_from_note": "Removed tag #{value0} from note",
    "tags.unpin": "Unpin tag",
    "tags.unpin_failed": "Could not unpin tag",
    "tags.unpinned": "Tag unpinned",
    "tags.untagged": "Untagged",
    "tags.updated_note_bodies_value0": "Updated {value0} note bodies. Open notes were refreshed too.",
    "time.just_now": "Just now",
    "time.this_month": "This month",
    "time.this_week": "This week",
    "time.today": "Today",
    "time.yesterday": "Yesterday",
    "workspace.a_snapshot_is_saved_every_few_minutes_or_after_larger_edits": "A snapshot is saved every few minutes or after larger edits",
    "workspace.autosave_for_value0": "Autosave for “{value0}”",
    "workspace.back_to_notes": "Back to notes",
    "workspace.block_id": "Block ID",
    "workspace.block_reference": "Block reference",
    "workspace.callout": "Callout",
    "workspace.characters": " characters",
    "workspace.close_right_note": "Close right note",
    "workspace.choose_a_note_or_write_a_new_one": "Choose a note, or write a new one",
    "workspace.code_block": "Code block",
    "workspace.details_block": "Details block",
    "workspace.differences_from_current_content": "Differences from current content",
    "workspace.divider": "Divider",
    "workspace.edit_only": "Edit only",
    "workspace.enhanced_code_block": "Enhanced code block",
    "workspace.runnable_js_block": "Runnable code block (JavaScript)",
    "workspace.runnable_javascript_code": "Runnable Code Block (JavaScript)",
    "workspace.run": "Run",
    "workspace.running": "Running...",
    "workspace.run_code": "Run code",
    "workspace.line_numbers": "Line numbers",
    "workspace.toggle_line_numbers": "Toggle line numbers",
    "workspace.execution_result": "Console Output",
    "workspace.click_run_to_execute": "Click \"Run\" in the top right to execute code",
    "workspace.executed_no_output": "Executed successfully with no output",
    "workspace.export": "Export",
    "workspace.export_failed": "Export failed",
    "workspace.export_html": "Export as HTML",
    "workspace.export_markdown": "Export as Markdown",
    "workspace.export_pdf": "Export as PDF",
    "workspace.footnote": "Footnote",
    "workspace.heading_value0": "Heading {value0}",
    "workspace.inline_math": "Inline math",
    "workspace.insert_file": "Insert file",
    "workspace.insert_image": "Insert image",
    "workspace.insert_note_template": "Insert note template",
    "workspace.insert_tag": "Insert tag",
    "workspace.large_content_using_a_faster_comparison": "Large content · using a faster comparison",
    "workspace.latest": "Latest",
    "workspace.layout": "Layout",
    "workspace.left_note_pane": "Left note pane",
    "workspace.link": "Link",
    "workspace.loading_note_content": "Loading note content",
    "workspace.preview_file": "Preview",
    "workspace.download_file": "Download",
    "workspace.delete_file": "Delete",
    "workspace.file_attachment": "Attachment",
    "workspace.file_deleted": "File removed from note",
    "workspace.note_title": "Note title",
    "workspace.math": "Math",
    "workspace.mermaid_diagram": "Mermaid diagram",
    "workspace.chartjs_diagram": "Chart.js chart",
    "workspace.more_blocks": "More blocks",
    "workspace.more_inline_styles": "More inline styles",
    "workspace.could_not_load_backlinks": "Could not load backlinks",
    "workspace.could_not_load_version": "Could not load this version",
    "workspace.could_not_load_version_history": "Could not load version history",
    "workspace.no_notes_link_here_yet_write": "No notes link here yet. Write ",
    "workspace.no_version_history_yet": "No version history yet",
    "workspace.note_embed": "Note embed",
    "workspace.note_syntax": "Note syntax",
    "workspace.open_a_note_from_the_list_or_press_shortcut_to_create_one": "Open a note from the list, or press {shortcut} to create one",
    "workspace.preview_only": "Preview only",
    "workspace.remote_image": "Remote image",
    "workspace.resize_editor_and_preview_panes": "Resize editor and preview panes",
    "workspace.right_note_pane": "Right note pane",
    "workspace.restore_this_version": "Restore this version?",
    "workspace.restore_this_version_da5169": "Restore this version",
    "workspace.restored_to_selected_version": "Restored to selected version",
    "workspace.share": "Share",
    "workspace.split_view": "Split view",
    "workspace.subscript": "Subscript",
    "workspace.superscript": "Superscript",
    "workspace.table": "Table",
    "workspace.ruby_annotation": "Ruby annotation",
    "workspace.ruby_base_placeholder": "text",
    "workspace.ruby_text_placeholder": "annotation",
    "workspace.definition_list": "Definition list",
    "workspace.deflist_term_placeholder": "Term",
    "workspace.deflist_desc_placeholder": "Definition",
    "workspace.abbreviation": "Abbreviation",
    "workspace.abbr_desc_placeholder": "Full description",
    "workspace.task_in_progress": "Task in progress",
    "workspace.task_cancelled": "Task cancelled",
    "workspace.task_question": "Task question",
    "workspace.task_important": "Task important",
    "workspace.the_current_content_will_be_automatically_saved_as_a_new_version_first_a": "The current content will be automatically saved as a new version first and will not be lost.",
    "workspace.title": "[[title]]",
    "workspace.title_748d7d": "Title",
    "workspace.title_level": "Title level",
    "workspace.upload_failed": "Upload failed",
    "workspace.value0_unchanged_lines_hidden": "… {value0} unchanged lines hidden …",
    "workspace.will_appear_here": "will appear here.",
    "contextmenu.cut": "Cut",
    "contextmenu.copy": "Copy",
    "contextmenu.paste": "Paste",
    "contextmenu.select_all": "Select All",
    "contextmenu.undo": "Undo",
    "contextmenu.redo": "Redo",
    "contextmenu.format": "Format",
    "contextmenu.headings": "Headings",
    "contextmenu.heading_paragraph": "Paragraph (Clear Heading)",
    "contextmenu.lists_quotes": "Lists & Quotes",
    "contextmenu.convert_to": "Convert To",
    "contextmenu.convert_to_link": "Hyperlink",
    "contextmenu.convert_to_wikilink": "WikiLink",
    "contextmenu.convert_to_codeblock": "Code Block",
    "contextmenu.convert_to_callout": "Callout",
    "contextmenu.insert": "Insert",
    "contextmenu.insert_datetime": "Current Date & Time",
    "contextmenu.table_insert_row_above": "Insert Row Above",
    "contextmenu.table_insert_row_below": "Insert Row Below",
    "contextmenu.table_duplicate_row": "Duplicate Row",
    "contextmenu.table_delete_row": "Delete Row",
    "contextmenu.table_insert_col_left": "Insert Column Left",
    "contextmenu.table_insert_col_right": "Insert Column Right",
    "contextmenu.table_delete_col": "Delete Column",
    "contextmenu.table_align": "Column Alignment",
    "contextmenu.table_align_left": "Align Left",
    "contextmenu.table_align_center": "Align Center",
    "contextmenu.table_align_right": "Align Right",
    "contextmenu.table_align_default": "Default Align",
    "contextmenu.table_sort": "Sort Column",
    "contextmenu.table_sort_asc": "Sort Ascending (A-Z / 0-9)",
    "contextmenu.table_sort_desc": "Sort Descending (Z-A / 9-0)",
    "contextmenu.table_clear_cell": "Clear Cell",
    "contextmenu.table_clear_row": "Clear Row",
    "contextmenu.table_format": "Format Table Columns",
    "contextmenu.table_copy_markdown": "Copy Table as Markdown",
    "contextmenu.table_copy_csv": "Copy Table as CSV",
    "contextmenu.table_delete": "Delete Table",
    "contextmenu.table_jump_to_editor": "Edit Table in Editor",
    "contextmenu.table_quick_add_row": "+ Row",
    "contextmenu.table_quick_add_col": "+ Col",
    "contextmenu.table_quick_sort": "↕ Sort",
    "contextmenu.table_quick_format": "✨ Format",
    "contextmenu.table_quick_csv": "📋 CSV",
    "contextmenu.image_preview": "Preview in Lightbox",
    "contextmenu.image_copy_url": "Copy Image Address",
    "contextmenu.image_copy_markdown": "Copy Image Markdown",
    "contextmenu.image_delete": "Delete Image",
    "contextmenu.image_jump_to_editor": "Locate Image in Editor",
    "contextmenu.math_copy_latex": "Copy LaTeX Code",
    "contextmenu.math_toggle_block": "Toggle Inline / Block Math",
    "contextmenu.math_delete": "Delete Math",
    "contextmenu.math_jump_to_editor": "Locate Formula in Editor",
    "contextmenu.code_copy": "Copy Code",
    "contextmenu.code_format": "Format Code",
    "contextmenu.code_select": "Select Code Block",
    "contextmenu.code_change_lang": "Change Language",
    "contextmenu.code_delete": "Delete Code Block",
    "contextmenu.code_jump_to_editor": "Locate Code Block in Editor",
    "contextmenu.mermaid_refresh": "Refresh Diagram",
    "contextmenu.mermaid_copy": "Copy Diagram Code",
    "contextmenu.mermaid_templates": "Diagram Templates",
    "contextmenu.mermaid_flowchart": "Flowchart",
    "contextmenu.mermaid_sequence": "Sequence Diagram",
    "contextmenu.mermaid_class": "Class Diagram",
    "contextmenu.mermaid_state": "State Diagram",
    "contextmenu.mermaid_er": "Entity Relationship",
    "contextmenu.mermaid_gantt": "Gantt Chart",
    "contextmenu.mermaid_mindmap": "Mindmap",
    "contextmenu.mermaid_pie": "Pie Chart",
    "contextmenu.mermaid_timeline": "Timeline",
    "contextmenu.mermaid_journey": "User Journey",
    "contextmenu.mermaid_quadrant": "Quadrant Chart",
    "contextmenu.mermaid_gitgraph": "Git Graph",
    "contextmenu.mermaid_c4": "C4 Architecture",
    "contextmenu.mermaid_kanban": "Kanban",
    "contextmenu.mermaid_jump_to_editor": "Locate Diagram in Editor",
    "contextmenu.chart_templates": "Chart Templates",
    "contextmenu.chart_bar": "Bar Chart",
    "contextmenu.chart_line": "Line Chart",
    "contextmenu.chart_pie": "Pie Chart",
    "contextmenu.chart_doughnut": "Doughnut Chart",
    "contextmenu.chart_radar": "Radar Chart",
    "contextmenu.chart_polar_area": "Polar Area Chart",
    "contextmenu.chart_bubble": "Bubble Chart",
    "contextmenu.chart_copy": "Copy Chart Config",
    "contextmenu.chart_refresh": "Refresh Chart",
    "contextmenu.chart_jump_to_editor": "Locate Chart in Editor",
    "contextmenu.wikilink_open": "Open Note",
    "contextmenu.wikilink_open_secondary": "Open in Right Pane",
    "contextmenu.wikilink_pin": "Pin Preview Window",
    "contextmenu.wikilink_copy_title": "Copy Note Title",
    "contextmenu.wikilink_copy_link": "Copy WikiLink",
    "contextmenu.wikilink_jump_to_editor": "Locate Link in Editor",
    "contextmenu.link_open": "Open Link in New Tab",
    "contextmenu.link_copy": "Copy Link Address",
    "contextmenu.link_delete": "Delete Link",
    "contextmenu.frontmatter_add_prop": "Add Property",
    "contextmenu.frontmatter_add_tag": "Add Tag",
    "contextmenu.frontmatter_copy_yaml": "Copy Properties as YAML",
    "contextmenu.frontmatter_delete": "Delete Front Matter",
    "contextmenu.frontmatter_jump_to_editor": "Locate Properties in Editor",
    "contextmenu.task_toggle": "Toggle Task State",
    "contextmenu.task_convert_bullet": "Convert to Bullet List",
    "contextmenu.task_delete": "Delete Task",
    "contextmenu.task_jump_to_editor": "Locate Task in Editor",
    "contextmenu.preview_switch_edit": "Switch to Edit Mode",
    "contextmenu.preview_switch_split": "Switch to Split View",
    "contextmenu.preview_copy_markdown": "Copy Full Markdown",
    "contextmenu.preview_scroll_top": "Scroll to Top",
    "contextmenu.preview_scroll_bottom": "Scroll to Bottom",
    "contextmenu.preview_search_selection": "Search Notes for Selection",
    "contextmenu.preview_create_note_from_selection": "Create Note with Selection",
    "contextmenu.preview_jump_to_editor": "Locate in Editor",
    "template.article_outline.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [writing]
---

## Working Title

## Thesis
> 

## Audience

## Outline
### 1. Hook
- 

### 2. Section 1
- Key argument:
- Evidence:

### 3. Section 2
- Key argument:
- Evidence:

### 4. Conclusion
- 

## Sources
- 
`,
    "template.article_outline.description": "Structure an article: thesis, sections and key arguments.",
    "template.article_outline.name": "Article Outline",
    "template.book_notes.content": `---
title: Book Notes: {{title}}
createdAt: {{createdAt}}
tags: [reading]
---

## Book Info
- Author:
- Started: {{date}}
- Finished:

## Key Ideas
1. 

## Quotes
> 

## My Thoughts
- 

## Action Items
- [ ] 

## Rating
⭐⭐⭐⭐⭐
`,
    "template.book_notes.description": "Capture quotes, ideas and takeaways while reading a book.",
    "template.book_notes.name": "Book Notes",
    "template.brainstorm.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [brainstorm]
---

## Topic

## Rules
- Quantity over quality
- No criticism during the session
- Build on each other's ideas

## Raw Ideas
- 
- 
- 
- 

## Clusters
### Cluster A
- 

### Cluster B
- 

## Top Picks
1. 

## Next Step
- [ ] 
`,
    "template.brainstorm.description": "Capture raw ideas first, then cluster and prioritize.",
    "template.brainstorm.name": "Brainstorm",
    "template.bug_tracker.content": `---
title: Bug: {{title}}
createdAt: {{createdAt}}
tags: [bug]
---

## Severity
- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

## Environment
- Version:
- OS / Browser:

## Repro Steps
1. 

## Expected
- 

## Actual
- 

## Root Cause
- 

## Fix
- [ ] 

## Verification
- [ ] Reproduced before fix
- [ ] Fixed in:
`,
    "template.bug_tracker.description": "Document one bug per note: repro steps, cause and fix.",
    "template.bug_tracker.name": "Bug Tracker",
    "template.bullet_journal.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [bullet-journal]
---

## Future Log
- [[Month]] · {{tomorrow}}
- [[Month]] · {{tomorrow}}
- [[Month]] · {{tomorrow}}

## Monthly Log

| Date | Tasks | Events | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

## Daily Log

- [ ] Task
- [ ] Migrated task · >
- [ ] Scheduled task · <
- Event · o
- Note · -

## Key
- · task · > migrated · < scheduled · o event · - note
- * priority · ! inspiration · ? question · x done
`,
    "template.bullet_journal.description": "Rapid logging with bullets, tasks, events and notes plus a future log.",
    "template.bullet_journal.name": "Bullet Journal",
    "template.category.health": "Health & Habits",
    "template.category.industry": "By Industry",
    "template.category.learning": "Learning & Knowledge",
    "template.category.life": "Life & Leisure",
    "template.category.productivity": "Productivity",
    "template.category.tasks": "Tasks & Lists",
    "template.category.work": "Work & Meetings",
    "template.category.writing": "Writing & Creation",
    "template.tag.checklist": "Checklist",
    "template.tag.daily": "Daily",
    "template.tag.finance": "Finance",
    "template.tag.goal": "Goals",
    "template.tag.health": "Health",
    "template.tag.life": "Life",
    "template.tag.review": "Review",
    "template.tag.study": "Learning",
    "template.tag.table": "Table",
    "template.tag.tech": "Tech",
    "template.tag.travel": "Travel",
    "template.tag.weekly": "Weekly",
    "template.tag.work": "Work",
    "template.tag.writing": "Writing",
    "template.class_notes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [class]
---

## Course
- Lecturer:
- Topic:

## Key Points
1. 

## Examples
- 

## Questions
- [ ] 

## After Class
- [ ] Review notes
- [ ] Do exercises
- [ ] Ask questions
`,
    "template.class_notes.description": "Structured notes for lectures and courses.",
    "template.class_notes.name": "Lecture Notes",
    "template.cornell.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cornell]
---

| Cue column | Notes |
| --- | --- |
| Keywords, questions | Main notes, diagrams, examples |

> Write keywords and questions on the left, then take notes on the right.
> Review within 24 hours, cover the notes and quiz yourself from the cue column.

## Summary

Summarize the page in your own words in 1-3 sentences. {{cursor}}
`,
    "template.cornell.description": "The classic cue-column-summary layout for lectures and reading.",
    "template.cornell.name": "Cornell Notes",
    "template.dev_daily.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [dev]
---

## Today
- [ ] 
- [ ] 

## Details
- 

## Commits / PRs
- 

## Blockers
- 

## Open Questions
- 

## Tomorrow
- [ ] 

## Learned
- 
`,
    "template.dev_daily.description": "Daily developer log: progress, blockers and next steps.",
    "template.dev_daily.name": "Dev Daily Log",
    "template.diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [diary]
---

## Mood
- Energy (1-5):
- Mood (1-5):

## Today's Highlights
1. 

## What Happened
- 

## Gratitude
- 

## Tomorrow
- [ ] 

{{cursor}}
`,
    "template.diary.description": "A dated diary entry with mood, highlights and gratitude.",
    "template.diary.name": "Diary Entry",
    "template.expense_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [expense]
---

## Daily Spending
| Item | Category | Amount |
| --- | --- | --- |
|  |  |  |

## Category Totals
- Food:
- Transport:
- Shopping:
- Other:

## Budget Check
- Daily budget:
- Spent today:
- Remaining this month:

## Notes
- 
`,
    "template.expense_log.description": "Track daily spending by category and compare to budget.",
    "template.expense_log.name": "Expense Log",
    "template.feynman.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [feynman]
---

## Concept

## Plain-Language Explanation

Pretend you are teaching an 8-year-old:

> 

## Gaps Found
1. 

## Simplify & Retry

Rewrite with an analogy:

## Final Check
- [ ] Can I explain it without jargon?
- [ ] Can I give a concrete example?
`,
    "template.feynman.description": "Explain a concept in plain language to find your knowledge gaps.",
    "template.feynman.name": "Feynman Technique",
    "template.four_quadrant.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [priority]
---

## 1. Important & Urgent — do now
- [ ] 

## 2. Important & Not Urgent — schedule
- [ ] 

## 3. Not Important & Urgent — delegate
- [ ] 

## 4. Not Important & Not Urgent — drop or limit
- [ ] 

> Principle: protect time for quadrant 2; the most meaningful work lives there. {{cursor}}
`,
    "template.four_quadrant.description": "Prioritize tasks by urgency and importance into four quadrants.",
    "template.four_quadrant.name": "Four Quadrants",
    "template.gtd.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [gtd]
---

## Inbox
- 

## Next Actions
- [ ] 

## Waiting For
- [ ] 

## Projects
- [ ] 

## Someday / Maybe
- 

## Calendar
- {{today}}:
- {{tomorrow}}:

> Weekly review: empty the inbox, update lists, and decide the next physical action for each project.
`,
    "template.gtd.description": "Capture, clarify, organize, reflect and engage with your commitments.",
    "template.gtd.name": "GTD Task Management",
    "template.habit_tracker.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [habits]
---

## Habits
- [ ] 
- [ ] 
- [ ] 

## Monthly Grid

| Date | Habit 1 | Habit 2 | Habit 3 |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## Notes
- Missed a day? Don't break the chain — just continue. {{cursor}}
`,
    "template.habit_tracker.description": "Track daily habits across a month with a simple grid.",
    "template.habit_tracker.name": "Habit Tracker",
    "template.knowledge_cards.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cards]
---

## Idea

> One sentence.

## Notes

## Sources
- 

## Related
- [[Related Note]]

## Actions
- [ ] 

> Write it as if you will never see the original source again. {{cursor}}
`,
    "template.knowledge_cards.description": "One idea per card for building a personal knowledge base.",
    "template.knowledge_cards.name": "Knowledge Cards",
    "template.marketing_plan.content": `---
title: {{title}} Marketing Plan
createdAt: {{createdAt}}
tags: [marketing]
---

## Campaign Overview
- Goal:
- Target audience:
- Launch date:

## Channels
- [ ] Social media
- [ ] Email
- [ ] Content / SEO
- [ ] Paid ads

## Content Plan
| Date | Channel | Topic | Status |
| --- | --- | --- | --- |
|  |  |  |  |

## Budget
| Item | Planned | Actual |
| --- | --- | --- |
| Ads |  |  |
| Production |  |  |

## Success Metrics
- 

## Review
- {{tomorrow}}
`,
    "template.marketing_plan.description": "Plan a campaign: audience, channels, budget and timeline.",
    "template.marketing_plan.name": "Marketing Plan",
    "template.meal_log.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [food]
---

## Breakfast
- 

## Lunch
- 

## Dinner
- 

## Snacks
- 

## Daily Check
- Calories:  / 
- Water:  glasses
- Feeling:
- 

> Honest records beat perfect records. {{cursor}}
`,
    "template.meal_log.description": "Track meals, calories and how you feel afterwards.",
    "template.meal_log.name": "Meal Log",
    "template.meeting_minutes.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [meeting]
---

## Meta
- Time:
- Attendees:
- Absent:

## Agenda
1. 

## Discussion
- 

## Decisions
1. 

## Action Items
- [ ] Owner:  · Due: 

## Next Meeting
- {{tomorrow}}
`,
    "template.meeting_minutes.description": "Capture decisions, action items and owners from a meeting.",
    "template.meeting_minutes.name": "Meeting Minutes",
    "template.mistake_notebook.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [mistakes]
---

## Subject

## Original Problem

## My Mistake

## Correct Approach

## Root Cause
- [ ] Careless
- [ ] Knowledge gap
- [ ] Wrong method

## Retest Date
- {{tomorrow}}
`,
    "template.mistake_notebook.description": "Log mistakes with the correct approach to avoid repeating them.",
    "template.mistake_notebook.name": "Mistake Notebook",
    "template.morning_pages.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [journal]
---

## Free writing

Start writing whatever comes to mind. Don't edit, don't stop.

{{cursor}}

## One-line today

## Intention
`,
    "template.morning_pages.description": "Three pages of stream-of-consciousness writing to clear your mind.",
    "template.morning_pages.name": "Morning Pages",
    "template.movie_log.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [movies]
---

## Seen

### {{date}}
- Title:
- Rating: ⭐⭐⭐
- Review:
- Favorite scene:

## Want to Watch
- [ ] 
- [ ] 

## Yearly Stats
- Total:
- Favorites:
`,
    "template.movie_log.description": "Track films and shows with ratings and quick reviews.",
    "template.movie_log.name": "Movie & Show Log",
    "template.okr.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [okr]
---

## Objective 1

- [ ] KR 1.1: 
- [ ] KR 1.2: 
- [ ] KR 1.3: 

## Objective 2

- [ ] KR 2.1: 
- [ ] KR 2.2: 

## Weekly Check-in
| Week | Progress | Blockers |
| --- | --- | --- |
|  |  |  |

> KRs should be measurable, ambitious and time-bound. Review weekly.
`,
    "template.okr.description": "Objectives and key results to align ambitious goals with measurable outcomes.",
    "template.okr.name": "OKR Goals",
    "template.pdca.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pdca]
---

## Plan
- Goal:
- Current status:
- Root causes:
- Actions to take:

## Do
- [ ] 
- [ ] 

## Check
- Results vs plan:
- What worked:
- What did not:

## Act
- Keep:
- Adjust:
- Next cycle starts: {{tomorrow}}
`,
    "template.pdca.description": "Plan-Do-Check-Act loop for continuous improvement.",
    "template.pdca.name": "PDCA Cycle",
    "template.pomodoro.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [pomodoro]
---

## Today's Goal

## Pomodoros

| # | Task | Interruptions | Done |
| --- | --- | --- | --- |
| 1 |  |  | [ ] |
| 2 |  |  | [ ] |
| 3 |  |  | [ ] |
| 4 |  |  | [ ] |

## Notes
- 

> Rhythm: 25 min work, 5 min break; every 4 pomodoros take a longer break. {{cursor}}
`,
    "template.pomodoro.description": "25-minute focus sprints with short breaks.",
    "template.pomodoro.name": "Pomodoro Technique",
    "template.prd.content": `---
title: {{title}} PRD
createdAt: {{createdAt}}
tags: [product]
---

## Background
- Problem:
- Why now:

## Goals
1. 

## Non-Goals
- 

## Target Users
- 

## User Stories
- As a ..., I want to ..., so that ...

## Scope
### In Scope
- [ ] 

### Out of Scope
- 

## Acceptance Criteria
- [ ] 

## Metrics
- 

## Open Questions
- 
`,
    "template.prd.description": "Product requirements: background, users, scope and acceptance criteria.",
    "template.prd.name": "Product Requirements",
    "template.project_review.content": `---
title: {{title}} Retrospective
createdAt: {{createdAt}}
tags: [review]
---

## Background
- Project:
- Period:
- Goal:

## What Went Well
1. 

## What Went Wrong
1. 

## Root Causes
- 

## Keep Doing
- 

## Improve Next Time
- [ ] 

## Lessons
- 
`,
    "template.project_review.description": "Retrospective on what went well and what to improve.",
    "template.project_review.name": "Project Retrospective",
    "template.recipe.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cooking]
---

## Dish

## Servings

## Time
- Prep:  min
- Cook:  min

## Ingredients
- 

## Steps
1. 

## Taste Notes
- Rating: ⭐⭐⭐
- Adjust next time:

> Remember to write down the seasoning amounts you actually used. {{cursor}}
`,
    "template.recipe.description": "Standard recipe card with ingredients and steps.",
    "template.recipe.name": "Recipe",
    "template.shopping_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [shopping]
---

## Groceries
- [ ] 
- [ ] 

## Household
- [ ] 
- [ ] 

## Electronics / Other
- [ ] 

## Budget
- Planned: 
- Spent: 
- Remaining: 

> Tick items off as you put them into the cart. {{cursor}}
`,
    "template.shopping_list.description": "Categorized shopping list with quantities and budget.",
    "template.shopping_list.name": "Shopping List",
    "template.sleep_diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [sleep]
---

## Last Night
- Bedtime:
- Fell asleep:
- Woke up:
- Got up:

## Quality
- Total sleep:  h
- Quality (1-5):
- Awakenings:

## Factors
- Caffeine after 14:00: 
- Screen time before bed: 
- Exercise today: 

## Tonight's Plan
- [ ] Wind down at:
- [ ] Lights off at:

> Keep a consistent schedule — weekends too. {{cursor}}
`,
    "template.sleep_diary.description": "Track bedtime, wake time and sleep quality.",
    "template.sleep_diary.name": "Sleep Diary",
    "template.speech_draft.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [speech]
---

## Occasion
- Event:
- Duration:  min
- Audience:

## One-Minute Message
> 

## Opening
- Hook:
- Why this topic:

## Main Points
### Point 1
- 

### Point 2
- 

### Point 3
- 

## Closing
- Recap:
- Call to action:

## Delivery Notes
- Pace:
- Pauses:
`,
    "template.speech_draft.description": "Draft a speech with opening, main points and call to action.",
    "template.speech_draft.name": "Speech Draft",
    "template.story_setting.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [story]
---

## Logline
> 

## Characters
### Protagonist
- Name:
- Want:
- Need:
- Flaw:

### Antagonist
- Name:
- Want:

## World
- Setting:
- Rules:
- Conflict source:

## Plot
### Act 1
- 

### Act 2
- 

### Act 3
- 

## Themes
- 
`,
    "template.story_setting.description": "Develop characters, world and plot for a story.",
    "template.story_setting.name": "Story Setting",
    "template.swot.content": `---
title: {{title}} SWOT
createdAt: {{createdAt}}
tags: [swot]
---

|  | Positive | Negative |
| --- | --- | --- |
| Internal | **Strengths** | **Weaknesses** |
|  |  |  |
| External | **Opportunities** | **Threats** |
|  |  |  |

## Strategies
- SO (use strengths to seize opportunities):
- WO (fix weaknesses to grab opportunities):
- ST (use strengths to reduce threats):
- WT (avoid threats, minimize weaknesses):
`,
    "template.swot.description": "Assess strengths, weaknesses, opportunities and threats.",
    "template.swot.name": "SWOT Analysis",
    "template.task_breakdown.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [planning]
---

## Big Task

**Goal / Definition of done:**

## Subtasks
- [ ] 1. 
  - [ ] Details
- [ ] 2. 
  - [ ] Details
- [ ] 3. 

## Dependencies & Risks
- 

## Estimate
- Total:  hours
- Deadline: 

> Each subtask should be small enough to start without thinking. {{cursor}}
`,
    "template.task_breakdown.description": "Break a big task into small, actionable subtasks.",
    "template.task_breakdown.name": "Task Breakdown",
    "template.todo_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [todo]
---

## Today
- [ ] **High priority**
  - [ ] 
- [ ] **Medium priority**
  - [ ] 
- [ ] **Low priority**
  - [ ] 

## Deferred
- [ ] 

> Pick the single most important task and finish it first. {{cursor}}
`,
    "template.todo_list.description": "A simple daily todo list with priorities and due dates.",
    "template.todo_list.name": "Todo List",
    "template.travel_guide.content": `---
title: {{title}} Travel Guide
createdAt: {{createdAt}}
tags: [travel]
---

## Trip Info
- Destination:
- Dates:
- Travelers:

## Itinerary
### Day 1 · {{today}}
- [ ] Morning:
- [ ] Afternoon:
- [ ] Evening:

### Day 2 · {{tomorrow}}
- [ ] Morning:
- [ ] Afternoon:
- [ ] Evening:

## Budget
| Item | Planned | Actual |
| --- | --- | --- |
| Transport |  |  |
| Accommodation |  |  |
| Food |  |  |
| Tickets |  |  |

## Packing
- [ ] Documents & IDs
- [ ] 

## Bookings
- [ ] Flights
- [ ] Hotel
- [ ] 

## Notes
- 
`,
    "template.travel_guide.description": "Plan itinerary, budget, packing and bookings for a trip.",
    "template.travel_guide.name": "Travel Guide",
    "template.weekly_plan.content": `---
title: {{title}} · Week
createdAt: {{createdAt}}
tags: [weekly]
---

## This Week's Focus
1. 

## Schedule
| Day | Tasks | Notes |
| --- | --- | --- |
| Mon |  |  |
| Tue |  |  |
| Wed |  |  |
| Thu |  |  |
| Fri |  |  |
| Sat |  |  |
| Sun |  |  |

## Next Week Preview
- 

> Review on Sunday: what moved forward, what needs replanning. {{cursor}}
`,
    "template.weekly_plan.description": "Plan your week: goals, schedule and reviews.",
    "template.weekly_plan.name": "Weekly Plan",
    "template.weekly_report.content": `---
title: {{title}} Weekly Report
createdAt: {{createdAt}}
tags: [report]
---

## Completed
1. 

## In Progress
- 

## Blockers
- 

## Learned
- 

## Next Week
- [ ] 

## Metrics
| KPI | Target | Actual |
| --- | --- | --- |
|  |  |  |
`,
    "template.weekly_report.description": "Summarize what you did, learned and plan next week.",
    "template.weekly_report.name": "Weekly Report",
    "template.workout_plan.content": `---
title: {{title}} Workout Plan
createdAt: {{createdAt}}
tags: [fitness]
---

## Weekly Split
| Day | Focus |
| --- | --- |
| Mon |  |
| Wed |  |
| Fri |  |

## Workout Log
### Push Day
| Exercise | Sets × Reps | Weight | Done |
| --- | --- | --- | --- |
|  |  |  | [ ] |

### Pull Day
| Exercise | Sets × Reps | Weight | Done |
| --- | --- | --- | --- |
|  |  |  | [ ] |

## Rest & Recovery
- Sleep:  h
- Stretching: [ ] 
`,
    "template.workout_plan.description": "Weekly workout split with exercises, sets and reps.",
    "template.workout_plan.name": "Workout Plan",
    "templates.all_templates": "All templates",
    "templates.builtin": "Built-in",
    "templates.categories": "Categories",
    "templates.category": "Category",
    "templates.category_name": "Category name",
    "templates.create_template": "Create template",
    "templates.created_note_from_template": "Note created from template",
    "templates.delete_category": "Delete category",
    "templates.delete_category_confirm": "Delete category {value0}? Templates inside will move to Uncategorized.",
    "templates.delete_template": "Delete template",
    "templates.delete_template_confirm": "Delete this template? Notes you already created are not affected.",
    "templates.description": "Description",
    "templates.duplicate_template": "Duplicate",
    "templates.edit_template": "Edit template",
    "templates.favorites": "Favorites",
    "templates.lines_count": "{value0} lines",
    "templates.move_to_category": "Move to category",
    "templates.name_required": "Please enter a name",
    "templates.new_category": "New category",
    "templates.new_note_from_template": "New note from template",
    "templates.new_template": "New template",
    "templates.no_matching_templates": "No matching templates",
    "templates.no_templates": "No templates here yet",
    "templates.no_templates_hint": "Create your own template or pick another category",
    "templates.rename_category": "Rename category",
    "templates.rename_template": "Rename",
    "templates.search_templates": "Search templates…",
    "templates.template_content": "Template content",
    "templates.template_content_hint": "Placeholders like the new-note template: {{title}}, {{date}}, {{time}}, {{today}}, {{tomorrow}}, {{yesterday}}, {{cursor}}.",
    "templates.template_count": "{value0} templates",
    "templates.template_library": "Template library",
    "templates.template_name": "Template name",
    "templates.uncategorized": "Uncategorized",
    "templates.use_template": "Use this template",
    "templates.copied_to_clipboard": "Copied to clipboard",
    "templates.copy_json": "Copy JSON",
    "templates.export_library": "Export library",
    "templates.exported_value0_templates": "Exported {value0} templates",
    "templates.import_file": "Choose file",
    "templates.import_hint": "Paste template-library JSON exported from another device, or choose a file. Your existing templates are kept.",
    "templates.import_invalid": "That file is not a valid template-library export.",
    "templates.import_paste_placeholder": "Paste template-library JSON here…",
    "templates.import_templates": "Import templates",
    "templates.import_title": "Import templates",
    "templates.imported_value0_skipped_value1": "Imported {value0} templates, skipped {value1}",
    "templates.no_favorite_templates": "No favorite templates",
    "templates.no_favorite_templates_hint": "Star templates in the library to create notes from them here.",
    "templates.open_template_library": "Open template library",
    "templates.tag_hint": "Separate multiple tags with commas.",
    "templates.tags": "Tags",
    "templates.batch_delete_confirm_value0": "Delete these {value0} templates? Notes you already created are not affected.",
    "templates.batch_deleted_value0": "Deleted {value0} templates",
    "templates.batch_moved_value0": "Moved {value0} templates",
    "templates.batch_starred_value0": "Added {value0} templates to favorites",
    "templates.batch_unstarred_value0": "Removed {value0} templates from favorites",
    "templates.clear_selection": "Clear selection",
    "templates.exit_select_mode": "Exit select mode",
    "templates.kbd_hint": "↑↓←→ move · Enter use · Ctrl/⌘+click star · / search",
    "templates.select_all": "Select all",
    "templates.select_hint": "Click cards to select multiple templates, then run a batch action. Esc exits.",
    "templates.select_mode": "Select mode",
    "templates.select_template": "Select template",
    "templates.selected_count_value0": "{value0} selected",
    "templates.community": "Community",
    "templates.community_count_value0": "{value0} templates shared",
    "templates.community_empty": "No templates shared yet",
    "templates.community_empty_hint": "Publish a template from your library to get the community started.",
    "templates.community_import": "Add to my library",
    "templates.community_imported": "Added to your template library",
    "templates.community_load_failed": "Couldn't load the community templates",
    "templates.community_mine": "Mine",
    "templates.community_published": "Template published",
    "templates.community_unpublish": "Unpublish",
    "templates.community_unpublish_confirm": "Remove this template from the community? It stays in your library.",
    "templates.community_unpublished": "Template unpublished",
    "templates.help_esc": "Close / exit select mode",
    "templates.help_help": "Show this help",
    "templates.help_move": "Move between templates",
    "templates.help_search": "Focus search",
    "templates.help_select_all": "Select all visible / clear",
    "templates.help_select_click": "Toggle a template",
    "templates.help_select_focused": "Toggle the focused template",
    "templates.help_select_mode": "Enter / exit select mode",
    "templates.help_select_section": "Select mode",
    "templates.help_star": "Star / unstar",
    "templates.help_tab": "Move between controls",
    "templates.help_use": "Use the focused template",
    "templates.keyboard_shortcuts": "Keyboard shortcuts",
    "templates.publish_hint": "This publishes the template publicly to this instance's community. Anyone signed in can use or copy it.",
    "templates.publish_to_community": "Publish to community",
    "common.refresh": "Refresh",
    "seed.welcome_note": `---
title: Welcome to Inkstone
tags: [getting-started, Inkstone]
aliases:
  - User guide
---

# Welcome to Inkstone

> [!TIP] Five things to know first
> - This is your private Markdown notebook; note bodies always remain plain text.
> - Content saves automatically, remains editable offline, and uploads after reconnection.
> - Common create, move, organize, and delete actions take effect locally first and roll back safely if persistence fails.
> - The title at the top of a note is independently editable and does not have to match the first body line.
> - MCP is entirely optional and requires account authorization before it can read notes.

Use the left side to organize notes, the center to edit plain Markdown, and the right side for live preview. There is no proprietary document format: every \`.md\` file in a backup opens in any text editor.

## Try these now

- [ ] Click this checkbox and watch the source update on the left
  - [ ] Nested tasks update their exact source line too
- [ ] Select text and press \`Ctrl + B\` to make it bold
- [ ] Press \`Ctrl + K\` to open the command palette
- [ ] Add a \`#tag\`, or click [[My first note]] to create a linked note
- [ ] Click the title above this note and give it a name different from the body
- [ ] Create a subfolder, then drag it into another folder or sibling position
- [ ] Alt-click another note, or choose **Open to side**, to work with two notes at once
- [ ] Install Inkstone as an offline-capable PWA under **Settings → About**
- [ ] Open **Settings → MCP** to review private AI connections and permissions
- [ ] Add a backup target under **Settings → Backup**
- [ ] Create a password-protected share for a note

> [!NOTE] Add a backup
> Open **Settings → Backup**, add a WebDAV or S3 target, test the connection, and run one **Back up now**.

> [!NOTE] Create a secure share
> Open **Share** from any note, then set an access password and expiration. Attachments in a protected share are available only after password verification.

## Essential Windows shortcuts

| Shortcut | Action |
| --- | --- |
| \`Ctrl + K\` | Open the command palette |
| \`Ctrl + P\` | Quickly open a note |
| \`Ctrl + N\` | Create a note |
| \`Ctrl + Shift + F\` | Search all notes |
| \`Ctrl + ,\` | Open settings |
| \`Ctrl + \\\` | Cycle editor, split, and preview layouts |
| \`Ctrl + S\` | Save now; normal edits save automatically |
| \`Ctrl + B / I / E\` | Bold, italic, and inline code |
| \`Ctrl + 1…6\` | Set heading levels one through six |
| \`Shift + ?\` | Show every shortcut |

## Why it works for long-term notes

:::: tabs
::: tab-item Writing
Independent titles, source editing, live preview, synchronized scrolling, focus and typewriter modes, an outline, and version history.
:::

::: tab-item Organization
Twelve levels of drag-sortable folders, inline \`#tags\`, \`[[wiki links]]\`, backlinks, a graph, and full-text search. On desktop, open a second note to the side and choose edit, split, or preview independently in each active group. Deleting a folder promotes its children and moves direct notes to the parent.
:::

::: tab-item Search & AI
Keyboard command-palette navigation, keyword search, and optional Workers AI semantic/hybrid search. Every account has a separate index, with automatic keyword fallback when AI is unavailable.
:::

::: tab-item Safety & backup
Self-hosting, an installable PWA, offline editing, multi-device sync, and conflict copies. Back up to several WebDAV or S3 targets and export readable Markdown, attachments, and complete structured data.
:::
::::

## Private MCP (optional)

Under **Settings → MCP**, the owner can enable the remote MCP service and each account can separately decide whether to allow writes or moves to trash:

- Full MCP clients such as Codex and Claude Code authorize through OAuth 2.1 with PKCE. You can revoke one client or every grant at any time.
- Scripts and minimal clients without OAuth can use an \`ink_...\` API key. A key is shown once, stored only as a hash, and can be revoked at any time.
- MCP can search, read bounded ranges, inspect outlines/folders/tags/links, and—with explicit permission—safely create, edit, organize, trash, or restore notes. Permanent purge is never exposed.
- With Workers AI configured, Inkstone builds a per-account semantic index and combines semantic and keyword results. The index can be rebuilt or cleared, and content changes are indexed in the background.

> [!WARNING] Check an external AI client's privacy policy before connecting
> Inkstone isolates accounts and enforces permissions, but content an authorized client actually reads is then processed by that client.

## Markdown quick reference

Under each example title, the **rendered result** is on the left and the **copyable source** is on the right.

### Inline styles

| Rendered result | Source |
| --- | --- |
| **Bold** | \`**Bold**\` |
| *Italic* | \`*Italic*\` |
| ~~Strikethrough~~ | \`~~Strikethrough~~\` |
| ==Highlight== | \`==Highlight==\` |
| \`Inline code\` | \`\` \`Inline code\` \`\` |

### Links, images, and note relationships

~~~~md-example title="Link"
[Open the example site](https://example.com)
~~~~

~~~~md-example title="Image"
![Inkstone project logo](/inkstone-logo.svg "Inkstone project logo")
~~~~

~~~~md-example title="Wiki links"
[[My first note|Open or create a note]] · [[Welcome to Inkstone#Markdown quick reference|Jump to this section]]
~~~~

~~~~md-example title="Block ID and reference"
This content can be addressed precisely. ^markdown-demo

Click [[#^markdown-demo]] to return to it.
~~~~

~~~~md-example title="Note embed"
This content is embedded again below. ^embed-demo

![[#^embed-demo|Embedded result]]
~~~~

~~~~md-example title="Footnote"
This sentence has an additional note.[^markdown-footnote]

[^markdown-footnote]: This is the rendered footnote. Use its links to move between the reference and definition.
~~~~

Obsidian comments are hidden in preview: \`%% one line %%\`, or place \`%%\` markers around multiple lines.

### Math and diagrams

~~~~md-example title="Math"
Inline math: $E = mc^2$

$$
a^2 + b^2 = c^2
$$
~~~~

~~~~md-example title="Mermaid diagram"
\`\`\`mermaid
flowchart LR
  A[Markdown source] --> B[Live preview]
\`\`\`
~~~~

### Modern block extensions

~~~~md-example title="Obsidian callout"
> [!NOTE]- Folded callout with a custom title
> Put explanations, tasks, lists, or other Markdown here.
>
> > [!TIP]+ Expanded nested callout
> > Nested callouts use the same syntax.
~~~~

~~~~md-example title="Folded details block"
::: details [Click to expand]
This content is hidden until the details block is opened.
:::
~~~~

~~~~md-example title="Tabs"
:::: tabs
::: tab-item First tab
This is the first tab panel.
:::

::: tab-item Second tab
This is the second tab panel.
:::
::::
~~~~

~~~~md-example title="Code block with a title, line numbers, and highlighting"
\`\`\`ts title="hello.ts" line-numbers {2}
const name = 'Inkstone'
console.log(\`Hello, \${name}!\`)
\`\`\`
~~~~

## Saving, syncing, and recovery

Changes save automatically and sync to your other devices. You can keep editing offline, and queued writes replay in order after reconnection. Everyday actions appear locally first and roll back only if background persistence fails; stale sync responses cannot overwrite newer local state.

Install the PWA under **Settings → About**. Application updates wait for confirmation and flush pending note writes before refreshing; only the owner receives deployment-version reminders. Existing databases upgrade through versioned, idempotent migrations, but keep a current backup before updating a self-hosted deployment.

Add several WebDAV/S3 destinations and a schedule under **Settings → Backup**. Import or export \`.md\`, \`.zip\`, and complete JSON archives under **Settings → Data**.

> [!WARNING] Backup is not sync
> Keep backups with at least two independent providers, and occasionally perform a real restore to prove they work.

## You are ready

Press \`Ctrl + ,\` to change the interface language, theme, typography, editor, sync, or backup settings. You now know everything needed to use Inkstone. Keep this note as a reference or delete it and start writing. #getting-started
`,
} as const;
export type MessageKey = keyof typeof EN_US_MESSAGES;
