// Visual end-to-end gate: renders the app in real Chrome (puppeteer-core +
// the system Chrome that GitHub runners preinstall) and asserts the prose
// pipeline that API-level e2e cannot see — code blocks with syntax
// highlighting and line numbers, mermaid diagrams, KaTeX math — plus the
// mobile .mobile-pane-layer transitions and the desktop split preview.
//
// The flow is UI-driven on purpose: demo-mode sessions live in client memory
// (a reload logs out) and notes created through raw API calls bypass the
// client store, so the probe note is created through the real new-note button
// and typed into the real editor. Registration is a one-time event on real
// instances and stays out of scope — the gate signs in with an existing
// account instead.
//
// Usage: node scripts/e2e-visual.mjs [baseUrl]   (default http://localhost:7712)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import {
  PALETTE_PANEL,
  REAL_VISITOR_UA,
  SETTINGS_PANEL,
  SHARE_HUB_DIALOG,
  SHARE_LABELS,
  apiCall,
  chromeExecutablePath,
  clickButton,
  ensureAxe,
  dismissUpdatePrompt,
  ensurePaneVisible,
  isReviewedIncomplete,
  loginThroughUi,
  openShareCenter,
  pressCombo,
  pressSurfaceControl,
  MUSIC_PROBE,
  runAxe,
  seedMusicProbeTracks,
  waitForHittable,
  seedShareHubData,
  setAppTheme,
  sleep,
  waitForPanelSettled,
} from './e2e-harness.mjs'

import { PROVIDER_STUB_FULL_PAGE, PROVIDER_STUB_HITS, installMusicProviderStub } from './lib/music-provider-stub.mjs'

const BASE = process.argv[2] ?? 'http://localhost:7712'
// Credentials of an existing account to sign in as. CI runs this gate right
// after scripts/e2e.mjs, which registered Owner-1, rotated its password to
// supersecret100, and then closed registration — so the default matches that
// final account state.
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 1280, height: 900 }

const NOTE_MARKDOWN = [
  '# Visual E2E Probe',
  '',
  '```ts title="probe.ts" line-numbers {2}',
  'const name = "Inkstone"',
  'console.log(`Hello, ${name}!`)',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Markdown] --> B[Preview]',
  '```',
  '',
  '---',
  '',
  'Inline math $E = mc^2$ and display math:',
  '',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
].join('\n')

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

// The resources, read a file at a time: the index module the app imports leaves the extensions off its
// own imports, which Node cannot resolve, while every page of it is a plain object literal.
const LOCALE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/shared/locales')
const localeMessages = { 'zh-CN': {}, 'en-US': {} }
for (const locale of ['zh-CN', 'en-US']) {
  const dir = path.join(LOCALE_ROOT, locale)
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue
    Object.assign(localeMessages[locale], (await import(pathToFileURL(path.join(dir, file)).href)).messages)
  }
}

/**
 * The spellings the resources give a key, in both languages — what a control is looked for by. The
 * strings used to be copied here by hand, and a copy goes stale the day the copy is reworded: the
 * search history popup had moved to its new wording in the app while the gate still selected the old
 * one, so the read found nothing and the assertion failed for the wrong reason (M5b). Naming the key
 * makes a rename follow by itself, and a key that does not exist is a load-time failure instead of a
 * selector that matches nothing.
 */
function localeLabel(...keys) {
  return keys.flatMap((key) => {
    const zh = localeMessages['zh-CN'][key]
    const en = localeMessages['en-US'][key]
    if (zh === undefined || en === undefined) throw new Error(`gate label: no resource for ${key}`)
    return zh === en ? [zh] : [zh, en]
  })
}

/** The leading text of a templated row: what a reader sees before the placeholder is filled in. */
function localePrefix(key) {
  return localeLabel(key).map((text) => (text.includes('{') ? text.slice(0, text.indexOf('{')).trimEnd() : text))
}

// The lists below are what each read is looking for, matched on both text and aria-label so the gate is
// locale-agnostic. Every string in them has to be one the resources carry today: scripts/check-visual-labels.mjs
// holds this file and the harness to that rule, so a reworded control fails the gate instead of the browser.
const LABELS = {
  newNote: localeLabel('common.new_note'),
  list: ['笔记', 'Notes'],
  edit: localeLabel('common.edit'),
  preview: localeLabel('preview.kanban_file_preview'),
  present: localeLabel('workspace.presentation_mode'),
  presentExit: localeLabel('workspace.presentation_exit'),
  presentExport: localeLabel('workspace.presentation_export'),
  presentExportImages: localeLabel('workspace.presentation_export_images'),
  slidesPrint: localeLabel('preview.kanban_export_print', 'slides.tool_print'),
  slidesDuplicate: localeLabel('slides.duplicate_element'),
  presentRail: localeLabel('workspace.presentation_show_slides', 'workspace.presentation_hide_slides'),
  presentFreeze: localeLabel('workspace.presentation_freeze'),
  presentFollow: localeLabel('workspace.presentation_follow'),
  outline: localeLabel('common.outline', 'preview.mindmap_mode_outline'),
  insert: localeLabel('contextmenu.insert'),
  mindMap: localeLabel('contextmenu.convert_to_mindmap', 'preview.mindmap', 'preview.mindmap_untitled', 'workspace.mind_map'),
  mindMapOutline: localeLabel('contextmenu.mindmap_outline'),
  musicHub: localeLabel('music.hub_title'),
  musicOpenHub: localeLabel('music.open_hub'),
  musicOpenSettings: localeLabel('music.open_settings'),
  musicSettingsNav: localeLabel('settings.music'),
  musicSettingsSources: localeLabel('music.settings_sources'),
  musicHubNavigation: localeLabel('music.hub_sidebar'),
  musicHubOpenNavigation: localeLabel('music.hub_open_navigation'),
  musicExpandPlayer: localeLabel('music.expand_player'),
  musicAddToQueue: localeLabel('music.add_to_queue'),
  musicGridView: localeLabel('music.view_grid'),
  musicListView: localeLabel('music.view_list'),
  musicFavorite: localeLabel('music.favorite'),
  // The row's favourite control flips its label with its state, and the fixture is left favourited by
  // the card read earlier in this scenario — so both spellings belong to the same control.
  musicUnfavorite: localeLabel('music.unfavorite'),
  musicEditTrack: localeLabel('music.edit_track'),
  // The index control's own label flips with the track's state, so both spellings are read.
  musicPlay: localeLabel('music.play'),
  musicPause: localeLabel('music.pause'),
  musicMoreActions: localeLabel('common.more_actions', 'music.more_actions', 'music.open_menu'),
  // FB-U4: the two columns that fold into the row when the list's own box cannot afford them.
  musicTableArtist: localeLabel('music.field_artist', 'music.sort_artist', 'music.table_artist'),
  musicTableAlbum: localeLabel('music.field_album', 'music.table_album'),
  // FB-U3: the two controls the status bar hides below lg / xl, and the pin's own two spellings
  // (the label flips with the track's state).
  musicEq: localeLabel('music.eq'),
  musicPin: localeLabel('attachments.pin', 'blog.link_pin', 'music.pin', 'music.batch_pin', 'notes.pin'),
  musicUnpin: localeLabel('attachments.unpin', 'blog.link_unpin', 'music.unpin', 'music.batch_unpin', 'notes.unpin'),
  musicQueue: localeLabel('music.queue'),
  // FB2-C1: the online results panel's own controls and words.
  musicProviderResults: localeLabel('music.provider_results'),
  musicProviderSwitch: localeLabel('music.provider_gds'),
  // FB3-F1: the scope control beside that switch, and the aggregate entry in it — the two read as one
  // answer, so they are read as one group.
  musicProviderScope: localeLabel('music.provider_scope'),
  musicProviderScopeAll: localeLabel('music.provider_scope_all'),
  musicRiskAccept: localeLabel('music.settings_risk_accept'),
  musicProviderPreview: localeLabel('music.provider_preview'),
  musicProviderAdd: localeLabel('blog.add_tag', 'common.add', 'music.import_url_add', 'music.provider_add', 'music.server_add_one'),
  musicProviderInLibrary: localeLabel('music.provider_in_library'),
  musicSearchSuggestions: localeLabel('music.search_suggestions'),
  musicProviderAddSelected: localeLabel('music.provider_add_selected'),
  musicSearch: localeLabel('music.search_placeholder'),
  musicSearchClear: localeLabel('music.search_clear', 'music.alist_search_clear', 'notes.clear_search_query'),
  // FB3-C1: the popup's own action, and the two names the empty state's action has had (FB3-U8 renamed
  // it away from the clear control's name, so the read below accepts either spelling of the same thing).
  musicSearchHistory: localeLabel('music.search_history'),
  musicSearchClearHistory: localeLabel('music.history_clear', 'music.search_clear_history'),
  musicEqPresets: localeLabel('music.eq_presets'),
  // FB3-F6: the groups of the settings page, in the order the page is meant to read. Each entry is
  // every spelling of one heading, so the read works in either language without pairing them.
  musicSettingsGroups: [
    ['播放默认', 'Playback defaults'],
    ['在线音源', 'Online sources'],
    ['下载与离线', 'Downloads and offline'],
    ['音乐服务器', 'Music servers'],
  ],
  musicSearchEmptyAction: localeLabel('music.search_clear', 'music.search_show_all', 'music.alist_search_clear', 'notes.clear_search_query'),
  // FB2-U1: the queue's own controls — the count in the immersive header is the way in there, and
  // the search is what the hub and the floating card already answer with.
  musicQueueToggle: localeLabel('music.queue_toggle'),
  musicQueueSearch: localeLabel('music.queue_search'),
  // FB3-C5: the library's own reload control, which this gate presses before it reads a library the
  // fixture has just written into.
  musicRefresh: localeLabel('common.refresh'),
  // FB-M16: the toolbar entry of the reader's own music server, and the two sentences its first-run
  // form shows. Nothing in this gate registers a server — a registration is verified against the
  // real server before it is stored — so the search half of that modal is read by the unit tests.
  // FB2-F2: the upload entry and the folder door. The rule reads the absence of a directory input
  // in the surface that takes folders, so both spellings of the door and the panel's own title are
  // needed to find it by an accessible name.
  musicUpload: localeLabel('music.upload'),
  musicTransferTitle: localeLabel('music.transfer_title'),
  musicUploadFolder: localeLabel('music.upload_choose_folder'),
  musicServers: localeLabel('music.server_title'),
  musicServersNone: localeLabel('music.server_none'),
  musicServersAdd: localeLabel('music.alist_add', 'music.server_add'),
  musicRemoveFromQueue: localeLabel('music.remove_from_queue'),
  musicMiniPlayer: localeLabel('music.mini_player'),
  // The windowed hub's own chrome (REF-1b, repaired in FB-F1): the label is how the drag guard
  // below knows the hub is a movable window rather than a viewport-filling sheet.
  musicMoveHub: localeLabel('music.move_hub'),
  musicMobileNav: localeLabel('shell.mobile_navigation'),
  musicImmersive: localeLabel('music.immersive'),
  // The immersive header's own window control (REF-10): the label flips with the state, so both
  // spellings are here — the desktop spelling is the app's own en-GB 'Maximise'.
  musicMaximizePlayer: localeLabel('music.maximize_player'),
  musicRestorePlayer: localeLabel('music.restore_player'),
  // The hub's own window control. It is the same store flip the header's double click makes, and
  // the pair is read where the box can be measured rather than through the toolbar sweep.
  musicMaximizeHub: localeLabel('music.maximize_hub'),
  musicRestoreHub: localeLabel('music.restore_hub'),
  musicLyrics: localeLabel('music.lyrics'),
  // M-51: the anonymous playlist page, which no other surface in this gate reaches. Its own words are
  // read there — the page name, the count it promises to a returning reader (templated, so only the
  // leading text before the number is fixed), the badge a new track carries, where the memory is said
  // to live, and the one control that forgets it.
  musicSharedPlaylist: localeLabel('music.shared_playlist'),
  musicShareSinceVisit: localePrefix('music.share_new_since_visit'),
  musicShareNewBadge: localeLabel('music.share_new_badge'),
  musicShareVisitMemoryNote: localeLabel('music.share_visit_memory_note'),
  musicShareForgetVisit: localeLabel('music.share_forget_visit'),
  // The sentence a visitor gets when the stream behind a track will not answer.
  musicPlaybackFailed: localeLabel('music.playback_failed'),
  // The share center's own four pairs (its entry, dialog, manage control and All Shares row) live
  // in `SHARE_LABELS` in the harness, shared with the contrast gate (SH-99); what stays here is
  // what only this gate reads.
  shareKpi: localeLabel('blog.total_views_pv', 'share.total_views_pv'),
  shareCategoryDashboard: localeLabel('share.category_dashboard'),
  shareChannelCollection: localePrefix('share.channel_collection_row'),
  shareSearch: localeLabel('share.search_placeholder'),
  sharePrintQr: localeLabel('share.batch_print_qr'),
  shareChannelField: localeLabel('share.channel_input_label'),
  shareTrafficFilter: localeLabel('share.filter_traffic_title'),
  // The board's compact top bar: one trigger for the actions it has no room to draw, and the rows
  // its menu offers in place of the labeled controls the wide bar shows.
  kanbanMoreActions: localeLabel('preview.kanban_more_actions'),
  kanbanFilterRow: localeLabel('preview.kanban_filter'),
  kanbanSortRow: localeLabel('music.sort', 'preview.kanban_sort'),
  kanbanShortcuts: localeLabel('command.keyboard_shortcuts_021cf9', 'music.keyboard_help', 'preview.kanban_shortcuts', 'templates.keyboard_shortcuts'),
}

/**
 * The toggles a toolbar actually draws, as a selector to filter in the page.
 *
 * A bar that carries two layouts keeps both in the document and lets a container query pick one, so
 * the hidden half reports a zero box — and a control pressed at `0,0` reads whatever is in the
 * viewport's corner instead of the toolbar. Every toolbar count in this gate is a count of what is on
 * screen, which is also what the stability sweep is about.
 */
const TOGGLE_SELECTOR = 'button[aria-pressed], button[aria-expanded]'

async function activeProse(page) {
  return page.evaluate(() => {
    const scope = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
      (layer) => layer.hasAttribute('data-active'),
    ) ?? document
    const root = scope.querySelector('.ink-prose')
    if (!root || root.getClientRects().length === 0) return null
    const code = root.querySelector('pre code')
    const mermaid = root.querySelector('svg')
    const mermaidBox = mermaid?.getBoundingClientRect()
    return {
      text: root.textContent,
      codeText: code?.textContent ?? '',
      highlighted: root.querySelectorAll('pre code [class]').length > 0,
      // Code enhance renders one .line per row and paints the digit through a
      // CSS ::before on [data-line-number] (styles/prose/code.css).
      lineNumber: !!root.querySelector('[data-line-number]'),
      hasMermaid: !!mermaid,
      mermaidVisible: !!mermaidBox && mermaidBox.width > 10 && mermaidBox.height > 10,
      katex: root.querySelectorAll('.katex').length,
    }
  })
}

async function typeProbeNote(page) {
  // The list layer stays mounted after login; make it the active pane so its
  // header button is genuinely clickable.
  await clickButton(page, LABELS.list)
  await sleep(400)
  await clickButton(page, LABELS.newNote)
  // Creating a note selects it; the mobile shell lands on the preview pane of
  // the empty note. Switch to the editor pane.
  await clickButton(page, LABELS.edit)
  await page.waitForSelector('.cm-content', { timeout: 30_000 })
  await page.evaluate((markdown) => {
    const content = document.querySelector('.cm-content')
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    document.execCommand('insertText', false, markdown)
  }, NOTE_MARKDOWN)
  await sleep(1_500) // autosave debounce

  await clickButton(page, LABELS.preview)
  await page.waitForFunction(() => {
    const layer = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
      (candidate) => candidate.hasAttribute('data-active'),
    )
    const prose = layer?.querySelector('.ink-prose')
    return !!prose && prose.getClientRects().length > 0
  }, { timeout: 30_000 })
  await waitForProseEnhancements(page)
}

// Mermaid/KaTeX/prism load behind lazy dynamic imports; give them a bounded
// window to finish before the assertions run.
async function waitForProseEnhancements(page, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const scope = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
        (layer) => layer.hasAttribute('data-active'),
      ) ?? document
      const root = scope.querySelector('.ink-prose')
      return !!root && !!root.querySelector('svg') && root.querySelectorAll('.katex').length >= 2
    },
    { timeout },
  )
}

async function assertProseSurface(page, surface) {
  const prose = await activeProse(page)
  check(`${surface}: prose container visible`, !!prose)
  if (!prose) return
  check(`${surface}: probe content rendered`, prose.text.includes('Visual E2E Probe'))
  check(`${surface}: code fence present`, prose.codeText.includes('Hello,'))
  check(`${surface}: syntax highlight tokens applied`, prose.highlighted)
  check(`${surface}: line-number gutter rendered`, prose.lineNumber)
  check(`${surface}: mermaid svg rendered`, prose.hasMermaid)
  check(`${surface}: mermaid svg has layout size`, prose.mermaidVisible)
  check(`${surface}: katex math rendered (inline + display)`, prose.katex >= 2, `count=${prose.katex}`)
}

async function assertPaneTransition(page) {
  await clickButton(page, LABELS.list)
  const midFlight = await page.evaluate(async () => {
    // Re-open the preview pane and sample the layer transition in flight.
    const tabs = () => Array.from(document.querySelectorAll('nav[aria-label] button'))
    const preview = tabs().at(-1)
    preview.click()
    await new Promise((resolve) => setTimeout(resolve, 60))
    const layer = document.querySelector('.mobile-pane-layer[data-active]')
    const style = layer ? getComputedStyle(layer) : null
    await new Promise((resolve) => setTimeout(resolve, 900))
    return {
      sampled: !!style,
      transition: style?.transition ?? '',
      activeNow: !!document.querySelector('.mobile-pane-layer[data-active] .ink-prose'),
    }
  })
  check(
    'mobile: pane switch carries the motion transition',
    midFlight.sampled && midFlight.transition.includes('transform') && midFlight.transition.includes('opacity'),
    midFlight.transition.slice(0, 60),
  )
  check('mobile: preview pane active after transition', midFlight.activeNow)
}

async function assertDesktopSplit(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600) // let the breakpoint listeners re-render the shell
  // Ctrl+\ cycles edit -> split -> preview; stop once the prose is visible.
  for (let attempt = 0; attempt < 3 && !(await activeProse(page)); attempt++) {
    await page.keyboard.down('Control')
    await page.keyboard.press('Backslash')
    await page.keyboard.up('Control')
    await sleep(800)
  }
  await assertProseSurface(page, 'desktop-split')
}

// Presentation mode is asserted from its own contract rather than the editor's:
// the design canvas has to fill the stage at any window size, the type has to be
// large enough to read from the back of a room, the slide list has to list the
// deck, and no block may spill past the canvas bottom.
async function assertPresentation(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await sleep(1_500)

  const deck = await page.evaluate(() => {
    const canvas = document.querySelector('[data-slide-canvas]')
    const stage = canvas.parentElement.getBoundingClientRect()
    const box = canvas.getBoundingClientRect()
    const host = canvas.querySelector('[data-slide-page]')
    const visible = [...host.children].filter((el) => el.style.visibility !== 'hidden')
    return {
      fills: box.width >= stage.width - 1 && box.height >= stage.height - 1,
      contentFills: host.getBoundingClientRect().width > box.width * 0.85,
      fontSize: Number.parseFloat(getComputedStyle(host).fontSize),
      slides: document.querySelectorAll('[data-presentation-rail] [data-slide-index]').length,
      overflow: visible.some((el) => el.getBoundingClientRect().bottom > box.bottom + 2),
    }
  })

  check('presentation: canvas fills the stage', deck.fills)
  check('presentation: prose column fills the canvas', deck.contentFills)
  check('presentation: type is enlarged for the projector', deck.fontSize >= 24, `fontSize=${deck.fontSize}px`)
  check('presentation: slide list lists the deck', deck.slides >= 2, `slides=${deck.slides}`)
  check('presentation: no block overflows the canvas', !deck.overflow)

  await clickButton(page, LABELS.presentExit)
  await sleep(600)
  check('presentation: exit returns to the note', await page.evaluate(() => !document.querySelector('[data-slide-canvas]')))
}

// The session contract: a show follows the note it was started from (so an edit
// reaching this tab — another tab, another device, an MCP write — lands on the
// projector), freezing pins what is on screen, and the show outlives the layout
// switch that unmounts the workspace it started from.
async function assertPresentationSession(page) {
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /演示模式|Presentation mode/.test(item.getAttribute('aria-label') ?? ''))
    button.focus()
    button.click()
    return document.activeElement === button
  })
  check('presentation session: the start control takes focus', started)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await sleep(1_500)

  const before = await presentationSession(page)
  check('presentation session: starts following the note', LABELS.presentFreeze.includes(before.followLabel), `label=${before.followLabel}`)

  // The deck length is read from the page counter, not from the slide list: the rail
  // mounts thumbnails lazily, so a deck that grows past the fold lists fewer items
  // than it has pages.
  await appendToNote(page, LIVE_EDIT_ONE)
  await sleep(2_000)
  const followed = await presentationSession(page)
  check('presentation session: an edit lands on the projector while following', followed.total === before.total + 1, `before=${before.position} after=${followed.position}`)

  await clickPresentationControl(page, LABELS.presentFreeze)
  await sleep(800)
  const frozen = await presentationSession(page)
  check('presentation session: freezing switches the control back to following', LABELS.presentFollow.includes(frozen.followLabel), `label=${frozen.followLabel}`)

  await appendToNote(page, LIVE_EDIT_TWO)
  await sleep(2_000)
  const pinned = await presentationSession(page)
  check('presentation session: a frozen deck ignores further edits', pinned.total === followed.total, `position=${pinned.position}`)

  await clickPresentationControl(page, LABELS.presentFollow)
  await sleep(2_000)
  const resumed = await presentationSession(page)
  check('presentation session: unfreezing catches up with the note', resumed.total === before.total + 2, `position=${resumed.position}`)

  // Crossing the mobile breakpoint rebuilds the whole shell subtree, which used to
  // take the workspace (and the show with it) down mid-talk.
  await page.setViewport(MOBILE_VIEWPORT)
  await sleep(1_500)
  const mobile = await presentationSession(page)
  check('presentation session: the show survives the mobile breakpoint', mobile.open && mobile.position === resumed.position, `position=${mobile.position}`)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(1_500)
  const desktop = await presentationSession(page)
  check('presentation session: the show survives switching back', desktop.open && desktop.position === resumed.position, `position=${desktop.position}`)
  check('presentation session: the canvas refills the stage', desktop.filled)

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(800)
  const closed = await presentationSession(page)
  check('presentation session: exit still works after the round trip', !closed.open)
  check('presentation session: focus is never left inside the closed overlay', !closed.inDialog)
  check('presentation session: the note is still open behind the show', await page.evaluate(() => Boolean(document.querySelector('.cm-content'))))
}

// The slide list is a page list: a note that never uses `---` is one slide but many
// pages, and listing only the `---` slides left a 14-page deck with a one-entry
// sidebar. The deck is measured off-screen while the show is idle, so this opens a
// show on a two-slide deck, navigates nowhere, and then checks that the list already
// knows every slide's pages — and that each slide's entry count equals the page count
// the canvas reports when the show actually displays that slide.
// The chart node in the stage: the block that holds it, its container, and the canvas the projector
// drew on. `scrolls` is the property the slide surface must never have — the chart block is the one
// box in a slide that can grow a scrollbar.
async function readChartBox(page) {
  return page.evaluate(() => {
    const block = document.querySelector('[data-slide-canvas] [data-chart]')
    if (!block) return null
    const container = block.querySelector('.chartjs-container')
    const canvas = block.querySelector('canvas')
    return {
      block: `${block.clientWidth}x${block.clientHeight}`,
      scroll: `${block.scrollWidth}x${block.scrollHeight}`,
      scrolls: block.scrollWidth > block.clientWidth + 1 || block.scrollHeight > block.clientHeight + 1,
      container: `${container?.clientWidth}x${container?.clientHeight}`,
      canvas: `${canvas?.clientWidth}x${canvas?.clientHeight}`,
      drawn: canvas ? canvas.width > 0 && canvas.height > 0 : false,
    }
  })
}

async function assertPresentationPages(page) {
  // The flip this scenario is about can only be observed from the "system" setting, and the account
  // arrives on whatever ran before this gate (scripts/e2e.mjs leaves it dark), so the setting is
  // made explicit before the show opens — the settings dialog is not reachable from inside a show.
  await setAppTheme(page, 'system')
  await openDeckNote(page)
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  // Read the deck the show opens on, before the idle pass fills the list: a show that
  // starts on the content the closed overlay was holding reports a one-slide deck here.
  const opening = await readDeckSize(page)
  await waitForRailFilled(page)

  const deck = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const entries = [...panel.querySelectorAll('[data-presentation-rail] [data-entry-index]')]
    const counts = {}
    for (const entry of entries) counts[entry.dataset.slideIndex] = (counts[entry.dataset.slideIndex] ?? 0) + 1
    const current = entries.find((entry) => entry.getAttribute('aria-current') === 'true')
    const openedOn = Number(current?.dataset.slideIndex ?? 0)
    const widest = Object.keys(counts).reduce((best, slide) => (counts[slide] > counts[best] ? slide : best), Object.keys(counts)[0])
    return {
      entries: entries.length,
      slides: Number.parseInt((panel.querySelector('[aria-live="polite"]')?.textContent ?? '').split('/')[1] ?? '', 10) || 0,
      counts,
      openedOn,
      aheadEntries: counts[String(openedOn + 1)] ?? 0,
      widestSlide: Number(widest),
    }
  })
  check('presentation pages: a show opens on the deck the note has now', opening.slides === deck.slides, `opening=${opening.position} settled=${deck.slides} slides`)
  check('presentation pages: the list lists pages, not only slides', deck.entries > deck.slides, `entries=${deck.entries} slides=${deck.slides}`)
  check('presentation pages: the idle pass measured a slide the show has not reached', deck.aheadEntries > 1, `slide ${deck.openedOn + 1} has ${deck.aheadEntries} entries`)

  const counts = await readPageCountsPerSlide(page, deck.counts)
  const mismatch = counts.find((item) => item.entries !== item.pages)
  check('presentation pages: every slide lists exactly the pages the canvas measures', !mismatch, mismatch ? `slide=${mismatch.slide} entries=${mismatch.entries} pages=${mismatch.pages}` : `${counts.length} slides agree`)

  const second = await clickPageEntry(page, deck.widestSlide, 1)
  check('presentation pages: clicking a page entry lands on that page', second.numerator === 2, `chip=${second.numerator}/${second.denominator}`)

  // The list renders the same prepared markup the projector shows — diagrams and math included —
  // and keeps doing so when the theme changes mid-talk, which is what happens to anyone on the
  // "system" setting when the OS flips. The deck is re-prepared for the new theme, so this polls
  // for the list to catch up instead of asserting on the frame right after the flip.
  await jumpToFirstPage(page)
  const prepared = await waitForRenderedMarkup(page)
  check('presentation pages: a thumbnail renders the markup the projector prepared', sameArtifacts(prepared), `stage=${describeArtifacts(prepared.stage)} thumb=${describeArtifacts(prepared.thumb)}`)
  check('presentation pages: the projector draws the chart on its own canvas', prepared.stage.live && prepared.stage.painted > 0, describeArtifacts(prepared.stage))
  check('presentation pages: the slide list shows the chart as a picture', prepared.thumb.still > 0, describeArtifacts(prepared.thumb))
  const stillPixels = await readStillPixels(page)
  check('presentation pages: the picture in the slide list was drawn, not an empty frame', stillPixels > 0, `pixels=${stillPixels}`)

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(400)
  check('presentation pages: the system theme flip reaches the show', (await readRenderedMarkup(page)).theme === 'dark')
  const flipped = await waitForRenderedMarkup(page)
  check('presentation pages: a theme flip re-prepares the list instead of leaving placeholders', sameArtifacts(flipped), `stage=${describeArtifacts(flipped.stage)} thumb=${describeArtifacts(flipped.thumb)}`)
  await page.emulateMediaFeatures([])

  // The slide canvas is scaled with a CSS transform, so a chart must not measure through it: the
  // canvas has to be exactly the size of its box, or it is drawn stage-scale times too big — the
  // chart block then grows a scrollbar in both directions, and one size larger on the next change.
  // The check happens while the show is on this slide, not at the end: a later redraw can happen to
  // be measured while the stage is unscaled, which hides the mis-sized canvas the show was showing.
  const chartBox = await readChartBox(page)
  check('presentation pages: the chart canvas is the size of its box', chartBox?.canvas === chartBox?.container && chartBox?.drawn, JSON.stringify(chartBox))
  check('presentation pages: the chart block carries no scrollbar', chartBox?.scrolls === false, JSON.stringify(chartBox))

  // And it has to stay that way through a geometry change. The stage has to *grow* for a scrollbar to
  // be possible at all (a stage smaller than the design canvas scales it down, and a canvas measured
  // too small leaves a gap), and the chart has to be redrawn to be measured again: re-slicing the
  // page is what remounts it, and hiding and showing the slide list is what re-slices it.
  await page.setViewport({ width: 1600, height: 1000 })
  await sleep(700)
  await clickPresentationControl(page, LABELS.presentRail)
  await sleep(1_200)
  await clickPresentationControl(page, LABELS.presentRail)
  await sleep(1_200)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(700)
  const resized = await readChartBox(page)
  check('presentation pages: the chart is still the size of its box after the stage resizes', resized?.canvas === resized?.container && resized?.scrolls === false, JSON.stringify(resized))

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
  // Hand the run back on the light palette the later scenarios measure on.
  await setAppTheme(page, 'light')
}

/**
 * The graph's canvas paints its own colours, so a theme flip has to reach the pixels and not just the
 * tokens: the renderer audit's original reading was this canvas frozen at the palette of its first
 * paint, byte-identical across a flip. Two promises are read here — the pixels change, and they change
 * on the element that was already on screen, because a flip that rebuilt the canvas would satisfy the
 * first alone. The reading starts from consecutively identical frames so the physics loop cannot move
 * the number, and the element is marked before the flip so its identity has an answer afterwards.
 */
async function assertGraphThemeFollow(page) {
  await setAppTheme(page, 'system')
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(300)
  await pressOpener(page, { labels: ['设置', 'Settings'], combo: ['Control', 'Shift', 'g'] })
  await page.waitForSelector('[data-surface="graph"] canvas', { timeout: 15_000 })
  const before = await waitForStillGraphCanvas(page)
  check('graph: the canvas paints its nodes before the theme flip', Boolean(before) && before.sum > 0, JSON.stringify(before))
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-surface="graph"] canvas')
    if (canvas) canvas.dataset.gateGraphCanvas = 'theme-flip'
  })

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', { timeout: 10_000 })
  const after = await waitForChangedGraphCanvas(page, before?.sum ?? -1)
  check('graph: a theme flip repaints the canvas element that was already on screen', after?.marker === 'theme-flip', JSON.stringify(after))
  check('graph: the repainted pixels are the new palette, not the old one', Boolean(before) && Boolean(after) && after.sum !== before.sum, `before=${before?.sum} after=${after?.sum}`)

  await page.evaluate(() => {
    const canvas = document.querySelector('[data-surface="graph"] canvas')
    if (canvas) delete canvas.dataset.gateGraphCanvas
  })
  await page.emulateMediaFeatures([])
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-surface="graph"]'), { timeout: 10_000 })
  // Hand the run back on the light palette the scenarios after this one measure on.
  await setAppTheme(page, 'light')
}

/** A sample of what the graph canvas has painted, taken on a stride so the read stays cheap. */
async function readGraphCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-surface="graph"] canvas')
    if (!canvas) return null
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    for (let index = 0; index < data.length; index += 400) sum += data[index] + data[index + 1] + data[index + 2]
    return { sum, marker: canvas.dataset.gateGraphCanvas ?? null }
  })
}

/**
 * Three identical frames mean the physics loop has settled, so only a repaint can move the number.
 * `attempts` is the caller's patience: a large graph runs out its frames over several seconds, and
 * `stable` comes back with the answer so a caller that needs a settled drawing can tell "still" from
 * "this is where the waiting stopped".
 */
async function waitForStillGraphCanvas(page, attempts = 24) {
  let previous = await readGraphCanvas(page)
  let stable = 0
  for (let attempt = 0; attempt < attempts; attempt++) {
    await sleep(250)
    const next = await readGraphCanvas(page)
    stable = next && previous && next.sum > 0 && next.sum === previous.sum ? stable + 1 : 0
    if (stable >= 2) return { ...next, stable }
    previous = next
  }
  return { ...previous, stable }
}

async function waitForChangedGraphCanvas(page, before) {
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(200)
    const next = await readGraphCanvas(page)
    if (next && next.sum !== before) return next
  }
  return readGraphCanvas(page)
}

// The walk's own numbers. Twenty presses take the canvas zoom from its floor (0.2) to its ceiling (4)
// in 0.2 steps; 24 px is the padding the camera keeps between a node it brought in and the edge it
// came through — the preview anchor the walk reads is the node's own box, so its half-width is the
// node's radius and that padding is what is left of GRAPH_CAMERA_PADDING + radius against the edge.
// The keys march out of the window and back: a walk that turns inside it never has to bring anything
// into view (measured: a right-march reaches the padding on its fourth press and pans 144–436 px).
const GRAPH_WALK_ZOOM_PRESSES = 20
const GRAPH_WALK_PAN_PX = 24
const GRAPH_INK_STRIDE = 2
const GRAPH_WALK_KEYS = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']

/**
 * Where the drawing's ink sits, as one count per column and per row of a strided sample. A pan moves
 * every painted pixel by the same vector, so the two histograms move as one piece; a selection change
 * repaints colours where the nodes already are and never turns painted into unpainted, so this
 * fingerprint can only change when the camera does.
 */
async function readGraphInkProfile(page) {
  return page.evaluate((stride) => {
    const canvas = document.querySelector('[data-surface="graph"] canvas')
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context) return null
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const columns = new Array(Math.ceil(canvas.width / stride)).fill(0)
    const rows = new Array(Math.ceil(canvas.height / stride)).fill(0)
    for (let y = 0; y < canvas.height; y += stride) {
      for (let x = 0; x < canvas.width; x += stride) {
        if (data[(y * canvas.width + x) * 4 + 3] === 0) continue
        columns[Math.floor(x / stride)] += 1
        rows[Math.floor(y / stride)] += 1
      }
    }
    return {
      columns,
      rows,
      stride,
      deviceScale: canvas.width / canvas.getBoundingClientRect().width,
    }
  }, GRAPH_INK_STRIDE)
}

/** The shift whose two histograms agree best: a sample count, and a cosine similarity to judge it by. */
function bestInkShift(before, after) {
  let best = { shift: 0, score: 0 }
  for (let shift = 1 - after.length; shift < after.length; shift += 1) {
    let dot = 0, left = 0, right = 0
    for (let index = 0; index < after.length; index += 1) {
      const source = index - shift
      const value = source >= 0 && source < before.length ? before[source] : 0
      dot += value * after[index]
      left += value * value
      right += after[index] * after[index]
    }
    const score = left && right ? dot / Math.sqrt(left * right) : 0
    if (score > best.score) best = { shift, score }
  }
  return best
}

/** How far the drawing moved between two reads, in CSS pixels, and how well the ink agrees there. */
function graphPanBetween(before, after) {
  if (!before || !after) return null
  const columns = bestInkShift(before.columns, after.columns)
  const rows = bestInkShift(before.rows, after.rows)
  return {
    dx: Math.round((columns.shift * before.stride) / before.deviceScale),
    dy: Math.round((rows.shift * before.stride) / before.deviceScale),
    score: Number(Math.min(columns.score, rows.score).toFixed(3)),
  }
}

/**
 * What the app says it selected and where that node is drawn: the box its preview card hangs off,
 * which the panel computes from the same camera it pans with, and the canvas's own box.
 */
async function readGraphWalkStep(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-surface="graph"]')
    const canvas = panel?.querySelector('canvas')
    const anchor = [...(panel?.querySelectorAll('div[aria-hidden="true"]') ?? [])]
      .filter((element) => getComputedStyle(element).position === 'fixed')
      .map((element) => element.getBoundingClientRect())
      .find((rect) => rect.left > -1_000 && rect.width >= 1)
    const box = canvas?.getBoundingClientRect()
    return {
      announced: (panel?.querySelector('[aria-live]')?.textContent ?? '').trim().slice(0, 48),
      anchor: anchor && { left: anchor.left, top: anchor.top, right: anchor.right, bottom: anchor.bottom },
      canvas: box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
    }
  })
}

/**
 * Whether the pan on this step is what put the reached node where it is: the drawing moves opposite
 * the camera, so the pan's sign says which edge the node came in through, and the app's own clamp
 * leaves its box exactly the camera padding inside that edge.
 */
function broughtNodeToEdge(step) {
  if (!step.anchor || !step.canvas || !step.pan) return false
  const near = (value) => Math.abs(value - GRAPH_WALK_PAN_PX) <= 1
  const againstEdge = []
  if (step.pan.dx <= -GRAPH_WALK_PAN_PX) againstEdge.push(step.canvas.right - step.anchor.right)
  if (step.pan.dx >= GRAPH_WALK_PAN_PX) againstEdge.push(step.anchor.left - step.canvas.left)
  if (step.pan.dy <= -GRAPH_WALK_PAN_PX) againstEdge.push(step.canvas.bottom - step.anchor.bottom)
  if (step.pan.dy >= GRAPH_WALK_PAN_PX) againstEdge.push(step.anchor.top - step.canvas.top)
  return againstEdge.some(near)
}

/**
 * The arrow keys are how a reader walks a graph too big to fit, and the promise they make (G-23) is
 * that the node they land on is brought into the window. jsdom cannot hold that promise to account —
 * it lays no canvas out, so the case there hands the camera a width and height by hand — so this
 * scenario reads it off the real surface: a real layout, a real camera, real pixels. The drawing is
 * zoomed in with the canvas's own zoom key first, because a fitted graph has every node on screen
 * already and a walk that never has to bring one into view would prove nothing; the walk itself is
 * arrow keys and nothing else.
 *
 * Each press is read twice. Where the app says the selected node is comes from the box its preview
 * card hangs off, which the panel positions from the same camera it pans with; whether the camera
 * moved comes from the painted pixels, which only a pan can move as a whole — a selection change
 * repaints colours where the nodes already were.
 */
async function assertGraphKeyboardWalk(page) {
  await pressOpener(page, { labels: ['设置', 'Settings'], combo: ['Control', 'Shift', 'g'] })
  await page.waitForSelector('[data-surface="graph"] canvas', { timeout: 15_000 })
  // A large graph runs its physics for seconds, and it is the settle that fits the camera: zooming
  // before it would have the fit undo the zoom, and walking before it would read drifting nodes as a
  // panning camera. The patience is longer than the default because this is the whole frame limit.
  const settled = await waitForStillGraphCanvas(page, 80)
  check('graph walk: the drawing settles before the keyboard drives it', Boolean(settled) && settled.stable >= 2, JSON.stringify(settled))

  await page.focus('[data-surface="graph"] canvas')
  for (let press = 0; press < GRAPH_WALK_ZOOM_PRESSES; press += 1) await page.keyboard.press('=')
  await sleep(500)

  const steps = []
  for (const key of GRAPH_WALK_KEYS) {
    const ink = await readGraphInkProfile(page)
    await page.keyboard.press(key)
    await sleep(500)
    steps.push({ key, ...(await readGraphWalkStep(page)), pan: graphPanBetween(ink, await readGraphInkProfile(page)) })
  }

  const offscreen = steps.filter((step) => !step.anchor || !step.canvas
    || step.anchor.left < step.canvas.left - 1 || step.anchor.right > step.canvas.right + 1
    || step.anchor.top < step.canvas.top - 1 || step.anchor.bottom > step.canvas.bottom + 1)
  check('graph walk: every node the arrows reach is drawn inside the window', offscreen.length === 0, JSON.stringify(offscreen.slice(0, 2)))
  check('graph walk: the first arrow enters the graph and says which node it landed on', Boolean(steps[0]?.announced), JSON.stringify(steps[0]))

  const panned = steps.filter((step) => step.pan && step.pan.score >= 0.75 && Math.hypot(step.pan.dx, step.pan.dy) >= GRAPH_WALK_PAN_PX)
  check('graph walk: the camera pans rather than leaving the drawing where it was', panned.length >= 1,
    JSON.stringify(steps.map((step) => ({ key: step.key, pan: step.pan }))))
  check('graph walk: the pan is what brings the reached node in, at the camera padding',
    panned.some((step) => broughtNodeToEdge(step)),
    JSON.stringify(panned.map((step) => ({ key: step.key, pan: step.pan, anchor: step.anchor, canvas: step.canvas }))))
  console.log(`  · graph walk: ${steps.length} presses over the graph, ${panned.length} of them panned — ${panned.map((step) => `${step.key} by (${step.pan.dx}, ${step.pan.dy})px at ${step.pan.score}`).join(', ') || 'none'}`)

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-surface="graph"]'), { timeout: 10_000 })
}

// The presentation surface is a modal dialog around a scaled canvas: exactly the shape where a
// missing role, an unnamed control or a low-contrast token goes unnoticed by eye. axe-core is
// injected into the live page (its own browser build, evaluated rather than added as a script
// tag so the app's CSP stays untouched) and run over the whole overlay with the slide list open.
async function assertPresentationAccessibility(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await waitForRailFilled(page)
  // axe measures what is painted, and two things in this overlay paint at less than full opacity for
  // a moment: the dialog's own entrance animation, and the control pill, which fades itself out while
  // the show sits idle. A counter read mid-fade composites towards the page under it and comes back
  // as a 1.08:1 violation that no token can explain. The pointer brings the pill back and both waits
  // hold until the painted opacity is 1, rather than until the elements merely exist.
  const viewport = page.viewport() ?? DESKTOP_VIEWPORT
  await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2))
  await waitForPanelSettled(page, '[role="dialog"]')
  await waitForPanelSettled(page, '[data-presentation-chrome]')
  await ensureAxe(page)
  const report = await runAxe(page, '[role="dialog"]')
  check('a11y: the presentation overlay has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  const unexpected = report.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('a11y: no unexpected axe review items', unexpected.length === 0, JSON.stringify(unexpected))
  check('a11y: axe actually inspected the slide surface', report.passes >= 10, `passes=${report.passes}`)

  // Keyboard path next to the automated rules: the slide list walks its own pages with the
  // arrows, and the counter follows it there.
  const walked = await page.evaluate(async () => {
    const rail = document.querySelector('[data-presentation-rail]')
    const active = () => rail.querySelector('[data-entry-index][aria-current="true"]')
    active()?.focus()
    const before = active()?.dataset.entryIndex ?? ''
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    const after = active()
    return { before, after: after?.dataset.entryIndex ?? '', chip: document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent?.trim() ?? '' }
  })
  check('a11y: the slide list walks its pages from the keyboard', walked.after !== '' && walked.after !== walked.before, JSON.stringify(walked))
  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// Exporting the deck runs through the browser's print pipeline, so this asserts what the promise
// rests on: the sheet it prints holds one page box per deck page (built from the same measured
// plans the show walks), the pages are the slide at the stage's own scale rather than the reader's
// prose scale (a page sliced against the slide layout reflows against any other), the charts are
// drawn live onto the sheet's canvases instead of printing the picture the cache carries, and the
// PDF Chrome actually renders from it has that many pages. The PDF is counted by its page objects,
// which is what "the pages match the show" means.
async function assertDeckExport(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  const entries = await waitForRailFilled(page)
  const stageFont = await page.evaluate(() => getComputedStyle(document.querySelector('[data-slide-canvas] [data-slide-page]')).fontSize)
  await clickPresentationControl(page, LABELS.presentExport)
  // The sheet prints once it has drawn what the show draws, so its own readiness marker is what
  // makes the reads below land on a finished sheet rather than a half-drawn one.
  await page.waitForSelector('[data-deck-print][data-deck-print-ready="true"]', { timeout: 20_000 })
  const sheet = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('[data-deck-print] .deck-print-page')]
    const painted = () => {
      const canvas = document.querySelector('[data-deck-print] [data-chart] canvas')
      if (!canvas) return 0
      try {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = 0
        for (let index = 3; index < data.length; index += 400) if (data[index] > 0) drawn++
        return drawn
      } catch {
        return -1
      }
    }
    const blocks = [...document.querySelectorAll('[data-deck-print] [data-chart]')]
    return {
      pages: pages.length,
      withContent: pages.filter((box) => box.querySelector('.ink-prose')?.children.length ?? 0 > 0).length,
      pageRule: [...document.styleSheets]
        .flatMap((sheet) => { try { return [...sheet.cssRules] } catch { return [] } })
        .filter((rule) => rule.constructor.name === 'CSSPageRule')
        .map((rule) => rule.cssText)
        .find((text) => /size:/.test(text)) ?? '',
      live: blocks.filter((block) => block.__chartInstance && block.querySelector('canvas')?.width > 0).length,
      stills: document.querySelectorAll('[data-deck-print] [data-chart] img.chartjs-still').length,
      painted: painted(),
      font: getComputedStyle(document.querySelector('[data-deck-print] .deck-print-body [data-slide-page]')).fontSize,
    }
  })
  check('export: the print sheet holds one page per deck page', sheet.pages > 1 && sheet.pages === entries, `sheet=${sheet.pages} rail=${entries}`)
  check('export: every printed page carries its own content', sheet.withContent === sheet.pages, `content=${sheet.withContent}/${sheet.pages}`)
  check('export: the print page size follows the design canvas', /size: \d+px \d+px/.test(sheet.pageRule), sheet.pageRule.slice(0, 60))
  check('export: the printed deck draws its charts live', sheet.live > 0 && sheet.painted > 0, `live=${sheet.live} painted=${sheet.painted}`)
  check('export: the printed deck prints no chart stills left over', sheet.stills === 0, `stills=${sheet.stills}`)
  check('export: a printed page uses the slide type scale', sheet.font === stageFont, `sheet=${sheet.font} stage=${stageFont}`)

  const pdf = Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }))
  const printed = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  check('export: the printed PDF has the deck page count', printed === sheet.pages, `pdf=${printed} sheet=${sheet.pages}`)

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// The image export is the same deck through a different renderer, so what it has to prove is that a
// file came out of it: every page rasterized (the sheet reports that itself, and it only reports it
// after the archive was handed to the browser) and the browser then wrote the archive somewhere.
// Its pages are the page boxes the PDF export uses, built from the same measured plans.
async function assertDeckImageExport(page) {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkstone-deck-images-'))
  const client = await page.createCDPSession()
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })

  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  const entries = await waitForRailFilled(page)
  await clickPresentationControl(page, LABELS.presentExportImages)
  await page.waitForSelector('[data-deck-print][data-deck-image-ready="true"]', { timeout: 60_000 })
  const images = await page.evaluate(() => {
    const sheet = document.querySelector('[data-deck-print][data-deck-image-ready]')
    return {
      pages: sheet?.querySelectorAll('.deck-print-page').length ?? 0,
      charts: sheet?.querySelectorAll('[data-chart] canvas').length ?? 0,
    }
  })
  check('export: the image export carries one page per deck page', images.pages > 1 && images.pages === entries, `images=${images.pages} rail=${entries}`)
  check('export: the image export draws its charts on the sheet', images.charts > 0, `charts=${images.charts}`)

  await sleep(2000)
  const saved = fs.readdirSync(downloadDir)
  check('export: the deck images are saved as one archive', saved.some((name) => name.endsWith('.zip')), JSON.stringify(saved))
  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// The note export writes a document instead of printing one, and it turns every chart canvas in that
// document into a PNG inside the same tick the chart was created — so the file it wrote carried fully
// transparent chart pictures: on a four-bar chart, 0 of the 69246 pixels a drawn chart has were on the
// canvas when the picture was taken, and the exported PNG held the same nothing. This reads the
// document the export produces (the same function the note row's menu calls) and counts the pixels of
// the chart picture inside it, because every read this path had counted elements — and an empty PNG is
// an element.
async function assertNoteExportCharts(page) {
  const read = await page.evaluate(async () => {
    const note = await import('/src/client/lib/export-note.ts')
    const chart = { type: 'bar', data: { labels: ['A', 'B'], datasets: [{ label: 'Probe', data: [3, 5], backgroundColor: '#2563eb' }] } }
    const content = ['# Export probe', '', '```chart', JSON.stringify(chart), '```'].join('\n')
    const html = await note.renderNoteToExportHtml({ title: 'Export probe', content }, 'zh-CN')
    const picture = new DOMParser().parseFromString(html, 'text/html').querySelector('img.chartjs-image')
    if (!picture) return { pictures: 0, painted: -1, size: '' }
    const image = new Image()
    image.src = picture.getAttribute('src') ?? ''
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let index = 3; index < data.length; index += 400) if (data[index] > 0) painted++
    return { pictures: 1, painted, size: `${image.naturalWidth}x${image.naturalHeight}` }
  })
  check('export: an exported note carries a chart that was drawn, not an empty frame', read.pictures > 0 && read.painted > 0, JSON.stringify(read))
}

// The mind map block is the surface with the most moving parts: the library loads on demand, the
// live instance is re-parented into every new render (that adoption is what two-way editing rests
// on), and full screen moves the very same element rather than drawing a second copy of the map.
// The scenario appends a fence to the probe note, then reads the preview, the overlay and the
// hand-back of the focus.
const MINDMAP_MARKDOWN = ['', '', '```mindmap', '- Visual Probe', '  - Live block', '  - Two way editing', '```'].join('\n')

// The layout cycling the mind map scenarios need (the editor to type a fence, the prose to read it
// back) is shared plumbing now: e2e-harness.mjs cycles it for this gate and the contrast gate alike.

/**
 * What the map paints from its own theme: the colour variables the library writes as inline styles on
 * the element it draws in, and the branch colour it bakes into the nodes that carry one. Both are
 * read off that element rather than off the stylesheet, because a theme that never reached the
 * instance is exactly the state under test. The branch colour comes from the first node that has one
 * — only the topics a connector is drawn for are painted, the rest inherit — and it is read beside
 * the canvas an earlier step stashed, so a rebuild cannot pass as a repaint.
 */
async function readMindmapTheme(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-canvas')
    const stage = canvas?.querySelector('.map-container')
    const branch = [...(canvas?.querySelectorAll('me-tpc') ?? [])]
      .map((node) => node.style.borderColor)
      .find((color) => color.length > 0) ?? ''
    return {
      sameElement: canvas === window.__mindmapCanvas,
      root: stage?.style.getPropertyValue('--root-bgcolor').trim() ?? '',
      branch,
    }
  })
}

/** The palettes the header menu offers, by the names a fence stores. */
const MINDMAP_PALETTES = {
  auto: ['Follow the app', '跟随应用'],
  light: ['Light', '浅色'],
  dark: ['Dark', '深色'],
}

/**
 * Opens the block header's palette menu and picks a palette. The pick is waited for on the block's
 * own attribute, which the renderer emits from the fence: the preview is re-rendered from the note's
 * committed text, so seeing it there means the pick reached the note and not merely the map. The
 * menu is read before the pick, and the map after it, against the canvas the scenario started with —
 * the same element across a pick is what separates a repaint from a rebuild.
 */
async function pickMindmapPalette(page, palette) {
  await page.click('.ink-prose .mindmap-block [data-mindmap-theme-pick]')
  await page.waitForSelector('[role="menu"] [role="menuitemcheckbox"]', { timeout: 15_000 })
  // The Menu appends its check glyph to the selected row's label, so the rows are read without it.
  const menu = await page.evaluate((wanted) => {
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitemcheckbox"]')]
    const labelOf = (element) => (element.textContent ?? '').replace('✓', '').trim()
    const labels = items.map(labelOf)
    const target = items.find((element) => wanted.includes(labelOf(element)))
    target?.click()
    return {
      labels,
      checked: labels.filter((_, index) => items[index].getAttribute('aria-checked') === 'true'),
      clicked: Boolean(target),
    }
  }, MINDMAP_PALETTES[palette])
  if (!menu.clicked) throw new Error(`the palette menu has no ${palette} entry`)
  await page.waitForFunction(
    (wanted) => (document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null) === wanted,
    { timeout: 15_000 },
    palette === 'auto' ? null : palette,
  )
  await sleep(600)
  const choice = await page.evaluate(() => ({
    control: document.querySelector('.ink-prose .mindmap-block [data-mindmap-theme-pick]')?.textContent?.trim() ?? '',
    annotation: document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null,
  }))
  return { menu, ...choice, theme: await readMindmapTheme(page) }
}

async function assertMindmapBlock(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('mindmap scenario: the editor pane never became visible')
  await page.evaluate((markdown) => {
    const content = document.querySelector('.cm-content')
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    document.execCommand('insertText', false, markdown)
  }, MINDMAP_MARKDOWN)
  await sleep(1_500)
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('mindmap scenario: the preview pane never became visible')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-block .mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return !!box && box.width > 100 && box.height > 100
  }, { timeout: 30_000 })

  const block = await page.evaluate(() => {
    const node = document.querySelector('.ink-prose .mindmap-block')
    const canvas = node?.querySelector('.mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return {
      ready: Boolean(node?.classList.contains('is-ready')),
      height: Math.round(box?.height ?? 0),
      role: canvas?.getAttribute('role') ?? '',
      label: canvas?.getAttribute('aria-label') ?? '',
      controls: node?.querySelectorAll('[data-mindmap-fit], [data-mindmap-fullscreen]').length ?? 0,
    }
  })
  check('mindmap: the block renders a live canvas', block.ready, JSON.stringify(block))
  check('mindmap: the canvas is announced as an application widget', block.role === 'application' && block.label.length > 0, JSON.stringify(block))
  check('mindmap: the block header offers fit and full screen', block.controls === 2, `controls=${block.controls}`)

  await page.evaluate(() => {
    window.__mindmapCanvas = document.querySelector('.ink-prose .mindmap-canvas')
  })

  // The header's palette control, end to end: it states the palette the fence asks for, a pick is
  // written into that same fence and painted on the instance already on screen, and picking the app
  // palette clears the statement again. The scenario leaves the fence following the app, because the
  // theme-follow step at the end of it measures exactly that. The custom entry is absent here on
  // purpose — this fence is an outline, which has no field to carry a theme object.
  const initial = await page.evaluate(() => ({
    control: document.querySelector('.ink-prose .mindmap-block [data-mindmap-theme-pick]')?.textContent?.trim() ?? '',
    annotation: document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null,
  }))
  check(
    'mindmap: the header names the palette the map draws with',
    MINDMAP_PALETTES.auto.includes(initial.control) && initial.annotation === null,
    JSON.stringify(initial),
  )
  const pickedLight = await pickMindmapPalette(page, 'light')
  check('mindmap: the palette menu offers the app palette, light and dark', pickedLight.menu.labels.length === 3, JSON.stringify(pickedLight.menu))
  check(
    'mindmap: the palette menu marks the palette the fence states',
    pickedLight.menu.checked.length === 1 && MINDMAP_PALETTES.auto.includes(pickedLight.menu.checked[0]),
    JSON.stringify(pickedLight.menu),
  )
  check(
    'mindmap: a pick is written into the fence and named by the control',
    pickedLight.annotation === 'light' && MINDMAP_PALETTES.light.includes(pickedLight.control),
    JSON.stringify(pickedLight),
  )
  const pickedDark = await pickMindmapPalette(page, 'dark')
  check(
    'mindmap: the picked palette repaints the live map without rebuilding it',
    pickedDark.annotation === 'dark' && pickedDark.theme.sameElement
    && pickedDark.theme.root.length > 0 && pickedDark.theme.root !== pickedLight.theme.root,
    `light=${JSON.stringify(pickedLight.theme)} dark=${JSON.stringify(pickedDark.theme)}`,
  )
  const pickedAuto = await pickMindmapPalette(page, 'auto')
  check(
    'mindmap: picking the app palette clears the fence statement again',
    pickedAuto.annotation === null && pickedAuto.theme.sameElement && MINDMAP_PALETTES.auto.includes(pickedAuto.control),
    JSON.stringify(pickedAuto),
  )
  await page.click('.ink-prose .mindmap-block [data-mindmap-fullscreen]')
  await page.waitForSelector('.mindmap-fullscreen-canvas .mindmap-canvas', { timeout: 15_000 })
  await waitForPanelSettled(page, '.mindmap-fullscreen')
  await sleep(600)

  const full = await page.evaluate(() => {
    const dialog = document.querySelector('.mindmap-fullscreen')
    const canvas = dialog?.querySelector('.mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return {
      hosted: Boolean(canvas) && canvas === window.__mindmapCanvas,
      height: Math.round(box?.height ?? 0),
      label: dialog?.getAttribute('aria-label') ?? '',
      controls: dialog?.querySelectorAll('button[aria-label]').length ?? 0,
      focused: Boolean(document.activeElement?.closest?.('.mindmap-canvas')),
      nodes: dialog?.querySelectorAll('me-tpc').length ?? 0,
    }
  })
  check('mindmap: full screen hosts the same live element', full.hosted, JSON.stringify(full))
  check('mindmap: full screen gives the map the viewport', full.height > block.height, `inline=${block.height} full=${full.height}`)
  check('mindmap: full screen exposes the view, shortcut and export controls', full.controls >= 6, `controls=${full.controls}`)
  check('mindmap: the overlay is announced by the map title', full.label === 'Visual Probe', `label=${full.label}`)
  check('mindmap: the map takes the focus in full screen', full.focused)

  // The keyboard reference is a layer of the drawing area, not a row of the toolbar: opening it there
  // must leave the head the size it was, or it pushes the button that was just pressed out from
  // under the pointer.
  const reference = await page.evaluate(async () => {
    const head = document.querySelector('.mindmap-fullscreen-head')
    const canvas = document.querySelector('.mindmap-fullscreen-canvas')
    const before = head?.getBoundingClientRect().height ?? 0
    const toggle = [...(head?.querySelectorAll('button') ?? [])]
      .find((element) => /shortcut|快捷键/.test(element.getAttribute('aria-label') ?? ''))
    toggle?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const card = document.querySelector('.mindmap-shortcuts')
    const cardBox = card?.getBoundingClientRect()
    const canvasBox = canvas?.getBoundingClientRect()
    return {
      opened: Boolean(card),
      inHead: Boolean(card && head?.contains(card)),
      inDrawingArea: Boolean(cardBox && canvasBox
        && cardBox.top >= canvasBox.top && cardBox.bottom <= canvasBox.bottom
        && cardBox.left >= canvasBox.left && cardBox.right <= canvasBox.right),
      headGrowth: Math.round((head?.getBoundingClientRect().height ?? 0) - before),
    }
  })
  check('mindmap: the keyboard reference opens', reference.opened, JSON.stringify(reference))
  check('mindmap: the keyboard reference sits in the drawing area, not the toolbar', reference.inDrawingArea && !reference.inHead, JSON.stringify(reference))
  check('mindmap: opening the keyboard reference leaves the toolbar its size', reference.headGrowth === 0, JSON.stringify(reference))

  // The card is measured while it is open: axe only reads what is on screen, and closing it first
  // would leave the one surface this gate added unread. The contrast gate opens the same overlay with
  // the same card in both themes; here the run is the light one the later scenarios measure on.
  await ensureAxe(page)
  const report = await runAxe(page, '.mindmap-fullscreen')
  check('a11y: the mind map full screen has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  check('a11y: axe inspected the mind map surface', report.passes >= 10, `passes=${report.passes}`)
  const referenceAudited = await page.evaluate(() => {
    const card = document.querySelector('.mindmap-shortcuts')
    return { open: Boolean(card), lines: card?.querySelectorAll('li').length ?? 0 }
  })
  check('a11y: the keyboard reference was on screen for the axe pass', referenceAudited.open && referenceAudited.lines >= 9, JSON.stringify(referenceAudited))

  await page.keyboard.press('Escape')
  const referenceClosed = await page.waitForFunction(
    () => !document.querySelector('.mindmap-shortcuts') && !!document.querySelector('.mindmap-fullscreen'),
    { timeout: 15_000 },
  ).then(() => true, () => false)
  check('mindmap: escape puts the keyboard reference away without leaving full screen', referenceClosed)

  // Keyboard path: Tab on the focused map is the library's add-child shortcut, and Tab or Enter in the
  // node editor commits it. The new node has to reach the note source, because the map and the fence
  // it came from are one document.
  await page.click('.mindmap-fullscreen-canvas me-tpc')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  const written = await page.waitForFunction(
    (names) => names.some((name) => (document.querySelector('.cm-content')?.textContent ?? '').includes(name)),
    { timeout: 15_000 },
    ['New node', '新节点'],
  ).then(() => true, () => false)
  check('mindmap: a node added from the keyboard reaches the note source', written)
  const nodes = await page.evaluate(() => document.querySelectorAll('.mindmap-fullscreen-canvas me-tpc').length)
  check('mindmap: the added node is on the map too', nodes === full.nodes + 1, `before=${full.nodes} after=${nodes}`)

  // Enter is the map's add-sibling shortcut and it opens the new node for editing. The overlay has to
  // survive both the operation and the write it schedules: whoever is building the map loses their
  // place, and the camera with it, if full screen drops out from under them mid-edit.
  await sleep(600)
  await page.keyboard.press('Enter')
  await sleep(400)
  const sibling = await page.evaluate(() => ({
    full: Boolean(document.querySelector('.mindmap-fullscreen')),
    hosted: Boolean(document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas')),
    inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
    nodes: document.querySelectorAll('.mindmap-fullscreen-canvas me-tpc').length,
    editing: Boolean(document.querySelector('.mindmap-canvas #input-box')),
  }))
  check('mindmap: enter opens a sibling without leaving full screen', sibling.full && sibling.hosted && !sibling.inline && sibling.nodes === nodes + 1, JSON.stringify(sibling))
  check('mindmap: the new sibling is open for editing', sibling.editing, JSON.stringify(sibling))
  await page.keyboard.type('Keyboard sibling')
  await sleep(250)
  await page.keyboard.press('Enter')
  await sleep(1_200)
  const afterSibling = await page.evaluate(() => ({
    full: Boolean(document.querySelector('.mindmap-fullscreen')),
    hosted: Boolean(document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas')),
    written: (document.querySelector('.cm-content')?.textContent ?? '').includes('Keyboard sibling'),
  }))
  check('mindmap: the sibling reaches the note with full screen still open', afterSibling.full && afterSibling.hosted && afterSibling.written, JSON.stringify(afterSibling))

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.mindmap-fullscreen'), { timeout: 15_000 })
  const closed = await page.evaluate(() => ({
    focusBack: document.activeElement?.hasAttribute('data-mindmap-fullscreen') ?? false,
    canvases: document.querySelectorAll('.mindmap-canvas').length,
    inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
  }))
  check('mindmap: escape leaves full screen and the map moves back', closed.inline && closed.canvases === 1, JSON.stringify(closed))
  check('mindmap: focus returns to the control that opened full screen', closed.focusBack, JSON.stringify(closed))

  // The library's toolbar ships a full screen button of its own. Left alone it asks the browser for
  // native full screen on the canvas, which cannot survive the re-render any edit brings: the
  // registry re-parents the canvas into the fresh placeholder, the browser sees the full screen
  // element leave the document and drops out of full screen — press Enter to add a sibling and the
  // map falls back to the pane. The button is routed to the overlay instead, so both affordances
  // open the same view and neither can be pulled out from under an edit. It is clicked through the
  // page so the check reads the app's own handler rather than a hit-test at a pixel, and the map is
  // left exactly as found: the scenario below counts nodes and edits through the same instance.
  const nativeHandler = await page.evaluate(() => typeof document.querySelector('.ink-prose .mindmap-canvas #fullscreen')?.onclick === 'function')
  check('mindmap: the library full screen button no longer requests native full screen', !nativeHandler)
  const libraryClick = await page.evaluate(() => {
    const span = document.querySelector('.ink-prose .mindmap-canvas #fullscreen')
    if (!span) return false
    span.click()
    return true
  })
  check('mindmap: the library toolbar offers its full screen button', libraryClick)
  if (libraryClick) {
    await page.waitForSelector('.mindmap-fullscreen-canvas .mindmap-canvas', { timeout: 15_000 })
    await waitForPanelSettled(page, '.mindmap-fullscreen')
    const routed = await page.evaluate(() => ({
      hosted: document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas') === window.__mindmapCanvas,
      native: document.fullscreenElement === null,
      label: document.querySelector('.mindmap-fullscreen')?.getAttribute('aria-label') ?? '',
      control: getComputedStyle(document.querySelector('.mindmap-fullscreen-canvas #fullscreen')).display,
      inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
    }))
    check('mindmap: the library full screen button opens the overlay on the live map', routed.hosted && routed.native && routed.label.length > 0 && !routed.inline, JSON.stringify(routed))
    check('mindmap: the library button leaves no dead control in the overlay', routed.control === 'none', JSON.stringify(routed))
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.mindmap-fullscreen'), { timeout: 15_000 })
  }

  // The map carries its own palette: the library writes a theme's colours as inline styles on the
  // element it draws in and bakes the branch colours into the nodes when it draws the connectors, so
  // a live instance has to be told about a switch. The state refuted here is the map that keeps the
  // colours it was born with until the page is reloaded. Two things are read rather than one: the
  // colour variable, which the instance always carries, and the branch colour, which only a connector
  // pass bakes in — a switch that moved the variables alone would leave every branch the colour of
  // the theme before it. The branch colour is compared between the two switched states instead of
  // against the baseline, because a layout-only pass (opening the overlay re-lays the map out) leaves
  // the nodes without one until something draws them again, which is exactly what the fix does. The
  // canvas element is compared on every read: the same element across the switch is what proves the
  // colours came from the instance on screen rather than from a rebuilt one. The account theme goes
  // back to light afterwards, because the rest of this run measures the light one.
  const lightTheme = await readMindmapTheme(page)
  check('mindmap: the live map is the element the earlier steps drove', lightTheme.sameElement && lightTheme.root.length > 0, JSON.stringify(lightTheme))
  await setAppTheme(page, 'dark')
  await page.waitForFunction(
    (previous) => document.querySelector('.ink-prose .mindmap-canvas .map-container')?.style.getPropertyValue('--root-bgcolor').trim() !== previous,
    { timeout: 5_000 },
    lightTheme.root,
  ).then(() => true, () => false)
  const darkTheme = await readMindmapTheme(page)
  await setAppTheme(page, 'light')
  await page.waitForFunction(
    (expected) => document.querySelector('.ink-prose .mindmap-canvas .map-container')?.style.getPropertyValue('--root-bgcolor').trim() === expected,
    { timeout: 5_000 },
    lightTheme.root,
  ).then(() => true, () => false)
  const backToLight = await readMindmapTheme(page)
  check(
    'mindmap: the theme switch reaches the live map without a reload',
    darkTheme.sameElement && backToLight.sameElement
    && darkTheme.root !== lightTheme.root && backToLight.root === lightTheme.root,
    `light=${JSON.stringify(lightTheme)} dark=${JSON.stringify(darkTheme)} back=${JSON.stringify(backToLight)}`,
  )
  check(
    'mindmap: the map paints the palette of the theme it is showing',
    darkTheme.branch.length > 0 && backToLight.branch.length > 0 && darkTheme.branch !== backToLight.branch,
    `dark=${JSON.stringify(darkTheme)} back=${JSON.stringify(backToLight)}`,
  )
}

// The library takes its selection from a pointer event on the node's own box, and a click that only
// lands on the block's padding leaves the previous selection in place: the key presses after it then
// act on the wrong node (Tab adds a child to the wrong parent, Delete removes the wrong node). This
// clicks the node's centre and waits for the library's own `selected` class, so every keyboard step
// below starts from a known selection instead of from an assumption about the click.
async function selectMindmapNode(page, scope, label) {
  const target = await page.evaluate(([root, text]) => {
    const atom = [...document.querySelectorAll(`${root} .mindmap-canvas me-tpc`)]
      .find((node) => node.textContent.includes(text))
    if (!atom) return null
    const box = atom.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }, [scope, label])
  if (!target) return false
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.mouse.click(target.x, target.y)
    const selected = await page.waitForFunction(([root, text]) =>
      [...document.querySelectorAll(`${root} .mindmap-canvas me-tpc`)]
        .some((node) => node.classList.contains('selected') && node.textContent.includes(text)),
    { timeout: 1_500 }, [scope, label]).then(() => true, () => false)
    if (selected) return true
  }
  return false
}

// The map lags the note: an operation is written through a debounce and the map re-renders on its
// own frame, so a node count read in the same tick as the source text is the state before the write.
async function waitForMindmapNodes(page, scope, expected, timeout = 15_000) {
  return page.waitForFunction(([root, count]) =>
    document.querySelectorAll(`${root} .mindmap-canvas me-tpc`).length === count,
  { timeout }, [scope, expected]).then(() => true, () => false)
}

// A block's body as the document itself holds it, read out of the fence bodies the host registered
// beside the markup (lib/markdown/fence-bodies.ts). The editor is not a stable place to read it
// from: CodeMirror renders only the lines in view, so its text depends on where the caret and the
// scroll happen to be. The preview always carries the body the note was last committed with, which
// is exactly what these assertions are about. Every family is numbered the same way, so one reader
// serves them all.
function readBlockBody({ scope, block, family, indexAttribute }) {
  const node = document.querySelector(`${scope} ${block}`)
  if (!node) return ''
  const index = Number(node.getAttribute(indexAttribute))
  if (!Number.isInteger(index)) return ''
  for (let current = node; current !== null; current = current.parentElement) {
    const bodies = current.inkstoneFenceBodies
    if (bodies) return bodies[family]?.[index] ?? ''
  }
  return ''
}

async function readNoteBody(page, scope) {
  return page.evaluate(readBlockBody, { scope, block: '.mindmap-block[data-mindmap]', family: 'mindmap', indexAttribute: 'data-mindmap-index' })
}

// The write is debounced and the preview re-renders after it, so an assertion on the frame right
// after a keypress would race both — this polls the committed body from here, where the predicate
// stays readable, until it says what it should or the deadline passes.
async function waitForNoteBody(page, scope, settled, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let body = await readNoteBody(page, scope)
  while (!settled(body) && Date.now() < deadline) {
    await sleep(200)
    body = await readNoteBody(page, scope)
  }
  return body
}

async function fenceHas(page, scope, text, present = true, timeout = 15_000) {
  const body = await waitForNoteBody(page, scope, (next) => next.includes(text) === present, timeout)
  return body.includes(text) === present
}

// Full screen is the loud surface; the preview column is the one people actually edit in. The
// library's own bindings are the input method there too — Tab adds a child, Enter commits it and
// opens a sibling, Delete removes the selected node, Ctrl+Z undoes, Alt+arrow reorders — and every
// one of them has to land in the note while the same instance stays alive through the re-render
// that follows.
async function assertMindmapSplitEditing(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('mindmap split scenario: the preview pane never became visible')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return !!box && box.width > 100 && box.height > 100
  }, { timeout: 30_000 })
  await sleep(600)
  const start = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: the map returns to the preview column on the same instance', start.same && start.nodes > 0, JSON.stringify(start))

  check('mindmap: a node is selected in the preview column', await selectMindmapNode(page, '.ink-prose', 'Live block'))
  await page.keyboard.press('Tab')
  await sleep(250)
  await page.keyboard.type('Split child')
  await page.keyboard.press('Enter')
  check('mindmap: a child added in the preview column reaches the note', await fenceHas(page, '.ink-prose', 'Split child'), await readNoteBody(page, '.ink-prose'))
  const added = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: the child is on the map and the instance survived the write', added.same && added.nodes === start.nodes + 1, JSON.stringify(added))

  // The node the library just committed stays selected, so Delete removes it and Ctrl+Z puts it
  // back. Both write through the same debounce as an edit does.
  check('mindmap: the node is selected before it is deleted', await selectMindmapNode(page, '.ink-prose', 'Split child'))
  await page.keyboard.press('Delete')
  check('mindmap: deleting the selected node leaves the note', await fenceHas(page, '.ink-prose', 'Split child', false), await readNoteBody(page, '.ink-prose'))
  // Ctrl+Z reaches the map only through the keyboard focus it holds on its own drawing container, so
  // read that before pressing it: an edit that landed in the editor instead would still put a node
  // back, and the assertions below would pass about the wrong surface.
  const keyboardOnMap = await page.evaluate(() => Boolean(document.activeElement?.closest?.('.ink-prose .mindmap-canvas')))
  check('mindmap: the map keeps the keyboard across the delete and the write', keyboardOnMap)
  await page.keyboard.down('Control')
  await page.keyboard.press('z')
  await page.keyboard.up('Control')
  // Which snapshot the library steps back to is the library's business — what the app owes the user is
  // that the note follows the map either way, since the step redraws without announcing an operation
  // (see the history wrapper in src/client/lib/markdown/mindmap/vendor.ts). So this asserts the node
  // is back in the fence and that every topic the map now shows is in it, not which topic came back.
  const back = await waitForMindmapNodes(page, '.ink-prose', added.nodes)
  const undone = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
    topics: [...document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc')].map((node) => node.textContent.trim()),
  }))
  // The read is polled exactly like the two edits before it: the undone map writes through the same
  // debounce, and the body this reads is the one the note was last *committed* with.
  const undoneBody = await waitForNoteBody(page, '.ink-prose', (body) => undone.topics.every((topic) => body.includes(topic)))
  const missing = undone.topics.filter((topic) => !undoneBody.includes(topic))
  check('mindmap: undo brings the node back and the note follows the map', back && missing.length === 0, `${JSON.stringify(undone)} missing=${JSON.stringify(missing)}`)
  check('mindmap: undo kept the same instance', undone.same && undone.nodes === added.nodes, JSON.stringify(undone))

  // Alt + an arrow reorders the selected node, and the new order has to reach the note rather than
  // only repaint the map. The selection is put on the node this scenario added, because an undo can
  // leave the selection somewhere else.
  const orderOf = async () => {
    const body = (await readNoteBody(page, '.ink-prose')).replace(/\s+/g, ' ')
    return ['Live block', 'Two way editing', 'Keyboard sibling', 'Split child']
      .map((name) => ({ name, at: body.indexOf(name) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.name)
  }
  const beforeMove = await orderOf()
  const target = await selectMindmapNode(page, '.ink-prose', 'Split child')
  await page.keyboard.down('Alt')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.up('Alt')
  await sleep(1_200)
  const afterMove = await orderOf()
  const reordered = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: alt+arrow reorders the node in the note', target && afterMove.join(' > ') !== beforeMove.join(' > ') && afterMove.includes('Split child'), `selected=${target} ${beforeMove.join(' > ')} → ${afterMove.join(' > ')}`)
  check('mindmap: reordering kept the same instance', reordered.same && reordered.nodes === undone.nodes, JSON.stringify(reordered))
}

// Jumps back to the deck's first page, so the thumbnail under test is the one holding the
// diagram and the math.
async function jumpToFirstPage(page) {
  await page.evaluate(() => {
    document.querySelector('[data-presentation-rail] [data-entry-index][data-slide-index="0"][data-slide-page="0"]')?.click()
  })
  await sleep(900)
}

// The rendered artifacts (a diagram, rendered math) a slide surface shows, taken from the active
// page's thumbnail next to the projector itself.
// `painted` samples the chart's canvas for non-transparent pixels: a chart block whose canvas was
// never drawn (the cached-markup path used to trust a serialized "already rendered" marker) has
// the right box and no drawing, which is exactly the failure this reads out.
async function readRenderedMarkup(page) {
  return page.evaluate(() => {
    const count = (root, selector) => root?.querySelectorAll(selector).length ?? 0
    const painted = (root) => {
      const canvas = root?.querySelector('[data-chart] canvas')
      if (!canvas) return 0
      try {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = 0
        for (let index = 3; index < data.length; index += 400) if (data[index] > 0) drawn++
        return drawn
      } catch {
        return -1
      }
    }
    const artifacts = (root) => ({
      svg: count(root, 'svg'),
      katex: count(root, '.katex'),
      // The projector draws a chart live; the list and the printed page show the still the cache
      // holds, so a chart counts as present either way and `painted` tells the two apart.
      charts: count(root, '[data-chart] canvas') + count(root, '[data-chart] img.chartjs-still'),
      still: count(root, '[data-chart] img.chartjs-still'),
      live: Boolean(root?.querySelector('[data-chart]')?.__chartInstance),
      painted: painted(root),
    })
    const panel = document.querySelector('[role="dialog"]')
    const stage = panel?.querySelector('[data-slide-canvas] [data-slide-page]')
    const active = panel?.querySelector('[data-presentation-rail] [data-entry-index][aria-current="true"] .ink-slide-rail-thumb .ink-prose')
    return {
      theme: document.documentElement.dataset.theme ?? '',
      stage: artifacts(stage),
      thumb: artifacts(active),
    }
  })
}

// The list draws the still the measuring pass captured, and that capture reads the chart's canvas
// (slide-html's freezeChart). So a still that is there but empty is a picture of nothing — which is
// what the pass shipped while it drew its charts with the entrance animation: the capture runs in the
// tick the chart is created, and chart.js draws on a later one (probe: 0 painted pixels of the 51604 a
// drawn chart has, the whole chart once the animation had run). The read above counts elements, and a
// fully transparent PNG is an element, so it was green on that pass. The count is sampled every 400th
// byte, like the sheet's own painted read: this asks whether the frame holds a chart at all.
async function readStillPixels(page) {
  return page.evaluate(async () => {
    const still = document.querySelector('[data-presentation-rail] [aria-current="true"] img.chartjs-still')
    if (!still) return -1
    try {
      const image = new Image()
      image.src = still.getAttribute('src') ?? ''
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let drawn = 0
      for (let index = 3; index < data.length; index += 400) if (data[index] > 0) drawn++
      return drawn
    }
    catch {
      return -1
    }
  })
}

function sameArtifacts(markup) {
  return markup.stage.svg > 0 && markup.thumb.svg === markup.stage.svg && markup.thumb.katex === markup.stage.katex && markup.thumb.charts === markup.stage.charts
}

function describeArtifacts(artifacts) {
  return `svg=${artifacts.svg},katex=${artifacts.katex},charts=${artifacts.charts},live=${artifacts.live},painted=${artifacts.painted}`
}

// The deck is re-prepared one slide per idle slice, so the list catches up asynchronously.
async function waitForRenderedMarkup(page) {
  let markup = await readRenderedMarkup(page)
  for (let attempt = 0; attempt < 30 && !sameArtifacts(markup); attempt++) {
    await sleep(500)
    markup = await readRenderedMarkup(page)
  }
  return markup
}

// A fresh note pasted with a fixed deck, so the assertions do not depend on where the
// caret happened to be in the note the earlier steps were editing.
async function openDeckNote(page) {
  await page.keyboard.down('Control')
  await page.keyboard.press('n')
  await page.keyboard.up('Control')
  await sleep(1_500)
  await page.waitForSelector('.cm-content', { timeout: 20_000 })
  await appendToNote(page, `${PAGINATED_DECK}\n`)
  await sleep(1_500)
}

// The deck the show is on, as the controls report it.
async function readDeckSize(page) {
  return page.evaluate(() => {
    const position = document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent?.trim() ?? ''
    const [current, total] = position.split('/').map((part) => Number.parseInt(part.trim(), 10))
    return { position, current, slides: total || 0 }
  })
}

// The list fills one slide per idle slice, so this waits for it to stop growing.
// The pass reports its completeness on the dialog, so this waits for the state itself instead of
// reading "the count has not changed lately" — a slice that is still measuring looks like that,
// and the page assertions then ran against a list that had barely started.
async function waitForRailFilled(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-slide-list-complete="true"]') !== null,
    { timeout: 60_000 },
  )
  return page.evaluate(() => document.querySelectorAll('[data-presentation-rail] [data-entry-index]').length)
}

// Clicks the first page of each slide and reads the counter, which is the canvas's own
// measurement of that slide, then hands it back next to the list's entry count.
async function readPageCountsPerSlide(page, expected) {
  const results = []
  for (const slide of Object.keys(expected).map(Number)) {
    const clicked = await page.evaluate((target) => {
      const entry = document.querySelector(`[data-presentation-rail] [data-entry-index][data-slide-index="${target}"]`)
      entry?.click()
      return Boolean(entry)
    }, slide)
    if (!clicked) continue
    await sleep(800)
    const pages = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]')
      const chip = [...panel.querySelectorAll('span')].find((item) => /^\d+\/\d+$/.test(item.textContent ?? ''))
      return chip ? Number(chip.textContent.split('/')[1]) : 1
    })
    results.push({ slide, entries: expected[slide], pages })
  }
  return results
}

// Clicks one page entry of a slide and reports the counter it landed on, which is
// what the presenter reads back from the controls.
async function clickPageEntry(browser, slide, pageOffset) {
  const clicked = await browser.evaluate((options) => {
    const entries = [...document.querySelectorAll('[data-presentation-rail] [data-entry-index]')]
      .filter((item) => Number(item.dataset.slideIndex) === options.slide)
    const entry = entries[options.pageOffset]
    entry?.click()
    return Boolean(entry)
  }, { slide, pageOffset })
  if (!clicked) throw new Error(`slide list has no page ${pageOffset + 1} on slide ${slide}`)
  await sleep(900)
  return browser.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const chip = [...panel.querySelectorAll('span')].find((item) => /^\d+\/\d+$/.test(item.textContent ?? ''))
    const [numerator, denominator] = (chip?.textContent ?? '').split('/')
    return { numerator: Number(numerator), denominator: Number(denominator) }
  })
}

async function presentationSession(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const canvas = document.querySelector('[data-slide-canvas]')
    const stage = canvas?.parentElement?.getBoundingClientRect()
    const box = canvas?.getBoundingClientRect()
    const follow = [...(panel?.querySelectorAll('[data-presentation-chrome] button') ?? [])]
      .find((item) => /跟随|冻结|Follow|Freeze/.test(item.getAttribute('aria-label') ?? ''))
    const position = panel?.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
    return {
      open: Boolean(canvas),
      position,
      total: Number.parseInt(position.split('/')[1] ?? '', 10) || 0,
      slides: panel?.querySelectorAll('[data-presentation-rail] [data-slide-index]').length ?? 0,
      followLabel: follow?.getAttribute('aria-label') ?? '',
      inDialog: Boolean(document.activeElement?.closest?.('[role="dialog"]')),
      filled: Boolean(box && stage) && box.height >= stage.height - 1 && box.width >= stage.width - 1,
    }
  })
}

// Presentation controls carry a locale-dependent aria-label; match either locale the
// way the other label helpers in this gate do.
async function clickPresentationControl(page, labels) {
  const clicked = await page.evaluate((options) => {
    const panel = document.querySelector('[role="dialog"]')
    const button = [...(panel?.querySelectorAll('[data-presentation-chrome] button') ?? [])]
      .find((item) => options.includes(item.getAttribute('aria-label')))
    if (!button) return false
    button.click()
    return true
  }, labels)
  if (!clicked) throw new Error(`presentation control missing: ${labels[0]}`)
}

// Each remote edit opens its own slide and ends on a blank line, so it adds exactly
// one page wherever the editor's caret happens to sit when the text arrives — a
// break is honoured both by the note that follows it and the deck that ends there.
const LIVE_EDIT_ONE = '\n\n---\n\n## Editorial addition\n\nAdded from another writer.\n\n'
const LIVE_EDIT_TWO = '\n\n---\n\n## Ignored\n\nWritten after the freeze.\n\n'
// A two-slide deck whose second slide cannot fit one canvas: the show opens on slide 1,
// so slide 2 is the slide the presenter has not reached yet.
const PAGINATED_DECK = [
  '# Short opening',
  '',
  'One page of talk, with a diagram, a chart and math so the slide list has rendered markup to show.',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Source] --> B[Preview]',
  '```',
  '',
  '```chart',
  '{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"Series","data":[3,7,4]}]}}',
  '```',
  '',
  'Inline $E = mc^2$ and a block:',
  '',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
  '',
  '---',
  '',
  '## Slide that paginates',
  '',
  // One block per paragraph: a soft-wrapped run is a single block, and an oversized
  // block is scaled to fit its page instead of paginating.
  ...Array.from({ length: 28 }, (_, index) => `Paragraph ${index + 1} of a slide that has to paginate.`).flatMap((line) => [line, '']),
].join('\n')

// Writes into the editor while the show is on screen: a presenter never types there
// directly (the overlay covers it), but a live edit arrives from another tab, another
// device, or an MCP write through the same store. CodeMirror is fed a paste event
// rather than execCommand('insertText'): the overlay's focus trap keeps DOM focus in
// the dialog, and a paste inserts at the editor's own cursor instead of relying on it.
async function appendToNote(page, markdown) {
  const appended = await page.evaluate((text) => {
    const content = document.querySelector('.cm-content')
    if (!content) return false
    const data = new DataTransfer()
    data.setData('text/plain', text)
    content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    return true
  }, markdown)
  if (!appended) throw new Error('appendToNote: the editor is not mounted')
  await sleep(1_200) // autosave debounce, then the show's own follow debounce
}

// A toolbar is one row: expanding a panel inside it must not change its height, or the control that
// was just pressed moves out from under the pointer — the mind map's keyboard reference card used to
// wrap to a second row and grow the full screen toolbar that way. The audit that found that is this
// loop, run rather than written down: every full screen surface is opened the way a person opens it,
// each toggle in its toolbar is pressed once, the toolbar's height and the toggle's own box are
// compared before and after, and the surface is closed again. The mind map overlay is not listed —
// its scenario above asserts the same two things for its one toggle, plus where the card lands — and
// that scenario is also what covers the modal shell, whose only consumer in the full screen variant
// is that overlay. The drawer shell is audited where it exists, at the phone breakpoint.
//
// Each surface also has to arrive with its content: a panel that opened on a failed request keeps a
// header of exactly the same height, so stability alone would read as a pass for a surface nobody can
// use. `loaded` is the smallest thing that only exists once the data is there — and for a surface
// whose content is a picture, the count is of pictures the browser actually decoded.
//
// Every surface is also opened from a control the sweep marks, because two more things are asserted
// on the way out: Escape closes it, and the control that opened it has the focus again. Opening by
// shortcut is one of those paths — the app hands focus back to whatever held it when the panel
// opened — so the entry names the control the shortcut is pressed with, and the assertion names the
// same element either way. `opener.labels` are the accessible names the control goes by in both
// locales; `focus` marks the shortcut path.
const LIGHTBOX_MARKDOWN = ['', '![Visual probe](/inkstone-logo.svg)', ''].join('\n')

// The music surfaces are drawn by the modal shell's own element, and the label each one hands that
// shell is how a reader finds it. Declared above the list because the list is built at module load.
const dialogRoot = (labels) => labels.map((label) => `div[role="dialog"][aria-label="${label}"]`).join(', ')
const MUSIC_HUB_ROOT = dialogRoot(LABELS.musicHub)
const MUSIC_IMMERSIVE_ROOT = dialogRoot(LABELS.musicImmersive)
// The hub's own fold breakpoint is 900px: below it the side columns are drawers opened from the
// header, and above it there is nothing in that row to disclose. The shell is still the desktop one
// here, which is what keeps the status bar (and its music control) on screen.
const MUSIC_HUB_SWEEP_VIEWPORT = { width: 850, height: 900 }

const TOOLBAR_SURFACES = [
  // The graph has no button of its own at this width: its entry point is the account menu, which
  // unmounts on the way to the panel, so a person reaches it by shortcut. The sidebar's account
  // control is what holds the keyboard while that shortcut runs, and that is the element focus has to
  // come back to. The scope control of this header is a radiogroup (radio + aria-checked), which this
  // sweep does not press and which its own naming gate reads, so the disclosure the sweep has to find is
  // the settings button: pressing it opens the drawer this surface discloses.
  { name: 'graph', open: (page) => pressOpener(page, { labels: ['设置', 'Settings'], combo: ['Control', 'Shift', 'g'] }), root: '[data-surface="graph"]', toolbar: '[data-surface="graph"] > header', minToggles: 1, loaded: { selector: 'canvas', min: 1 } },
  { name: 'template library', open: (page) => pressOpener(page, { labels: ['从模板新建笔记', 'New note from template'] }), root: '[data-surface="templates"]', toolbar: '[data-surface="templates"] > header', minToggles: 1, loaded: { selector: '[data-template-id]', min: 1 } },
  { name: 'settings', open: (page) => pressOpener(page, { labels: ['设置', 'Settings'] }), root: SETTINGS_PANEL, toolbar: `${SETTINGS_PANEL} header`, minToggles: 0, loaded: { selector: 'nav button', min: 3 } },
  { name: 'command palette', open: (page) => pressOpener(page, { labels: ['搜索笔记、执行命令', 'Search notes or run a command'] }), root: PALETTE_PANEL, toolbar: `${PALETTE_PANEL} > div`, minToggles: 0, loaded: { selector: '[role="option"]', min: 1 } },
  // The show's chrome is the one toolbar that floats over its surface instead of sitting at the top
  // of it, and the slide list is one of the four places an expansion is allowed to live: pressing the
  // two toggles is what has to leave the pill the size it was.
  { name: 'presentation', open: (page) => pressOpener(page, { labels: ['演示模式', 'Presentation mode'] }), root: '[data-surface="presentation"]', toolbar: '[data-presentation-chrome]', minToggles: 2, loaded: { selector: '[data-slide-canvas]', min: 1 } },
  // The lightbox has no toggle (zoom is two plain buttons), so what the sweep can say about it is
  // that it arrives on the picture it was opened for and holds its toolbar: the picture is appended
  // to the note here, at the end of the run, because the deck counts measured above are counts of the
  // note's own markdown. What opens it is the button the preview puts around a prose image, and that
  // button is also where focus has to land again — a bare image could not hold it.
  { name: 'lightbox', open: openLightbox, root: '[data-surface="lightbox"]', toolbar: '[data-lightbox-toolbar]', minToggles: 0, loaded: { selector: 'img', min: 1, decoded: true } },
  // The outline only lives in the drawer shell at the phone breakpoint, which is where that side
  // panel is part of the shell rather than a column of the split view.
  // The drawer's title row is its first child row, not a `header`: the panel is a `div role=dialog`
  // and a `header` inside it mapped to a second banner landmark (the phone reader found that pair).
  { name: 'outline drawer', open: openOutlineDrawer, root: '[data-surface="drawer"]', toolbar: '[data-surface="drawer"] > div:first-child', minToggles: 0, viewport: MOBILE_VIEWPORT, loaded: { selector: '[data-heading-level]', min: 1 } },
  // The slides editor is reached from a block in the note rather than from a control in the shell,
  // and its toolbar is the editor's own top bar. Two of its controls disclose panels that hang
  // under that bar, which is exactly what the sweep holds to its size: a panel drawn as a row of
  // the header would push the control that opened it out from under the pointer.
  { name: 'slides editor', open: openSlidesEditor, root: '.bento-slides-fullscreen', toolbar: '.bento-slides-fullscreen header', minToggles: 2, loaded: { selector: '.bento-canvas-stage [data-slide-element]', min: 3 } },
  // The board's top bar is the third toolbar drawn inside the full screen modal shell. Several of its
  // controls disclose a dialog of their own — panels that stay in the dialog's tree rather than being
  // portaled out of it, which is what keeps them inside the focus trap and is asserted where they are
  // opened (`assertKanbanPanelAnchoring`); the sweep dismisses them between presses. Its content has
  // arrived once the cards are drawn.
  { name: 'kanban board', open: openKanbanBoard, root: '.kanban-fullscreen', toolbar: '.kanban-fullscreen [data-kanban-header]', minToggles: 3, loaded: { selector: '[data-item-id]', min: 2 } },
  // FB-C3: the music library's window, audited at the width where its header actually discloses
  // something — below its 900px breakpoint the two side columns fold into drawers opened from that
  // row, which is exactly the expansion the rule is about. At this width the window also fills the
  // viewport, so the third toggle (fill the screen) changes nothing and is pressed along with the
  // rest. The person's path in is the status bar's music control, and Escape has to hand the
  // keyboard back to the music controls (see the `data-music-opener` marker).
  // FB3-C10: the one entry here whose content comes from the server. Every other surface draws what
  // the page already holds, so `loaded` was read the instant its panel settled and always answered;
  // the library has to be fetched, and on a clean instance the sweep read an empty hub (`count: 0`)
  // while the same check passed on a long-lived server that still had an earlier run's tracks. The
  // fixture is declared here the way the contrast gate's music surface declares its own, so this
  // entry answers for the hub rather than for whatever the instance happened to be holding.
  { name: 'music hub', viewport: MUSIC_HUB_SWEEP_VIEWPORT, open: openMusicHubForSweep, root: MUSIC_HUB_ROOT, toolbar: '[data-hub-header]', minToggles: 2, skipToggles: [...LABELS.musicMaximizeHub, ...LABELS.musicRestoreHub], successorAttributes: ['data-music-opener'], fixture: seedMusicProbeTracks, loaded: { selector: '[role="row"], div.grid-cols-2 button', min: 1 } },
  // FB-C3: the immersive player, opened the way the floating card offers it. Its lyrics header is
  // the toolbar: the queue it folds out is drawn below that row, and the row may not notice. The
  // header's other control resizes the surface itself — the dialog grows to the viewport and the
  // whole row travels with it — so that one is declared out of the sweep and read by
  // `assertMusicImmersiveFullscreen`, which measures the dialog the shell draws.
  { name: 'music immersive player', open: (page) => pressOpener(page, { labels: LABELS.musicImmersive }), root: MUSIC_IMMERSIVE_ROOT, toolbar: '[data-immersive-header]', minToggles: 1, skipToggles: [...LABELS.musicMaximizePlayer, ...LABELS.musicRestorePlayer], loaded: { selector: 'input[type="range"]', min: 1 } },
]

/**
 * Writes markdown at the end of the note and waits for it to reach the note source. The scenarios
 * that append to the probe note do it here rather than at the cursor because the cursor is wherever
 * the last scenario left it — the mind map one leaves it inside the fence it wrote — and a block
 * typed into the middle of someone else's markdown is not what the reader is being simulated doing.
 */
async function writeAtEndOfNote(page, markdown, scenario) {
  const written = await page.evaluate((text) => {
    const content = document.querySelector('.cm-content')
    if (!content) return false
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    return document.execCommand('insertText', false, text)
  }, markdown)
  if (!written) throw new Error(`${scenario}: the note could not be edited`)
  await sleep(1_200) // autosave debounce
}

/**
 * The lightbox needs a picture in the note. A same-origin asset is used rather than a remote URL, so
 * the surface is exercised without the run depending on the network, and the failure state is not
 * mistaken for the surface: the click waits until the browser has decoded what it is clicking.
 */
async function openLightbox(page) {
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('lightbox: the editor pane never became visible')
  await writeAtEndOfNote(page, LIGHTBOX_MARKDOWN, 'lightbox')
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('lightbox: the preview pane never became visible')
  const picture = await page.waitForSelector('.ink-prose img', { timeout: 30_000 }).then((handle) => handle, () => null)
  if (!picture) throw new Error('lightbox: the note holds no picture for the lightbox to open')
  // The renderer marks images lazy, so one appended past the fold is never fetched until it is looked
  // at; a reader scrolls to it, and so does this.
  await picture.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const rendered = await page.waitForFunction(() => {
    const image = document.querySelector('.ink-prose img')
    return Boolean(image && image.complete && image.naturalWidth > 0)
  }, { timeout: 30_000 }).then(() => true, () => false)
  if (!rendered) throw new Error('lightbox: the picture put into the note never decoded')
  await pressOpener(page, { labels: ['图片预览', 'Image preview'] })
}

/**
 * The deck's own card in the note is what opens the editor, so the sweep waits for it to be drawn
 * with its elements before pressing the control: a block that failed to parse offers a full screen
 * control over nothing, and the sweep would then read an empty surface as a stable one.
 */
async function openSlidesEditor(page) {
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')
  // The sweep runs after scenarios that write the note, so the deck may no longer be in it: the
  // surface is reached by putting one there rather than by assuming an earlier scenario left one
  // behind, which is also what keeps this entry runnable on its own.
  if (!(await slidesDeckOnScreen(page))) {
    await ensurePaneVisible(page, '.cm-content')
    await writeAtEndOfNote(page, SLIDES_FENCE, 'slides editor')
    if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')
  }
  const card = await page.waitForFunction(() => {
    const box = document.querySelector('.ink-prose [data-bento-slides] [data-slide-element]')
    return Boolean(box && box.getClientRects().length > 0)
  }, { timeout: 20_000 }).then(() => true, () => false)
  if (!card) throw new Error('slides editor: the note holds no deck for the sweep to open')
  await pressOpener(page, { labels: ['全屏', 'Full screen'], scope: '.ink-prose [data-bento-slides]' })
}

/** Whether the note on screen already draws a deck, which is what its full screen control needs. */
async function slidesDeckOnScreen(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.ink-prose [data-bento-slides] [data-slide-element]')
    return Boolean(box && box.getClientRects().length > 0)
  })
}

/** The day `offset` days from today, as the fence stores it. A board is read against the reader's
 * today, so the fixture's dates are relative: a fixed pair would put every dated view out of range
 * (or into the past) the moment the clock moved past it. */
function gateDay(offset) {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return day.toISOString().slice(0, 10)
}

/**
 * A board of two cards in two columns, each carrying a tag, a start and an end. The tags are what put
 * the filter chips in the header, and the chips are where the tag palette is actually painted; the two
 * statuses give the board a column each; the dates are what the calendar, timeline and Gantt read, so
 * every view the sweep opens has something of its own to draw. No `views` is declared, which is the
 * board's own default set — the eight a reader gets on a fence that just holds cards.
 */
const KANBAN_VIEWS_FENCE = [
  '',
  '```kanban',
  JSON.stringify(
    {
      title: 'Gate Board',
      items: [
        {
          id: 'gate-a',
          title: 'Gate first task',
          properties: { status: 'todo', tags: ['feat'], startDate: gateDay(-2), endDate: gateDay(3), progress: 40, assignee: 'Owner-1' },
        },
        // Finished work stops being late about a date it already met, so this one's missed deadline is
        // what the "overdue" chip has to *not* match (KU-15).
        {
          id: 'gate-b',
          title: 'Gate second task',
          properties: { status: 'done', tags: ['improve'], startDate: gateDay(-5), endDate: gateDay(-1), progress: 100 },
        },
        // A card with no chips is its own rendering path, and the one the reveal row used to be
        // floated over: without it the assertion below has nothing to stand on. Its deadline is the
        // one that has passed while the card is still open, which is the only shape "overdue" matches.
        { id: 'gate-c', title: 'Gate untagged task', properties: { status: 'todo', endDate: gateDay(-1) } },
      ],
    },
    null,
    2,
  ),
  '```',
  '',
].join('\n')

/**
 * The board this gate owns inside the note. A vault may hold other boards — an earlier run's fixture,
 * or one the reader wrote — and every read is scoped to this one by the cards it declares, so a
 * leftover block in the note can neither stand in for the fixture nor be counted as part of it. All
 * three cards are named, including the one with no tags: a board left by an earlier run of this gate
 * lacks the third, and matching it would read a surface with no tag-less card on it.
 */
const KANBAN_FIXTURE = '.ink-prose [data-kanban]:has([data-item-id="gate-a"]):has([data-item-id="gate-b"]):has([data-item-id="gate-c"])'

/**
 * The same block once the overlay holds its board, found by the fence it came from instead. The
 * overlay *borrows* the block's canvas rather than copying it, so the cards leave the block the
 * moment it opens and the marker above stops matching the very block it just found; the fence index
 * stays behind on the block and is unique within the note.
 */
function kanbanBlockByIndex(index) {
  return `.ink-prose [data-kanban][data-kanban-index="${index}"]`
}

/** The fence index of the block this gate wrote, or null when the note no longer holds it. */
async function kanbanFixtureIndex(page) {
  return page.evaluate((selector) => document.querySelector(selector)?.dataset.kanbanIndex ?? null, KANBAN_FIXTURE)
}

/** Whether the note on screen already draws this gate's own board, cards and all. */
async function kanbanBoardOnScreen(page) {
  return page.evaluate((selector) => {
    const block = document.querySelector(selector)
    return Boolean(block && block.getClientRects().length > 0 && block.querySelectorAll('[data-item-id]').length >= 2)
  }, KANBAN_FIXTURE)
}

/**
 * The board's own card in the note opens the overlay. The fence is written here rather than assumed to
 * be left over from an earlier scenario, which is also what keeps the sweep's entry runnable on its
 * own, and the press waits until the block draws its cards: a fence that failed to parse offers a
 * full screen control over an error message, and the sweep would read that empty surface as a stable
 * one. The control is pressed inside the board's own block because every rich block in the note
 * carries one under the same name.
 *
 * The fence index of the block it opened comes back, which is how a caller keeps reading that one
 * block after the overlay has taken the cards out of it.
 */
/**
 * The fixture board, drawn in the note, written at the end of the note when the vault holds no such
 * board yet. Split out of the opener so the board can also be read while it is still inline: the
 * overlay *borrows* the block's canvas, so once it opens there is no second chance at this state.
 */
async function ensureKanbanFixtureInline(page) {
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('kanban board: the preview pane never became visible')
  if (!(await kanbanBoardOnScreen(page))) {
    await ensurePaneVisible(page, '.cm-content')
    await writeAtEndOfNote(page, KANBAN_VIEWS_FENCE, 'kanban board')
    if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('kanban board: the preview pane never became visible')
  }
  const cards = await page.waitForFunction((selector) => {
    const block = document.querySelector(selector)
    return Boolean(block && block.querySelectorAll('[data-item-id]').length >= 2)
  }, { timeout: 30_000 }, KANBAN_FIXTURE).then(() => true, () => false)
  if (!cards) throw new Error('kanban board: the note holds no board for the sweep to open')
}

async function openKanbanBoard(page) {
  await ensureKanbanFixtureInline(page)
  // The fence index is read here, before the press: the overlay borrows the block's canvas, so from
  // the moment it opens the block no longer holds the cards this gate tells its board apart by.
  const index = await kanbanFixtureIndex(page)
  await pressOpener(page, { labels: ['全屏', 'Full screen'], scope: KANBAN_FIXTURE })
  return index
}

/**
 * The row a card reveals on hover — its checkbox, its tag control and its details button — must not be
 * painted across the card's own title. It used to be: for a card with no chips the row was taken out of
 * flow and floated over the card's top edge, which in the board (drawn outside the note, where no prose
 * margin pushes the title down) laid the add-tag control straight over the first line of the title.
 *
 * The controls' boxes are the same whether or not a pointer is over the card — the reveal is an
 * opacity change, not a layout one — so this reads the geometry, which is also why it works in a
 * headless browser that reports no hover-capable pointer at all (the reveal itself is behind
 * Tailwind's `@media (hover: hover)`, which no headless run satisfies).
 */
async function assertKanbanRevealRows(page, where, scope) {
  const drawn = await page.$(scope)
  if (!drawn) {
    check(`kanban ${where}: the surface is there to measure`, false, `no element matches ${scope}`)
    return
  }
  const cards = await page.evaluate((selector) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    }
    const overlap = (a, b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      return w > 0 && h > 0 ? `${w}x${h}` : null
    }
    return [...document.querySelectorAll(`${selector} [data-item-id]`)].map((card) => {
      const title = card.querySelector('h3')
      // The controls this row reveals on hover, found by the rule that reveals them: that is the same
      // marker in a board card and in a gallery tile, and it cannot drift from what the reveal switches.
      const revealed = [...card.querySelectorAll('*')]
        .filter((element) => (element.className ?? '').toString().includes('group-hover/card:opacity-100'))
      const titleBox = title ? box(title) : null
      const hits = titleBox
        ? revealed
          .map((element) => ({ name: element.getAttribute('aria-label') ?? element.tagName.toLowerCase(), box: box(element) }))
          .map((control) => ({ ...control, overlap: overlap(titleBox, control.box) }))
          .filter((control) => control.overlap !== null)
        : []
      return {
        id: card.getAttribute('data-item-id') ?? '',
        title: titleBox,
        controls: revealed.length,
        hits: hits.map((hit) => `${hit.name} ${hit.overlap}`),
      }
    })
  }, scope)
  const covered = cards.filter((card) => card.hits.length > 0)
  // A gallery tile reveals one control (its checkbox) where a board card reveals three, so what is
  // asserted is that each card draws its own reveal controls at all — the overlap above is what says
  // where they land.
  check(`kanban ${where}: every card draws its reveal controls`, cards.length >= 2 && cards.every((card) => card.title && card.controls >= 1), JSON.stringify(cards.map((card) => `${card.id}:${card.controls} controls`)))
  check(`kanban ${where}: a card with no tags is among them`, cards.some((card) => card.id === 'gate-c'), JSON.stringify(cards.map((card) => card.id)))
  check(`kanban ${where}: no card paints a reveal control across its own title`, covered.length === 0, JSON.stringify(covered))
}

/** The outline control of the pane on screen, pressed where it is drawn. */
async function openOutlineDrawer(page) {
  await clickButton(page, LABELS.preview)
  await sleep(700)
  await pressOpener(page, { labels: ['大纲', 'outline'], scope: '.mobile-pane-layer[data-active]' })
}

/**
 * Presses the control one surface is opened from, and marks it so the assertion after Escape can
 * say whether focus came back. A real pointer click is how a person presses a control that is drawn;
 * when the surface is reached by shortcut instead, the marked control takes the keyboard first and
 * the combo is pressed the way the app's own hotkey map reads it. Marks from earlier surfaces are
 * cleared, so the element the assertion finds is always this surface's opener.
 */
/**
 * FB-C3: the hub's sweep opens it from whichever music control the shell is showing — the plain
 * status-bar icon before anything plays, the transport row's expand control once a track is current,
 * and the floating card when neither of those is drawn (at phone width, where the card is the whole
 * music surface). All three open the hub and all three carry the same successor marker, so the
 * sweep's focus check has an answer whichever one it pressed. Waiting for the control to be hittable
 * is the contrast gate's own lesson: a playback notice sits over that row for seconds, and a press
 * that lands on the notice reads as a surface that never opened.
 */
async function openMusicHubForSweep(page) {
  const labels = [...LABELS.musicOpenHub, ...LABELS.musicExpandPlayer]
  await waitForHittable(page, labels)
  await pressOpener(page, { labels })
}

async function pressOpener(page, { labels, combo = null, scope = '' }) {
  const point = await page.evaluate(({ labels, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    const control = [...(root?.querySelectorAll('button') ?? [])]
      .find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
    if (!control) return null
    // A control further down a long note is off screen, and a press is a real pointer click at a
    // measured point: it has to be brought into view first, or it lands on whatever is at those
    // coordinates — which is how a card at the end of the probe note read as a dead control.
    control.scrollIntoView({ block: 'center' })
    const box = control.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return null
    // The sweep opens one surface at a time, so its marks replace the previous surface's: the focus
    // check below is about the control this press touched, not about whatever opened something earlier.
    window.__gateOpeners = [control]
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { labels, scope })
  if (!point) throw new Error(`the sweep found no control named ${labels.join(' / ')} to open a surface from`)
  if (combo) {
    await page.evaluate(() => (window.__gateOpeners ?? []).at(-1)?.focus())
    await pressCombo(page, combo)
    return
  }
  await page.mouse.click(point.x, point.y)
}

/** One toggle's row, read from the toolbar it sits in: where it is, and whether it is still inside. */
async function readToggle(page, toolbar, index, skipped = []) {
  return page.evaluate(({ toolbar, index, skipped }) => {
    const bar = document.querySelector(toolbar)
    const drawn = [...(bar?.querySelectorAll('button[aria-pressed], button[aria-expanded]') ?? [])]
      .filter((item) => item.getBoundingClientRect().width > 0)
      .filter((item) => !skipped.includes(item.getAttribute('aria-label') ?? ''))
    const toggle = drawn[index]
    if (!bar || !toggle) return null
    const barBox = bar.getBoundingClientRect()
    const box = toggle.getBoundingClientRect()
    return {
      height: Math.round(barBox.height),
      top: Math.round(box.top),
      left: Math.round(box.left),
      inside: box.top >= barBox.top - 1 && box.bottom <= barBox.bottom + 1,
      label: (toggle.getAttribute('aria-label') || toggle.textContent.trim()).slice(0, 24),
    }
  }, { toolbar, index, skipped })
}

/** Presses one toolbar toggle the way a person does: a real pointer click on the control's centre. */
async function clickToggle(page, toolbar, index, skipped = []) {
  const point = await page.evaluate(({ toolbar, index, skipped }) => {
    const drawn = [...(document.querySelector(toolbar)?.querySelectorAll('button[aria-pressed], button[aria-expanded]') ?? [])]
      .filter((item) => item.getBoundingClientRect().width > 0)
      .filter((item) => !skipped.includes(item.getAttribute('aria-label') ?? ''))
    const toggle = drawn[index]
    if (!toggle) return null
    const box = toggle.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { toolbar, index, skipped })
  if (!point) return
  await page.mouse.click(point.x, point.y)
}

/**
 * A toolbar control can open a portaled popover or menu rather than anything inside the toolbar, and
 * those close on their own terms: the palette's tag filter only ever opens, so a second press leaves
 * it up. Escape is what a person reaches for, and it closes those layers one at a time, so the sweep
 * dismisses them before the next toggle instead of assuming a control toggles.
 */
async function dismissTransientLayers(page, root) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const layers = await page.evaluate((selector) => [...document.querySelectorAll('[role="dialog"], [role="menu"]')]
      .filter((element) => !element.matches(selector) && !element.closest(selector)).length, root)
    if (layers === 0) return
    await page.keyboard.press('Escape')
    await sleep(240)
  }
}

/**
 * Presses every toggle in one toolbar and reports what the toolbar and the toggle itself did.
 *
 * The height is the assertion the mind map's reference card failed; "inside" is its sibling, for a
 * control that stays in the toolbar but wraps to a row of its own. A sideways move is recorded and
 * not failed: the graph's scope buttons sit after a count that changes width with the data, so a
 * legitimate repaint moves them without the toolbar growing.
 */
async function sweepToolbar(page, surface) {
  // FB-C3: a control that resizes the surface itself is not a disclosure, and pressing it moves the
  // whole window — which is the one thing this sweep must not read as a toolbar growth. A surface
  // declares those controls by name; each one is read by an assertion of its own instead (the music
  // pair below say what they skipped and who reads it).
  const skipped = surface.skipToggles ?? []
  const bar = await page.evaluate(({ selector, skipped }) => {
    const element = document.querySelector(selector)
    if (!element) return null
    return {
      height: Math.round(element.getBoundingClientRect().height),
      toggles: [...element.querySelectorAll('button[aria-pressed], button[aria-expanded]')]
        .filter((toggle) => toggle.getBoundingClientRect().width > 0)
        .filter((toggle) => !skipped.includes(toggle.getAttribute('aria-label') ?? '')).length,
    }
  }, { selector: surface.toolbar, skipped })
  if (!bar) throw new Error(`toolbar sweep: the ${surface.name} has no toolbar matching ${surface.toolbar}`)
  let growth = 0
  let rowShift = 0
  let sideways = 0
  let outside = 0
  const labels = []
  for (let index = 0; index < bar.toggles; index += 1) {
    const before = await readToggle(page, surface.toolbar, index, skipped)
    await clickToggle(page, surface.toolbar, index, skipped)
    await sleep(320)
    const after = await readToggle(page, surface.toolbar, index, skipped)
    if (!before || !after) {
      outside += 1
      labels.push(`${before?.label ?? index}:gone`)
      continue
    }
    growth = Math.max(growth, after.height - before.height)
    rowShift = Math.max(rowShift, Math.abs(after.top - before.top))
    sideways = Math.max(sideways, Math.abs(after.left - before.left))
    if (!after.inside) outside += 1
    labels.push(`${after.label}:${after.height - before.height}/${after.top - before.top}/${after.left - before.left}`)
    await dismissTransientLayers(page, surface.root)
  }
  return { height: bar.height, toggles: bar.toggles, skipped: skipped.join(' / '), growth, rowShift, sideways, outside, labels: labels.join(', ') }
}

/**
 * A deck whose three cards share one row: 100 wide, 40 between the first pair and 44 between the
 * second, so the even spacing the drag below lands on is 42. Written as a JSON body, which is the
 * one form the fence takes where every coordinate is stated rather than parsed out of an outline.
 */
const SLIDES_FENCE = [
  '',
  '```bento-slides',
  JSON.stringify(
    {
      title: 'Gate deck',
      slides: [
        {
          id: 'gate-slide',
          elements: [100, 240, 384].map((x, index) => ({
            id: ['gate-a', 'gate-b', 'gate-c'][index],
            type: 'text',
            html: `Card ${index + 1}`,
            fontSize: 24,
            x,
            y: 100,
            w: 100,
            h: 100,
          })),
        },
      ],
    },
    null,
    2,
  ),
  '```',
  '',
].join('\n')

/**
 * What the page looked like when the card's control did not open the editor: whether the control the
 * sweep marked is still on screen, how many preview roots are mounted, and whether any of them is
 * the mounted copy — the block hands a session back only from the pane that mounted it, and the
 * split draws its markup twice.
 */
async function slidesOpenProbe(page) {
  return page.evaluate(() => {
    const opener = (window.__gateOpeners ?? []).at(-1)
    const rect = opener?.getBoundingClientRect()
    const block = opener?.closest('[data-bento-slides],[data-mindmap],[data-excalidraw],[data-kanban]')
    return {
      opener: opener ? { label: opener.getAttribute('aria-label'), onScreen: Boolean(rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight), top: rect ? Math.round(rect.top) : null } : null,
      // Which block the marked control belonged to, since every rich block names its own.
      openerBlock: block ? [...block.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith('data-')).join(',') : null,
      viewport: window.innerHeight,
      previewRoots: [...document.querySelectorAll('.ink-prose')].map((root) => ({
        rects: root.getClientRects().length,
        blocks: root.querySelectorAll('[data-bento-slides]').length,
        ready: root.querySelectorAll('[data-bento-slides].is-ready').length,
      })),
      editors: document.querySelectorAll('.cm-content').length,
      activeLayers: [...document.querySelectorAll('.mobile-pane-layer')].filter((layer) => layer.hasAttribute('data-active')).length,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => dialog.getAttribute('aria-label') ?? dialog.className.toString().slice(0, 40)),
      // What the press actually met: a control can be on screen and still be under something.
      hit: rect
        ? (() => {
          const met = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return met ? `${met.tagName.toLowerCase()}[${met.getAttribute('class')?.slice(0, 30) ?? ''}]` : 'nothing'
        })()
        : null,
    }
  })
}

/** The percentage the slides stage is drawn at, read off the corner cluster's own label. */
async function readSlidesZoom(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll('.bento-slides-fullscreen button')]
      .map((button) => button.textContent.trim())
      .find((text) => /^\d+%$/.test(text))
    return label ? Number.parseInt(label, 10) : null
  })
}

/** The deck the note was last committed with, read off the block rather than out of the editor. */
async function readSlidesSource(page) {
  return page.evaluate(readBlockBody, { scope: '.ink-prose', block: '[data-bento-slides]', family: 'slides', indexAttribute: 'data-bento-slides-index' })
}

/** The write back into the fence is debounced and the preview re-renders after it, so this waits. */
async function waitForSlidesSource(page, settled, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let body = await readSlidesSource(page)
  while (!settled(body) && Date.now() < deadline) {
    await sleep(200)
    body = await readSlidesSource(page)
  }
  return body
}

/** Where the second card of the deck stands in the committed deck, as its own x. */
const SLIDES_LANDED = /"x"\s*:\s*242/

/** How many boxes the page holds, which is what an edit through the menu shows up as. */
async function slidesElementCount(page) {
  return page.evaluate(() => document.querySelectorAll('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element]').length)
}

/** The centre of one row of the editor's own menu, addressed by the text it carries. */
async function menuRowCentre(page, labels) {
  return page.evaluate((wanted) => {
    const row = [...document.querySelectorAll('[role="menu"] button')]
      .find((candidate) => wanted.includes(candidate.textContent.trim()))
    if (!row) return null
    const box = row.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, labels)
}

/** Where an element box is on screen, in page pixels of the editor's own stage. */
async function slidesElementCentre(page, id) {
  return page.evaluate((elementId) => {
    const box = document.querySelector(`.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="${elementId}"]`)
    const rect = box?.getBoundingClientRect()
    if (!rect || rect.width < 1) return null
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }, id)
}

/**
 * The slides editor is where a deck is edited, and it is the one surface in this gate that edits a
 * *document* rather than a setting: its rail, stage and inspector are drawn from the deck's own
 * tokens, its stage scrolls under the page, and an edit is committed back into the fence it came
 * from. So the scenario opens it the way a person does — the block card's own full screen control —
 * and then drives the three gestures that have no API-level equivalent: dragging an element onto the
 * even spacing its row already shares, fitting the page to the stage, and panning the stage with
 * Space held while the page stays exactly where it was.
 *
 * The a11y pass belongs to this surface for the same reason the mind map's does: it is a full
 * screen overlay nobody reaches by keyboard alone, and a missing role or an unnamed control in it
 * goes unnoticed by eye.
 */
async function assertSlidesEditor(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('slides editor: the editor pane never became visible')
  await writeAtEndOfNote(page, SLIDES_FENCE, 'slides editor')
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')

  // The card has to arrive before its control is pressed: the block renders one slide with the real
  // element boxes, so a card that failed to parse would offer a full screen control over nothing.
  const card = await page.waitForFunction(() => {
    const box = document.querySelector('.ink-prose [data-slide-element="gate-b"]')
    return Boolean(box && box.getClientRects().length > 0)
  }, { timeout: 20_000 }).then(() => true, () => false)
  check('slides editor: the deck card renders the page it was given', card)

  // The control is pressed inside the deck's own block, not across the preview pane: every rich
  // block in the note carries a full screen control under the same name, and the mind map's sits
  // ahead of this one in the document — a scene-wide search opens the map instead of the deck.
  // Only the preview's copy is mounted, which is where a reader's pointer would be anyway.
  await pressOpener(page, { labels: ['全屏', 'Full screen'], scope: '.ink-prose [data-bento-slides]' })
  const surfaced = await page
    .waitForFunction(() => Boolean(document.querySelector('.bento-slides-fullscreen')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('slides editor: the block card opens the editor', surfaced, JSON.stringify(await slidesOpenProbe(page)))
  if (!surfaced) return
  await waitForPanelSettled(page, '.bento-slides-fullscreen')
  await sleep(400)
  const ready = await page.evaluate(() => ({
    elements: document.querySelectorAll('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element]').length,
    zoom: [...document.querySelectorAll('.bento-slides-fullscreen button')]
      .map((button) => button.textContent.trim())
      .find((text) => /^\d+%$/.test(text)) ?? '',
  }))
  check('slides editor: it opens on the deck with every element drawn', ready.elements >= 3, JSON.stringify(ready))
  // The zoom is what turns a distance on screen into a distance on the page, and every gesture
  // below is driven with the mouse: a drag is measured in the deck's own pixels.
  const scale = (Number.parseInt(ready.zoom, 10) || 100) / 100

  // The row's even spacing, dragged live: three pixels to the right is 43 and 41 apart, inside the
  // threshold, so the drag lands on 42 either side and the two widths are written on the page while
  // the pointer is still down.
  const middle = await slidesElementCentre(page, 'gate-b')
  if (!middle) throw new Error('slides editor: the middle card of the row is not on screen')
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 3 * scale, middle.y, { steps: 4 })
  await sleep(200)
  const gaps = await page.evaluate(() => [...document.querySelectorAll('.bento-slides-fullscreen [data-slide-gap-size]')]
    .map((badge) => badge.textContent.trim()))
  await page.mouse.up()
  check('slides editor: an even gap is written on the page while the drag runs', gaps.length === 2 && gaps.every((gap) => gap === '42'), JSON.stringify(gaps))
  // The write back into the fence is debounced, and the preview carries the body the note was last
  // committed with — so this waits for the edit to arrive there rather than for the clock.
  const committed = await waitForSlidesSource(page, (body) => SLIDES_LANDED.test(body))
  const landed = await page.evaluate(() => ({
    left: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="gate-b"]')?.style.left ?? '',
  }))
  check('slides editor: the drag lands the card on the equal gaps and reaches the note source', landed.left === '242px' && SLIDES_LANDED.test(committed), `${JSON.stringify(landed)} committed=${SLIDES_LANDED.test(committed)}`)

  // The other half of a guide: an edge that reaches another box rather than the page's own lines.
  // The first card is dragged down onto the row's bottom edge — 44 page pixels, so its top edge
  // reaches 150 — and the line it stops on is drawn while the pointer is down and goes the moment
  // the pointer is let go.
  const first = await slidesElementCentre(page, 'gate-a')
  if (!first) throw new Error('slides editor: the first card of the row is not on screen')
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(first.x, first.y + 44 * scale, { steps: 6 })
  await sleep(200)
  const lines = await page.evaluate(() => [...document.querySelectorAll('.bento-slides-fullscreen [data-slide-guide]')]
    .filter((guide) => !guide.hasAttribute('data-slide-gap'))
    .map((guide) => guide.getAttribute('data-slide-guide')))
  await page.mouse.up()
  await sleep(300)
  const dropped = await page.evaluate(() => ({
    top: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="gate-a"]')?.style.top ?? '',
    guides: document.querySelectorAll('.bento-slides-fullscreen [data-slide-guide]').length,
  }))
  check('slides editor: an edge that reaches another box draws its line while the drag runs', lines.includes('y'), JSON.stringify(lines))
  check('slides editor: the drag lands on that line and the line goes with the pointer', dropped.top === '150px' && dropped.guides === 0, JSON.stringify(dropped))

  // The a11y pass runs on the panel as a reader leaves it: with nothing selected, because the
  // selection frame and its handles sit over the box they belong to, and axe can then neither read
  // the text under them nor the background behind it — which it reports as a review item rather
  // than a violation, so a selected box would quietly take its own text out of the pass. A press on
  // the page where nothing is drawn is what clears the selection, and the point is taken from the
  // part of the page that is on screen rather than from the page's far corner.
  const empty = await page.evaluate(() => {
    const canvas = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage .bento-slide-shadow')?.getBoundingClientRect()
    const stage = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage')?.getBoundingClientRect()
    if (!canvas || !stage) return null
    const left = Math.max(canvas.left, stage.left)
    const top = Math.max(canvas.top, stage.top)
    const right = Math.min(canvas.right, stage.right)
    const bottom = Math.min(canvas.bottom, stage.bottom)
    // Every box of this deck sits in the top left of the page, so its bottom left corner is empty.
    return right - 40 > left && bottom - 40 > top ? { x: Math.round(left + 40), y: Math.round(bottom - 40) } : null
  })
  if (empty) await page.mouse.click(empty.x, empty.y)
  await sleep(300)

  await ensureAxe(page)
  const report = await runAxe(page, '.bento-slides-fullscreen')
  check('a11y: the slides editor has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  // The deck paints its own colours — the page and the boxes in it are the author's theme, not the
  // app's tokens — so axe cannot judge the text on them and hands the call to a reviewer. What was
  // measured rather than assumed: the stack of elements at that text is the text itself, and hiding
  // the editor's two side columns makes the item disappear, so nothing of the editor's is over it.
  // The allowance is counted and located, not waved through: every item has to name a box on the page,
  // and there can be at most one per box — so a review item on anything that is not a box, or on the
  // editor's own chrome, still fails. How many of the boxes axe declines to judge is not pinned: it
  // depends on which text it can resolve a background for, and the drags above move the boxes over
  // each other, so the count is bounded by the deck rather than fixed at it.
  const deckCanvas = report.incomplete.filter(isDeckCanvasReviewItem)
  const unexpected = report.incomplete.filter((item) => !isReviewedIncomplete(item) && !deckCanvas.includes(item))
  const onBoxes = deckCanvas.every((item) => Boolean(item.box))
  check('a11y: no unexpected axe review items in the slides editor', unexpected.length === 0, JSON.stringify(unexpected))
  check(
    'a11y: every axe review item in the slides editor is text on one of the deck\'s own boxes',
    deckCanvas.length >= 1 && deckCanvas.length <= ready.elements && onBoxes,
    `canvas=${deckCanvas.length} boxes=${ready.elements} onBoxes=${onBoxes} found=${JSON.stringify(deckCanvas.map((item) => item.box))}`,
  )
  check('a11y: axe inspected the slides editor', report.passes >= 10, `passes=${report.passes}`)

  // The menu belongs to this editor and to nothing else, and a row that cannot reach the document
  // would read as a live menu that edits nothing: the last card is duplicated from it — one more
  // box on the page — and then taken back with the editor's own undo.
  const last = await slidesElementCentre(page, 'gate-c')
  if (!last) throw new Error('slides editor: the last card of the row is not on screen')
  await page.mouse.click(last.x, last.y, { button: 'right' })
  const opened = await page.waitForSelector('[role="menu"]', { timeout: 10_000 }).then(() => true, () => false)
  const rows = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] button')].map((row) => row.textContent.trim()))
  check('slides editor: right-clicking an element opens the editor\'s own menu', opened, JSON.stringify(rows))
  check('slides editor: the menu carries the rows this editor can do', rows.length >= 5, JSON.stringify(rows))
  const duplicate = await menuRowCentre(page, LABELS.slidesDuplicate)
  check('slides editor: the menu offers a duplicate row', Boolean(duplicate))
  if (duplicate) {
    await page.mouse.click(duplicate.x, duplicate.y)
    await sleep(400)
    const grown = await slidesElementCount(page)
    check('slides editor: duplicating a card puts a second box on the page', grown === 4, `elements=${grown}`)
    await pressCombo(page, ['Control', 'z'])
    await sleep(400)
    const undone = await slidesElementCount(page)
    check('slides editor: the editor takes its own edit back from the keyboard', undone === 3, `elements=${undone}`)
  }

  // Fitting the page is the one view control whose answer is measured rather than stepped: the
  // stage is narrower than the deck at this size, so the whole page cannot be on screen at 100%.
  const beforeFit = await readSlidesZoom(page)
  await clickButton(page, ['页面适应窗口', 'Fit the page to the window'])
  await sleep(400)
  const fitted = await readSlidesZoom(page)
  check('slides editor: fitting the page shows all of it at once', fitted !== null && beforeFit !== null && fitted < beforeFit, `before=${beforeFit} after=${fitted}`)

  // Panning needs something to pan to, so the view is zoomed past the page again and the stage is
  // asked to scroll. What has to hold is both halves: the stage moves, and the document does not.
  await clickButton(page, ['放大', 'Zoom in'])
  await clickButton(page, ['放大', 'Zoom in'])
  await sleep(400)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  const stage = await page.evaluate(() => {
    const element = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage')
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      scrollLeft: element.scrollLeft,
      overflow: element.scrollWidth - element.clientWidth,
    }
  })
  await page.keyboard.down(' ')
  // Space arms the pan through a state update, and the press below is dispatched by the same
  // protocol as the key it follows — nothing in between waits for a frame. So the stage is asked
  // whether it has taken the key before the press is sent: the app announces an armed pan with the
  // grab cursor it draws for as long as one is armed, and the press reads the very state that cursor
  // is drawn from. This is the flake that was seen once under load and passed either side of it —
  // the drag arrived first, the press was left to the page (`scrollLeft` 0 → 0, `overflow` fine),
  // and the assertion was reading the readiness of a render it had outrun.
  const armed = await page.waitForFunction(() => {
    const element = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage')
    return Boolean(element) && getComputedStyle(element).cursor === 'grab'
  }, { timeout: 5_000 }).then(() => true, () => false)
  check('slides editor: space arms the pan before the press reaches the stage', armed)
  await page.mouse.move(stage.x, stage.y)
  await page.mouse.down()
  await page.mouse.move(stage.x - 80, stage.y, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up(' ')
  await sleep(300)
  const panned = await page.evaluate(() => ({
    scrollLeft: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage').scrollLeft,
  }))
  check('slides editor: space and a drag pan the view', stage.overflow > 0 && panned.scrollLeft > stage.scrollLeft, JSON.stringify({ stage, panned }))
  check('slides editor: panning leaves the page where it was', SLIDES_LANDED.test(await readSlidesSource(page)))


  await assertSlidesPrint(page)

  await page.keyboard.press('Escape')
  const closed = await page.waitForFunction(
    () => !document.querySelector('.bento-slides-fullscreen'),
    { timeout: 10_000 },
  ).then(() => true, () => false)
  check('slides editor: escape closes it', closed)
  // The focus is asserted against the deck's own full screen control rather than against the marked
  // node the scenario pressed: the drags above are edits, the write they schedule re-renders the
  // card, and the button that was pressed does not exist any more. What has to hold is that the
  // keyboard came back to the control that opens this editor — found by its own attribute — and not
  // that it fell to the body or stayed in the surface that just closed.
  const focus = await page.evaluate(() => {
    const control = document.querySelector('.ink-prose [data-bento-slides] [data-bento-slides-fullscreen]')
    return {
      returned: Boolean(control) && document.activeElement === control,
      active: document.activeElement instanceof HTMLElement
        ? document.activeElement.getAttribute('aria-label') ?? document.activeElement.tagName.toLowerCase()
        : 'nothing',
    }
  })
  check('slides editor: it hands focus back to the control it was opened from', focus.returned, JSON.stringify(focus))
}

/**
 * The editor's other exit: the print control hands the browser a sheet built from the deck rather
 * than from the screen. The dialog blocks the thread and cannot be read from a gate, so what is
 * asserted is the paper the dialog is called on — one page box per page of the deck, each at the
 * deck's own page size, laid out off screen and out of the tab order. The sheet lives only as long
 * as the dialog, so the page watches it from inside instead of sampling it after the press.
 */
async function assertSlidesPrint(page) {
  const rail = await page.evaluate(() => document.querySelectorAll('.bento-slides-fullscreen [data-slide-thumbnail]').length)
  await page.evaluate(() => {
    window.__gatePrintSheet = null
    window.__gatePrintWatch = window.setInterval(() => {
      const sheet = document.querySelector('[data-bento-print]')
      if (!sheet || window.__gatePrintSheet) return
      const box = sheet.querySelector('.bento-print-page')?.getBoundingClientRect()
      const rule = [...document.styleSheets]
        .flatMap((style) => { try { return [...style.cssRules] } catch { return [] } })
        .find((entry) => entry.constructor.name === 'CSSPageRule')
      window.__gatePrintSheet = {
        pages: sheet.querySelectorAll('.bento-print-page').length,
        hidden: sheet.getAttribute('aria-hidden') === 'true',
        inert: sheet.hasAttribute('inert'),
        size: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '',
        rule: rule?.cssText ?? '',
        // Off screen rather than hidden: a hidden subtree has no box, and a canvas with no box
        // draws nothing onto the paper.
        offScreen: sheet.getBoundingClientRect().left < 0,
      }
    }, 50)
  })
  await clickButton(page, LABELS.slidesPrint)
  await sleep(2_500)
  const sheet = await page.evaluate(() => {
    window.clearInterval(window.__gatePrintWatch)
    return window.__gatePrintSheet
  })
  check('slides editor: the print control hands the browser a sheet', Boolean(sheet) && sheet.pages === rail && rail > 0, `sheet=${JSON.stringify(sheet)} rail=${rail}`)
  check('slides editor: the sheet is the deck\'s own page at 1:1', sheet?.size === '1280x720' && /size:\s*1280px 720px/.test(sheet?.rule ?? ''), JSON.stringify(sheet))
  check('slides editor: the sheet is off screen and out of the tab order', Boolean(sheet) && sheet.offScreen && sheet.hidden && sheet.inert, JSON.stringify(sheet))
}

/**
 * The two locales the app offers: the settings radios a language goes by — the option names are
 * translated too, so each choice is looked up under both dialog languages — and the value its `lang`
 * attribute takes once it is applied.
 */
const LANGUAGES = {
  zh: { lang: 'zh-CN', radios: ['简体中文', 'Simplified Chinese'] },
  en: { lang: 'en-US', radios: ['英文', 'English'] },
}

/**
 * The count inside one of the board's tag chips. A chip paints itself as a 14% tint of its own text
 * colour over whatever lies behind it, so axe cannot resolve that background and hands these nodes
 * to a reviewer instead of judging them — which is not the same as leaving them unjudged:
 * `scripts/check-contrast.mjs` measures every tag colour's text on its own tint in both themes.
 */
const TAG_CHIP_COUNT = /^<span class="text-\[length:var\(--text-10\)\]">\(\d+\)<\/span>$/

/**
 * Presses one of the board's own view tabs, with a real pointer, wherever the board is drawn: the
 * overlay, or the block in the note (the same tablist, and the tabs scroll horizontally, so the one
 * asked for is brought into view before it is measured — a later tab sits outside the narrow pane the
 * note draws the board in and a press at its un-scrolled coordinates lands on whatever is there).
 */
/**
 * Answers what a press found rather than throwing on the spot: the caller is the one that can say
 * whether the view it wanted arrived, and a gate that dies mid-run reports nothing about the rest.
 */
async function pressKanbanView(page, scope, labels) {
  let why = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page.evaluate(({ scope, wanted }) => {
      const root = scope ? document.querySelector(scope) : document
      const tabs = [...(root?.querySelectorAll('[role="tab"]') ?? [])]
      const tab = tabs.find((item) => wanted.includes(item.textContent.trim()))
      if (!tab) return { reason: 'no such tab', tabs: tabs.map((item) => item.textContent.trim()) }
      const describe = (element) => (element ? `${element.tagName.toLowerCase()}|${element.className.toString().slice(0, 40)}|${element.textContent.trim().slice(0, 12)}` : '(nothing)')
      // The pointer has to end up *on the tab*: the note's board is drawn in a pane whose scrollport
      // reaches under the app's fixed footer, where the music control sits, and a tab scrolled to the
      // nearest edge can therefore be measured behind a control that is not part of the board at all.
      const aim = (block) => {
        tab.scrollIntoView({ block, inline: 'center' })
        const box = tab.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return { reason: 'the tab has no box' }
        const x = Math.round(box.left + box.width / 2)
        const y = Math.round(box.top + box.height / 2)
        const under = document.elementFromPoint(x, y)
        return { x, y, under, hit: Boolean(under && tab.contains(under)) }
      }
      let aimed = aim('nearest')
      for (const block of ['start', 'center']) {
        if (aimed.reason || aimed.hit) break
        aimed = aim(block)
      }
      if (aimed.reason) return { reason: aimed.reason, tabs: tabs.map((item) => item.textContent.trim()) }
      // Nothing is pressed when the pointer is not on the tab: the click would land on whatever covers
      // it, and one of the things that can cover it is the app's music control — a press there starts
      // playing something, which is not something a measurement is allowed to do.
      if (!aimed.hit) return { reason: `the tab cannot be pointed at; over it was ${describe(aimed.under)}`, tabs: tabs.map((item) => item.textContent.trim()) }
      return { x: aimed.x, y: aimed.y, pressed: tab.textContent.trim(), under: describe(aimed.under) }
    }, { scope, wanted: labels })
    if (!found.pressed) return { pressed: '', reason: found.reason }
    await page.mouse.click(found.x, found.y)
    await sleep(500)
    // A press that leaves another tab selected is not a press: the tablist scrolls horizontally and a
    // tab at the wrong scroll offset takes the pointer somewhere harmless, which is how the gallery
    // step used to read the list view's panel as if it were the gallery's.
    const selected = await page.evaluate(({ scope, name }) => {
      const root = scope ? document.querySelector(scope) : document
      const tab = [...(root?.querySelectorAll('[role="tab"]') ?? [])].find((item) => item.textContent.trim() === name)
      return tab?.getAttribute('aria-selected') === 'true'
    }, { scope, name: found.pressed })
    if (selected) return { pressed: found.pressed, reason: '' }
    why = `pressing at ${found.x},${found.y} selected nothing; under the pointer was ${found.under}`
  }
  return { pressed: '', reason: why }
}

async function clickKanbanView(page, labels) {
  return pressKanbanView(page, '.kanban-fullscreen', labels)
}

/**
 * What decides how a view's content is *typed* — the properties prose claims and the ones a board's
 * own utilities set — for every element the view draws, keyed by the element's path inside the view's
 * panel. Boxes are deliberately absent: the note draws this board in a narrow pane and the overlay
 * draws it across the window, so widths, heights and resolved grid tracks describe the surface, not
 * the board, and comparing them would only assert that two differently sized panes are differently
 * sized. `scripts/check-contrast.mjs` and the tier measurements are where colour against the actual
 * background is judged; the colours here are compared only between the two renderings.
 */
const KANBAN_STYLE_PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-transform', 'text-wrap', 'white-space', 'text-decoration-line', 'color',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'list-style-type', 'display', 'position', 'gap', 'row-gap', 'column-gap', 'align-items', 'justify-content',
  'cursor', 'border-radius', 'border-top-width', 'border-top-color', 'background-color', 'appearance',
  'flex-grow', 'flex-shrink', 'flex-basis', 'vertical-align', 'opacity', 'visibility',
]

async function readKanbanViewStyles(page, scope, type) {
  return page.evaluate(({ scope, type, props }) => {
    const panel = document.querySelector(`${scope} [data-kanban-view-type="${type}"]`)
    if (!panel) return null
    const pathOf = (element) => {
      const parts = []
      for (let node = element; node && node !== panel; node = node.parentElement) {
        const tag = node.tagName.toLowerCase()
        const index = [...(node.parentElement?.children ?? [])].filter((sibling) => sibling.tagName === node.tagName).indexOf(node)
        parts.unshift(`${tag}:${index}`)
      }
      return parts.join('>')
    }
    return [...panel.querySelectorAll('*')].map((element) => {
      const style = getComputedStyle(element)
      const read = {}
      for (const prop of props) read[prop] = style.getPropertyValue(prop)
      return { path: pathOf(element), tag: element.tagName.toLowerCase(), text: (element.textContent ?? '').trim().slice(0, 20), style: read }
    })
  }, { scope, type, props: KANBAN_STYLE_PROPS })
}

/** Waits until one view's own panel is the one drawn, wherever the board is. */
async function waitForKanbanView(page, scope, type, timeout = 15_000) {
  return page
    .waitForFunction(({ scope, type }) => Boolean(document.querySelector(scope + ' [data-kanban-view-type="' + type + '"]')), { timeout }, { scope, type })
    .then(() => true, () => false)
}

/** What a view step left behind, for the failure message when its panel never arrived. */
async function readKanbanViewState(page, scope) {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const panel = root?.querySelector('[data-kanban-view-type]')
    return {
      panel: panel?.getAttribute('data-kanban-view-type') ?? '(none)',
      tabs: [...(root?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => `${tab.textContent.trim()}${tab.getAttribute('aria-selected') === 'true' ? '*' : ''}`),
      error: root?.querySelector('.kanban-error')?.textContent?.trim().slice(0, 60) ?? '',
    }
  }, scope)
}

/**
 * Every view's own typography, read from the board while it is still in the note. The overlay borrows
 * the block's canvas when it opens, so the note's rendering of a view can only be read before that —
 * and the point of reading it is comparing it with the overlay's (`assertKanbanViewParity`).
 */
async function readKanbanViewsInline(page, blockSelector) {
  const styles = {}
  const missing = {}
  for (const view of KANBAN_VIEWS) {
    const press = await pressKanbanView(page, blockSelector, view.labels)
    // A view the note has to build for the first time reads its chunk and its data before it draws,
    // and this pass runs before the overlay's own sweep, so its wait is the longer of the two.
    const drawn = press.pressed && (await waitForKanbanView(page, blockSelector, view.type, 25_000))
      ? await readKanbanViewStyles(page, blockSelector, view.type)
      : null
    styles[view.type] = drawn?.length ? drawn : null
    // A panel with no elements is no panel: the comparison would pass on two empty lists.
    if (!styles[view.type]) missing[view.type] = { ...press, ...(await readKanbanViewState(page, blockSelector)) }
  }
  await pressKanbanView(page, blockSelector, ['看板', 'Board'])
  return { styles, missing }
}

/**
 * The block in the note and the overlay draw the same board, and a reader sees one of them without the
 * other: a defect where the note's stylesheet reached into the board and the overlay's did not is
 * exactly what a card title was — 18.24px with a 26.4px top margin in the note, 14px with none in the
 * overlay, because prose owns a note's `h3` and wins any utility written on it. This walks every view
 * of both renderings element by element and fails on the first property that says they differ.
 */
function assertKanbanViewParity(inline, overlay) {
  for (const view of KANBAN_VIEWS) {
    const note = inline.styles[view.type]
    const board = overlay[view.type]
    if (!note || !board) {
      check(`kanban board: the ${view.type} view was read in both renderings`, false, JSON.stringify({ note: note?.length ?? 0, overlay: board?.length ?? 0, inTheNote: inline.missing[view.type] ?? null }))
      continue
    }
    const rows = []
    for (const [index, element] of note.entries()) {
      const other = board[index]
      if (!other) { rows.push(`${element.path} ${element.tag} "${element.text}" :: only in the note`); continue }
      const changed = Object.keys(element.style).filter((prop) => element.style[prop] !== other.style[prop])
      if (changed.length) rows.push(`${element.path} ${element.tag} "${element.text}" :: ${changed.map((prop) => `${prop} ${element.style[prop]} → ${other.style[prop]}`).join(' | ')}`)
    }
    for (const element of board.slice(note.length)) rows.push(`${element.path} ${element.tag} "${element.text}" :: only in the overlay`)
    check(`kanban board: the ${view.type} view is typed the same in the note and in the overlay`, rows.length === 0, JSON.stringify(rows.slice(0, 3)))
  }
}

/**
 * The eight views the board offers on a fence that declares none, each with the one thing only it
 * draws. What makes the list readable is the panel's own `data-kanban-view-type`: several views draw
 * cards, so "a card exists" would say nothing — "this view's panel holds a card of its own" does.
 *
 * The tab is found by name in both languages because the board draws a view under its own name when
 * it has one and under the type's translated label when it does not, and the two runs of this gate
 * happen in whichever language the account was left in.
 */
const KANBAN_VIEWS = [
  { type: 'board', labels: ['看板', 'Board'], selector: '[data-kanban-board]' },
  { type: 'table', labels: ['表格', 'Table'], selector: '[role="table"]' },
  { type: 'chart', labels: ['图表', 'Chart'], selector: 'canvas' },
  { type: 'calendar', labels: ['日历', 'Calendar'], selector: '[data-item-id]' },
  { type: 'timeline', labels: ['时间轴', 'Timeline'], selector: '[data-item-id]' },
  { type: 'gantt', labels: ['甘特图', 'Gantt'], selector: '[data-item-id]' },
  { type: 'list', labels: ['列表', 'List'], selector: '[data-item-id]' },
  { type: 'gallery', labels: ['画廊', 'Gallery'], selector: '[data-item-id]' },
]

/** The top bar's height, which no view is allowed to change: the head sits above the view's panel. */
async function readKanbanHeadHeight(page) {
  return page.evaluate(() => {
    const head = document.querySelector('.kanban-fullscreen [data-kanban-header]')
    return Math.round(head?.getBoundingClientRect().height ?? 0)
  })
}

/**
 * Every view, opened the way a reader opens one: the tab is pressed, and the view has to draw the one
 * thing that is its own. Until this existed the gate only ever read the table (its `[role="table"]`
 * was the "content arrived" proof of the whole overlay), so six views had never been opened by any
 * gate — and the two that were most recently rebuilt, the timeline and the Gantt, were exactly the
 * ones whose defects nothing could have caught.
 */
async function assertKanbanViews(page) {
  const settled = await readKanbanHeadHeight(page)
  const styles = {}
  check('kanban board: the top bar is drawn before the views are opened', settled > 0, `head=${settled}`)
  for (const view of KANBAN_VIEWS) {
    await clickKanbanView(page, view.labels)
    const drawn = await page.waitForFunction(({ type, selector }) => {
      const panel = document.querySelector(`.kanban-fullscreen [data-kanban-view-type="${type}"]`)
      return Boolean(panel?.querySelector(selector))
    }, { timeout: 15_000 }, view).then(() => true, () => false)
    // Read here rather than in a loop of its own: this is the one pass that has each view mounted, and
    // the note's rendering of it was read before the overlay took the canvas (`readKanbanViewsInline`).
    styles[view.type] = await readKanbanViewStyles(page, '.kanban-fullscreen', view.type)
    const read = await page.evaluate(({ type, selector }) => {
      const overlay = document.querySelector('.kanban-fullscreen')
      const panel = overlay?.querySelector(`[data-kanban-view-type="${type}"]`)
      const tab = [...(overlay?.querySelectorAll('[role="tab"]') ?? [])]
        .find((item) => item.getAttribute('aria-selected') === 'true')
      const head = overlay?.querySelector('[data-kanban-header]')
      return {
        pressed: tab?.textContent.trim() ?? '',
        own: panel?.querySelectorAll(selector).length ?? 0,
        cards: panel?.querySelectorAll('[data-item-id]').length ?? 0,
        head: Math.round(head?.getBoundingClientRect().height ?? 0),
      }
    }, view)
    check(`kanban board: the ${view.type} view draws its own content`, drawn && read.own >= 1 && read.pressed !== '', JSON.stringify(read))
    check(`kanban board: the ${view.type} view leaves the top bar its size`, read.head === settled, `now=${read.head} before=${settled}`)
  }
  await clickKanbanView(page, ['看板', 'Board'])
  return styles
}

/**
 * The base type the board draws on. It has to state its own, because it is drawn inside prose in the
 * note and inside nothing in the overlay: prose gives the note 16px/1.65/-0.005em, and a board that
 * inherited that read one size in the note and another in its own view. The app's own base is what the
 * body carries, so this compares against that rather than against a number written here.
 */
async function assertKanbanCanvasBase(page, scope) {
  const base = await page.evaluate((scope) => {
    const canvas = document.querySelector(`${scope} [data-kanban-canvas]`)
    if (!canvas) return null
    const read = (element) => {
      const style = getComputedStyle(element)
      return { family: style.fontFamily, size: style.fontSize, line: style.lineHeight, spacing: style.letterSpacing }
    }
    return { app: read(document.body), board: read(canvas) }
  }, scope)
  check('kanban board: the board draws on the app\'s own base type, not the note\'s', base !== null && JSON.stringify(base.board) === JSON.stringify(base.app), JSON.stringify(base))
}

/**
 * Which top bar the board's **own** width chose, and whether that bar fits the box it was given.
 *
 * The bar used to make every layout decision from the window (`hidden md:inline` on each label), so a
 * 1280px monitor showing a 400px note pane drew the desktop row and wrapped it into three lines above
 * a 480px canvas (user report 2026-09-23). jsdom cannot evaluate a container query, so this is where
 * the two layouts are told apart on a real page: the compact cluster is asserted in the note — where
 * the bar is a few hundred pixels wide — and the wide one in the overlay, which is the same page at
 * the window's width. Both directions matter: a bar stuck in one layout would pass one of the two and
 * fail the other.
 *
 * "One line" is asserted with the compact bar rather than the wide one. The wide row is allowed to
 * wrap on a bar too narrow for it (that is what a full screen window at 900px is), and the complaint
 * was never about the overlay: it was that a note pane paid three lines of chrome for a canvas its own
 * height is capped at 480px. The bar keeping its controls inside its own box is asserted in both.
 */
async function assertKanbanHeaderLayout(page, scope, where, expected) {
  await page.evaluate((scope) => {
    document.querySelector(`${scope} [data-kanban-actions]`)?.scrollIntoView({ block: 'center' })
  }, scope)
  await sleep(240)
  const read = await page.evaluate((scope) => {
    const row = document.querySelector(`${scope} [data-kanban-actions]`)
    if (!row) return null
    const box = row.getBoundingClientRect()
    const drawn = [...row.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().width > 0)
    const trigger = row.querySelector('[data-kanban-overflow]')
    return {
      width: Math.round(box.width),
      controls: drawn.length,
      lines: new Set(drawn.map((button) => Math.round(button.getBoundingClientRect().top))).size,
      // A control wide enough to be carrying words rather than an icon alone.
      labelled: drawn.filter((button) => button.getBoundingClientRect().width > 60).length,
      compact: Math.round(trigger?.getBoundingClientRect().width ?? 0),
      overflow: row.scrollWidth - row.clientWidth,
      spilled: [...row.children]
        .filter((child) => child.getBoundingClientRect().width > 0)
        .filter((child) => child.getBoundingClientRect().right > box.right + 1).length,
    }
  }, scope)
  if (!read) {
    check(`kanban ${where}: the top bar is drawn`, false, 'the bar has no action row')
    return null
  }
  check(
    `kanban ${where}: the bar's own width decided which layout to draw, not the window's`,
    expected === 'compact' ? read.compact > 0 && read.labelled === 0 : read.compact === 0 && read.labelled > 0,
    JSON.stringify(read),
  )
  check(
    `kanban ${where}: the bar keeps its controls inside its own box`,
    read.overflow <= 1 && read.spilled === 0,
    JSON.stringify(read),
  )
  if (expected === 'compact') {
    check(
      `kanban ${where}: the narrow bar costs the canvas one line, not three`,
      read.lines === 1 && read.controls >= 2,
      JSON.stringify(read),
    )
  }
  return read
}

/**
 * The narrow bar's way to the panels it draws no control for.
 *
 * The compact layout is only honest if its menu reaches the same panels the wide bar's labeled
 * controls reach, with a real pointer and from the trigger rather than from the row that was pressed:
 * the row is gone by the time the panel draws, so a panel anchored to it would land nowhere. The two
 * rows exercised here are the filter and the sort, which are the two the wide bar also draws as
 * labeled controls — the same relation `assertKanbanPanelAnchoring` measures on that side.
 */
async function assertKanbanOverflowMenu(page, scope, where) {
  const target = await page.evaluate((scope) => {
    const trigger = document.querySelector(`${scope} [data-kanban-actions] [data-kanban-overflow]`)
    if (!trigger) return null
    trigger.scrollIntoView({ block: 'center' })
    const box = trigger.getBoundingClientRect()
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const hit = document.elementFromPoint(x, y)
    return { x, y, width: Math.round(box.width), hittable: Boolean(hit) && (hit === trigger || trigger.contains(hit)) }
  }, scope)
  check(
    `kanban ${where}: the bar offers one control for the panels it cannot draw, and the pointer reaches it`,
    Boolean(target) && target.width > 0 && target.hittable,
    JSON.stringify(target),
  )
  if (!target) return
  for (const rowLabels of [LABELS.kanbanFilterRow, LABELS.kanbanSortRow]) {
    await page.mouse.click(target.x, target.y)
    await sleep(340)
    const row = await page.evaluate((labels) => {
      const items = [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
      const found = items.find((item) => labels.some((label) => (item.textContent ?? '').includes(label)))
      if (!found) return { found: false, offered: items.map((item) => (item.textContent ?? '').trim().slice(0, 16)) }
      const box = found.getBoundingClientRect()
      return { found: true, x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
    }, rowLabels)
    check(`kanban ${where}: the menu offers the ${rowLabels[1]} row the wide bar draws as a control`, row.found, JSON.stringify(row))
    if (!row.found) continue
    await page.mouse.click(row.x, row.y)
    await sleep(340)
    const panel = await page.evaluate((scope) => {
      const trigger = document.querySelector(`${scope} [data-kanban-actions] [data-kanban-overflow]`)
      const triggerBox = trigger?.getBoundingClientRect()
      const open = [...document.querySelectorAll(`${scope} [data-kanban-panel]`)]
        .find((node) => node.getBoundingClientRect().height > 0)
      const box = open?.getBoundingClientRect()
      const surface = document.querySelector(scope)?.getBoundingClientRect()
      return {
        opened: Boolean(open),
        named: Boolean(open?.getAttribute('aria-label')),
        under: Boolean(box && triggerBox) && box.top >= triggerBox.bottom - 1,
        inTree: Boolean(open?.closest(scope)),
        insideSurface: Boolean(box && surface) && box.left >= surface.left - 1 && box.right <= surface.right + 1 && box.bottom <= surface.bottom + 1,
        menu: document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]').length,
      }
    }, scope)
    check(
      `kanban ${where}: the ${rowLabels[1]} row opens the board's own panel under the trigger`,
      panel.opened && panel.named && panel.under && panel.inTree,
      JSON.stringify(panel),
    )
    check(`kanban ${where}: the ${rowLabels[1]} row's panel stays inside the bar's own surface`, panel.insideSurface, JSON.stringify(panel))
    check(`kanban ${where}: the menu closes behind the ${rowLabels[1]} panel it opened`, panel.menu === 0, JSON.stringify(panel))
    await page.keyboard.press('Escape')
    await sleep(260)
  }
  // The last press leaves the bar as it was found: menu shut, no panel open behind the next scenario.
  await page.keyboard.press('Escape')
  await sleep(240)
}

/**
 * Where the top bar's panels land, and the reason this exists at all.
 *
 * Every panel the board opens used to be `absolute right-0 top-full`, and `right-0` resolved against
 * `data-kanban-actions` — the whole action row rather than the control inside it — so the filter, the
 * sort, the view options, the CSV door and the archive shelf all opened in the same corner of the row
 * instead of under the control that asked for them. The toolbar sweep above only ever asked whether a
 * bar kept its height, so nothing in this gate could see it (user report 2026-09-23).
 *
 * What is measured is the relation: the panel is under its own control, it is wholly inside the
 * surface it belongs to (the block in the note — 292px wide at a 1280px window, which is why a 320px
 * panel has to be squeezed rather than placed — and the whole window in the overlay), it lines up with
 * its control's trailing edge whenever the room for that exists, and it stays in the tree it was
 * opened from. That last one is not decoration: the full screen board is a `Modal` whose focus trap
 * cycles `Tab` inside the dialog's own subtree, so a panel parked on the body would be unreachable by
 * keyboard, which is why the fix places them by hand instead of portaling them.
 *
 * "Whenever the room exists" is spelled out rather than relaxed away: a control near the right edge of
 * a narrow block cannot have a wide panel's trailing edge on its own, and asserting it anyway would
 * only make the gate fail for a geometry no placement could satisfy. The room is computed from the
 * measured boxes, so the alignment is still required everywhere it is achievable — including the whole
 * overlay, where the original defect (every panel in the row's corner) is caught outright.
 *
 * Each control is pressed with a real pointer, and `aria-controls` is followed rather than guessed: a
 * panel that is not the box its own button names is a panel wired to the wrong control. The pointer's
 * mark is checked too, since the note's scroll area reaches under the app's fixed bottom bar and a
 * press that lands there would be measuring whatever it hit instead.
 */
async function assertKanbanPanelAnchoring(page, scope, where) {
  await page.evaluate((scope) => {
    document.querySelector(`${scope} [data-kanban-actions]`)?.scrollIntoView({ block: 'center' })
  }, scope)
  await sleep(240)
  // Only the controls the bar actually draws: a header that offers a compact layout as well as a wide
  // one keeps both in the document and lets a container query choose, so the hidden half reports a zero
  // box and a press at its "centre" would land in the viewport's corner. One drawn trigger is the floor
  // rather than four, which is why the narrow bar's own trigger counts here: it draws no dialog-panel
  // control at all, and the panels behind it are the ones `assertKanbanOverflowMenu` presses by hand.
  // The two kinds are told apart rather than pooled — only a dialog trigger opens a panel this
  // function knows how to read (`aria-controls` → the named panel), while both are pressed here at the
  // place the pointer would have to reach.
  const triggers = await page.evaluate((scope) => {
    const row = document.querySelector(`${scope} [data-kanban-actions]`)
    if (!row) return null
    return [...row.querySelectorAll('button[aria-haspopup="dialog"], button[aria-haspopup="menu"]')]
      .filter((button) => button.getBoundingClientRect().width > 0)
      .map((button) => {
        const box = button.getBoundingClientRect()
        const x = Math.round(box.left + box.width / 2)
        const y = Math.round(box.top + box.height / 2)
        const hit = document.elementFromPoint(x, y)
        return {
          name: button.getAttribute('aria-label') ?? button.textContent.trim(),
          dialog: button.getAttribute('aria-haspopup') === 'dialog',
          x,
          y,
          // The pointer has to land on the control itself, not on something drawn over it.
          hittable: Boolean(hit) && (hit === button || button.contains(hit)),
        }
      })
  }, scope)
  check(
    `kanban ${where}: the top bar offers its triggers to press, and the pointer reaches them`,
    (triggers?.length ?? 0) >= 1 && triggers.every((trigger) => trigger.hittable),
    JSON.stringify(triggers),
  )
  if (!triggers) return
  const controls = triggers.filter((trigger) => trigger.dialog)
  for (const control of controls) {
    await page.mouse.click(control.x, control.y)
    await sleep(340)
    const read = await page.evaluate(({ scope, name }) => {
      // The clearance a panel keeps from an edge, which is also the room the alignment needs.
      const MARGIN = 8
      const found = [...document.querySelectorAll(`${scope} [data-kanban-actions] button[aria-haspopup="dialog"]`)]
        .find((button) => (button.getAttribute('aria-label') ?? button.textContent.trim()) === name)
      const panelId = found?.getAttribute('aria-controls') ?? ''
      const panel = panelId ? document.getElementById(panelId) : null
      const controlBox = found?.getBoundingClientRect()
      const box = panel?.getBoundingClientRect()
      const surface = document.querySelector(scope)?.getBoundingClientRect()
      return {
        name,
        named: panelId !== '',
        panel: Boolean(panel),
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
        under: Boolean(box && controlBox) && box.top >= controlBox.bottom - 1,
        aligned: Boolean(box && controlBox) && Math.abs(box.right - controlBox.right) <= 8,
        // Whether the panel's own width even fits to the right of its control inside the surface: if
        // it does not, no placement can put the two trailing edges together, and the panel is drawn
        // as far right as the surface allows instead.
        alignmentPossible: Boolean(box && controlBox && surface) &&
          controlBox.right - surface.left >= box.width + MARGIN,
        insideSurface:
          Boolean(box && surface) &&
          box.left >= surface.left - 1 &&
          box.top >= surface.top - 1 &&
          box.right <= surface.right + 1 &&
          box.bottom <= surface.bottom + 1,
        insideWindow:
          Boolean(box) &&
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= window.innerWidth + 1 &&
          box.bottom <= window.innerHeight + 1,
        inTree: Boolean(panel?.closest(scope)),
      }
    }, { scope, name: control.name })
    check(
      `kanban ${where}: ${read.name} opens the panel its own button names`,
      read.named && read.panel && read.height > 0,
      JSON.stringify(read),
    )
    check(
      `kanban ${where}: ${read.name} draws that panel under itself, not under the action row`,
      read.under,
      JSON.stringify(read),
    )
    check(
      `kanban ${where}: ${read.name} keeps its panel whole inside its surface and the window`,
      read.insideSurface && read.insideWindow && read.inTree,
      JSON.stringify(read),
    )
    check(
      `kanban ${where}: ${read.name} lines the panel up with its own trailing edge when the room is there`,
      !read.alignmentPossible || read.aligned,
      JSON.stringify(read),
    )
    // Escape first, because a control that only ever opens is not the same control twice; the second
    // press is the fallback for the ones that do toggle.
    await page.keyboard.press('Escape')
    await sleep(240)
    const stillOpen = await page.evaluate(({ scope, name }) => {
      const found = [...document.querySelectorAll(`${scope} [data-kanban-actions] button[aria-haspopup="dialog"]`)]
        .find((button) => (button.getAttribute('aria-label') ?? button.textContent.trim()) === name)
      const panelId = found?.getAttribute('aria-controls') ?? ''
      return panelId !== '' && Boolean(document.getElementById(panelId))
    }, { scope, name: control.name })
    if (stillOpen) {
      await page.mouse.click(control.x, control.y)
      await sleep(240)
    }
  }
}

/**
 * The selected view tab, which has to read as selected on a light theme as well.
 *
 * The strip painted its selection in `--bg-raised` on a header of `--bg-surface`, and on both light
 * themes those two tokens are the same colour — so the reader who reported "the inline board shows
 * which tab is active and the full screen one does not" was looking at a selection that was not
 * drawn at all (user report 2026-09-23). The toolbar sweep above asks whether a bar keeps its height
 * and which controls it names; it never asked what a control was painted in, so nothing here could
 * see it.
 *
 * What is measured is the tab's own background against the colour already behind it (the first
 * ancestor that paints one, which is the header): a tab that repeats it is the old defect, whatever
 * token it names. `check-contrast.mjs` covers the other half in the same session — the accent pair
 * the selection now wears is calibrated for all seven accents there, in both themes.
 *
 * The scroll half is what the strip owes a board with more views than fit: the selected tab has to be
 * inside the strip's own box, or the reader is looking at a row that does not contain the tab the
 * board is showing. It is asserted as that invariant rather than by parking the strip and selecting
 * from the keyboard, and the reason is worth writing down: `focus()` scrolls its element into view by
 * itself, so every keyboard path here self-reveals and would pass with no help from the board. What
 * the board has to do is the case no browser will do for it — a view created, duplicated, deleted or
 * renamed from the header's menus changes the selection without moving focus — and that is carried by
 * exact geometry in `kanban-view-tabs-selection.test.ts` instead, where the strip's measurements are
 * given to it. What this pass adds is that the invariant holds on a real strip whose width it reports.
 */
async function assertKanbanActiveTab(page, scope, where) {
  const read = () => page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const strip = root?.querySelector('[role="tablist"]')
    const selected = strip?.querySelector('[role="tab"][aria-selected="true"]')
    const box = selected?.getBoundingClientRect()
    const stripBox = strip?.getBoundingClientRect()
    // The colour already behind the tab: the first ancestor that paints one. A transparent parent
    // (the tablist itself) says nothing about what the reader sees behind the tab.
    let behind = 'transparent'
    for (let node = selected?.parentElement; node; node = node.parentElement) {
      const painted = getComputedStyle(node).backgroundColor
      if (painted && painted !== 'transparent' && painted !== 'rgba(0, 0, 0, 0)') {
        behind = painted
        break
      }
    }
    return {
      tabs: strip?.querySelectorAll('[role="tab"]').length ?? 0,
      selectedCount: strip?.querySelectorAll('[role="tab"][aria-selected="true"]').length ?? 0,
      selected: selected?.textContent?.trim() ?? '',
      background: selected ? getComputedStyle(selected).backgroundColor : '',
      behind,
      width: Math.round(box?.width ?? 0),
      inside: Boolean(box && stripBox) && box.left >= stripBox.left - 1 && box.right <= stripBox.right + 1,
      scrollLeft: Math.round(strip?.scrollLeft ?? -1),
      // Whether the strip has anywhere to scroll at all. At a full-screen width the gate's six views
      // may fit, and "the selected tab came back into view" is not a claim that can be tested on a
      // strip that never moved — the note half of this pass is where that happens, and the widths are
      // reported so a run where neither half overflowed is visible rather than silently green.
      overflows: Boolean(strip) && strip.scrollWidth > strip.clientWidth + 1,
      stripWidth: Math.round(strip?.clientWidth ?? 0),
    }
  }, scope)
  const before = await read()
  check(
    `kanban ${where}: the view strip offers tabs and exactly one of them is selected`,
    before.tabs > 1 && before.selectedCount === 1 && before.selected.length > 0,
    JSON.stringify(before),
  )
  check(
    `kanban ${where}: the selected tab is painted, not the colour already behind it`,
    before.background !== '' && before.background !== before.behind,
    JSON.stringify(before),
  )
  check(
    `kanban ${where}: the selected tab is inside the strip's own visible box`,
    before.inside && before.width > 0,
    JSON.stringify(before),
  )
  console.log(
    `  · kanban ${where}: ${before.tabs} tabs in a ${before.stripWidth}px strip, ${before.overflows ? `scrolled ${before.scrollLeft}px in` : 'all of them fitting'}, selected "${before.selected}" at ${before.width}px`,
  )
}

/**
 * The surfaces the board is drawn with, read as the app really painted them.
 *
 * Two claims, both of them about a light theme where four tokens answer to the same colour (user
 * report 2026-09-23: the board's surfaces all looked alike): the plane is `--bg-inset` and each step
 * up from it is the token that means "one step up" — a column on `--bg-surface`, a card on
 * `--bg-raised` — and a column's own colour is painted on it rather than filed away in a dot, so two
 * columns wearing different colours cannot come out the same colour.
 *
 * It is read from the tokens rather than from the two hex values this run happens to draw, because
 * "the ladder" is a relation between tokens: in the light theme a column and a card are the same
 * white, and only the token says which of the two is the step above. What makes them tellable apart
 * on screen — the card's shadow and border — is the browser's business on the same page, and the
 * pairs any text on the tint makes are judged by `check-contrast.mjs`.
 */
async function assertKanbanSurfaces(page, scope, where) {
  // The ladder is a claim about the board view, and the board view is the one with columns in it. The
  // tab is pressed rather than assumed: this assertion runs after other steps that press tabs, and a
  // read of whichever view they left open would be a read of no columns at all.
  const onBoard = await pressKanbanView(page, scope, KANBAN_VIEWS[0].labels)
  check(`kanban ${where}: the board view is the one the surfaces are read in`, Boolean(onBoard.pressed), JSON.stringify(onBoard))
  const read = await page.evaluate((scope) => {
    const painted = (node) => (node ? getComputedStyle(node).backgroundColor : '')
    const transparent = (colour) => !colour || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)'
    const root = document.querySelector(scope)
    const board = root?.querySelector('[data-kanban-board]')
    // The plane is whatever paints behind the board: the note's block, or the overlay's stage. Read
    // by walking up rather than by naming a class, so the same pass works in both places.
    let plane = root
    for (let node = board?.parentElement; node; node = node.parentElement) {
      if (!transparent(painted(node))) {
        plane = node
        break
      }
    }
    // What the walk saw, so a failure says which ancestor was picked rather than only its colour.
    const chain = []
    for (let node = board?.parentElement; node && chain.length < 8; node = node.parentElement) {
      chain.push({ tag: node.tagName.toLowerCase(), className: (node.className || '').toString().slice(0, 60), background: painted(node) })
    }
    const probe = document.createElement('div')
    document.body.append(probe)
    const token = (name) => {
      probe.style.backgroundColor = 'transparent'
      probe.style.backgroundColor = `var(${name})`
      return getComputedStyle(probe).backgroundColor
    }
    const tokens = { inset: token('--bg-inset'), surface: token('--bg-surface'), raised: token('--bg-raised') }
    probe.remove()
    return {
      plane: painted(plane),
      chain,
      column: painted(board?.querySelector('[data-kanban-group]')),
      card: painted(board?.querySelector('[data-item-id]')),
      bands: [...(board?.querySelectorAll('[data-kanban-column-head]') ?? [])].map((band) => ({
        colour: band.getAttribute('data-kanban-column-tint') ?? '',
        background: painted(band),
      })),
      tokens,
    }
  }, scope)
  const banded = read.bands.filter((band) => band.colour !== '')
  check(
    `kanban ${where}: a column is the step above the plane and a card is the step above the column`,
    read.plane === read.tokens.inset && read.column === read.tokens.surface && read.card === read.tokens.raised,
    JSON.stringify(read),
  )
  check(
    `kanban ${where}: the plane under the columns is not the column's own surface`,
    read.plane !== read.column,
    JSON.stringify(read),
  )
  check(
    `kanban ${where}: columns wearing different colours are painted in different colours (${banded.map((band) => band.colour).join(', ')})`,
    banded.length >= 2 && new Set(banded.map((band) => band.background)).size === banded.length &&
      banded.every((band) => band.background !== read.column),
    JSON.stringify(read),
  )
}

/**
 * The block is as tall as its columns need and no taller (KU-06). A board is a flex row, and a flex row
 * stretches its children to the tallest of them: every column used to be drawn as tall as the block's
 * fixed 480px canvas, so a reader looking at three short columns saw two or three rows of their own
 * column's background under the last card, and the horizontal scrollbar sat at the bottom of that
 * emptiness rather than under the columns (user report 2026-09-23).
 *
 * Three numbers, and each one is load-bearing. A column that is taller than what it draws means it was
 * stretched; a canvas taller than the tree it draws means the block is still holding a height nobody
 * asked for; and a canvas shorter than that tree means something is being clipped — which is what the
 * ceiling used to do: it was written on the canvas, the block's whole box, so the header and the
 * overdue-notice strip spent the board's own budget and the bottom of the board (its scrollbar with it)
 * fell outside the canvas's `overflow: hidden`. The ceiling is the board's now (styles/kanban.css), and
 * the block hugs the chrome plus the board. Read in both the note and the overlay, because the two get
 * their height from different rules.
 *
 * The tree is read as the boxes the canvas's own root lays out — the top bar, the notice strip, the view
 * panel and anything else a state adds — rather than as a named sum: the check is "the block covers what
 * it draws", and a reader who has to update this line every time the block gains a strip is a check that
 * goes stale quietly.
 */
async function assertKanbanColumnHeights(page, scope, where) {
  const read = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const canvas = root?.querySelector('[data-kanban-canvas]')
    const board = root?.querySelector('[data-kanban-board]')
    if (!canvas || !board) return { reason: 'this surface draws no board' }
    /**
     * How much of a box has nothing drawn under its own content, in pixels. `box.bottom` less where the
     * last thing inside it ends, less the box's own bottom padding: a box that hugs its content scores
     * 0, one that was stretched to a height it was handed scores the slack it got for free, and one
     * that is capped and scrolling scores negative (its content runs past it, which is the point).
     *
     * Measured from the painted boxes rather than from `scrollHeight`, which cannot answer this at all:
     * `scrollHeight` is never smaller than `clientHeight`, so a box with 250px of nothing in it reports
     * its content as filling it.
     */
    const slackIn = (box, content, paddingBottom) => {
      if (!box || !content) return null
      return Math.round(box.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom - paddingBottom)
    }
    const padBottom = (node) => Number.parseFloat(getComputedStyle(node).paddingBottom) || 0
    // The column's slack is read two levels down on purpose: the column hands its spare room to the
    // list, and the list hands it to the space after the last thing it draws.
    const columns = [...board.querySelectorAll('[data-kanban-group]')].flatMap((column) => {
      const list = column.lastElementChild
      const content = list?.lastElementChild
      const slack = slackIn(list, content, list ? padBottom(list) : 0)
      if (slack === null) return []
      return [{
        key: column.getAttribute('data-kanban-group') ?? '',
        height: Math.round(column.getBoundingClientRect().height),
        slack,
        drawn: Math.round(list.getBoundingClientRect().height - slack - padBottom(list)),
      }]
    })
    const round = (node) => Math.round(node.getBoundingClientRect().height)
    const children = canvas.firstElementChild ? [...canvas.firstElementChild.children] : []
    return {
      rows: columns.length,
      canvas: round(canvas),
      board: round(board),
      // The header is drawn above the board and inside the canvas, so a canvas that stops at the board
      // would cut the controls off; the space the block has to cover is the whole tree inside it.
      header: Math.round(root?.querySelector('[data-kanban-header]')?.getBoundingClientRect().height ?? 0),
      // The overlay fills the stage it is given; only the note is supposed to give space back.
      fullscreen: canvas.classList.contains('is-fullscreen'),
      columns,
      // The boxes the canvas has to cover, top to bottom: the board's own root is the canvas's single
      // child, and its children are the chrome and the view's panel. They travel with the read so a
      // failure names what the canvas was measured against instead of re-deriving it.
      drawn: children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0),
      children: children.map((child) => ({
        tag: child.tagName.toLowerCase(),
        cls: (child.getAttribute('class') ?? '').slice(0, 48),
        height: Math.round(child.getBoundingClientRect().height),
      })),
      view: canvas?.querySelector('[data-kanban-view-type]')?.getAttribute('data-kanban-view-type') ??
        canvas?.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '',
    }
  }, scope)
  if (read.reason) {
    check(`kanban ${where}: the board view is the one the column heights are read in (${read.reason})`, false, JSON.stringify(read))
    return
  }
  // The two defects, and each read where it is actually visible.
  //
  // First the stretch. A flex row hands every column the height of the tallest of them, so a column
  // with two cards in it held a couple of hundred pixels of its own background under them — the rows
  // of empty column the report was about. Positive slack is exactly that. A column that is *capped* and
  // scrolling (more cards than the cap holds) scores negative instead, and that is the arrangement the
  // fix has to preserve rather than the defect it removes.
  const stretched = read.columns.filter((column) => column.slack > 1)
  check(
    `kanban ${where}: no column is stretched past the cards it draws`,
    read.rows > 0 && stretched.length === 0,
    JSON.stringify({ stretched: stretched.slice(0, 3), rows: read.rows }),
  )
  // Then the block itself: with the columns no longer filling it, a canvas still sized to the old fixed
  // height would show as plane under a short board. The canvas has to cover what it draws — the top bar,
  // the notice strip, the view's panel — with nothing held beyond it and nothing clipped inside it.
  // Neither check reads the board's own slack: its last child is the add-column button, which is short
  // by design, not a column with room to spare.
  //
  // Only the note gives space back: in its own overlay the canvas fills the stage it was given, and a
  // plane that stopped at the last card would leave the note's furniture under a full screen board.
  const extra = { canvas: read.canvas, drawn: read.drawn, board: read.board, header: read.header, view: read.view, children: read.children }
  check(
    `kanban ${where}: the block is no taller than the tree it draws`,
    read.fullscreen || read.canvas <= read.drawn + 1,
    JSON.stringify(extra),
  )
  check(
    `kanban ${where}: the block is tall enough for the tree it draws`,
    read.canvas >= read.drawn - 1,
    JSON.stringify(extra),
  )
}

/**
 * A card's title opens the detail on the click it receives — no window, no waiting — and rename lives
 * on the pencil the title row carries and on `F2`, driven here with a real pointer.
 *
 * History worth keeping: the title used to carry two pointer gestures, and the open waited a quarter
 * second for a second click that would rename — a wait the reader paid on every open, and the rename
 * it protected could not run anyway, because the dialog's own overlay ate the second press (user
 * report, 2026-09-23). What is asserted now is the contract that replaced it: one click opens a dialog
 * within a beat, and the pencil opens a rename field over the same board — never a dialog — whose
 * Escape cancels without closing anything else.
 */
async function assertKanbanTitleGestures(page, scope, where) {
  const aimed = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const title = root?.querySelector('[data-item-id] h3 button')
    if (!title) return { reason: 'this surface draws no card title' }
    title.scrollIntoView({ block: 'center' })
    const box = title.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the card title has no box' }
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const under = document.elementFromPoint(x, y)
    const card = title.closest('[data-item-id]')
    return {
      x,
      y,
      hit: Boolean(under && title.contains(under)),
      text: title.textContent?.trim() ?? '',
      itemId: card?.getAttribute('data-item-id') ?? '',
      // Read the way `readCardTitleState` reads it, document-wide, because the two numbers are compared:
      // the card window is portalled to the body, and the board's own overlay is a dialog too. A count
      // scoped to the surface is a count of a *different set* — it saw 0 with the overlay open (the
      // element carrying `role=dialog` is the surface root, which `querySelectorAll` does not return).
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }
  }, scope)
  // The pointer has to land on the title itself: the note's board sits in a pane whose scrollport
  // reaches under the app's fixed footer, and a press that lands there is a press on something else.
  check(`kanban ${where}: the card title can be clicked (${aimed.reason ?? aimed.text})`, aimed.hit === true, JSON.stringify(aimed))
  if (!aimed.hit) return

  // One full press/release pair: the detail is a dialog the moment the click lands.
  await page.mouse.move(aimed.x, aimed.y)
  await page.mouse.down({ clickCount: 1 })
  await page.mouse.up({ clickCount: 1 })
  await sleep(150)
  const opened = await readCardTitleState(page, scope, aimed.itemId)
  check(`kanban ${where}: one click opens the card's detail at once`, opened.dialogs === aimed.dialogs + 1, JSON.stringify({ before: aimed.dialogs, after: opened.dialogs }))

  await page.keyboard.press('Escape')
  await sleep(150)
  const closed = await readCardTitleState(page, scope, aimed.itemId)
  check(`kanban ${where}: escape closes the detail and leaves no rename field`, closed.dialogs === aimed.dialogs && closed.editing === false, JSON.stringify(closed))

  // The rename goes through the pencil beside the title: hovering the card reveals it, and its press
  // must draw a field without opening any dialog over the board.
  const pencil = await page.evaluate((itemId) => {
    const card = document.querySelector(`[data-item-id="${itemId}"]`)
    const button = card?.querySelector('[data-kanban-rename-card]')
    if (!button) return null
    const box = button.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, aimed.itemId)
  check(`kanban ${where}: the card draws a rename pencil`, pencil !== null, JSON.stringify(pencil))
  if (!pencil) return
  await page.mouse.move(pencil.x, pencil.y)
  await page.mouse.click(pencil.x, pencil.y)
  await sleep(150)
  const renamed = await readCardTitleState(page, scope, aimed.itemId)
  check(`kanban ${where}: the pencil turns the card title into a field`, renamed.editing === true, JSON.stringify(renamed))
  check(
    `kanban ${where}: renaming opens no dialog over the board`,
    renamed.dialogs === aimed.dialogs,
    JSON.stringify({ before: aimed.dialogs, after: renamed.dialogs }),
  )

  await page.keyboard.press('Escape')
  await sleep(150)
  const cancelled = await readCardTitleState(page, scope, aimed.itemId)
  check(`kanban ${where}: escape leaves the rename without writing a new title`, cancelled.editing === false, JSON.stringify(cancelled))
}

/**
 * A column's footer is a title field rather than a button that opens the card's window (KU-13). What is
 * measured is the errand a reader runs: press the footer open, type a title, press Enter, and the card is
 * filed in that column with nothing opened over the board and the focus still in the field for the next
 * title. Escape then puts the field away and hands the focus back to the button that opened it.
 *
 * The card this writes is undone before the function returns: the gate writes into the board it then
 * reads, and the assertions that follow count the cards on it.
 */
async function assertKanbanQuickAdd(page, scope, where) {
  const opened = await page.evaluate(({ scope, labels }) => {
    const root = document.querySelector(scope)
    const button = [...(root?.querySelectorAll('[data-kanban-group] button') ?? [])].find((element) =>
      labels.includes(element.textContent.trim()),
    )
    if (!button) return { reason: 'no column footer button on screen' }
    button.scrollIntoView({ block: 'center' })
    const box = button.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the column footer button has no box' }
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const under = document.elementFromPoint(x, y)
    return {
      x,
      y,
      hit: Boolean(under && button.contains(under)),
      group: button.closest('[data-kanban-group]')?.getAttribute('data-kanban-group') ?? '',
      dialogs: root?.querySelectorAll('[role="dialog"]').length ?? -1,
    }
  }, { scope, labels: KANBAN_NEW_ITEM_LABELS })
  check(`kanban ${where}: a column footer offers a new card (${opened.reason ?? opened.group})`, opened.hit === true, JSON.stringify(opened))
  if (!opened.hit) return

  await page.mouse.move(opened.x, opened.y)
  await page.mouse.down({ clickCount: 1 })
  await page.mouse.up({ clickCount: 1 })
  await sleep(200)
  const field = await readQuickAddState(page, scope)
  check(`kanban ${where}: the footer button opens a title field in its place`, field.fields === 1, JSON.stringify(field))
  check(`kanban ${where}: that field takes the focus`, field.focused === true, JSON.stringify(field))

  // A real keystroke per character, so the input's own change tracking is what builds the title.
  await page.keyboard.type('Gate quick add')
  await page.keyboard.press('Enter')
  await sleep(300)
  const added = await readQuickAddState(page, scope)
  check(`kanban ${where}: Enter files the typed card in that column`, added.filed.includes('Gate quick add'), JSON.stringify(added.filed))
  check(
    `kanban ${where}: typing a card opens nothing over the board`,
    added.dialogs === opened.dialogs,
    JSON.stringify({ before: opened.dialogs, after: added.dialogs }),
  )
  check(`kanban ${where}: the field keeps the focus for the next title`, added.focused === true, JSON.stringify(added))
  check(`kanban ${where}: the field clears itself once the card is filed`, added.value === '', JSON.stringify(added))
  check(`kanban ${where}: the region says which title landed`, added.announcement.includes('Gate quick add'), JSON.stringify(added.announcement))

  await page.keyboard.press('Escape')
  await sleep(200)
  const closed = await readQuickAddState(page, scope)
  check(
    `kanban ${where}: Escape puts the field away and hands the focus back to its button`,
    closed.fields === 0 && KANBAN_NEW_ITEM_LABELS.includes(closed.focusText),
    JSON.stringify({ fields: closed.fields, focus: closed.focusText }),
  )

  const undone = await page.evaluate(({ scope, labels }) => {
    const button = [...(document.querySelector(scope)?.querySelectorAll('button') ?? [])].find((element) =>
      labels.includes(element.getAttribute('aria-label') ?? ''),
    )
    if (!button) return { reason: 'the board offers no undo control' }
    button.click()
    return { pressed: true }
  }, { scope, labels: ['Undo', '撤销'] })
  await sleep(300)
  const reverted = await readQuickAddState(page, scope)
  check(
    `kanban ${where}: the card this wrote is taken back off the board (${undone.reason ?? 'undone'})`,
    undone.pressed === true && !reverted.filed.includes('Gate quick add'),
    JSON.stringify(reverted.filed),
  )
}

/**
 * The board's own keyboard (KU-14), run with real key events.
 *
 * Two halves, because the board grew two things: chords it answers to itself (the arrows walk the focus,
 * `N` files a card, `/` opens the search) and a reference card that says so. The chords used to exist
 * only as scattered `onKeyDown` handlers on cards, which nothing could enumerate — the arrow keys are
 * now one table in `kanban-board-keys.tsx`, and the card the reader opens is drawn from that same table,
 * so this asserts the table's behaviour and the card's existence rather than a hand-written list.
 *
 * The focus is primed on a card's own title button — the control whose Enter opens the detail — and
 * every press after that goes through the browser's key pipeline: a handler that listens for the wrong
 * phase, swallows the press, or reads the wrong element is caught here and not by a synthetic
 * `dispatchEvent` in a jsdom test.
 *
 * The card `N` files is taken back off the board with the board's own undo control before returning,
 * since the scenarios after this one count the cards the fixture brought with it.
 */
async function assertKanbanKeyboard(page, scope, where, { viaMenu }) {
  const primed = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const title = root?.querySelector('[data-item-id] h3 button')
    if (!title) return { reason: 'this surface draws no card title to stand on' }
    title.scrollIntoView({ block: 'center' })
    const box = title.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the card title has no box' }
    title.focus()
    const card = title.closest('[data-item-id]')
    return {
      itemId: card?.getAttribute('data-item-id') ?? '',
      group: card?.closest('[data-kanban-group]')?.getAttribute('data-kanban-group') ?? '',
    }
  }, scope)
  check(`kanban ${where}: a card title takes the focus to walk from (${primed.reason ?? primed.itemId})`, primed.itemId !== '', JSON.stringify(primed))
  if (primed.itemId === '') return

  await page.keyboard.press('ArrowDown')
  await sleep(160)
  const down = await readKanbanFocus(page, scope)
  check(
    `kanban ${where}: the down arrow walks to the next card of that column`,
    down.itemId !== '' && down.itemId !== primed.itemId && down.group === primed.group,
    JSON.stringify({ from: primed.itemId, to: down.itemId, group: down.group }),
  )
  await page.keyboard.press('ArrowUp')
  await sleep(160)
  const up = await readKanbanFocus(page, scope)
  check(`kanban ${where}: the up arrow walks back where it came from`, up.itemId === primed.itemId, JSON.stringify(up))

  // Sideways: the column beside the first one is empty on this fixture, and an arrow that skips an
  // empty column would move a reader somewhere they did not ask to be. So the card that makes the walk
  // possible is filed here first, through the column's own footer — and taken back once the walk is
  // read, because the scenarios after this one count the cards this board is holding.
  const beside = await fileCardInColumn(page, scope, 1, 'Gate keyboard card')
  check(`kanban ${where}: the column beside the first one takes a card (${beside.reason ?? beside.key})`, beside.filed === true, JSON.stringify(beside))
  if (beside.filed === true) {
    await page.keyboard.press('Escape')
    await sleep(200)
    await refocusCard(page, scope, primed.itemId)
    await page.keyboard.press('ArrowRight')
    await sleep(180)
    const right = await readKanbanFocus(page, scope)
    check(
      `kanban ${where}: the right arrow crosses into the column beside it`,
      right.text === 'Gate keyboard card' && right.group === beside.key,
      JSON.stringify({ from: primed.group, to: right.group, text: right.text }),
    )
    await page.keyboard.press('ArrowLeft')
    await sleep(180)
    const left = await readKanbanFocus(page, scope)
    check(`kanban ${where}: the left arrow walks back into the column it came from`, left.itemId === primed.itemId, JSON.stringify(left))
    await pressUndo(page, scope)
    await sleep(320)
  }

  await refocusCard(page, scope, primed.itemId)
  await page.keyboard.press('ArrowRight')
  await sleep(180)
  const blocked = await readKanbanFocus(page, scope)
  check(
    `kanban ${where}: a column with no cards beside it is not skipped over`,
    blocked.itemId === primed.itemId && blocked.group === primed.group,
    JSON.stringify(blocked),
  )

  await page.keyboard.press('/')
  await sleep(240)
  const searched = await readKanbanKeyboardState(page, scope)
  check(`kanban ${where}: slash opens the board's search field and puts the reader in it`, searched.searchFocused === true, JSON.stringify(searched))
  // The field stays open by design (a query that is filtered by has to stay visible), so the focus is
  // put back on a card before the next chord: a key pressed inside a field belongs to that field.
  await refocusCard(page, scope, primed.itemId)
  await sleep(120)

  const before = await readKanbanKeyboardState(page, scope)
  await refocusCard(page, scope, primed.itemId)
  await page.keyboard.press('n')
  await sleep(320)
  const after = await readKanbanKeyboardState(page, scope)
  check(
    `kanban ${where}: N opens a column's own title field and puts the reader in it`,
    after.fields === before.fields + 1 && after.fieldFocused === true,
    JSON.stringify({ before: before.fields, after: after.fields, focused: after.fieldFocused }),
  )
  check(
    `kanban ${where}: N files no card behind a window over the board`,
    after.cards === before.cards && after.dialogs === before.dialogs,
    JSON.stringify({ cards: [before.cards, after.cards], dialogs: [before.dialogs, after.dialogs] }),
  )
  // The field the chord opened is put away the way a reader would: Escape, which hands the focus back
  // to the control that stands there when the field is closed. Nothing is left open for the reference
  // card that follows.
  await page.keyboard.press('Escape')
  await sleep(240)
  const closed = await readKanbanKeyboardState(page, scope)
  check(
    `kanban ${where}: escape puts the field away and leaves the board as it was`,
    closed.fields === before.fields && closed.doors === before.doors && closed.cards === before.cards,
    JSON.stringify({ fields: closed.fields, doors: closed.doors, cards: closed.cards }),
  )

  // The reference dismisses itself and asserts that it did, so nothing is pressed here afterwards: an
  // extra Escape would land on whatever the surface put back — in the board view that is the overlay
  // itself, and the scenarios after this one were reading a closed overlay.
  await assertKanbanShortcuts(page, scope, where, { viaMenu })
}

/** Presses the board's own undo control, the way the quick-add scenario above already takes a write back. */
async function pressUndo(page, scope) {
  return page.evaluate(({ scope, labels }) => {
    const button = [...(document.querySelector(scope)?.querySelectorAll('button') ?? [])].find((element) =>
      labels.includes(element.getAttribute('aria-label') ?? ''),
    )
    if (!button) return { reason: 'the board offers no undo control' }
    button.click()
    return { pressed: true }
  }, { scope, labels: ['Undo', '撤销'] })
}

/** Puts the focus back on one card's title, so a chord lands on the board rather than on a field. */
async function refocusCard(page, scope, itemId) {
  await page.evaluate(({ scope, itemId }) => {
    document.querySelector(`${scope} [data-item-id="${itemId}"] h3 button`)?.focus()
  }, { scope, itemId })
}

/**
 * Files one card into a named column through that column's footer, which is the door KU-13 turned from
 * a button into a title field. What it exists for here is the sideways walk: the arrows cross into the
 * column beside them, and a candidate has to be in it for that to be readable.
 */
async function fileCardInColumn(page, scope, columnIndex, title) {
  const target = await page.evaluate(({ scope, columnIndex, labels }) => {
    const groups = [...(document.querySelector(scope)?.querySelectorAll('[data-kanban-group]') ?? [])]
    const group = groups[columnIndex]
    if (!group) return { reason: 'the board draws no column at that index' }
    const button = [...group.querySelectorAll('button')].find((element) => labels.includes(element.textContent.trim()))
    if (!button) return { reason: 'that column offers no new-card control' }
    button.scrollIntoView({ block: 'center' })
    const box = button.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the column footer has no box' }
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const under = document.elementFromPoint(x, y)
    return { x, y, hit: Boolean(under && button.contains(under)), key: group.getAttribute('data-kanban-group') ?? '' }
  }, { scope, columnIndex, labels: KANBAN_NEW_ITEM_LABELS })
  if (target.hit !== true) return { ...target, filed: false }
  await page.mouse.click(target.x, target.y)
  await sleep(220)
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await sleep(300)
  return { ...target, filed: true }
}

/**
 * The reference card itself, opened the way a reader in this layout would open it: from the toolbar
 * control where the bar has room for one, and from the overflow menu's row where it does not.
 */
async function assertKanbanShortcuts(page, scope, where, { viaMenu }) {
  const opened = await pressBoardTrigger(page, scope, viaMenu)
  check(
    `kanban ${where}: the board offers a keyboard reference (${opened.reason ?? opened.blocker ?? 'control'})`,
    opened.hit === true,
    JSON.stringify(opened),
  )
  if (opened.hit !== true) return

  await page.mouse.click(opened.x, opened.y)
  await sleep(320)
  if (viaMenu) {
    const row = await page.evaluate((labels) => {
      const items = [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
      const found = items.find((item) => labels.some((label) => (item.textContent ?? '').includes(label)))
      if (!found) return { found: false, offered: items.map((item) => (item.textContent ?? '').trim().slice(0, 16)) }
      const box = found.getBoundingClientRect()
      return { found: true, x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
    }, KANBAN_SHORTCUT_LABELS)
    check(`kanban ${where}: the menu offers the keyboard reference the wide bar draws as a control`, row.found, JSON.stringify(row))
    if (!row.found) return
    await page.mouse.click(row.x, row.y)
    await sleep(340)
  }

  const drawn = await page.evaluate(({ scope, labels }) => {
    const root = document.querySelector(scope)
    const bar = root?.querySelector('[data-kanban-actions]')
    const panel = [...(root?.querySelectorAll('[data-kanban-panel]') ?? [])].find((node) =>
      labels.includes(node.getAttribute('aria-label') ?? ''),
    )
    return {
      opened: Boolean(panel),
      rows: panel?.querySelectorAll('li').length ?? -1,
      keys: [...(panel?.querySelectorAll('kbd') ?? [])].map((key) => key.textContent ?? ''),
      text: panel?.textContent ?? '',
      barHeight: Math.round(bar?.getBoundingClientRect().height ?? -1),
      inTree: Boolean(panel?.closest(scope)),
      focusText: document.activeElement?.textContent?.trim() ?? '',
    }
  }, { scope, labels: KANBAN_SHORTCUT_LABELS })
  check(`kanban ${where}: the reference opens as the board's own panel (${drawn.rows} rows)`, drawn.opened && drawn.rows > 0, JSON.stringify({ opened: drawn.opened, rows: drawn.rows }))
  check(
    `kanban ${where}: it lists the keys the board answers to, arrows and doors spelled as keys`,
    drawn.keys.includes('↑') && drawn.keys.includes('↓') && drawn.keys.includes('←') && drawn.keys.includes('→') && drawn.keys.includes('N') && drawn.keys.includes('/'),
    JSON.stringify(drawn.keys),
  )
  check(`kanban ${where}: the reference draws inside the surface it belongs to`, drawn.inTree === true, JSON.stringify(drawn))
  check(
    `kanban ${where}: the reference does not push the top bar open`,
    drawn.barHeight === opened.barHeight,
    JSON.stringify({ before: opened.barHeight, after: drawn.barHeight }),
  )
  await page.keyboard.press('Escape')
  await sleep(240)
  const closed = await page.evaluate(({ scope, labels }) => {
    const root = document.querySelector(scope)
    return {
      panel: [...(root?.querySelectorAll('[data-kanban-panel]') ?? [])].some((node) =>
        labels.includes(node.getAttribute('aria-label') ?? ''),
      ),
      focusText: document.activeElement?.textContent?.trim() ?? '',
      focusLabel: document.activeElement?.getAttribute('aria-label') ?? '',
    }
  }, { scope, labels: KANBAN_SHORTCUT_LABELS })
  // The control it goes back to is the one the reader reached it from, and that is not the same control
  // in the two layouts: the wide bar draws one of its own, while the note's bar has no room for it and
  // the reference is a row of the overflow menu — whose trigger is what stands there when the reference
  // is gone. Expecting the reference's own name in both would fail the note for being right.
  const expected = viaMenu ? LABELS.kanbanMoreActions : KANBAN_SHORTCUT_LABELS
  check(
    `kanban ${where}: Escape puts the reference away and hands the focus back to the control it came from`,
    closed.panel === false && expected.includes(closed.focusLabel),
    JSON.stringify({ ...closed, expected: expected.join('/') }),
  )
}

/** The names the board's keyboard reference answers to, in both languages the gate runs in. */
const KANBAN_SHORTCUT_LABELS = ['键盘快捷键', 'Keyboard shortcuts']

/**
 * The control that opens the keyboard reference in this layout, waited for until a pointer can actually
 * reach it.
 *
 * The wait is the point, and the failure it exists for is a real one rather than a flake: this board
 * writes to the note it lives in, the header carries a write-status chip while a write is in flight, and
 * a chip that pops over a control's centre turns a press into a press on the chip. Re-measuring until the
 * control is what a pointer would hit is also what every other press in this gate does (the harness's
 * `waitForHittable` waits the same way); what is added here is the chain of elements that was in the way
 * when it never became reachable, so the failure names the blocker instead of the symptom.
 */
async function pressBoardTrigger(page, scope, viaMenu) {
  const deadline = Date.now() + 5000
  let last = { reason: 'the trigger was never measured' }
  while (Date.now() < deadline) {
    last = await page.evaluate(({ scope, viaMenu, labels }) => {
      const root = document.querySelector(scope)
      const bar = root?.querySelector('[data-kanban-actions]')
      if (!bar) return { reason: 'this surface draws no action bar' }
      const trigger = viaMenu
        ? bar.querySelector('[data-kanban-overflow]')
        : [...bar.querySelectorAll('button')].find(
            (button) => labels.includes(button.getAttribute('aria-label') ?? '') && button.getBoundingClientRect().width > 0,
          )
      if (!trigger) return { reason: viaMenu ? 'no overflow trigger on screen' : 'the wide bar draws no keyboard reference' }
      trigger.scrollIntoView({ block: 'center' })
      const box = trigger.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return { reason: 'the trigger has no box' }
      const x = Math.round(box.left + box.width / 2)
      const y = Math.round(box.top + box.height / 2)
      const under = document.elementFromPoint(x, y)
      const reached = Boolean(under) && (under === trigger || trigger.contains(under))
      const describe = (node) => {
        if (!node) return 'nothing'
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return `${node.tagName.toLowerCase()}${node.getAttribute('aria-label') ? `[${node.getAttribute('aria-label')}]` : ''} .${String(node.className).split(' ').slice(0, 4).join('.')} ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} <${style.position}|${style.zIndex}|${style.pointerEvents}>`
      }
      return {
        x,
        y,
        hit: reached,
        blocker: reached ? '' : describe(under),
        barHeight: Math.round(bar.getBoundingClientRect().height ?? -1),
        dialogs: root.querySelectorAll('[role="dialog"]').length,
      }
    }, { scope, viaMenu, labels: KANBAN_SHORTCUT_LABELS })
    if (last.hit === true) return last
    await sleep(200)
  }
  return last
}

/** Which card holds the focus, what it says, and which column it is drawn in. */
async function readKanbanFocus(page, scope) {
  return page.evaluate((scope) => {
    const card = document.activeElement?.closest('[data-item-id]')
    return {
      itemId: card?.getAttribute('data-item-id') ?? '',
      text: card?.querySelector('h3')?.textContent?.trim() ?? '',
      group: card?.closest('[data-kanban-group]')?.getAttribute('data-kanban-group') ?? '',
      inSurface: Boolean(document.activeElement?.closest(scope)),
    }
  }, scope)
}

/**
 * What the board's own chords leave on screen: its cards, the fields it can open, and any panel over it.
 * `dialogs` and `searchFocused` read the document, for the same reason `readCardTitleState` does — a card
 * window is portalled to the body, and a count taken inside the block cannot see one.
 */
async function readKanbanKeyboardState(page, scope) {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope)
    return {
      cards: root?.querySelectorAll('[data-item-id]').length ?? -1,
      // The door and the field it becomes are two elements with one marker between them, so a column
      // counts once either way — which is what makes these two numbers readable on their own.
      fields: root?.querySelectorAll('input[data-kanban-new-item]').length ?? -1,
      doors: root?.querySelectorAll('button[data-kanban-new-item]').length ?? -1,
      fieldFocused: Boolean(document.activeElement?.matches('[data-kanban-new-item]')),
      searchOpen: Boolean(root?.querySelector('[data-kanban-search-input]')),
      searchFocused: Boolean(document.activeElement?.matches('[data-kanban-search-input]')),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }
  }, scope)
}

/**
 * The board's quick filters (KU-15), pressed with a real pointer.
 *
 * Every chip is a rule the filter panel could have built by hand, several presses at a time, and what is
 * asserted is the promise that makes those chips safe to have: a pressed chip narrows the board the way
 * that rule would, it lights up as in force, and pressing it again gives the board back exactly as it
 * was. What the fixture arranges for that is one card in nobody else's hands (so "unassigned" has a
 * card to remove), one open card past its deadline (so "overdue" has exactly one), and one finished card
 * also past its date - finished work is never late, so an "overdue" that counted it would be wrong here.
 *
 * The board is left with no chips pressed, because the view's filters are written into the note the
 * scenarios after this one read.
 */
async function assertKanbanQuickFilters(page, scope, where) {
  const drawn = await page.evaluate((scope) => {
    const bar = document.querySelector(`${scope} [data-kanban-quick-filters]`)
    if (!bar) return { reason: 'this surface draws no quick filters' }
    return {
      ids: [...bar.querySelectorAll('[data-kanban-quick-filter]')].map((chip) => chip.getAttribute('data-kanban-quick-filter') ?? ''),
      labels: [...bar.querySelectorAll('[data-kanban-quick-filter]')].map((chip) => (chip.textContent ?? '').trim()),
      cards: document.querySelectorAll(`${scope} [data-item-id]`).length,
      pressed: [...bar.querySelectorAll('[data-kanban-quick-filter][aria-pressed="true"]')].length,
    }
  }, scope)
  check(
    `kanban ${where}: the board offers its habitual questions as chips (${drawn.reason ?? drawn.ids.join('/')})`,
    Array.isArray(drawn.ids) && drawn.ids.join(',') === 'overdue,dueToday,unassigned,mine' && drawn.pressed === 0,
    JSON.stringify(drawn),
  )
  if (!Array.isArray(drawn.ids)) return
  check(
    `kanban ${where}: every chip is named, and none of them is named by a raw key`,
    drawn.labels.length === 4 && drawn.labels.every((label) => label.length > 0 && !label.includes('.')),
    JSON.stringify(drawn.labels),
  )

  // Unassigned: of the three cards, exactly the one somebody holds leaves the board.
  const cleared = await pressKanbanChip(page, scope, 'unassigned')
  check(`kanban ${where}: the unassigned chip is where a pointer can reach it`, cleared.hit === true, JSON.stringify(cleared))
  const afterUnassigned = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: unassigned takes the assigned card off the board`,
    afterUnassigned.cards === drawn.cards - 1 && afterUnassigned.pressed === 1,
    JSON.stringify({ before: drawn.cards, after: afterUnassigned }),
  )
  check(
    `kanban ${where}: the chip reads as in force while its rule is`,
    afterUnassigned.active === 'unassigned',
    JSON.stringify(afterUnassigned),
  )

  // Overdue: the open card whose date has passed, and not the finished one that also has one.
  await pressKanbanChip(page, scope, 'unassigned')
  const restored = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: pressing the chip again gives the board back`,
    restored.cards === drawn.cards && restored.pressed === 0 && restored.active === '',
    JSON.stringify(restored),
  )
  await pressKanbanChip(page, scope, 'overdue')
  const late = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: overdue keeps only the card that is both open and past its date`,
    late.cards === 1 && late.keys === 'gate-c' && late.active === 'overdue',
    JSON.stringify(late),
  )
  await pressKanbanChip(page, scope, 'overdue')
  const back = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: nothing is left filtered once the chips are released`,
    back.cards === drawn.cards && back.pressed === 0,
    JSON.stringify(back),
  )
}

/**
 * Presses one chip at the place a pointer would have to reach, and reports what stood in the way when it
 * could not. The header is a row of its own, so a chip can be under the bar it belongs to rather than
 * under the pointer, which is the failure this names instead of the symptom.
 */
async function pressKanbanChip(page, scope, id) {
  const target = await page.evaluate(({ scope, id }) => {
    const chip = document.querySelector(`${scope} [data-kanban-quick-filter="${id}"]`)
    if (!chip) return { reason: `no ${id} chip on screen` }
    chip.scrollIntoView({ block: 'center' })
    const box = chip.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the chip has no box' }
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const under = document.elementFromPoint(x, y)
    return { x, y, hit: Boolean(under && chip.contains(under)) }
  }, { scope, id })
  if (target.hit !== true) return target
  await page.mouse.click(target.x, target.y)
  await sleep(420)
  return target
}

/**
 * The board's undo reaches the last *edit*, not the last lookup (KU-16), run with the real controls.
 *
 * The discriminating read is what is on the board once the undo has landed, and it is only readable
 * because the chip is released first: file a card (an edit), narrow the board with a chip so the card is
 * filtered out (a lookup), then press the board's own undo control. Undo restores a whole document, so it
 * releases the chip either way — the question is whether the card comes back with it. Before KU-16 the
 * chip press was a step of its own, so the undo landed on the chip and the card was still on the board;
 * now the undo lands on the card and the board is back to what it held before the write.
 *
 * This runs in the board view where the undo control is on the bar. In the note the same control lives
 * inside the overflow menu (KU-05 folded it there), which is a different opening path and is already
 * exercised by the reference-card scenario.
 */
async function assertKanbanLookupUndo(page, scope, where) {
  const before = await readKanbanQuickState(page, scope)
  const filed = await fileCardInColumn(page, scope, 0, 'Gate undo lookup')
  check(`kanban ${where}: the undo scenario can file a card to take back (${filed.reason ?? filed.key})`, filed.filed === true, JSON.stringify(filed))
  if (filed.filed !== true) return
  const written = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: the card is on the board before anything narrows it`,
    written.titles.includes('Gate undo lookup') && written.cards === before.cards + 1,
    JSON.stringify({ cards: written.cards, titles: written.titles }),
  )

  // `overdue` keeps only open cards with a date already past: the card just filed has neither, so the
  // chip takes it off the board — the lookup is in force and the reader can see it.
  await pressKanbanChip(page, scope, 'overdue')
  const narrowed = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: a chip narrows the board, and the card it filed is one of the ones it hides`,
    narrowed.pressed === 1 && narrowed.cards < written.cards && !narrowed.titles.includes('Gate undo lookup'),
    JSON.stringify({ written: written.cards, narrowed: narrowed.cards, titles: narrowed.titles }),
  )

  const undone = await pressUndo(page, scope)
  await sleep(400)
  const after = await readKanbanQuickState(page, scope)
  check(
    `kanban ${where}: the undo did not walk the lookup back (${undone.reason ?? 'pressed'})`,
    undone.pressed === true && after.pressed === 0,
    JSON.stringify({ pressed: undone.pressed, lit: after.pressed }),
  )
  // The chip is released either way (undo restores a whole document), so the reading below is of the
  // board itself: the write is gone, and the card the reader filed is not among the ones left.
  check(
    `kanban ${where}: it took back the card the reader filed, not the chip they pressed`,
    !after.titles.includes('Gate undo lookup') && after.cards === before.cards,
    JSON.stringify({ before: before.cards, after: after.cards, titles: after.titles }),
  )
}

/** What the board holds while the chips are pressed: which cards, which chip is lit, and how many. */
async function readKanbanQuickState(page, scope) {
  return page.evaluate((scope) => {
    const bar = document.querySelector(`${scope} [data-kanban-quick-filters]`)
    const cards = [...document.querySelectorAll(`${scope} [data-item-id]`)].map((card) => card.getAttribute('data-item-id') ?? '')
    const lit = [...(bar?.querySelectorAll('[data-kanban-quick-filter][aria-pressed="true"]') ?? [])]
    return {
      cards: cards.length,
      keys: cards.join(','),
      // The titles as well as the ids: a scenario that files a card of its own knows its title, not the
      // id the board minted for it.
      titles: [...document.querySelectorAll(`${scope} [data-item-id] h3`)].map((heading) => (heading.textContent ?? '').trim()),
      active: lit.map((chip) => chip.getAttribute('data-kanban-quick-filter') ?? '').join(','),
      pressed: lit.length,
    }
  }, scope)
}

/** The names a column's new-card control answers to, in both languages the gate runs in. */
const KANBAN_NEW_ITEM_LABELS = ['New item', '新建项目']

/** What a column's quick-add door is doing right now, and what the board holds around it. */
async function readQuickAddState(page, scope) {
  return page.evaluate(({ scope, labels }) => {
    const root = document.querySelector(scope)
    const groups = [...(root?.querySelectorAll('[data-kanban-group]') ?? [])]
    const fields = groups.flatMap((group) =>
      [...group.querySelectorAll('input')].filter((input) => labels.includes(input.getAttribute('aria-label') ?? '')),
    )
    const field = fields[0]
    return {
      fields: fields.length,
      value: field?.value ?? '',
      focused: Boolean(field && document.activeElement === field),
      filed: [...(root?.querySelectorAll('[data-item-id] h3') ?? [])].map((heading) => heading.textContent.trim()),
      dialogs: root?.querySelectorAll('[role="dialog"]').length ?? -1,
      announcement: groups.map((group) => group.querySelector('[role="status"]')?.textContent ?? '').join(' | '),
      focusText: document.activeElement?.textContent?.trim() ?? '',
    }
  }, { scope, labels: KANBAN_NEW_ITEM_LABELS })
}

/**
 * Whether one card's title is a field right now, and how many dialogs the *document* is showing.
 *
 * The count is document-wide rather than scoped to the surface, and that is not a detail: the card
 * window is a `Modal` (a right-hand `Drawer` in the overlay), both of which are portalled to the body,
 * so a count taken inside the board's own block reads zero while a card window is open over it. That is
 * exactly how a keyboard chord that filed a card through the header's door slipped past the dialog-count
 * assertion that was supposed to prove the rename gesture does not open it (found while adding KU-14).
 * The board's own overlay is a dialog too, so it is in the count on both sides of every comparison.
 */
async function readCardTitleState(page, scope, itemId) {
  return page.evaluate(({ scope, itemId }) => {
    const root = document.querySelector(scope)
    const card = root?.querySelector(`[data-item-id="${itemId}"]`)
    return {
      editing: Boolean(card?.querySelector('input[data-owns-escape]')),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }
  }, { scope, itemId })
}

/** What the board has to repaint when the account's language changes: its view names and its controls. */
async function readKanbanLocale(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('.kanban-fullscreen')
    return {
      lang: document.documentElement.lang,
      open: Boolean(overlay),
      views: [...(overlay?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.textContent.trim()),
      controls: [...(overlay?.querySelectorAll('[data-kanban-header] button') ?? [])]
        .map((button) => button.getAttribute('aria-label') ?? '')
        .filter(Boolean),
      // The landmark name is the one string on the canvas the host wrote by hand, so it is the one the
      // tree has to keep current — nothing re-renders the block when the account's language moves.
      canvasName: document.querySelector('[data-kanban-canvas]')?.getAttribute('aria-label') ?? '',
    }
  })
}

/**
 * A card in the full screen board opens as a right-hand peek, and the board stays where it was.
 *
 * The note keeps the centred dialog — there the board is a few hundred pixels tall inside a pane
 * that also holds the editor, so a modal is the only honest way to give the card room. The overlay
 * has both, and a reader working through a column reads the card against the columns it came from
 * (user decision, 2026-09-23). Three things are measured rather than assumed: the panel is the
 * drawer shell and hugs the right edge while the board keeps its own columns, the panel is painted
 * above the board's own modal instead of behind it, and Escape closes the panel alone — falling
 * through to the board would take the reader out of the board they were working in — and hands the
 * focus back to the card.
 */
async function assertKanbanCardPeek(page, scope, where) {
  const aimed = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const title = root?.querySelector('[data-item-id] h3 button')
    if (!title) return { reason: 'this surface draws no card title' }
    title.scrollIntoView({ block: 'center' })
    const card = title.closest('[data-item-id]')
    const box = title.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return { reason: 'the card title has no box' }
    const x = Math.round(box.left + box.width / 2)
    const y = Math.round(box.top + box.height / 2)
    const under = document.elementFromPoint(x, y)
    return { x, y, hit: Boolean(under && title.contains(under)), cardId: card?.getAttribute('data-item-id') ?? '' }
  }, scope)
  check(`kanban ${where}: the card can be opened from its title (${aimed.reason ?? aimed.cardId})`, aimed.hit === true, JSON.stringify(aimed))
  if (!aimed.hit) return

  // The click opens the detail at once now; the sleep only gives the dialog its mount.
  await page.mouse.click(aimed.x, aimed.y)
  await sleep(250)

  const opened = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const panel = document.querySelector('[data-surface="drawer"]')
    const panelRoot = panel?.parentElement ?? null
    const boardModal = root?.parentElement ?? null
    const zOf = (el) => (el ? Number(getComputedStyle(el).zIndex) : NaN)
    const board = root?.querySelector('[data-kanban-board]') ?? root
    return {
      surface: panel?.getAttribute('data-surface') ?? '',
      panel: panel ? panel.getBoundingClientRect().toJSON() : null,
      panelZ: zOf(panelRoot),
      boardZ: zOf(boardModal),
      boardCards: root?.querySelectorAll('[data-item-id]').length ?? -1,
      board: board ? board.getBoundingClientRect().toJSON() : null,
      viewport: window.innerWidth,
      modal: panel?.getAttribute('aria-modal') ?? '',
      name: panel?.getAttribute('aria-label') ?? '',
    }
  }, scope)
  check(
    `kanban ${where}: a card opens as a side panel rather than over the board`,
    opened.surface === 'drawer' && opened.modal === 'true' && opened.name !== '',
    JSON.stringify(opened),
  )
  check(
    `kanban ${where}: the panel takes the right edge and the board keeps its columns`,
    Boolean(opened.panel && opened.board) &&
      opened.panel.right >= opened.viewport - 2 &&
      opened.panel.left > opened.board.left &&
      opened.boardCards >= 2,
    JSON.stringify({ panel: opened.panel, board: opened.board, cards: opened.boardCards }),
  )
  check(
    `kanban ${where}: the panel is painted above the board's own modal`,
    opened.panelZ > opened.boardZ,
    JSON.stringify({ panelZ: opened.panelZ, boardZ: opened.boardZ }),
  )

  await page.keyboard.press('Escape')
  await sleep(300)
  const closed = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const focused = document.activeElement
    return {
      panels: document.querySelectorAll('[data-surface="drawer"]').length,
      boardOpen: Boolean(root),
      focusInCard: Boolean(focused && focused.closest('[data-item-id]')),
      focused: focused instanceof HTMLElement ? (focused.getAttribute('aria-label') ?? focused.textContent ?? '').trim().slice(0, 40) : '',
    }
  }, scope)
  check(
    `kanban ${where}: Escape closes the panel alone and hands the focus back to the card`,
    closed.panels === 0 && closed.boardOpen && closed.focusInCard,
    JSON.stringify(closed),
  )
}

/**
 * The board's own name on screen, and the stand-in the block head used to draw instead of it.
 *
 * The head is the markup a fence renders, and it cannot read the body's `title` without parsing that
 * body a second time, so it drew the board's *type* name — which the board view's own tab carries as
 * well, putting the same word on screen twice while the name a reader had given the board was nowhere
 * (user report 2026-09-23). Each host now draws the name where it has the room: the note in the block's
 * own head, written there by the registry that holds the parsed body, and the overlay in its bar. The
 * name was first put in the bar in the note too, and this gate read a 26px view strip for an 8-tab
 * board: a few hundred pixels of pane cannot hold a name and a strip whose tab has to scroll into view.
 *
 * The canvas is also read here. Its landmark name is written by hand when the host makes the element,
 * so the only way it stays in the reader's language is for the tree to re-write it (measured moving in
 * `readKanbanLocale`, which flips the account's language with the board on screen).
 */
async function assertKanbanBoardName(page, scope, where, name) {
  const read = await page.evaluate((scope) => {
    const root = document.querySelector(scope)
    const header = root?.querySelector('[data-kanban-header]')
    const block = root?.classList.contains('kanban-block') ? root : root?.querySelector('.kanban-block')
    const head = block?.querySelector('.kanban-block-head')
    const canvas = root?.querySelector('[data-kanban-canvas]')
    const mode = head?.querySelector('.kanban-block-mode')
    // The name as it is on screen: the block's head in the note, the bar in the overlay.
    const shown = (head?.querySelector('.kanban-block-title')?.textContent ?? header?.querySelector('h2')?.textContent ?? '').trim()
    return {
      shown,
      // The head writes the name and the syntax, and nothing else: no type name of its own.
      head: head ? { titles: head.querySelectorAll('.kanban-block-title').length, text: head.textContent?.trim() ?? '', mode: mode?.textContent?.trim() ?? '' } : null,
      landmark: canvas?.getAttribute('aria-label') ?? '',
      lang: document.documentElement.lang,
    }
  }, scope)
  const typeName = read.lang.startsWith('zh') ? '看板' : 'Kanban'
  check(`kanban ${where}: the board draws the name the reader gave it`, read.shown === name, JSON.stringify(read))
  if (read.head) {
    check(
      `kanban ${where}: the head names the board rather than repeating its type`,
      read.head.titles === 1 && read.head.text.includes(name) && !read.head.text.includes(typeName),
      JSON.stringify(read.head),
    )
    check(
      `kanban ${where}: the head still says which syntax the body holds`,
      read.head.mode !== '' && read.head.text.includes(read.head.mode),
      JSON.stringify(read.head),
    )
  }
  check(
    `kanban ${where}: the canvas names the region for a screen reader`,
    read.landmark === typeName,
    JSON.stringify({ landmark: read.landmark, typeName, lang: read.lang }),
  )
}

/**
 * Choosing another language in the settings dialog, which the app opens over whatever is already on
 * screen, and closing the dialog again. The radio is pressed rather than the store written to: which
 * control carries the choice is part of what this measures.
 *
 * The two waits stand where a pair of sleeps used to. The settings panel arrives in its own chunk, so
 * on a cold cache the dialog is not drawn yet when the press is answered, and the `lang` attribute is
 * updated before the board has repainted the labels it translates for itself.
 */
async function setAccountLanguage(page, { radios, lang }) {
  await pressCombo(page, ['Control', ','])
  const drawn = await page.waitForFunction((labels) => [...document.querySelectorAll('[role="dialog"] button[role="radio"]')]
    .some((item) => labels.includes(item.getAttribute('aria-label') ?? item.textContent.trim())), { timeout: 20_000 }, radios)
    .then(() => true, () => false)
  const choice = await page.evaluate((labels) => {
    const name = (radio) => radio.getAttribute('aria-label') ?? radio.textContent.trim()
    const all = [...document.querySelectorAll('[role="dialog"] button[role="radio"]')]
    const radio = all.find((item) => labels.includes(name(item)) && item.getAttribute('aria-checked') !== 'true')
    if (radio) radio.click()
    return { clicked: radio ? name(radio) : '', names: all.map(name).slice(0, 6), dialogs: document.querySelectorAll('[role="dialog"]').length }
  }, radios)
  const applied = drawn && choice.clicked
    ? await page.waitForFunction((wanted) => document.documentElement.lang === wanted, { timeout: 10_000 }, lang).then(() => true, () => false)
    : false
  await sleep(600)
  await page.keyboard.press('Escape')
  await sleep(1_000)
  return { ...choice, drawn, applied }
}

/** One axe pass over the board: nothing in violation, and nothing sent to a reviewer but its own chips. */
function assertBoardAccessibility(where, report) {
  check(`a11y: the ${where} has no axe violations`, report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  const chips = report.incomplete.filter((item) => item.id === 'color-contrast' && TAG_CHIP_COUNT.test(item.html))
  check(`a11y: the ${where} sends axe only its tag chips to a reviewer`, report.incomplete.every((item) => chips.includes(item)) && chips.length <= 3, JSON.stringify(report.incomplete))
  check(`a11y: axe inspected the ${where}`, report.passes >= 10, `passes=${report.passes}`)
}

/**
 * The full screen board, which is where the block is actually used. Four of its properties are
 * asserted rather than assumed: the overlay borrows the one instance the block in the note mounted
 * instead of mounting a second copy of the board (a copy would write back twice), the heading chain
 * runs from the board's title down to its cards one level at a time, every one of its eight views is
 * opened and has to draw its own content (see `assertKanbanViews`), and the board repaints when the
 * account's language changes while it sits open — the case a unit test cannot reach, because the
 * board is a memo tree whose data did not change.
 *
 * The two axe passes are the first read of this surface at all, and they are what found the defects
 * the fixes for this item carry: a chip dimmed by its own `opacity` (its colour is calibrated at full
 * strength, so the fade took it under AA), a card title that skipped a heading level under the board
 * title, the table's value editors carrying no accessible name, and a top bar that claimed the banner
 * landmark from inside the region the board already names.
 */
async function assertKanbanBoard(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  // Read while the board is still in the note: opening the overlay borrows its canvas, cards and all.
  await ensureKanbanFixtureInline(page)
  await assertKanbanRevealRows(page, 'in the note', KANBAN_FIXTURE)
  // The three reads below are of the note's own rendering, which exists only until the overlay borrows
  // the canvas. They address the block by its fence index rather than by the fixture's marker: that
  // marker asks for the block's *cards*, and a view with no cards on screen — the chart — stops
  // matching it, which is a fact about the marker and not about the block.
  const index = await kanbanFixtureIndex(page)
  check('kanban board: the note holds the block this gate wrote', index !== null, `index=${index} for ${KANBAN_FIXTURE}`)
  if (index === null) return
  const blockSelector = kanbanBlockByIndex(index)
  await assertKanbanCanvasBase(page, blockSelector)
  await assertKanbanHeaderLayout(page, blockSelector, 'in the note', 'compact')
  await assertKanbanOverflowMenu(page, blockSelector, 'in the note')
  // Where the top bar's panels land, read in the note as well as in the overlay: the note draws the
  // board inside prose, inside two scroll boxes of its own, and that is the case the placement has to
  // clamp itself around.
  await assertKanbanPanelAnchoring(page, blockSelector, 'in the note')
  await assertKanbanActiveTab(page, blockSelector, 'in the note')
  await assertKanbanSurfaces(page, blockSelector, 'in the note')
  await assertKanbanColumnHeights(page, blockSelector, 'in the note')
  await assertKanbanBoardName(page, blockSelector, 'in the note', 'Gate Board')
  await assertKanbanTitleGestures(page, blockSelector, 'in the note')
  // The block's own bar has no room for the reference's control, so this is the menu's row — which is
  // the path a reader in the note takes, and the reason the row exists at all.
  await assertKanbanKeyboard(page, blockSelector, 'in the note', { viaMenu: true })
  // Before the view sweep reads the board: a chip narrows what the sweep would be reading, and it
  // releases every chip before it returns.
  await assertKanbanQuickFilters(page, blockSelector, 'in the note')
  const inlineViews = await readKanbanViewsInline(page, blockSelector)
  await openKanbanBoard(page)
  const surfaced = await page
    .waitForFunction(() => Boolean(document.querySelector('.kanban-fullscreen')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('kanban board: the block card opens the overlay', surfaced)
  if (!surfaced) return
  await waitForPanelSettled(page, '.kanban-fullscreen')
  await sleep(400)
  await assertKanbanHeaderLayout(page, '.kanban-fullscreen', 'in the board view', 'wide')
  await assertKanbanPanelAnchoring(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanActiveTab(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanSurfaces(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanColumnHeights(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanBoardName(page, '.kanban-fullscreen', 'in the board view', 'Gate Board')
  await assertKanbanCardPeek(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanTitleGestures(page, '.kanban-fullscreen', 'in the board view')
  await assertKanbanKeyboard(page, '.kanban-fullscreen', 'in the board view', { viaMenu: false })
  await assertKanbanQuickFilters(page, '.kanban-fullscreen', 'in the board view')
  // Last of the board's own writes: the column's quick-add door is run and taken back here, before the
  // reads below count the cards this gate's fixture brought with it. (The keyboard scenario above writes
  // one too, and takes it back the same way.)
  await assertKanbanQuickAdd(page, '.kanban-fullscreen', 'in the board view')
  // Also last of the board's own writes, and for the same reason: it files a card and takes it back.
  await assertKanbanLookupUndo(page, '.kanban-fullscreen', 'in the board view')

  const hosting = await page.evaluate((selector) => {
    const overlay = document.querySelector('.kanban-fullscreen')
    const block = document.querySelector(selector)
    return {
      role: overlay?.getAttribute('role') ?? '',
      name: overlay?.getAttribute('aria-label') ?? '',
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      canvases: (block?.querySelectorAll('[data-kanban-canvas]').length ?? 0) + (overlay?.querySelectorAll('[data-kanban-canvas]').length ?? 0),
      inOverlay: overlay?.querySelectorAll('[data-kanban-canvas]').length ?? 0,
      reserve: Boolean(block?.querySelector('[data-kanban-placeholder] .kanban-canvas.is-reserve')),
      headings: [...(overlay?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])].map((heading) => heading.tagName),
      // A board title is capped in its own width, so it may only be clipped by its own cap and not by
      // the bar around it. The strip beside it scrolls instead — the failure this reads for was the
      // strip keeping its whole width and squeezing "Gate Board" into 56px of a 1280px bar.
      titleFits: (() => {
        const title = overlay?.querySelector('h2')
        return title ? title.scrollWidth <= title.clientWidth + 1 : null
      })(),
      banners: overlay?.querySelectorAll('header, [role="banner"]').length ?? 0,
      cards: [...(overlay?.querySelectorAll('[data-item-id] h3') ?? [])].map((heading) => heading.textContent.trim()),
    }
  }, blockSelector)
  // The overlay is named after the board rather than after the control that opened it, which is what a
  // reader hears first when the surface appears.
  check('kanban board: the overlay is a dialog named after the board', hosting.role === 'dialog' && hosting.name === 'Gate Board', JSON.stringify(hosting))
  check('kanban board: the overlay hosts the block\'s one instance', hosting.dialogs === 1 && hosting.canvases === 1 && hosting.inOverlay === 1, JSON.stringify(hosting))
  check('kanban board: the block keeps its place in the note while the overlay holds the board', hosting.reserve, JSON.stringify(hosting))
  check('kanban board: the cards hang one level under the board title', hosting.headings.join(',') === 'H2,H3,H3,H3' && hosting.cards.length === 3, JSON.stringify(hosting))
  check('kanban board: the view strip gives way to the title rather than clipping it', hosting.titleFits === true, JSON.stringify(hosting))
  check('kanban board: nothing inside the board claims the banner landmark', hosting.banners === 0, JSON.stringify(hosting))

  await ensureAxe(page)
  assertBoardAccessibility('kanban board', await runAxe(page, '.kanban-fullscreen'))

  await clickKanbanView(page, ['表格', 'Table'])
  const drawn = await page.waitForFunction(() => Boolean(document.querySelector('.kanban-fullscreen [role="table"]')), { timeout: 10_000 }).then(() => true, () => false)
  const table = await page.evaluate(() => {
    const grid = document.querySelector('.kanban-fullscreen [role="table"]')
    const count = (role) => grid?.querySelectorAll(`[role="${role}"]`).length ?? 0
    const editors = [...(grid?.querySelectorAll('select') ?? [])]
    return {
      name: grid?.getAttribute('aria-label') ?? '',
      rows: count('row'),
      headers: count('columnheader'),
      cells: count('cell'),
      editors: editors.length,
      unnamed: editors.filter((editor) => !editor.getAttribute('aria-label')).length,
      names: [...new Set(editors.map((editor) => editor.getAttribute('aria-label')))],
    }
  })
  // A grid of boxes is not a table: the roles are what tell a reader which row a cell belongs to, and
  // they have to be on the surface the note's own markup draws rather than on a copy of it.
  check('kanban board: the table view is a named table of rows and cells', drawn && table.name !== '' && table.rows >= 3 && table.headers >= 2 && table.cells >= 2, JSON.stringify(table))
  check('kanban board: every value editor in the table is named after its column', table.editors >= 1 && table.unnamed === 0, JSON.stringify(table))
  assertBoardAccessibility('kanban table view', await runAxe(page, '.kanban-fullscreen'))
  await clickKanbanView(page, ['看板', 'Board'])

  // Every other view, so the six the gate had never opened are read the same way the table was — and
  // every one of them is read against the note's own rendering of the same view.
  const overlayStyles = await assertKanbanViews(page)
  assertKanbanViewParity(inlineViews, overlayStyles)

  // The reveal row in the surface the card actually gets used in, and the gallery's own tile: both
  // draw the same row, and the gallery only floats it when the tile has a cover to float it over.
  await assertKanbanRevealRows(page, 'in the board view', '.kanban-fullscreen')
  await clickKanbanView(page, ['画廊', 'Gallery'])
  await assertKanbanRevealRows(page, 'in the gallery view', '.kanban-fullscreen')
  await clickKanbanView(page, ['看板', 'Board'])

  // The language switch happens with the board on screen. What has to move is everything the board
  // translates for itself — its view names and its controls — while the cards keep the words the
  // author wrote, and the account is put back afterwards so the run leaves nothing behind.
  const found = await readKanbanLocale(page)
  const current = found.lang.startsWith('zh') ? LANGUAGES.zh : LANGUAGES.en
  const other = current === LANGUAGES.zh ? LANGUAGES.en : LANGUAGES.zh
  const choice = await setAccountLanguage(page, other)
  const flipped = await readKanbanLocale(page)
  const back = choice.applied ? await setAccountLanguage(page, current) : choice
  const restored = choice.applied ? await readKanbanLocale(page) : flipped
  check('kanban board: the settings dialog opens over it and the language can be changed', choice.drawn && choice.applied && flipped.open && flipped.lang === other.lang, JSON.stringify({ choice, found, flipped }))
  check('kanban board: the board repaints the labels it translates while it stays open', flipped.views.length === found.views.length && flipped.views.length >= 4 && flipped.views.every((view, index) => view !== found.views[index] && view !== '') && flipped.controls.join() !== found.controls.join(), JSON.stringify({ choice, before: found, after: flipped }))
  check('kanban board: the run leaves the account the language it found', back.applied && restored.lang === current.lang && JSON.stringify(restored.views) === JSON.stringify(found.views), JSON.stringify({ choice, back, restored }))
  // The landmark name is written on the canvas by hand, once, when the host makes the element, so it is
  // the one string on the board the tree itself has to keep in the reader's language.
  check(
    'kanban board: the region a reader hears is named in the language they switched to',
    flipped.canvasName !== '' && flipped.canvasName !== found.canvasName,
    JSON.stringify({ before: found.canvasName, after: flipped.canvasName }),
  )
  check(
    'kanban board: the region goes back to the name it started with',
    restored.canvasName === found.canvasName,
    JSON.stringify({ before: found.canvasName, restored: restored.canvasName }),
  )

  await page.keyboard.press('Escape')
  const closed = await page.waitForFunction(() => !document.querySelector('.kanban-fullscreen'), { timeout: 10_000 }).then(() => true, () => false)
  const returned = await page.evaluate((selector) => {
    const block = document.querySelector(selector)
    return {
      inOverlay: document.querySelectorAll('.kanban-fullscreen [data-kanban-canvas]').length,
      inBlock: block?.querySelectorAll('[data-kanban-canvas]').length ?? 0,
      cards: block?.querySelectorAll('[data-item-id]').length ?? 0,
    }
  }, blockSelector)
  check('kanban board: escape closes it', closed)
  // The repaint above rebuilt the note under the open overlay, so this is the read of the borrow
  // actually working: the instance still comes back to the block, and the block still draws it.
  check('kanban board: closing hands the one instance back to the block', returned.inOverlay === 0 && returned.inBlock === 1 && returned.cards >= 2, JSON.stringify(returned))
}

/**
 * What a swept surface opened with, read once its own content is actually there. The wait is bounded by
 * a deadline rather than by hoping the read is late enough — and it is not a weaker assertion: the
 * check below still fails on a surface that reports empty, so this only stops a fetch that is still in
 * flight from being read as a surface that opened with nothing (FB3-C10).
 */
async function readSweepContent(page, surface) {
  const read = () => page.evaluate(({ root, selector, decoded }) => {
    const scope = document.querySelector(root)
    const found = scope ? [...scope.querySelectorAll(selector)] : []
    const settled = decoded ? found.filter((element) => element.complete && element.naturalWidth > 0) : found
    return { count: found.length, settled: settled.length, selector }
  }, { root: surface.root, selector: surface.loaded.selector, decoded: Boolean(surface.loaded.decoded) })
  const deadline = Date.now() + 15_000
  let loaded = await read()
  while (loaded.count < surface.loaded.min && Date.now() < deadline) {
    await sleep(250)
    loaded = await read()
  }
  return loaded
}

async function assertFullscreenToolbars(page) {
  // The hotkeys below are the app's own, and half of them are refused while a text field has the
  // keyboard: each surface starts from no focus at all rather than from wherever the last scenario
  // left it. The window is part of the surface — the outline is a drawer at phone width — so the
  // entry says which one it is audited in, and the desktop width comes back between them.
  for (const surface of TOOLBAR_SURFACES) {
    await page.setViewport(surface.viewport ?? DESKTOP_VIEWPORT)
    await sleep(500)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await sleep(300)
    // A surface whose content is fetched declares the fixture its read needs, and says here whether it
    // took: without this the entry below answers about whatever the instance happened to hold (FB3-C10).
    if (surface.fixture) {
      const fixture = await surface.fixture({ page })
      check(`toolbar stability: the ${surface.name} arranged the content its read needs`,
        fixture.found.length >= surface.loaded.min, JSON.stringify(fixture.found))
    }
    await surface.open(page)
    await page.waitForSelector(surface.root, { timeout: 15_000 })
    await waitForPanelSettled(page, surface.root)
    await sleep(400)
    const loaded = await readSweepContent(page, surface)
    check(`toolbar stability: the ${surface.name} opened with its content, not an error state`, loaded.count >= surface.loaded.min && loaded.settled >= surface.loaded.min, JSON.stringify(loaded))
    const result = await sweepToolbar(page, surface)
    check(`toolbar stability: the ${surface.name} toolbar holds its height`, result.growth === 0, JSON.stringify(result))
    check(`toolbar stability: the ${surface.name} toggles stay on the toolbar row`, result.rowShift === 0 && result.outside === 0, JSON.stringify(result))
    // A surface with no toggle is still counted: the sweep says it found none rather than passing
    // silently over a control it did not recognize.
    check(`toolbar stability: the ${surface.name} toolbar exercised its toggles`, result.toggles >= surface.minToggles, JSON.stringify(result))
    // The sweep's own presses can leave the surface in a mode of its own — the template library is
    // still selecting — so the count is reported rather than pinned to one press; what has to hold is
    // that Escape gets out.
    let escapes = 0
    let closed = false
    while (!closed && escapes < 3) {
      escapes += 1
      await page.keyboard.press('Escape')
      closed = await page.waitForFunction((root) => !document.querySelector(root), { timeout: 5_000 }, surface.root).then(() => true, () => false)
      if (!closed) await sleep(240)
    }
    check(`toolbar stability: the ${surface.name} closes with escape`, closed, `escapes=${escapes}`)
    // Escape is only half of it: the keyboard has to come back to where it was, or the person who
    // opened this surface is left with no place on the page. The control is the one marked before it
    // was pressed, so a surface that hands focus to the body, or deep inside a panel that is gone,
    // fails here and says which element ended up holding it.
    const focus = await page.evaluate((successors) => {
      const describe = (element) => (element
        ? `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') ? `[${element.getAttribute('aria-label')}]` : ''}`
        : 'nothing')
      const openers = window.__gateOpeners ?? []
      const marked = openers.at(-1)
      const connected = openers.find((element) => element.isConnected) ?? null
      const active = document.activeElement instanceof Element ? document.activeElement : null
      // FB-C3: a surface may replace its opener *while it is open* (the music status bar swaps its
      // transport for a quiet title row, the floating card unmounts). Those surfaces are handed back
      // to the control that took the opener's place, which is the app's own rule for a re-rendered
      // opener (`successorOf` in components/overlay/hooks.ts) — it is not a looser check, because the
      // replacement has to carry the same declared markers as the control that was pressed.
      const inherited = successors.length > 0 && successors.every((name) => marked?.hasAttribute(name))
        && successors.every((name) => active?.hasAttribute(name))
      return {
        opener: describe(connected ?? marked),
        active: describe(active),
        inherited: inherited ? successors.join('+') : '',
        returned: (connected !== null && active === connected) || inherited,
      }
    }, surface.successorAttributes ?? [])
    check(`surface keyboard: the ${surface.name} hands focus back to the control it was opened from`, focus.returned, JSON.stringify(focus))
  }
  // The drawer's entry is the one that changed the window: the run leaves the app as it found it.
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(300)
}

/**
 * A row of a submenu that opens a panel of its own. The editor's context menu nests three
 * deep — insert, then the mind map row, then a template — and the third level is a `fixed`
 * box living inside the submenu its pop-in animation owns, which makes that animation's
 * settled transform the block the panel is placed in instead of the viewport: read as
 * viewport coordinates it was drawn a whole submenu down and to the right, off screen, and
 * the row looked dead. The panel is asserted where it has to be — on screen, and beside the
 * row that opened it — and then used, because a panel that is merely visible proves nothing
 * about the row it serves.
 */
async function assertContextMenuNesting(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('context menu scenario: the editor pane never became visible')

  // The blank-canvas menu is the one that carries the insert row, and an empty line at the
  // end of the note is what gives it: the caret is moved there and the right click lands on it.
  await page.evaluate(() => document.querySelector('.cm-content')?.focus())
  await pressCombo(page, ['Control', 'End'])
  await page.keyboard.press('Enter')
  await sleep(300)
  const caret = await page.evaluate(() => {
    const cursor = document.querySelector('.cm-cursor-primary') ?? document.querySelector('.cm-line:last-child')
    const box = cursor?.getBoundingClientRect()
    return box ? { x: Math.round(box.x + 4), y: Math.round(box.y + box.height / 2) } : null
  })
  if (!caret) throw new Error('context menu scenario: the editor has no caret to right-click')
  await page.mouse.click(caret.x, caret.y, { button: 'right' })

  const rowBox = async (labels) => page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('[role="menu"] button, body > div button')]
      .find((candidate) => wanted.includes(candidate.textContent.trim()))
    if (!button) return null
    const box = button.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }, labels)
  const hoverRow = async (labels, what) => {
    const box = await rowBox(labels)
    if (!box) throw new Error(`context menu scenario: the ${what} row never appeared`)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(450)
    return box
  }

  await page.waitForSelector('[role="menu"]', { timeout: 15_000 })
  check('context menu: right-clicking the editor opens the menu', true)
  await hoverRow(LABELS.insert, 'insert')
  const row = await hoverRow(LABELS.mindMap, 'mind map')

  const panel = await page.evaluate((wanted) => {
    const menu = [...document.querySelectorAll('[role="menu"]')]
      .find((candidate) => wanted.includes(candidate.getAttribute('aria-label') ?? ''))
    if (!menu) return null
    const box = menu.getBoundingClientRect()
    return {
      x: Math.round(box.x), y: Math.round(box.y),
      width: Math.round(box.width), height: Math.round(box.height),
      rows: [...menu.querySelectorAll('button')].map((button) => button.textContent.trim()),
    }
  }, LABELS.mindMap)
  check('context menu: the mind map row opens a panel of templates', Boolean(panel) && panel.rows.length > 0, JSON.stringify(panel))
  if (!panel) return
  const onScreen = panel.x >= 0 && panel.y >= 0
    && panel.x + panel.width <= 1280 && panel.y + panel.height <= 900
  check('context menu: the nested panel is drawn inside the window', onScreen, JSON.stringify(panel))
  const besideRow = Math.abs(panel.x - (row.x + row.width)) <= 8
    && Math.abs(panel.y - row.y) <= row.height
  check('context menu: the nested panel sits beside the row that opened it', besideRow, `panel=${JSON.stringify(panel)} row=${JSON.stringify(row)}`)

  const template = await rowBox(LABELS.mindMapOutline)
  check('context menu: the template row is reachable', Boolean(template))
  if (!template) return
  // The note already carries a mind map fence from its own scenario above, so the mark of this
  // insertion is the template's own topic rather than the fence it arrives in.
  await page.mouse.click(template.x + template.width / 2, template.y + template.height / 2)
  const inserted = await page
    .waitForFunction(() => (document.querySelector('.cm-content')?.textContent ?? '').includes('- Core Topic'), { timeout: 15_000 })
    .then(() => true, () => false)
  check('context menu: picking a template writes the mind map fence', inserted)
  // The note is shared with the scenarios above and this one owns no content of its own.
  await pressCombo(page, ['Control', 'z'])
  await sleep(1_200)
  const undone = await page
    .waitForFunction(() => !(document.querySelector('.cm-content')?.textContent ?? '').includes('- Core Topic'), { timeout: 15_000 })
    .then(() => true, () => false)
  check('context menu: the insertion is undone again', undone)
  await page.keyboard.press('Escape')
  await sleep(300)
}

// --- music surfaces -------------------------------------------------------------
//
// The library hub, the floating player and their queue ride on rules the rest of the gate never
// touches: controls that reveal on hover from md up but must stay tappable below it (the M-18
// rule), entrance animations that a reduced-motion preference has to silence, and a floating
// card that may not sit on top of the surfaces it shares the window edge with. The tracks are
// seeded through the real upload endpoint because the scenario reads what the library draws;
// nothing here ever starts audio, so the probe bytes are never decoded.

const MUSIC_TRACK_TITLES = MUSIC_PROBE.titles

const ariaAttr = (labels) => labels.map((label) => `@aria-label="${label}"`).join(' or ')
// A toolbar action is an icon with an aria-label in the compact shapes and a labelled button in the
// roomy one, and which shape is on screen depends on the window the reader was left with.
const ariaOrTextAttr = (labels) => [ariaAttr(labels), ...labels.map((label) => `normalize-space(.)="${label}"`)].join(' or ')
const cssByLabels = (base, labels) => labels.map((label) => `${base}[aria-label="${label}"]`).join(', ')
const overlaps = (a, b) => a && b
  && a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height

const HUB_DIALOG_XPATH = `xpath/.//div[@role="dialog" and ${ariaAttr(LABELS.musicHub)}]`
const HUB_DIALOG_CSS = MUSIC_HUB_ROOT

// FB-F1: the window used to write its drag offset into the store and into an inline `transform`,
// and the dialog's own entrance animation (`ink-pop`, fill `both`, ending on `transform: none`)
// painted over it — the offset was never visible, and a jsdom assertion on the store could not
// tell the difference because the store was right the whole time. The guard is here, because
// this is the only layer that can see the paint: a real press and drag on the header, and the box
// on screen has to follow the pointer, then follow it back.
async function assertMusicHubDrag(page) {
  const grip = await page.$(cssByLabels('div[role="dialog"] button', LABELS.musicMoveHub))
  check('music: the hub opens as a movable window with its own drag control', Boolean(grip))
  if (!grip) return
  const before = await rectOf(page, HUB_DIALOG_CSS)
  if (!before) {
    check('music: the hub window is on screen to be dragged', false, `panel=${JSON.stringify(before)}`)
    return
  }
  await dragHubBy(page, { x: 120, y: 60 })
  const moved = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the hub window follows the pointer when its header is dragged',
    Boolean(moved) && Math.abs(moved.x - before.x - 120) <= 4 && Math.abs(moved.y - before.y - 60) <= 4,
    `before=${JSON.stringify(before)} moved=${JSON.stringify(moved)}`)
  await dragHubBy(page, { x: -120, y: -60 })
  const restored = await rectOf(page, HUB_DIALOG_CSS)
  check('music: dragging the hub back returns it to where it started',
    Boolean(restored) && Math.abs(restored.x - before.x) <= 6 && Math.abs(restored.y - before.y) <= 6,
    `before=${JSON.stringify(before)} restored=${JSON.stringify(restored)}`)
}

// The hub's window chrome, found by the name on the dialog rather than by a chain of child
// selectors: the name sits on the dialog, and the header is the first one inside it.
async function hubHeaderBox(page) {
  return page.evaluate((selectors) => {
    const dialog = selectors.map((selector) => document.querySelector(selector)).find(Boolean)
    const header = dialog?.querySelector('header')
    if (!header) return null
    const box = header.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }, HUB_DIALOG_CSS.split(', '))
}

// A press in the middle of the header: that strip is the window's grip, and its centre carries no
// control (the buttons sit at its two ends, and a press that begins on one belongs to it). The box
// is read again on every call: after a drag the grip has moved, and a press aimed at where it used
// to be lands on the backdrop outside the window, which closes the hub instead of moving it.
async function dragHubBy(page, delta) {
  const box = await hubHeaderBox(page)
  if (!box) {
    check('music: the hub header is on screen to be dragged', false)
    return
  }
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 8 })
  await page.mouse.up()
  await sleep(300)
}

// FB-U1: the zones are named by direction in the DOM, so the same press can be aimed at each edge
// regardless of the language the app is in. They exist nowhere else in the app, which is why the
// lookup does not repeat the dialog's name.
async function dragZoneBy(page, zone, delta) {
  const handle = await page.$(`[data-hub-resize="${zone}"]`)
  const box = handle ? await handle.boundingBox() : null
  if (!box) {
    check(`music: the ${zone} edge of the window offers a resize zone`, false)
    return
  }
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 8 })
  await page.mouse.up()
  await sleep(250)
}

// FB-U1: eight zones, one per edge and corner — so the window can be made wider *or* narrower
// without also getting taller, which the single corner grip never could. The box is centred, so a
// held edge only stays under the pointer if the window also travels half the change; these read
// both the size and the position, because a zone that grew the width from the wrong side would
// pass a size-only assertion. A double click of the title bar is every window's way to fill the
// screen, and it toggles, so the second one has to give the window back.
/**
 * FB-U2 / FB-R3: what the music toolbar and the list under it really got, read from the running
 * surface. The rows are counted as bands rather than as distinct pixel rows: a 32px select and a 24px
 * icon share a line but not a top, so counting tops read the phone's two rows as four — measured on
 * the way to this, which is why the metric below is what it is.
 *
 * The floor the list is owed is read off the element that declares it (`data-music-content`) instead
 * of being repeated here, so a budget the app stops drawing fails this rather than passing quietly;
 * the only number this side contributes is the policy floor below, the point under which a budget
 * stops saying anything.
 *
 * FB2-U2: a band's own width and the gap after the band the search is on come back too. The row the
 * toolbar draws first is the one the search fills, so it has to end at the toolbar's edge — the fix
 * for the layout that wrapped a third row carrying two icons and 630px of nothing.
 */
const MUSIC_BUDGET_POLICY_FLOOR = 100

// FB-R2: the same number `MUSIC_HUB_COLUMNS_MIN_WIDTH` (music-utils.ts) folds the hub's side
// columns at. It is repeated here on purpose and kept under this name: the assertion below is about
// what the browser draws, so it must not be handed the app's own answer to read back — a threshold
// that drifts in the app still has to make the box and the columns agree on screen.
const MUSIC_HUB_COLUMNS_FOLD_WIDTH = 900

async function readMusicToolbarBudget(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-music-toolbar]')
    const content = document.querySelector('[data-music-content]')
    if (!toolbar || !content) return null
    const style = getComputedStyle(toolbar)
    const box = toolbar.getBoundingClientRect()
    const contentRight = box.right - Number.parseFloat(style.paddingRight)
    const controls = [...toolbar.querySelectorAll('button, input, select, [role="radiogroup"]')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return { centre: Math.round(rect.top + rect.height / 2), left: rect.left, right: rect.right }
      })
      .sort((a, b) => a.centre - b.centre)
    const bands = []
    for (const control of controls) {
      const last = bands.at(-1)
      if (!last || control.centre - last.centre > 10) bands.push({ centre: control.centre, controls: [control] })
      else last.controls.push(control)
    }
    const widths = bands.map((band) => Math.round(Math.max(...band.controls.map((c) => c.right)) - Math.min(...band.controls.map((c) => c.left))))
    return {
      shape: toolbar.getAttribute('data-shape'),
      bands: bands.length,
      bandWidths: widths,
      // The first row is the search's own: the search grows into whatever else that row does not
      // hold, so the gap after its last control measures whether the row really reaches the edge.
      searchEndGap: bands.length ? Math.round(contentRight - Math.max(...bands[0].controls.map((c) => c.right))) : -1,
      floor: Math.round(Number.parseFloat(getComputedStyle(content).minHeight) || 0),
      content: Math.round(content.getBoundingClientRect().height),
      viewport: window.innerHeight,
    }
  })
}

// FB2-U2: what a band has to be worth. Measured before this fix, on the hub's own centre column
// (718px on a 1440px screen): three bands, the last of them 56px — the refresh and the "more" menu
// with 630px of empty space beside them. The narrowest row the plan draws on purpose is the phone's
// filter + five icons at ~280px.
const MUSIC_TOOLBAR_BAND_MIN_WIDTH = 200

/**
 * FB2-U2: the toolbar's rows are planned from measured widths, so the leftover row cannot come back.
 * Read at the two widths a desktop run can reach without dragging anything (the windowed hub on a
 * 1440 screen and the maximised one): every band is a row worth drawing, there are never more than
 * two of them, and the search's row ends at the toolbar's own edge.
 */
async function assertMusicToolbarRows(page) {
  await page.setViewport({ width: 1440, height: 900 })
  await sleep(500)
  const windowed = await readMusicToolbarBudget(page)
  const planned = (read) => Boolean(read) && read.bands <= 2 && read.searchEndGap <= 1
    && Math.min(...read.bandWidths) >= MUSIC_TOOLBAR_BAND_MIN_WIDTH
  check('music: the toolbar plans its rows instead of wrapping into a leftover one', planned(windowed), JSON.stringify(windowed))
  await clickButton(page, LABELS.musicMaximizeHub)
  await sleep(500)
  const filled = await readMusicToolbarBudget(page)
  check('music: the maximised hub keeps the same two rows and the search row still reaches the edge', planned(filled), JSON.stringify(filled))
  await clickButton(page, LABELS.musicRestoreHub)
  await sleep(400)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
}

/**
 * FB-U3: everything the status bar hides below md / lg / xl is hidden rather than degraded only if
 * there is another way in, and at 768–1024 the equalizer and the pin were nowhere on the page. The
 * jsdom cases pin what the "more" entry carries; this is the other half, the one they cannot see —
 * what CSS really draws. At 1000×800 the entry is the only one of the three on screen, and it
 * carries both of the others.
 */
async function assertMusicStatusBarMore(page) {
  await page.setViewport({ width: 1000, height: 800 })
  await sleep(500)
  const bar = await page.evaluate(({ more, eq, pin }) => {
    const state = (labels) => {
      const control = [...document.querySelectorAll('footer button')]
        .find((button) => labels.includes(button.getAttribute('aria-label') ?? ''))
      if (!control) return null
      const box = control.getBoundingClientRect()
      return { drawn: box.width > 0, display: getComputedStyle(control).display }
    }
    return { more: state(more), eq: state(eq), pin: state(pin) }
  }, { more: LABELS.musicMoreActions, eq: LABELS.musicEq, pin: [...LABELS.musicPin, ...LABELS.musicUnpin] })
  check('music: the status bar draws one entry where its own controls are hidden',
    Boolean(bar.more) && bar.more.drawn && bar.eq?.drawn === false && bar.pin?.drawn === false,
    JSON.stringify(bar))

  await page.click(cssByLabels('footer button', LABELS.musicMoreActions))
  const panelOpened = await page
    .waitForSelector(cssByLabels('[role="dialog"]', LABELS.musicMoreActions), { timeout: 15_000 })
    .then(() => true, () => false)
  const carried = panelOpened ? await page.evaluate(({ dialog, eq }) => {
    const root = dialog
      .map((label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`))
      .find(Boolean)
    if (!root) return null
    return {
      pin: root.querySelector('[role="switch"]')?.getAttribute('aria-label') ?? '',
      eq: [...root.querySelectorAll('button')].some((button) => eq.includes(button.getAttribute('aria-label') ?? '')),
    }
  }, { dialog: LABELS.musicMoreActions, eq: LABELS.musicEq }) : null
  check('music: the entry carries the controls this width hides',
    Boolean(carried) && carried.eq && Boolean(carried.pin), JSON.stringify(carried))

  await page.keyboard.press('Escape')
  await sleep(400)
  const panelClosed = await page.evaluate((labels) =>
    labels.every((label) => !document.querySelector(`[role="dialog"][aria-label="${label}"]`)), LABELS.musicMoreActions)
  check('music: the entry closes with escape', panelClosed)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
}

/**
 * FB-U4: the row's columns are the width of the list's own box — the centre column — not the width
 * of the screen. Both reads below are taken on the same 1440px viewport, so a viewport-answered
 * column layout (what the classes said before) could not tell them apart: what changes is the box
 * the maximised hub hands the centre column — measured 960 against 514 on the way to this, the
 * windowed hub having been left narrow by the resize assertions above.
 */
async function assertMusicListDensity(page) {
  await page.setViewport({ width: 1440, height: 900 })
  const narrow = await readSettled(() => readMusicListDensity(page))
  await clickButton(page, LABELS.musicMaximizeHub)
  const wide = await readSettled(() => readMusicListDensity(page))
  const shows = (read, labels) => labels.some((label) => read.headers.includes(label))
  check('music: a narrow centre column moves the table columns onto the row',
    narrow.centre < 900 && narrow.viewport >= 1440 && !shows(narrow, LABELS.musicTableArtist)
      && !shows(narrow, LABELS.musicTableAlbum) && narrow.cells === wide.cells - 3,
    `narrow=${JSON.stringify(narrow)} wide=${JSON.stringify(wide)}`)
  check('music: the same screen draws the columns once the centre has the room',
    wide.centre >= 900 && wide.viewport >= 1440 && shows(wide, LABELS.musicTableArtist)
      && shows(wide, LABELS.musicTableAlbum) && wide.cells > narrow.cells,
    `narrow=${JSON.stringify(narrow)} wide=${JSON.stringify(wide)}`)
  await clickButton(page, LABELS.musicRestoreHub)
  await sleep(400)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
}

/**
 * FB3-C7: the columns are decided by a width the list measures on itself (a ResizeObserver), and that
 * measurement lands on a frame boundary — so a read taken a fixed moment after a layout change can
 * catch the shape the *previous* width asked for. On a loaded machine the two reads below were both
 * taken before the measurement arrived and both saw the full table (measured on a narrow window,
 * which is exactly the state the check rules out). This waits for the read to hold still instead: N
 * successive samples that agree. It does not weaken either check — an unchanged screen is still read
 * as it is, and a list that genuinely kept the wrong columns would settle on them just the same.
 */
async function readSettled(read, { stable = 3, stepMs = 200 } = {}) {
  let previous = null
  let agreed = 0
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const next = JSON.stringify(await read())
    agreed = next === previous ? agreed + 1 : 0
    if (agreed >= stable - 1) return JSON.parse(next)
    previous = next
    await sleep(stepMs)
  }
  return JSON.parse(previous ?? 'null')
}

/**
 * What the list is drawing about its own columns right now: the width of the centre column, the
 * column headers it carries and how many cells one row has. The headers are matched against the
 * whole label set rather than one spelling — the account's language is whatever the run left it as.
 */
async function readMusicListDensity(page) {
  return page.evaluate(({ dialogLabels }) => {
    const dialog = dialogLabels
      .map((label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`))
      .find(Boolean)
    const header = dialog?.querySelector('[role="row"]')
    const row = dialog?.querySelector('[role="rowgroup"] > [role="row"]')
    return {
      viewport: window.innerWidth,
      centre: Math.round(dialog?.querySelector('[data-music-content]')?.getBoundingClientRect().width ?? 0),
      headers: [...(header?.querySelectorAll('[role="columnheader"]') ?? [])].map((cell) => cell.textContent ?? ''),
      cells: row?.querySelectorAll('[role="cell"]').length ?? 0,
    }
  }, { dialogLabels: LABELS.musicHub })
}

async function assertMusicHubResize(page) {
  const before = await rectOf(page, HUB_DIALOG_CSS)
  await dragZoneBy(page, 'e', { x: -300, y: 0 })
  const narrowed = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the east edge narrows the window and leaves the far edge where it was',
    Boolean(narrowed) && Math.abs(narrowed.width - (before.width - 300)) <= 8 && Math.abs(narrowed.x - before.x) <= 8,
    `before=${JSON.stringify(before)} narrowed=${JSON.stringify(narrowed)}`)
  await dragZoneBy(page, 'w', { x: -120, y: 0 })
  const grown = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the west edge grows the window and travels with the pointer',
    Boolean(grown) && Math.abs(grown.width - (narrowed.width + 120)) <= 8 && Math.abs(grown.x - (narrowed.x - 120)) <= 8,
    `narrowed=${JSON.stringify(narrowed)} grown=${JSON.stringify(grown)}`)
  await dragZoneBy(page, 's', { x: 0, y: -160 })
  const shorter = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the bottom edge shortens the window from below',
    Boolean(shorter) && Math.abs(shorter.height - (grown.height - 160)) <= 8 && Math.abs(shorter.y - grown.y) <= 8,
    `grown=${JSON.stringify(grown)} shorter=${JSON.stringify(shorter)}`)

  // FB-C3: the header's own window control, which the toolbar sweep declares out of its list — it
  // resizes the surface rather than disclosing anything, and a press of it travels the whole row. The
  // box and the label that flips with the state are read here instead, and the window is given back
  // before the double click below, because a maximised hub remembers that state across opens.
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  await clickButton(page, LABELS.musicMaximizeHub)
  await sleep(400)
  const byControl = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the header control fills the screen with the window',
    Boolean(byControl) && Math.abs(byControl.width - viewport.width) <= 8 && Math.abs(byControl.height - viewport.height) <= 8,
    `viewport=${JSON.stringify(viewport)} filled=${JSON.stringify(byControl)}`)
  await clickButton(page, LABELS.musicRestoreHub)
  await sleep(400)
  const givenBack = await rectOf(page, HUB_DIALOG_CSS)
  check('music: the header control gives the window back',
    Boolean(givenBack) && Math.abs(givenBack.width - shorter.width) <= 8 && Math.abs(givenBack.height - shorter.height) <= 8,
    `shorter=${JSON.stringify(shorter)} restored=${JSON.stringify(givenBack)}`)
  if (!(await doubleClickHubHeader(page))) return
  const filled = await rectOf(page, HUB_DIALOG_CSS)
  check('music: a double click of the header fills the screen with the window',
    Boolean(filled) && Math.abs(filled.width - viewport.width) <= 8 && Math.abs(filled.height - viewport.height) <= 8,
    `viewport=${JSON.stringify(viewport)} filled=${JSON.stringify(filled)}`)
  await doubleClickHubHeader(page)
  const restored = await rectOf(page, HUB_DIALOG_CSS)
  check('music: a second double click gives back the window it filled',
    Boolean(restored) && Math.abs(restored.width - shorter.width) <= 8 && Math.abs(restored.height - shorter.height) <= 8,
    `shorter=${JSON.stringify(shorter)} restored=${JSON.stringify(restored)}`)

  // FB-R2: the side columns answer the box the hub was given, not the screen behind it. The viewport
  // is the desktop one throughout this drag, so the answer the old code gave (a viewport query) would
  // have kept both columns inline here and let them squeeze the list toward zero. Read twice: once in
  // the folded window, once after the width is given back — a fold that never comes back is the other
  // half of the same bug.
  const foldWidth = 860
  await dragZoneBy(page, 'e', { x: foldWidth - restored.width, y: 0 })
  const folded = await readHubColumns(page)
  check('music: the side columns fold on the window they were given, not on the viewport',
    folded.width < MUSIC_HUB_COLUMNS_FOLD_WIDTH && folded.viewport >= 1280 && !folded.sidebar && folded.opener,
    JSON.stringify(folded))
  await dragZoneBy(page, 'e', { x: restored.width - foldWidth, y: 0 })
  const unfolded = await readHubColumns(page)
  check('music: widening the window again brings the columns back',
    unfolded.width >= MUSIC_HUB_COLUMNS_FOLD_WIDTH && unfolded.sidebar && !unfolded.opener,
    JSON.stringify(unfolded))
}

/**
 * What the hub is drawing about its side columns right now: the box it has, whether the sidebar is
 * inline inside that box, and whether the header offers the drawer that replaces it.
 */
async function readHubColumns(page) {
  return page.evaluate(({ dialogLabels, sidebarLabels, openerLabels }) => {
    const dialog = dialogLabels
      .map((label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`))
      .find(Boolean)
    return {
      width: Math.round(dialog?.getBoundingClientRect().width ?? 0),
      viewport: window.innerWidth,
      sidebar: sidebarLabels.some((label) => Boolean(dialog?.querySelector(`aside[aria-label="${label}"]`))),
      opener: openerLabels.some((label) => Boolean(dialog?.querySelector(`button[aria-label="${label}"]`))),
    }
  }, { dialogLabels: LABELS.musicHub, sidebarLabels: LABELS.musicHubNavigation, openerLabels: LABELS.musicHubOpenNavigation })
}

async function doubleClickHubHeader(page) {
  const box = await hubHeaderBox(page)
  if (!box) {
    check('music: the hub header is on screen to be double clicked', false)
    return false
  }
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  // A double click is two press and release pairs whose click count climbs. One pair that merely
  // says `clickCount: 2` is still a single click as far as the browser is concerned, and it fires
  // no `dblclick` at all — which is a way for a gate to look like it tested a shortcut it never
  // sent.
  await page.mouse.move(point.x, point.y)
  for (const clickCount of [1, 2]) {
    await page.mouse.down({ clickCount })
    await page.mouse.up({ clickCount })
  }
  await sleep(400)
  return true
}

async function openMusicHub(page) {
  // A playback session restored from the server (music-session-sync) leaves a current track, and
  // the footer then carries the transport row instead of the hub icon — its expand button opens
  // the very same hub, so both footer states are a person's path to it.
  const opener = `xpath/.//footer//button[${ariaAttr(LABELS.musicOpenHub)} or ${ariaAttr(LABELS.musicExpandPlayer)}]`
  try {
    await page.waitForSelector(opener, { timeout: 15_000 })
  } catch {
    return false
  }
  await (await page.$$(opener)).at(-1).click()
  try {
    await page.waitForSelector(HUB_DIALOG_XPATH, { timeout: 15_000 })
  } catch {
    return false
  }
  await sleep(400)
  return true
}

/**
 * Closes the library the way a person does, and reports how many presses that took (or -1 if it is
 * still up). One press is not always enough, and that is the app's documented layering rather than a
 * fault: a popup standing inside the surface owns the first Escape — the search box's history popup
 * registers after the hub it stands in, so one Escape puts the popup away and the next the hub.
 *
 * The teardown below clears the search box before it reaches here, and a cleared box shows that popup,
 * so a single press left the hub open. The next scenario then pressed the sidebar's Share entry and got
 * the hub's own scrim instead of the control it aimed at: the note list never switched to the shared
 * view, its manage control never drew, and the run reported a share center that would not open (SH-104)
 * — while the scenario after it, by then pressing a clean shell, opened the very same center.
 */
async function closeMusicHub(page, { attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!(await page.$(MUSIC_HUB_ROOT))) return attempt
    await page.keyboard.press('Escape')
    await sleep(400)
  }
  return (await page.$(MUSIC_HUB_ROOT)) ? -1 : attempts
}

async function hubMotionDurations(page) {
  return page.evaluate((hubLabels) => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((candidate) => hubLabels.includes(candidate.getAttribute('aria-label') ?? ''))
    if (!dialog) return null
    const scrim = (dialog.parentElement ?? dialog).querySelector('.anim-fade')
    const milliseconds = (element) =>
      element ? Number.parseFloat(getComputedStyle(element).animationDuration) * 1000 : null
    return { scrim: milliseconds(scrim), panel: milliseconds(dialog) }
  }, LABELS.musicHub)
}

async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const box = document.querySelector(sel)?.getBoundingClientRect()
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
  }, selector)
}

// The reveal rules live on the control itself for rows and on a wrapper for cards, and a hidden
// ancestor's opacity never shows up on the child's own computed style — so the readable element
// is picked per surface rather than assumed to be the button.
async function controlState(page, selector, { fromWrapper = false } = {}) {
  return page.evaluate(({ sel, wrapper }) => {
    const button = document.querySelector(sel)
    if (!button) return null
    const element = wrapper ? button.parentElement : button
    if (!element) return null
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      width: box.width,
      height: box.height,
    }
  }, { sel: selector, wrapper: fromWrapper })
}

// At md and up the row actions reveal on pointer-events-gated hover, but the headless shell
// reports `hover: none`, so the hover branch of the rule can never fire inside this gate. The
// focus-within sibling of that rule is what a keyboard user walks, and it is what gets pressed
// here: focus the control, activate it with Enter, no pointer involved.
async function focusRevealedActivate(page, selector) {
  const handle = (await page.$$(selector)).at(0)
  if (!handle) return false
  await page.evaluate((element) => element.focus(), handle)
  await sleep(200)
  await handle.press('Enter')
  return true
}

// FB-F4: the library had no door to its own preferences — the switches lived inside a search
// result panel. The header gear is that door, and it has to land on the music section of the
// settings panel rather than on whatever section was open last time.
async function assertMusicHubSettingsShortcut(page) {
  const gear = await page.$(cssByLabels('div[role="dialog"] button', LABELS.musicOpenSettings))
  check('music: the hub header carries a settings shortcut', Boolean(gear))
  if (!gear) return
  await gear.click()
  const navigated = await page.waitForFunction((navLabels) => {
    const current = [...document.querySelectorAll('nav button[aria-current="page"]')]
    return current.some((button) => navLabels.includes((button.textContent ?? '').trim()))
  }, { timeout: 15_000 }, LABELS.musicSettingsNav).then(() => true, () => false)
  check('music: the settings shortcut opens the music section', navigated)
  // The section is a lazy chunk: the nav label lights up first and the page arrives after it, so
  // the group is waited for rather than read the instant the panel opens.
  const showsSources = await page.waitForFunction(
    (labels) => labels.some((label) => (document.body.textContent ?? '').includes(label)),
    { timeout: 15_000 },
    LABELS.musicSettingsSources,
  ).then(() => true, () => false)
  check('music: the music settings page holds the online sources group', showsSources)
  // The section is new, so it is measured rather than assumed: axe reads the page the reader is
  // actually on, and only the globally reviewed review items are allowed through.
  await waitForPanelSettled(page, SETTINGS_PANEL)
  await ensureAxe(page)
  const report = await runAxe(page, SETTINGS_PANEL)
  check('a11y: the music settings page has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  const unexpected = report.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('a11y: the music settings page sends axe no unexpected review items', unexpected.length === 0, JSON.stringify(unexpected))
  await page.keyboard.press('Escape')
  await sleep(400)
}

// FB-M16: the music-server modal is the newest consumer of the shared dialog shell, and the entry
// that opens it sits in the toolbar beside the other source flows. What this reads is the first-run
// path, which is the one every reader walks: the entry is there, pressing it shows the registration
// form rather than an empty picker, escape closes it, and the keyboard comes back to the entry
// rather than falling to the body or staying inside the surface that just closed.
async function assertMusicServerSource(page) {
  const trigger = (await page.$$(`xpath/.//*[@data-music-toolbar]//button[${ariaOrTextAttr(LABELS.musicServers)}]`)).at(0)
  check('music: the toolbar carries the music server entry', Boolean(trigger))
  if (!trigger) return
  // The modal opens *over* the hub, which is a dialog of its own — so the count is what says a new
  // surface appeared, and the sentence is what says it is this one. Reading the first dialog in the
  // document would read the hub, whose toolbar does carry the words "Add server".
  const before = await page.evaluate(() => document.querySelectorAll('div[role="dialog"]').length)
  await trigger.click()
  // Either spelling: the account's language is whatever the previous scenario left it as, which is
  // not this assertion's business.
  const opened = await page.waitForFunction((count, groups) => {
    const dialogs = [...document.querySelectorAll('div[role="dialog"]')]
    if (dialogs.length <= count) return false
    const added = dialogs.slice(count)
    return added.some((dialog) => groups.some((group) => group.some((label) => (dialog.textContent ?? '').includes(label))))
  }, { timeout: 15_000 }, before, [LABELS.musicServersNone, LABELS.musicServersAdd])
    .then(() => true, () => false)
  const shape = await page.evaluate(() => ({
    dialogs: document.querySelectorAll('div[role="dialog"]').length,
    texts: [...document.querySelectorAll('div[role="dialog"]')].map((dialog) => (dialog.textContent ?? '').slice(0, 60)),
  }))
  check('music: the music server entry opens the registration form', opened, JSON.stringify(shape))
  await page.keyboard.press('Escape')
  const closed = await page.waitForFunction(
    (count) => document.querySelectorAll('div[role="dialog"]').length === count,
    { timeout: 10_000 },
    before,
  ).then(() => true, () => false)
  check('music: escape closes the music server modal', closed)
  // A dialog opened from the hub opens *over* it, so closing the inner one may not take the outer
  // one with it: the library the reader came from is still there, rows and all.
  const hub = await page.evaluate((labels) => {
    const dialog = [...document.querySelectorAll('div[role="dialog"]')]
      .find((item) => labels.some((label) => (item.getAttribute('aria-label') ?? '') === label))
    return { open: Boolean(dialog), rows: document.querySelectorAll('[role="row"]').length }
  }, LABELS.musicHub)
  check('music: the hub survives the music server modal it opened', hub.open, JSON.stringify(hub))
  const focus = await page.evaluate((labels) => ({
    returned: document.activeElement instanceof HTMLElement && labels.includes(document.activeElement.getAttribute('aria-label') ?? ''),
    active: document.activeElement instanceof HTMLElement
      ? document.activeElement.getAttribute('aria-label') ?? document.activeElement.tagName.toLowerCase()
      : 'nothing',
  }), LABELS.musicServers)
  check('music: the music server modal hands focus back to the entry', focus.returned, JSON.stringify(focus))
}

// FB2-F2: folders used to be chosen through `<input webkitdirectory>`, and that attribute is what
// makes Chrome put up its own "upload these files to this site?" confirmation — a browser dialog the
// app cannot style, localise or dismiss. The invariant is read here rather than trusted to a code
// review: the panel that takes folders holds no directory input at all, and the folder door is
// drawn only where the browser's own directory picker exists.
async function assertMusicUploadPicker(page) {
  const trigger = (await page.$$(`xpath/.//*[@data-music-toolbar]//button[${ariaOrTextAttr(LABELS.musicUpload)}]`)).at(0)
  check('music: the toolbar carries the upload entry', Boolean(trigger))
  if (!trigger) return
  await trigger.click()
  const opened = await page.waitForFunction(
    (titles) => [...document.querySelectorAll('div[role="dialog"]')].some((dialog) => titles.some((title) => (dialog.textContent ?? '').includes(title))),
    { timeout: 15_000 },
    LABELS.musicTransferTitle,
  ).then(() => true, () => false)
  check('music: the upload entry opens the transfer panel', opened)
  // The panel is picked by its own title rather than by "the dialog with a file input": the hub's
  // toolbar carries one too (the m3u import), and it is the first of the two in the document.
  const shape = await page.evaluate(({ titles, folderDoors }) => {
    const dialog = [...document.querySelectorAll('div[role="dialog"]')]
      .find((item) => titles.some((title) => (item.textContent ?? '').includes(title)))
    if (!dialog) return null
    return {
      fileInputs: dialog.querySelectorAll('input[type="file"]').length,
      directoryInputs: dialog.querySelectorAll('input[webkitdirectory]').length,
      folderDoor: [...dialog.querySelectorAll('button')].some((button) => folderDoors.includes((button.textContent ?? '').trim())),
      hasDirectoryPicker: typeof window.showDirectoryPicker === 'function',
    }
  }, { titles: LABELS.musicTransferTitle, folderDoors: LABELS.musicUploadFolder })
  check('music: nothing in the transfer panel asks to upload a folder through a directory input',
    Boolean(shape) && shape.directoryInputs === 0 && shape.fileInputs === 1, JSON.stringify(shape))
  check('music: the folder door is drawn exactly where the browser has its own picker',
    Boolean(shape) && shape.folderDoor === shape.hasDirectoryPicker, JSON.stringify(shape))
  await page.keyboard.press('Escape')
  await sleep(300)
}

async function assertMusicSurface(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)

  // One fixture for every gate that measures these surfaces (`seedMusicProbeTracks` in
  // e2e-harness.mjs). This gate's own copy was 35 bytes of text in an `.mp3` — enough for the rows
  // and cards it reads, and the reason the contrast gate, which does start audio, found itself
  // measuring a library the engine refuses to play (SH-100).
  const fixture = await seedMusicProbeTracks({ page })
  const seeded = fixture.found.length === MUSIC_TRACK_TITLES.length
  check('music: the probe library holds two tracks the browser can open', seeded, JSON.stringify(fixture))
  if (!seeded) return

  // Measured before the hub opens: the floating player steps aside while the hub is on screen
  // (one track, one transport), so this is the only moment both rectangles exist.
  const playerBox = await rectOf(page, cssByLabels('aside', LABELS.musicMiniPlayer))
  const statusBarBox = await rectOf(page, cssByLabels('footer button', [...LABELS.musicOpenHub, ...LABELS.musicExpandPlayer]))
  check('music: the floating player does not cover the music status bar',
    Boolean(playerBox) && Boolean(statusBarBox) && !overlaps(playerBox, statusBarBox),
    `player=${JSON.stringify(playerBox)} status=${JSON.stringify(statusBarBox)}`)


  if (!(await openMusicHub(page))) {
    check('music: the status bar opens the library hub', false)
    return
  }
  check('music: the status bar opens the library hub', true)
  await assertMusicHubDrag(page)
  await assertMusicHubResize(page)
  // The settings panel takes the hub's place, so the shortcut has to hand the hub back before
  // the rest of the scenario reads its list.
  await assertMusicHubSettingsShortcut(page)
  await openMusicHub(page)

  // The hub's own footer is the transport while it is open; a floating card on top of it would
  // put two play buttons for one track on screen.
  const playerUnderHub = await rectOf(page, cssByLabels('aside', LABELS.musicMiniPlayer))
  check('music: the floating player steps aside while the hub is open', playerUnderHub === null, JSON.stringify(playerUnderHub))
  await assertMusicServerSource(page)
  await assertMusicUploadPicker(page)

  // FB3-C5: the fixture uploads after the client's first library load, and the client serves that
  // listing for a minute (LIBRARY_FRESH_MS in the store). On a *fresh* instance that meant every read
  // below was reading a library the fixture was never in — the scenario returned here, and its new
  // assertions never ran. It used to pass on a long-lived server only because of the rows an earlier
  // run had left behind, which is a gate reading its own leftovers rather than the app. The refresh
  // control the toolbar already draws is the reader's own way out, so the gate takes that path: the
  // fixture must be in the *client's* library before anything here reads that library.
  const refreshed = await pressSurfaceControl(page, LABELS.musicRefresh, '[data-music-toolbar]')
  check('music: the toolbar reload control hands the just-uploaded fixture to the client library', refreshed)
  const rowsReady = await page
    .waitForFunction((titles) => titles.every((title) => [...document.querySelectorAll('[role="row"]')]
      .some((row) => row.textContent.includes(title))), { timeout: 15_000 }, MUSIC_TRACK_TITLES)
    .then(() => true, () => false)
  if (!rowsReady) {
    const listed = await page.evaluate(() => [...document.querySelectorAll('[role="row"]')].map((row) => (row.textContent ?? '').slice(0, 40)))
    check('music: the hub lists the seeded tracks', false, JSON.stringify({ checked: ['both titles'], listed }).slice(0, 300))
    return
  }
  check('music: the hub lists the seeded tracks', true)
  // FB-U4: the rows exist now, so the columns can be read in both of the shapes the same screen
  // gives them (windowed vs maximised).
  await assertMusicListDensity(page)
  await assertMusicToolbarRows(page)

  const motion = await hubMotionDurations(page)
  check('music: the hub opens with an entrance animation',
    Boolean(motion) && motion.scrim > 1 && motion.panel > 1, JSON.stringify(motion))

  // The reduced-motion check reopens the hub from the status bar footer, so it has to run before
  // anything is queued: once a track is current, the footer swaps the hub opener for the transport
  // row, and the 'Added to the queue' toast covers the floating player's own opener for seconds.
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await openMusicHub(page)
  const reduced = await hubMotionDurations(page)
  check('music: reduced motion silences the hub entrance',
    Boolean(reduced) && reduced.scrim <= 1 && reduced.panel <= 1, JSON.stringify(reduced))
  await page.emulateMediaFeatures([])
  await page.keyboard.press('Escape')
  await sleep(300)
  await openMusicHub(page)

  const menuQueued = await focusRevealedActivate(page, cssByLabels('div[role="row"] button', LABELS.musicMoreActions))
    && await page.waitForSelector('xpath/.//div[@role="menu"]', { timeout: 15_000 })
      .then(() => clickButton(page, LABELS.musicAddToQueue).then(() => true, () => false), () => false)
  check('music: the row menu queues a track without playing it', menuQueued)
  await sleep(300)

  await clickButton(page, LABELS.musicGridView)
  await page.waitForSelector(cssByLabels('div.grid-cols-2 button', LABELS.musicFavorite), { timeout: 15_000 })

  await page.setViewport({ width: 700, height: 900 })
  await sleep(500)
  const cardActions = await controlState(page, cssByLabels('div.grid-cols-2 button', LABELS.musicFavorite), { fromWrapper: true })
  check('music: card actions stay visible and clickable below md',
    Boolean(cardActions) && cardActions.opacity === 1 && cardActions.pointerEvents !== 'none' && cardActions.width > 0,
    JSON.stringify(cardActions))

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  await clickButton(page, LABELS.musicListView)
  // Every read below is about the list view and asks for it as `div[role="row"]`. If the switch did
  // not take — the hub's window state decides whether the control is drawn at all — then each read
  // would answer about the grid, and the phone-width block after them would wait for a header control
  // that is not there and abort the whole run, taking the scenarios after this one with it. So the
  // switch is read once, here: one honest failure instead of four and a crash.
  const listViewDrawn = await page.waitForSelector('div[role="row"]', { timeout: 15_000 }).then(() => true, () => false)
  check('music: the view switch draws the list the narrow reads are about', listViewDrawn)
  if (!listViewDrawn) {
    await page.setViewport(DESKTOP_VIEWPORT)
    await sleep(400)
    return
  }
  await page.setViewport({ width: 700, height: 900 })
  await sleep(500)
  const rowFavorite = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicFavorite))
  const rowMenu = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicMoreActions))
  check('music: row actions stay visible and clickable below md',
    [rowFavorite, rowMenu].every((control) => control
      && control.opacity === 1 && control.pointerEvents !== 'none' && control.width > 0),
    `favorite=${JSON.stringify(rowFavorite)} menu=${JSON.stringify(rowMenu)}`)

  await page.setViewport({ width: 375, height: 667 })
  await sleep(500)
  // Below the hub's 900px breakpoint the fixed-width side columns fold into drawers opened
  // from the header (UI-14), so the centre list — and the touch reveal rule on its rows —
  // now keeps the whole width instead of being squeezed away.
  const narrowFavorite = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicFavorite))
  check('music: row actions keep the touch reveal rule at 375px',
    Boolean(narrowFavorite) && narrowFavorite.opacity === 1 && narrowFavorite.pointerEvents !== 'none',
    JSON.stringify(narrowFavorite))

  // FB-R1: the narrow default (covers on a phone) is a default only. This reader picked rows at a
  // wide width earlier in this very scenario, and the phone must still draw rows: a default that
  // overrules a choice is the failure this asserts against. The defaulting half is pinned in jsdom
  // (`music-view-toggles.test.ts`) — a fresh profile is the only place it is visible, and this run
  // has already made the choice by now.
  const narrowRows = await page.$$eval('div[role="row"]', (rows) => rows.length)
  const narrowCards = await page.$$eval('div.grid-cols-2 > div', (cards) => cards.length)
  check('music: a phone keeps the view the reader chose, not the narrow default',
    narrowRows > 0 && narrowCards === 0, `rows=${narrowRows} cards=${narrowCards}`)

  const folded = await page.evaluate((navSelector) => {
    const row = document.querySelector('[role="rowgroup"] [role="row"]')
    return {
      navInline: Boolean(document.querySelector(navSelector)),
      rowWidth: row ? Math.round(row.getBoundingClientRect().width) : 0,
    }
  }, cssByLabels('aside', LABELS.musicHubNavigation))
  check('music: the hub folds its side columns and keeps the list width at 375px',
    !folded.navInline && folded.rowWidth >= 300, JSON.stringify(folded))

  // FB-U2: a phone width used to wrap the toolbar into six rows of controls, the 240px search box on
  // the first of them — measured at 390×844 before this: 145px of the row, 189px with the header, and
  // the list starting below that. Two bands are what the layout is worth, and the shape that draws
  // them is named here too, so a width cannot quietly go back to wrapping without a word.
  const phoneBudget = await readMusicToolbarBudget(page)
  check('music: the toolbar answers a phone width with two rows and keeps the list its floor',
    Boolean(phoneBudget) && phoneBudget.shape === 'stacked' && phoneBudget.bands <= 2
    && phoneBudget.floor >= MUSIC_BUDGET_POLICY_FLOOR && phoneBudget.content >= phoneBudget.floor,
    JSON.stringify(phoneBudget))

  // FB-R3: the height squeeze gets the same answer from the other side. 900 is the width where the
  // side columns are still inline, so the centre column is at its narrowest anywhere in this run.
  await page.setViewport({ width: 900, height: 600 })
  await sleep(500)
  const shortBudget = await readMusicToolbarBudget(page)
  check('music: a 600px-tall viewport keeps the toolbar at two rows and the list at its floor',
    Boolean(shortBudget) && shortBudget.bands <= 2 && shortBudget.content >= shortBudget.floor,
    JSON.stringify(shortBudget))
  await page.setViewport({ width: 375, height: 667 })
  await sleep(400)

  await page.click(cssByLabels('header button', LABELS.musicHubOpenNavigation))
  const drawerOpened = await page
    .waitForSelector(cssByLabels('[data-surface="drawer"] aside', LABELS.musicHubNavigation), { timeout: 15_000 })
    .then(() => true, () => false)
  check('music: the folded navigation opens as a drawer', drawerOpened)
  await page.keyboard.press('Escape')
  await sleep(300)

  await page.keyboard.press('Escape')
  await sleep(400)
  const narrowPlayer = await rectOf(page, cssByLabels('aside', LABELS.musicMiniPlayer))
  const navBar = await rectOf(page, cssByLabels('nav', LABELS.musicMobileNav))
  check('music: the floating player clears the mobile navigation bar',
    Boolean(narrowPlayer) && Boolean(navBar) && !overlaps(narrowPlayer, navBar)
    && narrowPlayer.x >= 0 && narrowPlayer.x + narrowPlayer.width <= 375.5,
    `player=${JSON.stringify(narrowPlayer)} nav=${JSON.stringify(navBar)}`)

  const queueButton = cssByLabels('aside button', LABELS.musicQueue)
  await (await page.$$(queueButton)).at(-1).click()
  const removeSelector = cssByLabels('aside button', LABELS.musicRemoveFromQueue)
  const queueShown = await page.waitForFunction((sel) => Boolean(document.querySelector(sel)),
    undefined, removeSelector).then(() => true, () => false)
  const queueRowText = await page.evaluate((sel) => {
    const button = document.querySelector(sel)
    return button?.parentElement?.textContent ?? null
  }, removeSelector)
  check('music: the floating player shows the track queued from the row menu',
    queueShown && Boolean(queueRowText?.includes('E2E Probe Audio')), String(queueRowText))
  const queueRemove = await controlState(page, removeSelector)
  check('music: queue actions stay visible and clickable on touch',
    Boolean(queueRemove) && queueRemove.opacity === 1 && queueRemove.pointerEvents !== 'none',
    JSON.stringify(queueRemove))

  // The immersive player shares UI-14's fold: below the breakpoint its fixed-width artwork
  // column stacks into a full-width row, so the lyrics pane keeps the viewport width instead
  // of being squeezed by the 384px column.
  await (await page.$$(cssByLabels('aside button', LABELS.musicImmersive))).at(-1).click()
  const immersiveDialog = cssByLabels('[role="dialog"]', LABELS.musicImmersive)
  const immersiveShown = await page.waitForSelector(immersiveDialog, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the floating player opens the immersive view at 375px', immersiveShown)
  if (immersiveShown) {
    // Scope the lookup inside the dialog itself: cssByLabels' comma union would let an
    // unscoped second branch match a background surface.
    const lyricsWidth = await page.evaluate((dialogLabels, lyricsLabels) => {
      const dialog = dialogLabels
        .map((label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`))
        .find(Boolean)
      const lyrics = dialog && dialog.querySelector(lyricsLabels
        .map((label) => `[role="group"][aria-label="${label}"]`)
        .join(', '))
      return lyrics ? Math.round(lyrics.getBoundingClientRect().width) : 0
    }, LABELS.musicImmersive, LABELS.musicLyrics)
    check('music: the immersive lyrics pane keeps its width at 375px',
      lyricsWidth >= 300, String(lyricsWidth))
    await assertNarrowImmersiveQueue(page)
    await page.keyboard.press('Escape')
    await sleep(300)
  }

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  // The card's own strip is swept last of the three surfaces, and after the queue press above on
  // purpose: the sweep presses every disclosure in the card, the queue toggle among them — run
  // earlier it would leave that panel open and the press below would close what it means to open.
  await assertMusicFloatingStrip(page)
  await assertMusicImmersiveFullscreen(page)
  await assertMusicStatusBarMore(page)
  // FB3-U3: both reads are geometry, so they belong here rather than in a class-name assertion.
  await assertMusicSettingsLayout(page)
  // FB3-C1 runs before the online scenario for the same reason that one runs last: it types a query.
  await assertMusicSearchClear(page)
  // FB2-C1 last: it types a query and turns the online switch on, which the reads above would
  // otherwise be measuring around.
  await assertMusicProviderResults(page)
  // The row index read runs first of the three at the end: it is the only one that starts playback, and
  // a current track changes the footer every earlier read walks past.
  await assertMusicRowIndexControl(page)
  // Then the immersive surface, which needs something playing to have a menu about.
  await assertMusicImmersiveMenu(page)
  // The touch pass first, and deliberately: touch emulation reloads the page, so everything after it
  // would be reading a shell that had just been rebuilt.
  await assertMusicTouchReveal(page)
  // Then the same rule read back on a pointer that can hover, against a pinned row this gate made.
  await assertMusicRowActionReveal(page)
  // The check the online scenario makes is about its own teardown; this one is about the three reads
  // above it, which open the hub and the player for themselves. A library left open turns the next
  // scenario's press on a shell control into a press on its scrim, and that is a failure two scenarios
  // away from its cause — so it is asserted where it happens.
  check('music: the surface reads at the end of the scenario leave no library open',
    (await page.$(MUSIC_HUB_ROOT)) === null)
}

// The immersive player used to hand right clicks to the browser: over a page of one song the menu
// offered reload, print and inspect. It answers with the track's own menu now — the same one the rows
// open, because it is the same store-held request — and the menu's "edit track" item reaches the hub's
// editor across a surface the menu does not own. The press is a real right button click at a measured
// point rather than a dispatched event, so what is read is the path a reader takes.
async function assertMusicImmersiveMenu(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  if (!(await page.$(MUSIC_HUB_ROOT))) await openMusicHubForSweep(page)
  const hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the hub opens for the immersive menu read', hubOpen)
  if (!hubOpen) return
  const opened = await pressSurfaceControl(page, LABELS.musicImmersive, MUSIC_HUB_ROOT)
  const immersive = cssByLabels('[role="dialog"]', LABELS.musicImmersive)
  const shown = await page.waitForSelector(immersive, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the toolbar button opens the immersive player for the menu read', opened && shown)
  if (!shown) return
  const point = await page.evaluate(({ dialog, lyric }) => {
    // Scoped to the dialog: the hub behind it keeps a lyrics pane of its own with the same name.
    const pane = document.querySelector(dialog)?.querySelector(lyric)
    if (!pane) return null
    const box = pane.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 60) }
  }, { dialog: immersive, lyric: cssByLabels('[role="group"]', LABELS.musicLyrics) })
  if (!point) {
    check('music: the immersive player draws a lyrics pane to right click', false, immersive)
    return
  }
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const menuDrawn = await page.waitForSelector('[role="menu"]', { timeout: 10_000 }).then(() => true, () => false)
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"]')]
    .map((item) => item.textContent ?? ''))
  const wanted = LABELS.musicEditTrack.some((label) => items.some((item) => item.includes(label)))
  check('music: a right click on the immersive player opens the track menu the rows open',
    menuDrawn && wanted, `menu=${menuDrawn} items=${JSON.stringify(items.map((item) => item.trim()).slice(0, 4))}`)
  // The gesture is what a reader reaches for to start or stop the song in front of them, so the menu
  // that answers it has to carry the transport — and on the track that is playing it reads as pause.
  // Matched exactly: "play all" is a different item and must not satisfy this read.
  const transport = [...LABELS.musicPlay, ...LABELS.musicPause].some((label) => items.some((item) => item.trim() === label))
  check('music: the immersive menu carries the transport for the track it was opened on',
    menuDrawn && transport, `items=${JSON.stringify(items.map((item) => item.trim()).slice(0, 4))}`)
  if (!menuDrawn) return
  const pressed = await pressSurfaceControl(page, LABELS.musicEditTrack)
  const readEditor = () => page.evaluate(({ immersiveRoot, title }) => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const top = dialogs.at(-1) ?? null
    return {
      topIsEditor: Boolean(top) && !top.matches(immersiveRoot) && (top.textContent ?? '').includes(title),
      playerStillOpen: Boolean(document.querySelector(immersiveRoot)),
    }
  }, { immersiveRoot: MUSIC_IMMERSIVE_ROOT, title: LABELS.musicEditTrack[0] })
  const editorDrawn = await waitForTruth(async () => (await readEditor()).topIsEditor, 15_000)
  check('music: the menu\u2019s edit item opens the hub\u2019s editor over the player', pressed && editorDrawn,
    JSON.stringify(await readEditor()))
  if (editorDrawn) {
    await page.keyboard.press('Escape')
    await sleep(600)
    const after = await readEditor()
    check('music: escape closes the editor and leaves the player it opened over',
      after.playerStillOpen && !after.topIsEditor, JSON.stringify(after))
  }
  await page.keyboard.press('Escape')
  await sleep(400)
  await closeMusicHub(page)
  check('music: the immersive menu read leaves no library open', (await page.$(MUSIC_HUB_ROOT)) === null)
}

// A tablet is wider than `md` and still cannot hover, so the md-gated reveal left those screens with
// row actions nobody could see or press — the row menu among them, which is the only way to the
// actions a row does not carry. Touch emulation is what makes the shell answer `(pointer: coarse)`,
// and it reloads the page, so the shell is opened again after each change rather than assumed.
async function assertMusicTouchReveal(page) {
  await page.setViewport({ width: 1400, height: 900, hasTouch: true })
  await sleep(1500)
  await dismissUpdatePrompt(page)
  const rows = await sweptRowsForReveal(page)
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  await parkPointer(page)
  const touch = await readRowActionControls(page)
  check('music: a touch screen keeps every row\u2019s actions drawn without a hover',
    coarse && rows && Array.isArray(touch) && touch.length > 0 && touch.every((row) => row.found >= 3 && row.hidden.length === 0),
    `coarse=${coarse} rows=${rows} ${JSON.stringify(touch)}`)
  // The pinned row the read below is about is made here, where the controls are drawn and a real press
  // can land on one. The fixture seeds none, so the state is this gate's own rather than something the
  // database happened to hold.
  if (Array.isArray(touch) && touch.length > 0 && !touch.some((row) => row.pinned)) {
    await pressSurfaceControl(page, LABELS.musicPin, MUSIC_HUB_ROOT)
    await sleep(400)
  }
  // Back to the pointer a laptop has, which reloads the page again — so the read below opens the
  // library for itself rather than inheriting this one.
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(1500)
  await dismissUpdatePrompt(page)
}

/**
 * FB4-2: the reveal rule is per row, so it is asserted per row rather than on whichever row the list
 * starts with — a row that is not pinned hides every action until the pointer arrives, and a row that
 * is pinned keeps the one control that says so and hides the rest (that control is why a pinned row can
 * be unpinned at all, which is how the state is handed back before leaving).
 */
async function assertMusicRowActionReveal(page) {
  const rowsOpen = await sweptRowsForReveal(page)
  if (!rowsOpen) {
    check('music: the row action read has rows to read', false)
    return
  }
  await parkPointer(page)
  const read = await readRowActionControls(page)
  const rows = Array.isArray(read) ? read : []
  const plain = rows.find((row) => !row.pinned)
  const marked = rows.find((row) => row.pinned)
  const hiddenHas = (row, labels) => Boolean(row) && row.hidden.some((label) => labels.includes(label))
  const shownHas = (row, labels) => Boolean(row) && row.shown.some((label) => labels.includes(label))
  // Asserted by which control, not by how many: a track the reader has favourited keeps its favourite
  // drawn too (the same rule the pin follows), so "exactly one control" would be asserting this
  // scenario's leftover state rather than the reveal rule.
  check('music: a row that is not pinned hides its pin and its menu for a pointer that can hover',
    Boolean(plain) && plain.found >= 3 && hiddenHas(plain, LABELS.musicPin) && hiddenHas(plain, LABELS.musicMoreActions),
    `rows=${rowsOpen} ${JSON.stringify(plain)}`)
  check('music: a pinned row keeps the control that says so drawn, and hides its menu',
    Boolean(marked) && marked.pinned && marked.found >= 3 &&
      shownHas(marked, LABELS.musicUnpin) && hiddenHas(marked, LABELS.musicMoreActions),
    `rows=${rowsOpen} ${JSON.stringify(marked)}`)
  if (marked) {
    await pressSurfaceControl(page, LABELS.musicUnpin, MUSIC_HUB_ROOT)
    await sleep(400)
  }
  await closeMusicHub(page)
}

/**
 * Opens the hub on the list view and waits for a row, which is the shape the reveal reads are about.
 * The reload the viewport change causes leaves the stored view mode in charge, so the list is asked for
 * again rather than assumed — a run that finished on the grid would otherwise have no rows to read.
 */
async function sweptRowsForReveal(page) {
  if (!(await page.$(MUSIC_HUB_ROOT))) await openMusicHubForSweep(page)
  const hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  if (!hubOpen) return false
  if ((await hubRowCount(page)) === 0) await pressSurfaceControl(page, LABELS.musicListView)
  return waitForTruth(async () => (await hubRowCount(page)) > 0, 15_000)
}

/**
 * Moves the pointer off the rows. The reveal rule is about a pointer that is *not* on the row, so a read
 * taken with the cursor still resting where the last press left it would measure a hover instead.
 */
async function parkPointer(page) {
  await page.mouse.move(2, 2)
  await sleep(300)
}

/**
 * How many rows the hub itself draws. The count is built from each row outward rather than by appending
 * a descendant to the hub's root selector: that root is a *list* of alternatives (one per language), and
 * a descendant only narrows the last of them — the first alternative alone matches the whole dialog, so
 * `MUSIC_HUB_ROOT + ' [role="row"]'` answers with the library whether or not it drew a row. That is what
 * the row-action read below used to measure, which is how it could report a pinned row's counts while
 * never looking at a row.
 */
async function hubRowCount(page) {
  return page.$$eval('[role="rowgroup"] > [role="row"]', (rows, root) => rows.filter((row) => row.closest(root)).length, MUSIC_HUB_ROOT)
}

/**
 * Every row's action controls: how many it carries, which are drawn, and whether the row says it is
 * pinned. Pinning is read off the row's own control (its label is the way out) rather than from the
 * order the rows come in, so a fixture that reorders itself cannot quietly stop testing this.
 */
async function readRowActionControls(page) {
  return page.evaluate(({ labels, root }) => {
    const wanted = [...labels.pin, ...labels.unpin, ...labels.favorite, ...labels.more]
    const labelOf = (button) => button.getAttribute('aria-label') ?? ''
    const isHidden = (button) => {
      const style = getComputedStyle(button)
      return Number(style.opacity) === 0 || style.pointerEvents === 'none'
    }
    // Each row outward (`closest`), for the reason spelled out on `hubRowCount`: the hub's root is a
    // selector list, and interpolating it here made the whole dialog the first "row".
    const rows = [...document.querySelectorAll('[role="rowgroup"] > [role="row"]')].filter((row) => row.closest(root))
    return rows.map((row) => {
      const controls = [...row.querySelectorAll('button')].filter((button) => wanted.includes(labelOf(button)))
      return {
        pinned: controls.some((button) => labels.unpin.includes(labelOf(button))),
        found: controls.length,
        shown: controls.filter((button) => !isHidden(button)).map(labelOf),
        hidden: controls.filter(isHidden).map(labelOf),
      }
    })
  }, { root: MUSIC_HUB_ROOT, labels: { pin: LABELS.musicPin, unpin: LABELS.musicUnpin, favorite: [...LABELS.musicFavorite, ...LABELS.musicUnfavorite], more: LABELS.musicMoreActions } })
}

// FB3-U3: the settings page draws two components at a width they were not designed against — the player
// popover's preset grid at ten times its width, and a two-column server form whose labels sized
// themselves to their own text. The class names say what was intended; these two reads say what the
// column actually did with them.
async function assertMusicSettingsLayout(page) {
  if (!(await page.$(MUSIC_HUB_ROOT))) await openMusicHubForSweep(page)
  const hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the hub opens for the settings layout read', hubOpen)
  if (!hubOpen) return
  await pressSurfaceControl(page, LABELS.musicOpenSettings)
  const opened = await page.waitForSelector(SETTINGS_PANEL, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the settings page opens for the music layout read', opened)
  if (!opened) return
  await sleep(600)
  const layout = await page.evaluate(({ panel, presetLabels }) => {
    const root = document.querySelector(panel)
    if (!root) return null
    const group = root.querySelector(presetLabels.map((label) => `[role="group"][aria-label="${label}"]`).join(', '))
    const presets = [...(group?.querySelectorAll('button') ?? [])]
    // The fields are laid out as (label, control) pairs across four columns, so the ones in column A are the
    // 1st, 3rd and 5th and the ones in column B are the 2nd and 4th — which is what "aligned" means here.
    const fields = [...root.querySelectorAll('[data-server-field]')]
    const lefts = fields.map((field) => {
      const box = field.querySelector('input, select')?.getBoundingClientRect()
      return box ? Math.round(box.left) : -1
    })
    return {
      presets: presets.length,
      presetRows: new Set(presets.map((button) => Math.round(button.getBoundingClientRect().top))).size,
      fields: fields.length,
      lefts,
      aligned: lefts.length === 5
        && new Set([lefts[0], lefts[2], lefts[4]]).size === 1
        && new Set([lefts[1], lefts[3]]).size === 1,
    }
  }, { panel: SETTINGS_PANEL, presetLabels: LABELS.musicEqPresets })
  check('music: the five equalizer presets share one row on the settings page',
    Boolean(layout) && layout.presets === 5 && layout.presetRows === 1, JSON.stringify(layout))
  check('music: the add-server fields share their label columns',
    Boolean(layout) && layout.fields === 5 && layout.aligned, JSON.stringify(layout))
  // FB3-F6: the order of the page is a claim about it, so it is read rather than left to the source:
  // playback defaults, then the online catalogues, then what is kept on the device, then the reader's
  // own servers.
  const groupOrder = await page.evaluate(({ panel, groups }) => {
    const headings = [...(document.querySelector(panel)?.querySelectorAll('h3') ?? [])].map((heading) => heading.textContent ?? '')
    return groups.map((spellings) => Math.min(...spellings.map((spelling) => headings.indexOf(spelling)).filter((index) => index >= 0), Infinity))
  }, { panel: SETTINGS_PANEL, groups: LABELS.musicSettingsGroups })
  check('music: the settings groups read playback → online sources → downloads → servers',
    groupOrder.length === 4 && groupOrder.every((index, position) =>
      Number.isFinite(index) && (position === 0 || groupOrder[position - 1] < index)),
    JSON.stringify(groupOrder))
  await page.keyboard.press('Escape')
  await sleep(400)
}

// FB3-C1: the box's clear control, which no gate had ever read. The gate's own teardown had been pressing
// it and believing the query was gone; it was not — the × ran the history action, so the box kept its text
// and every read after it was a read of a filtered hub. That belief is an assertion now, and the other half
// of the split (the popup's own action still means the history) is read in the same pass.
//
async function assertMusicSearchClear(page) {
  if (!(await page.$(MUSIC_HUB_ROOT))) await openMusicHubForSweep(page)
  const hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the hub opens for the search clear control read', hubOpen)
  if (!hubOpen) return
  const input = cssByLabels('input', LABELS.musicSearch)
  // The library half is read as text rather than as rows: the same title is drawn by the table's rows and
  // by the grid's cards, and this read is about whether the list is filtered, not about which view it is in.
  // FB3-C8: "the library" is the list's own column, not the whole hub — the sidebar's recently played
  // entry and the queue panel are other surfaces that legitimately name a track, so reading the dialog
  // as a whole answered "the library still lists it" for a hub whose list was already empty. This
  // passed when it was written only because nothing had been played yet in that run.
  const read = () => page.evaluate(({ input, emptyLabels, historyLabels }) => {
    const box = document.querySelector(input)
    const panel = document.querySelector('[role="dialog"]')
    const list = panel?.querySelector('[data-music-content]')
    const text = list?.textContent ?? ''
    const emptyAction = [...(panel?.querySelectorAll('button') ?? [])].some((button) => {
      const name = (button.getAttribute('aria-label') ?? '').trim() || (button.textContent ?? '').trim()
      return emptyLabels.includes(name)
    })
    const history = panel?.querySelector(historyLabels.map((label) => `[role="listbox"][aria-label="${label}"]`).join(', '))
    return {
      value: box?.value ?? null,
      caretInBox: box !== null && document.activeElement === box,
      library: text.includes('E2E Probe Audio'),
      emptyAction,
      historyRows: history ? history.querySelectorAll('[role="option"]').length : 0,
    }
  }, { input, emptyLabels: LABELS.musicSearchEmptyAction, historyLabels: LABELS.musicSearchHistory })

  await page.click(input)
  await page.keyboard.type('zzzz no such track', { delay: 20 })
  // The last read is kept for the message: a predicate that answers true/false leaves a failure with
  // nothing to read, and this is the assertion whose two halves (list gone, empty state drawn) are the
  // whole point of saying which one did not arrive.
  let filteredRead = null
  const filtered = await waitForTruth(async () => {
    filteredRead = await read()
    return !filteredRead.library && filteredRead.emptyAction
  }, 15_000)
  check('music: a query that matches nothing leaves the library and draws the empty state',
    filtered, JSON.stringify(filteredRead))
  // Committed so the history has an entry to leave alone; the caret stays in the box for the read below.
  await page.keyboard.press('Enter')
  await sleep(400)
  const pressed = await pressSurfaceControl(page, LABELS.musicSearchClear)
  await sleep(500)
  const cleared = await read()
  check('music: the box clear control empties the query and brings the library back',
    pressed && cleared.value === '' && cleared.library && !cleared.emptyAction,
    `pressed=${pressed} ${JSON.stringify(cleared)}`)
  check('music: clearing the query leaves the caret in the box, on the history it did not touch',
    cleared.caretInBox && cleared.historyRows >= 1, JSON.stringify(cleared))
  const clearedHistory = await pressSurfaceControl(page, LABELS.musicSearchClearHistory)
  await sleep(400)
  const afterHistory = await read()
  check("music: the popup's own action still clears the history, and only that",
    clearedHistory && afterHistory.historyRows === 0 && afterHistory.value === '',
    `pressed=${clearedHistory} ${JSON.stringify(afterHistory)}`)
  await page.keyboard.press('Escape')
  await sleep(300)
}

// Reads the index cell of every row that names the probe track: its number, the control beside it, and
// where those two boxes are drawn. Split from the assertions below because both the press and the reads
// after it ask the same question of the DOM, and asking it twice differently is how the two answers drift.
async function readMusicIndexCells(page, title) {
  return page.evaluate(({ title, play, pause }) => {
    const rows = [...document.querySelectorAll('div[role="row"]')].filter((row) => row.querySelector(':scope > [role="cell"]'))
    return rows.map((row, at) => {
      const cell = row.querySelectorAll(':scope > [role="cell"]')[1]
      const control = cell?.querySelector('button')
      const number = cell?.querySelector('span')
      const style = control ? getComputedStyle(control) : null
      const name = control?.getAttribute('aria-label') ?? ''
      const box = (element) => element.getBoundingClientRect()
      const named = (labels) => labels.some((label) => name.startsWith(label + ': '))
      return {
        namesTrack: (row.textContent ?? '').includes(title),
        place: at + 1,
        isCurrent: row.getAttribute('aria-current') === 'true',
        number: number?.textContent.trim() ?? '',
        numberRight: number ? Math.round(box(number).right) : 0,
        numberWidth: number ? Math.round(box(number).width) : 0,
        name,
        plays: named(play),
        pauses: named(pause),
        controlLeft: control ? Math.round(box(control).left) : 0,
        controlWidth: control ? Math.round(box(control).width) : 0,
        drawable: Boolean(style) && Number(style.opacity) === 1 && style.pointerEvents !== 'none',
      }
    })
  }, { title, play: LABELS.musicPlay, pause: LABELS.musicPause })
}

// The row's number and the control that plays it. The defect this reads against is the one a reader
// reported: the playing row swapped its number for a pause glyph, so the row they were looking for was
// the only one without a number, and pressing play meant a double click nothing announces. The hover
// that reveals the control at desktop widths cannot fire in this shell (headless answers `hover: none`,
// see `focusRevealedActivate`), so the trigger read here is the focus-within sibling of that rule — the
// one a keyboard user walks — and the control is activated with Enter rather than with a pointer.
async function assertMusicRowIndexControl(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  if (!(await page.$(MUSIC_HUB_ROOT))) await openMusicHubForSweep(page)
  const hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the hub opens for the row index control read', hubOpen)
  if (!hubOpen) return
  const title = MUSIC_TRACK_TITLES[0]
  const rowsDrawn = await waitForTruth(async () => (await readMusicIndexCells(page, title)).some((cell) => cell.namesTrack), 15_000)
  check('music: the row index control read has a probe track to press', rowsDrawn, title)
  if (!rowsDrawn) return
  const focus = () => page.evaluate((title) => {
    const row = [...document.querySelectorAll('div[role="row"]')].find((item) => item.textContent.includes(title))
    const control = row?.querySelectorAll(':scope > [role="cell"]')[1]?.querySelector('button')
    if (!control) return null
    control.focus()
    return control.getAttribute('aria-label')
  }, title)
  const idle = (await readMusicIndexCells(page, title)).find((cell) => cell.namesTrack)
  // The number is drawn for every row before anything is pressed, and it sits where the control is not:
  // an invisible control on top of it is the same defect with the number still in the DOM.
  check('music: every row draws its number beside, not under, the control that plays it',
    Boolean(idle) && idle.number === String(idle.place) && idle.numberWidth > 0 && idle.numberRight <= idle.controlLeft + 1,
    JSON.stringify(idle))
  const focusedName = await focus()
  await sleep(300)
  const revealed = (await readMusicIndexCells(page, title)).find((cell) => cell.namesTrack)
  check('music: focusing a row draws the index control it keeps for the pointer',
    Boolean(focusedName) && Boolean(revealed) && revealed.plays && revealed.drawable,
    JSON.stringify({ focusedName, revealed }))
  await page.keyboard.press('Enter')
  const started = await waitForTruth(async () => {
    const cells = await readMusicIndexCells(page, title)
    return cells.some((cell) => cell.namesTrack && cell.isCurrent && cell.pauses)
  }, 15_000)
  const playing = (await readMusicIndexCells(page, title)).find((cell) => cell.namesTrack && cell.isCurrent)
  // Two claims in one read: the playing row is the row that was pressed (it answers with the pause
  // spelling), and it still carries its place in the list while it plays.
  check('music: playing a row keeps its number and turns the control beside it into a pause',
    started && Boolean(playing) && playing.number === String(playing.place) && playing.drawable,
    JSON.stringify({ started, playing }))
  await focus()
  await page.keyboard.press('Enter')
  const paused = await waitForTruth(async () => {
    const cells = await readMusicIndexCells(page, title)
    return cells.some((cell) => cell.namesTrack && cell.isCurrent && cell.plays)
  }, 15_000)
  const resting = (await readMusicIndexCells(page, title)).find((cell) => cell.namesTrack && cell.isCurrent)
  check('music: pausing keeps the playing row its number and a control to press again',
    paused && Boolean(resting) && resting.number === String(resting.place) && resting.drawable && resting.plays,
    JSON.stringify({ paused, resting }))
  await closeMusicHub(page)
}

// FB2-C1: the online half of the library, which had no browser assertion at all — and the payload
// regression (an add whose body carried the catalogue's artwork, refused as "too large" before the
// schema ever saw it) lived exactly there. The catalogue is replaced by request interception, so
// this runs in CI without a third-party dependency; what it reads is the page's own shape and the
// presses a reader makes, including the one assertion that would have caught that regression on the
// day it landed: the body the page actually sends.
//
async function assertMusicProviderResults(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  const probe = await probeTrackForStub(page)
  if (!probe) {
    check('music: the online result list has a playable probe track to point its stream at', false)
    return
  }
  const stub = await installMusicProviderStub(page, { playUrl: `/api/music/tracks/${probe.id}/stream` })
  const libraryTitles = async () => ((await apiCall(page, 'GET', '/api/music/library')).data?.tracks ?? []).map((track) => track.title)
  // What the worker itself answered is read here rather than through the stub: the import is the half
  // the fixture deliberately leaves real, so its status is the evidence this scenario is about.
  const importStatuses = []
  const streamRequests = []
  const onImportResponse = (response) => { if (response.url().includes('/tracks/import-provider')) importStatuses.push(response.status()) }
  const onStreamRequest = (request) => { if (/\/api\/music\/tracks\/[^/]+\/stream/.test(request.url())) streamRequests.push(request.url()) }
  page.on('response', onImportResponse)
  page.on('request', onStreamRequest)
  // The switch is a preference of the account, so the state it was found in is the state this
  // scenario hands back: a run that left the online catalogue on would change what the next run reads.
  let switchWasOn = false
  try {
    // Whatever an earlier run left behind goes first, through the same endpoint that removes it at the
    // end. This scenario reads the library's own length to see its adds land, so a leftover row would
    // be read as "this add did nothing".
    await cleanupStubLibraryRows(page, PROVIDER_STUB_HITS.map((hit) => hit.title))
    const before = await libraryTitles()
    // The switch that turns the catalogue on lives in settings, and the panel only exists once it is
    // on — so the gate walks there the way a reader does, through the gear in the library's header
    // (FB-F4), rather than writing a preference behind the app's back.
    await openMusicHubForSweep(page)
    let hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
    if (!hubOpen) {
      // A notice left by an earlier surface is what a press can land on, and this scenario runs after
      // all of them: the hub not opening is retried once rather than read as a missing panel.
      await sleep(1_500)
      await openMusicHubForSweep(page)
      hubOpen = await page.waitForSelector(MUSIC_HUB_ROOT, { timeout: 15_000 }).then(() => true, () => false)
    }
    check('music: the hub opens for the online results read', hubOpen)
    if (!hubOpen) return
    await pressSurfaceControl(page, LABELS.musicOpenSettings)
    const settingsOpen = await page.waitForSelector(SETTINGS_PANEL, { timeout: 15_000 }).then(() => true, () => false)
    check('music: the library keeps a way to the music settings page in its header', settingsOpen)
    if (!settingsOpen) return
    // The opt-in is a decision with consequences: the notice beside the switch is acknowledged before
    // the switch will move, and a run that finds it already acknowledged just carries on.
    await pressSurfaceControl(page, LABELS.musicRiskAccept, SETTINGS_PANEL)
    switchWasOn = await readProviderSwitch(page, SETTINGS_PANEL)
    if (!switchWasOn) await pressSurfaceControl(page, LABELS.musicProviderSwitch, SETTINGS_PANEL)
    const switched = await waitForTruth(() => readProviderSwitch(page, SETTINGS_PANEL))
    check('music: the online catalogue is switched on from the settings page', switched)
    await page.keyboard.press('Escape')
    await sleep(600)
    // The gear leaves the library for the settings page, so the way back in is the opener again.
    await openMusicHubForSweep(page)
    const backInLibrary = await waitForTruth(async () => Boolean(await page.$(MUSIC_HUB_ROOT)), 15_000)
    check('music: closing the settings page hands the library back', backInLibrary)
    if (!backInLibrary) return
    await page.click(cssByLabels('input', LABELS.musicSearch))
    await page.keyboard.type('stub', { delay: 30 })
    const panel = await page.waitForSelector(cssByLabels('section', LABELS.musicProviderResults), { timeout: 15_000 }).then(() => true, () => false)
    if (!panel) {
      const why = await page.evaluate((labels) => ({
        hub: Boolean(document.querySelector('[role="dialog"]')),
        typed: document.querySelector(`input[aria-label="${labels[0]}"]`)?.value ?? null,
        sections: [...document.querySelectorAll('section')].map((item) => item.getAttribute('aria-label')).slice(0, 12),
      }), LABELS.musicSearch)
      check('music: a query opens the online results panel', false, JSON.stringify(why))
      return
    }
    check('music: a query opens the online results panel', true)
    const listed = await waitForTruth(() => page.evaluate((titles) => {
      const body = document.querySelector('[aria-label="Online results"], [aria-label="在线结果"]')
      return Boolean(body) && titles.every((title) => (body?.textContent ?? '').includes(title))
    }, PROVIDER_STUB_HITS.map((hit) => hit.title)), 20_000)
    check('music: the stubbed catalogue hits reach the panel', listed, JSON.stringify(stub.endpoints()))
    // FB3-F1 + FB3-U6: which catalogue to ask is the reader's first question about this list, and the
    // switch that governs the list is their second — so the two controls share the panel's header row,
    // and the scope is a real preference rather than decoration: narrowing it must cost one catalogue.
    const headerRead = await page.evaluate((section) => {
      const root = document.querySelector(section)
      const header = root?.querySelector('[data-provider-header]')
      const select = header?.querySelector('[data-provider-scope]')
      const toggle = header?.querySelector('[role="switch"]')
      return {
        labelled: select?.getAttribute('aria-label') ?? null,
        options: [...(select?.options ?? [])].map((option) => option.value),
        // The first entry is the aggregate; it is read by its own words rather than by its value.
        aggregate: select?.options?.[0]?.textContent ?? null,
        value: select?.value ?? null,
        switchInRow: Boolean(toggle) && Boolean(header?.contains(toggle)),
      }
    }, cssByLabels('section', LABELS.musicProviderResults))
    check('music: the search scope sits in the panel header beside the aggregate switch',
      Boolean(headerRead) && headerRead.switchInRow
        && LABELS.musicProviderScope.includes(headerRead.labelled)
        && LABELS.musicProviderScopeAll.includes(headerRead.aggregate)
        && headerRead.value === 'all'
        && headerRead.options.join(',') === 'all,netease,kuwo,migu,qq,bilibili',
      JSON.stringify(headerRead))
    // The stub records the search request, so the scope's cost is read from what the page asked for: a
    // narrowed scope has to be one request for that catalogue, which no class name can state.
    const searches = () => stub.calls.filter((call) => call.endpoint === 'search')
    const beforeNarrow = searches().length
    await page.select('[data-provider-scope]', 'kuwo')
    await waitForTruth(async () => searches().length > beforeNarrow, 20_000)
    const narrowed = searches().slice(beforeNarrow)
    const narrowedSources = [...new Set(narrowed.map((call) => new URL(call.url).searchParams.get('source')))]
    check('music: narrowing the scope asks one catalogue instead of five',
      narrowedSources.length === 1 && narrowedSources[0] === 'kuwo', JSON.stringify({ sources: narrowedSources }))
    // FB3-P1: back to the aggregate is answered from this session's memory of the same (scope,
    // keywords) — the reader pays once per question, not once per keystroke or per change of mind —
    // and the hits come back with it, which is what the reads below are about.
    await page.select('[data-provider-scope]', 'all')
    const relisted = await waitForTruth(() => page.evaluate((titles) => {
      const body = document.querySelector('[aria-label="Online results"], [aria-label="在线结果"]')
      return Boolean(body) && titles.every((title) => (body?.textContent ?? '').includes(title))
    }, PROVIDER_STUB_HITS.map((hit) => hit.title)), 20_000)
    await sleep(700)
    check('music: going back to the aggregate is answered from the session, not from five catalogues',
      relisted && searches().length - beforeNarrow === 1,
      JSON.stringify({ searches: searches().length - beforeNarrow, relisted }))

    const listedText = await panelText(page)
    check('music: a hit that reported a length shows it and a hit that did not names nothing',
      listedText.includes('03:34') && !listedText.includes('时长未知') && !listedText.includes('Length unknown'), JSON.stringify(listedText.slice(0, 200)))

    // Audition: the row is taken by the player. This is the symptom the payload regression was read
    // as — a hit that could be listed but never added, let alone played — so what it asserts is the
    // registration and the source handed to the player. Whether that stream then resolves is the
    // catalogue's answer and not this app's: from inside the sandbox the upstream is unreachable, and
    // the row is meant to land anyway (the degradation the import path is built to survive).
    await pressSurfaceControl(page, LABELS.musicProviderPreview, cssByLabels('section', LABELS.musicProviderResults))
    const previewed = await waitForTruth(async () => (await libraryTitles()).length === before.length + 1, 15_000)
    check('music: auditioning a hit registers it and hands the player its stream',
      previewed && streamRequests.length >= 1,
      JSON.stringify({ before: before.length, after: (await libraryTitles()).length, streams: streamRequests.length }))

    // FB-F10: the selection bar is drawn by a tick, and nothing is ticked yet — which is also why the
    // reads here are about the rows' own controls and not about the bar's.
    const batchBarAbsent = await page.evaluate((selector) => !/添加所选|Add selected/.test(document.querySelector(selector)?.textContent ?? ''),
      cssByLabels('section', LABELS.musicProviderResults))
    check('music: the selection bar is not drawn before anything is ticked', batchBarAbsent)
    // FB2-U3: the row the audition just registered now says the library holds it, and it offers no
    // second "Add" to press — the control is replaced by the fact. Read as a pair (the state's own
    // words, and the button being disabled) because a row that only looked different would still be a
    // second import offered to the reader. What used to be read here by pressing that button is
    // covered below, where it still exists: the batch re-adds a row the library already holds.
    const heldRead = await page.evaluate(({ selector, title, heldLabels, addLabels }) => {
      // The rows are read inside the panel element rather than with a descendant selector: the scope is
      // itself a comma-separated pair of labels, and `a, b li` matches the whole panel as well. Which
      // list is asked is named too (FB3-C7): the panel draws the suggestion rows above the hits, and a
      // hit the library already holds *is* one of those suggestions — so `li` would have answered with
      // the suggestion row, whose one button is its name plus the meta.
      const panel = document.querySelector(selector)
      const row = [...(panel?.querySelectorAll('[data-provider-results] > li') ?? [])].find((item) => (item.textContent ?? '').includes(title))
      if (!row) return null
      const buttons = [...row.querySelectorAll('button')]
      const held = buttons.find((button) => heldLabels.includes(button.textContent.trim()))
      return {
        named: held ? held.textContent.trim() : null,
        disabled: held ? held.disabled : false,
        offersAdd: buttons.some((button) => addLabels.includes(button.textContent.trim())),
      }
    }, {
      selector: cssByLabels('section', LABELS.musicProviderResults),
      title: PROVIDER_STUB_HITS[0].title,
      heldLabels: LABELS.musicProviderInLibrary,
      addLabels: LABELS.musicProviderAdd,
    })
    check('music: a row the library already holds says so instead of offering a second import',
      heldRead !== null && heldRead.named !== null && heldRead.disabled && !heldRead.offersAdd,
      JSON.stringify(heldRead))

    // Then the whole selection in one press: both rows ticked, which is the only path that lands the
    // second hit.
    // Then the whole selection in one press: every row ticked, which is the only path that lands the
    // hit the audition did not already register.
    //
    // FB3-C7: the words in the box are read *in the panel* — the library's jump targets and the
    // catalogue's answer are rows of it, drawn with the hits they lead to. They used to be a drop-down
    // over the panel, and that drop-down's box covered the first hits' own ticks and buttons: a press
    // aimed at a tick landed on a suggestion instead (measured then — the tick at x=297, the popup's box
    // starting at x=298). FB2-U7/U8's rule is kept here by construction and read as the pair below:
    // with the suggestion rows drawn, a real press on a tick reaches *that* tick. The rows are read by
    // the name the popup used to carry, because that is the name the reader hears for them.
    const suggestionStrip = await page.evaluate(({ selector, labels }) => {
      // Read from the panel element, not with a descendant selector: the scope is a comma-separated
      // pair, and `a, b [data-provider-suggestions]` is two selectors — the first one wins.
      const strip = document.querySelector(selector)?.querySelector('[data-provider-suggestions]')
      const named = strip?.getAttribute('aria-label') ?? null
      return {
        present: Boolean(strip),
        named: named !== null && labels.includes(named),
        rows: [...(strip?.querySelectorAll('button') ?? [])].map((button) => (button.textContent ?? '').trim()),
      }
    }, { selector: cssByLabels('section', LABELS.musicProviderResults), labels: LABELS.musicSearchSuggestions })
    check('music: the jump targets and the catalogue answer are rows of the panel',
      suggestionStrip.present && suggestionStrip.named, JSON.stringify(suggestionStrip))
    const tickCount = () => page.evaluate((selector) => {
      const panel = document.querySelector(selector)
      return [...(panel?.querySelectorAll('[role="checkbox"]') ?? [])]
        .filter((box) => box.getAttribute('aria-checked') === 'true').length
    }, cssByLabels('section', LABELS.musicProviderResults))
    const pressTick = (title) => pressSurfaceControl(page, [`选择 ${title}`, `Select ${title}`],
      cssByLabels('section', LABELS.musicProviderResults))
    const firstTick = await pressTick(PROVIDER_STUB_HITS[0].title)
    const ticksAfterOne = await tickCount()
    check('music: a real press on a tick reaches it, with the suggestion rows beside it',
      firstTick && ticksAfterOne === 1, JSON.stringify({ firstTick, ticksAfterOne, rows: suggestionStrip.rows.length }))
    // The rest of the answer is ticked the same way, so the batch this scenario presses is the one the
    // rows are showing — read back as the ticks themselves rather than as the count of controls drawn.
    await pressTick(PROVIDER_STUB_HITS[1].title)
    const ticked = await tickCount()
    check('music: the panel offers a tick per hit', ticked === PROVIDER_STUB_HITS.length, String(ticked))
    // The tick is what draws the bar, so the gate waits for the control it is about to press instead of
    // pressing into a re-render.
    const barDrawn = await waitForTruth(() => page.evaluate((selector) => {
      const root = document.querySelector(selector)
      return [...(root?.querySelectorAll('button') ?? [])]
        .some((button) => /添加所选|Add selected/.test(button.textContent ?? '') && button.getClientRects().length > 0)
    }, cssByLabels('section', LABELS.musicProviderResults)))
    check('music: ticking a hit draws the add-selected control', barDrawn, JSON.stringify(stub.endpoints()))
    const pressedBatch = await pressSurfaceControl(page, LABELS.musicProviderAddSelected, cssByLabels('section', LABELS.musicProviderResults))
    check('music: the selection bar answers the press that was aimed at it',
      pressedBatch, JSON.stringify({ pressedBatch }))
    const afterBatch = await waitForTruth(async () => {
      const titles = await libraryTitles()
      return PROVIDER_STUB_HITS.every((hit) => titles.includes(hit.title))
    }, 15_000)
    check('music: adding the whole selection lands every hit', afterBatch, JSON.stringify(await libraryTitles()))
    // The selection included the row the audition had already registered, so this is the app's own
    // idempotency read where it is still reachable: the library holds one row per hit, not two.
    const stubVariants = (await libraryTitles()).filter((title) => PROVIDER_STUB_HITS.some((hit) => hit.title === title))
    check('music: a hit the library already holds is not added a second time',
      stubVariants.length === PROVIDER_STUB_HITS.length, JSON.stringify(stubVariants))

    // FB2-U4: a full page of hits is read in one piece. The list used to be capped at four rows
    // (224px) inside a column that already scrolls, so half of a five-source answer sat behind a
    // second scrollbar the reader had to go looking for. The cap is now a full page, and this is a
    // geometry read rather than a class-name read: how many rows there are, and whether the list is
    // scrolling at all when they all fit.
    stub.setHits(PROVIDER_STUB_FULL_PAGE)
    const fullPageQuery = 'stubpage'
    // FB3-P1: this session already holds the answer to 'stub', and answering it again from what it
    // remembers is what the memo above is for — so the longer page is asked for under words the
    // session has not used. This read is about the list's geometry, not about what a repeat costs.
    await pressSurfaceControl(page, LABELS.musicSearchClear)
    await page.click(cssByLabels('input', LABELS.musicSearch))
    await page.keyboard.type(fullPageQuery, { delay: 30 })
    const fullPageDrawn = await waitForTruth(async () => page.evaluate((count) =>
      document.querySelectorAll('[data-provider-results] > li').length === count, PROVIDER_STUB_FULL_PAGE.length), 15_000)
    const listBox = await page.evaluate(() => {
      const list = document.querySelector('[data-provider-results]')
      if (!list) return null
      return { rows: list.children.length, clientHeight: list.clientHeight, scrollHeight: list.scrollHeight }
    })
    check('music: a full page of online hits is drawn without an inner scrollbar',
      fullPageDrawn && listBox !== null && listBox.scrollHeight <= listBox.clientHeight + 1, JSON.stringify(listBox))

    // The regression guard: every import the page sent carried the catalogue's ids, and none of them
    // carried the artwork or the words. The ceiling is well under the route's 8 KiB allowance, which
    // is what a body holding a cover could never stay beneath.
    const imports = stub.calls.filter((call) => call.endpoint === 'import')
    const shapes = imports.map((call) => ({ bytes: call.bytes, shape: call.shape }))
    check('music: every online import the page sent is metadata and ids, never the artwork',
      imports.length >= 2 && imports.every((call) => call.bytes <= 4096 && call.shape.coverId && call.shape.lyricId
        && !('coverDataUrl' in call.shape) && !('lyric' in call.shape)),
      JSON.stringify(shapes))
    check('music: the online import is never refused for its size',
      importStatuses.length >= 2 && importStatuses.every((status) => status < 400), JSON.stringify(importStatuses))
  } finally {
    // The switch goes back first, while the panel that holds it is still drawn; turning it off both
    // restores the setting the run found and takes the online panel out of the surfaces after it.
    if (!switchWasOn) await pressSurfaceControl(page, LABELS.musicProviderSwitch, cssByLabels('section', LABELS.musicProviderResults))
    await stub.stop()
    page.off('response', onImportResponse)
    page.off('request', onStreamRequest)
    await cleanupStubLibraryRows(page, PROVIDER_STUB_HITS.map((hit) => hit.title))
    // The query the scenario typed is left in the store, and a later read of the hub would then be a
    // read of a filtered hub. The box's own clear control is the way it goes.
    await pressSurfaceControl(page, LABELS.musicSearchClear)
    await closeMusicHub(page)
  }
  // The shell is handed back closed, and said so: the next scenario presses a shell control, and a hub
  // left standing turns that press into a press on its scrim (see `closeMusicHub`).
  check('music: the scenario hands the shell back with no library open',
    (await page.$(MUSIC_HUB_ROOT)) === null)
}

/**
 * Polls a predicate that lives on this side of the wire (an API call, an interception log). The
 * page-side waits below use `waitForFunction` instead, which is the same thing asked in the browser.
 */
async function waitForTruth(predicate, timeoutMs = 15_000, stepMs = 250) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return true
    if (Date.now() > deadline) return false
    await sleep(stepMs)
  }
}

/** The probe track the stub's play URL points at: a real, decodable, same-origin stream. */
async function probeTrackForStub(page) {
  const fixture = await seedMusicProbeTracks({ page })
  if (!fixture.found.length) return null
  const tracks = (await apiCall(page, 'GET', '/api/music/library')).data?.tracks ?? []
  return tracks.find((track) => track.title === MUSIC_PROBE.titles[0]) ?? null
}

/** Whether the aggregate-search switch is already on, so a run leaves it the way it found it. */
async function readProviderSwitch(page, scope = '') {
  return page.evaluate(({ selector, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    return root?.querySelector(selector)?.getAttribute('aria-checked') === 'true'
  }, { selector: cssByLabels('button', LABELS.musicProviderSwitch), scope })
}

/** The panel's own text, so the two duration rules can be read off one answer. */
async function panelText(page) {
  return page.evaluate(() => document.querySelector('[aria-label="Online results"], [aria-label="在线结果"]')?.textContent ?? '')
}

/**
 * Whatever this scenario added is removed again by title, the way it was added: through the
 * product's own endpoint. The music surfaces the contrast gate reads later must not inherit rows
 * this run invented, and a stub artwork on one of them would make that read about the wrong thing.
 */
async function cleanupStubLibraryRows(page, titles) {
  const tracks = (await apiCall(page, 'GET', '/api/music/library')).data?.tracks ?? []
  for (const track of tracks.filter((row) => titles.includes(row.title))) {
    await apiCall(page, 'DELETE', `/api/music/tracks/${track.id}`)
  }
}

/**
 * FB-C3: the floating card is the third music surface, and it is the one the toolbar sweep cannot
 * take: it is not an overlay, so it has no Escape and no opener to hand the keyboard back to. The rule
 * is asked of it here on the card's own terms — every disclosure in the strip is pressed and the rows
 * that hold them may not change shape: not the control's own height, not the height of the row it sits
 * in, and not its place within the card. The place is measured from the card's top rather than from the
 * screen, because this card is anchored to the bottom edge and grows upwards: the queue it folds out is
 * appended below the strip, which is one of the four places an expansion is allowed to live, and a
 * panel drawn as a row of the strip would be caught by all three readings at once.
 */
async function assertMusicFloatingStrip(page) {
  const card = cssByLabels('aside', LABELS.musicMiniPlayer)
  const read = (index) => page.evaluate(({ selector, index }) => {
    const aside = document.querySelector(selector)
    const toggles = [...(aside?.querySelectorAll('button[aria-pressed], button[aria-expanded]') ?? [])]
      .filter((item) => item.getBoundingClientRect().width > 0)
    const toggle = toggles[index]
    if (!aside || !toggle) return null
    const box = toggle.getBoundingClientRect()
    return {
      count: toggles.length,
      label: (toggle.getAttribute('aria-label') || toggle.textContent.trim()).slice(0, 24),
      height: Math.round(box.height),
      rowHeight: Math.round(toggle.parentElement?.getBoundingClientRect().height ?? 0),
      fromTop: Math.round(box.top - aside.getBoundingClientRect().top),
    }
  }, { selector: card, index })
  const press = (index) => page.evaluate(({ selector, index }) => {
    const aside = document.querySelector(selector)
    const toggles = [...(aside?.querySelectorAll('button[aria-pressed], button[aria-expanded]') ?? [])]
      .filter((item) => item.getBoundingClientRect().width > 0)
    const toggle = toggles[index]
    if (!toggle) return false
    toggle.click()
    return true
  }, { selector: card, index })

  const first = await read(0)
  if (!first) {
    check("music: the floating player's strip holds its shape as its panels open", false, 'the card offers no disclosure to press')
    return
  }
  const moved = []
  for (let index = 0; index < first.count; index += 1) {
    const before = await read(index)
    await press(index)
    await sleep(320)
    const after = await read(index)
    const held = before && after && after.height === before.height
      && after.rowHeight === before.rowHeight && after.fromTop === before.fromTop
    if (!held) {
      moved.push(`${before?.label ?? index}: ${before?.height}/${before?.rowHeight}/${before?.fromTop} -> ${after?.height}/${after?.rowHeight}/${after?.fromTop}`)
    }
    // A panel opens through a portal or gains a row of its own; Escape is what closes the first kind.
    await page.keyboard.press('Escape')
    await sleep(200)
  }
  check("music: the floating player's strip holds its shape as its panels open", moved.length === 0, moved.join(', '))
}

/**
 * FB-C3: the immersive player takes the modal shell's full screen variant too, and what this reads is
 * the shell rather than the header the sweep below holds to its size — after the header's own
 * toggle, the dialog the shell draws has to be the viewport. Opened from the floating card's
 * immersive control, which is the path the card itself offers at this width, and Escape closes it.
 */
/**
 * FB2-U6: the same queue at the width where the columns have stacked. There is no second column to move
 * it into, so the strip under the lyrics is its home and the strip's own row is the way in — the header
 * has no count at this width (the count tick lives with the columns). What this reads is that the narrow
 * shape kept the strip rather than inheriting the wide pane: no search box, not inside the artwork
 * column, and inside the viewport, because this row is the last one on a surface that fills the screen.
 */
async function assertNarrowImmersiveQueue(page) {
  // The fold lives with the surface rather than with the press, so the read normalises before it
  // measures: an earlier surface may have left the queue open, and then there is no entry row to press.
  if ((await readNarrowQueue(page)).open) {
    await pressNarrowQueueToggle(page, true)
    await sleep(300)
  }
  const pressed = await pressNarrowQueueToggle(page, false)
  await sleep(400)
  const opened = await readNarrowQueue(page)
  check('music: at 375px the queue opens as the strip under the lyrics, with no search box',
    pressed && opened.open && !opened.inArtworkColumn && !opened.hasSearch, `pressed=${pressed} ${JSON.stringify(opened)}`)
  check('music: at 375px the queue strip stays inside the viewport', opened.insideViewport, JSON.stringify(opened))
  // FB3-U9: the strip is a slice of the lyrics column, so its cost has to be bounded — a row of it has
  // to be readable, and the column under the words may not start scrolling around it as well.
  check('music: at 375px the open strip keeps a whole row and adds no second scrollbar',
    opened.rows >= 1 && opened.lyricsScrolls === false, JSON.stringify(opened))
}

/** Whether the narrow queue is open, where it landed, and whether it fits the viewport. */
async function readNarrowQueue(page) {
  return page.evaluate(({ root, queueLabels, searchLabels }) => {
    const dialog = document.querySelector(root)
    const sections = [...(dialog?.querySelectorAll('section') ?? [])]
    const artwork = sections[0]
    const lyrics = sections[1]
    const group = dialog?.querySelector(queueLabels.map((label) => `[aria-label="${label}"]`).join(', '))
    const box = group?.getBoundingClientRect()
    const rows = group ? group.querySelectorAll('button').length : 0
    return {
      open: Boolean(group),
      inArtworkColumn: Boolean(group && artwork?.contains(group)),
      hasSearch: Boolean(dialog?.querySelector(searchLabels.map((label) => `input[aria-label="${label}"]`).join(', '))),
      insideViewport: box ? box.bottom <= window.innerHeight + 1 && box.top >= 0 : false,
      rows,
      lyricsScrolls: lyrics ? lyrics.scrollHeight > lyrics.clientHeight + 1 : false,
      bottom: box ? Math.round(box.bottom) : 0,
      viewport: window.innerHeight,
    }
  }, { root: MUSIC_IMMERSIVE_ROOT, queueLabels: LABELS.musicQueue, searchLabels: LABELS.musicQueueSearch })
}

/** The queue's own control in the state asked for: the strip's way in is the folded one. */
async function pressNarrowQueueToggle(page, expanded) {
  return page.evaluate(({ root, labels, expanded }) => {
    const dialog = document.querySelector(root)
    const control = [...(dialog?.querySelectorAll('button') ?? [])]
      .find((item) => labels.musicQueueToggle.includes(item.getAttribute('aria-label') ?? '')
        && item.getAttribute('aria-expanded') === String(expanded) && item.getClientRects().length > 0)
    if (!control) return false
    control.click()
    return true
  }, { root: MUSIC_IMMERSIVE_ROOT, labels: LABELS, expanded })
}

async function assertMusicImmersiveFullscreen(page) {
  // The card's own control, scoped to the card: the label is shared with the surface itself, and an
  // unscoped lookup finds the dialog's title where the button should be.
  const opener = cssByLabels('aside button', LABELS.musicImmersive)
  const pressed = await page.$$(opener).then(
    async (handles) => { const handle = handles.at(-1); if (!handle) return false; await handle.click(); return true },
    () => false,
  )
  const shown = Boolean(pressed) && await page.waitForSelector(MUSIC_IMMERSIVE_ROOT, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the floating player opens the immersive player', Boolean(shown))
  if (!shown) return
  await waitForPanelSettled(page, MUSIC_IMMERSIVE_ROOT)
  // FB2-U1 runs while the surface is open and before it is maximised: it is about where the queue
  // the header discloses really lands, which is the same question in both window sizes.
  await assertMusicImmersiveQueue(page)
  await clickButton(page, LABELS.musicMaximizePlayer)
  await sleep(400)
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const filled = await rectOf(page, MUSIC_IMMERSIVE_ROOT)
  check('music: the maximized immersive player fills the viewport',
    Boolean(filled) && Math.abs(filled.width - viewport.width) <= 8 && Math.abs(filled.height - viewport.height) <= 8,
    `viewport=${JSON.stringify(viewport)} filled=${JSON.stringify(filled)}`)
  await page.keyboard.press('Escape')
  await sleep(400)
}

/**
 * FB2-U1: the queue the hub and the floating card both answer with a search box now lives in this
 * surface's artwork column too — that column had half of itself empty under the transport while the
 * queue spent a slice of the lyrics column below the words. Where it landed, and whether its search
 * really narrows the rows, are layout facts no unit test can see; the header that discloses it may
 * not change height, because that row is the one the toolbar sweep holds to its size.
 *
 * Called with the surface already open, and it leaves the queue folded again.
 */
async function assertMusicImmersiveQueue(page) {
  // Built here rather than inside the page: a label pair interpolated into one selector is a
  // selector the browser refuses, which is how this read first reported itself as a crash.
  const queueSelector = LABELS.musicQueue.map((label) => `[aria-label="${label}"]`).join(', ')
  const searchSelector = LABELS.musicQueueSearch.map((label) => `input[aria-label="${label}"]`).join(', ')
  const read = () => page.evaluate(({ root, queueSelector, searchSelector }) => {
    const dialog = document.querySelector(root)
    const sections = [...(dialog?.querySelectorAll('section') ?? [])]
    const [artwork, lyrics] = sections
    const group = dialog?.querySelector(queueSelector) ?? null
    const header = dialog?.querySelector('[data-immersive-header]')
    const rows = [...(group?.querySelectorAll('button') ?? [])]
      .map((button) => (button.textContent ?? '').trim())
      .filter((text) => text.includes('Probe Audio'))
    // FB3-U9: the queue takes the room the artwork does not need, and the column itself may not
    // start scrolling around it — a second scrollbar beside the queue's own is the shape this read
    // exists to rule out. "A whole row" is a row whose box sits inside the queue's box, because a
    // pane squeezed to its header would still hold rows below the fold.
    const groupBox = group?.getBoundingClientRect()
    const visibleRows = groupBox
      ? [...group.querySelectorAll('button')].filter((row) => {
        const box = row.getBoundingClientRect()
        return box.height > 0 && box.top >= groupBox.top - 1 && box.bottom <= groupBox.bottom + 1
      }).length
      : 0
    return {
      host: group ? (artwork?.contains(group) ? 'artwork' : lyrics?.contains(group) ? 'lyrics' : 'other') : 'none',
      search: Boolean(dialog?.querySelector(searchSelector)),
      rows,
      visibleRows,
      artworkScrolls: artwork ? artwork.scrollHeight > artwork.clientHeight + 1 : false,
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
      pictureWidth: artwork?.firstElementChild ? Math.round(artwork.firstElementChild.getBoundingClientRect().width) : 0,
    }
  }, { root: MUSIC_IMMERSIVE_ROOT, queueSelector, searchSelector })
  // Scoped to the header row, because the pane carries a collapse control of the same name once it
  // is open: this read is about the way in the header offers.
  const press = () => page.evaluate(({ root, labels }) => {
    const dialog = document.querySelector(root)
    const header = dialog?.querySelector('[data-immersive-header]')
    const control = [...(header?.querySelectorAll('button') ?? [])]
      .find((item) => labels.musicQueueToggle.includes(item.getAttribute('aria-label') ?? '') && item.getClientRects().length > 0)
    if (!control) return false
    control.click()
    return true
  }, { root: MUSIC_IMMERSIVE_ROOT, labels: LABELS })

  // FB3-U2: the fold opens in the shape's own default, and on this window that default is out — the
  // column the queue lives in had half of itself empty on every open, so asking for it first was a press
  // spent on nothing. An earlier surface may have folded it (the fold lives with the surface), so this
  // read normalises to open rather than assuming a fresh mount.
  let opened = await read()
  if (opened.host === 'none') {
    await press()
    await sleep(400)
    opened = await read()
  }
  check('music: a wide window opens the immersive queue in the artwork column, with its search',
    opened.host === 'artwork' && opened.search && opened.rows.length >= 1, JSON.stringify(opened))
  check('music: the open queue shows a whole row and the column does not grow a second scrollbar',
    opened.visibleRows >= 1 && opened.artworkScrolls === false, JSON.stringify(opened))
  // The queue takes the room the artwork does not need: a pane squeezed to its own header is a
  // control that opens nothing, which is what the strip this replaces left in its place.
  const tucked = await press()
  await sleep(400)
  const folded = await read()
  check('music: the immersive queue folds away from its own header',
    tucked && folded.host === 'none' && !folded.search, `pressed=${tucked} ${JSON.stringify(folded)}`)
  check('music: the immersive header keeps its height while the queue moves',
    folded.headerHeight > 0 && folded.headerHeight === opened.headerHeight,
    `${opened.headerHeight} -> ${folded.headerHeight}`)
  check('music: the artwork gives the queue its room while it is open',
    opened.pictureWidth > 0 && opened.pictureWidth < folded.pictureWidth,
    `${folded.pictureWidth} -> ${opened.pictureWidth}`)
  await press()
  await sleep(400)
  const after = await read()
  // A search that is merely drawn is not a search: the query has to narrow the rows.
  const typed = await page.evaluate(({ root, searchSelector }) => {
    const dialog = document.querySelector(root)
    const input = dialog?.querySelector(searchSelector)
    if (!input) return false
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, 'no such track in this queue')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, { root: MUSIC_IMMERSIVE_ROOT, searchSelector })
  await sleep(300)
  const filtered = await read()
  check('music: the queue search really narrows the rows it is over',
    typed && filtered.rows.length === 0 && after.rows.length >= 1,
    `typed=${typed} rows=${after.rows.length} -> ${filtered.rows.length}`)
  await press()
  await sleep(300)
  const refolded = await read()
  check('music: the queue folds away again after its search was used',
    refolded.host === 'none' && refolded.pictureWidth === folded.pictureWidth, JSON.stringify(refolded))
}

/**
 * The share center is the one large surface the shell renders through the shared Modal: a dialog at
 * desktop width and that modal's full screen variant at the phone breakpoint. It is opened the way a
 * person opens it — the sidebar's Share entry switches the list to the shared view, whose header
 * carries the manage-shares control — so Escape has an opener to hand focus back to.
 *
 * The data behind it is real: the KPI strip only paints once the analytics request through the
 * worker and D1 resolved, so a dashboard stuck on its loading skeleton fails here instead of
 * passing on an empty shell.
 */
const SHARE_DIALOG = SHARE_HUB_DIALOG
const MOBILE_PANE = '.mobile-pane-layer[data-active]'

/**
 * Opens the share center through `openShareCenter` in `e2e-harness.mjs`: the same labels, the same
 * two presses and the same opener marking `scripts/check-contrast.mjs` opens it with. This gate
 * used to carry its own copy of all three, which could only ever fail as "the control is gone" on
 * whichever side was not updated when a label changed (SH-99).
 */
function openShareHub(page, { mobile = false } = {}) {
  return openShareCenter(page, { mobile })
}

/**
 * Presses one control inside the share center by its accessible name, returning whether it was
 * found — the same rule the opener sweep follows, narrowed to the dialog that is already open.
 */
async function pressHubControl(page, labels) {
  const point = await page.evaluate(({ dialog, labels }) => {
    const hub = document.querySelector(dialog)
    const control = [...(hub?.querySelectorAll('button') ?? [])]
      .find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
    if (!control) return null
    control.scrollIntoView({ block: 'center' })
    const box = control.getBoundingClientRect()
    ;(window.__gateOpeners ??= []).push(control)
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { dialog: SHARE_DIALOG, labels })
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  await sleep(700)
  return true
}

/**
 * Picks one category in the share center's own sidebar, the way a person does: by its visible name.
 * The rows are buttons that carry their label as text (a count badge may ride behind it), so the
 * press lands on the one whose text starts with the name rather than on whatever matches first.
 */
async function gotoSidebarCategory(page, labels) {
  const point = await page.evaluate(({ dialog, labels }) => {
    const hub = document.querySelector(dialog)
    const row = [...(hub?.querySelectorAll('aside button') ?? [])]
      .find((item) => labels.some((label) => item.textContent.trim().startsWith(label)))
    if (!row) return null
    const box = row.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { dialog: SHARE_DIALOG, labels })
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  await sleep(900)
  return true
}

async function assertShareCenter(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  // What the reads below mean depends on the account having something to draw — a KPI delta badge
  // needs traffic, a sidebar tag row needs a tag — and CI's fixture account has neither until this
  // puts them there (SH-103). The result is asserted rather than trusted: a fixture that quietly
  // failed to be there reads exactly like a clean account.
  const fixture = await seedShareHubData({ page, base: BASE })
  check('share: the account carries a tag and a visit so the reads below are about a real one',
    fixture.views > 0 && fixture.share === 200 && (fixture.tag === 200 || fixture.tag === 201),
    JSON.stringify(fixture))
  const { opened, reason } = await openShareHub(page)
  check('share: the shared view opens the share center', opened, reason)
  if (!opened) return
  await waitForPanelSettled(page, SHARE_DIALOG)
  await ensureAxe(page)

  const kpi = await page.waitForFunction(({ dialog, labels }) => {
    const hub = document.querySelector(dialog)
    return Boolean(hub) && labels.some((label) => hub.textContent.includes(label))
  }, { timeout: 20_000 }, { dialog: SHARE_DIALOG, labels: LABELS.shareKpi }).then(() => true, () => false)
  check('share: the center draws its KPIs from the analytics request', kpi)

  // The two axe reads below are the reason the fixture exists, so the surface SH-102 lived in is
  // asserted to be painted rather than assumed: a KPI card draws its delta badge only when the
  // account has something to compare, and a run where the fixture's visit never landed would read a
  // quieter center and still pass. Reading the badge is what makes "no violations" mean something.
  const delta = await page.evaluate((dialog) => {
    const hub = document.querySelector(dialog)
    return [...(hub?.querySelectorAll('span') ?? [])]
      .some((span) => /^[+-]?\d+%$/.test((span.textContent ?? '').trim()))
  }, SHARE_DIALOG)
  check('share: the center paints a KPI delta badge, so its semantics are read below', delta)

  const desktop = await runAxe(page, SHARE_DIALOG)
  check('share: the center has no accessibility violations at desktop width',
    desktop.violations.length === 0, JSON.stringify(desktop.violations.slice(0, 3)))
  const unreviewed = desktop.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('share: no unreviewed axe items in the center',
    unreviewed.length === 0, JSON.stringify(unreviewed.slice(0, 3)))

  // The dashboard is the category the hub opens on; the list is where the rows live — the share
  // rows, their pin/star/copy controls and the toolbar. Switching to it in the sidebar is how a
  // person gets there, and it is read for the same two things: the toolbar drew itself, and every
  // control in it has a name axe accepts.
  const listed = await gotoSidebarCategory(page, SHARE_LABELS.categoryAll)
  const toolbar = await page.waitForFunction(({ dialog, labels }) => {
    const hub = document.querySelector(dialog)
    return Boolean(hub) && [...hub.querySelectorAll('input')].some((input) => labels.includes(input.getAttribute('aria-label') ?? ''))
  }, { timeout: 15_000 }, { dialog: SHARE_DIALOG, labels: LABELS.shareSearch }).then(() => true, () => false)
  check('share: the sidebar switches the center to the list and its toolbar', listed && toolbar)
  const listAxe = await runAxe(page, SHARE_DIALOG)
  check('share: the list view of the center has no accessibility violations',
    listAxe.violations.length === 0, JSON.stringify(listAxe.violations.slice(0, 3)))
  const listUnreviewed = listAxe.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('share: no unreviewed axe items in the list view',
    listUnreviewed.length === 0, JSON.stringify(listUnreviewed.slice(0, 3)))

  await page.keyboard.press('Escape')
  await sleep(700)
  const closed = await page.evaluate((selector) => ({
    hub: Boolean(document.querySelector(selector)),
    returned: document.activeElement === (window.__gateOpeners ?? []).find((element) => element.isConnected),
  }), SHARE_DIALOG)
  check('share: the center closes with escape and hands focus back to its control',
    !closed.hub && closed.returned, JSON.stringify(closed))

  await page.setViewport(MOBILE_VIEWPORT)
  await sleep(700)
  const { opened: reopened, reason: reopenReason } = await openShareHub(page, { mobile: true })
  check('share: the phone breakpoint opens the center from the bottom bar', reopened, reopenReason)
  if (!reopened) return
  await waitForPanelSettled(page, SHARE_DIALOG)

  const covered = await page.evaluate((selector) => {
    const hub = document.querySelector(selector)
    if (!hub) return null
    const box = hub.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  }, SHARE_DIALOG)
  check('share: the center takes the phone breakpoint as a full screen surface',
    Boolean(covered) && covered.width >= covered.viewportWidth - 1 && covered.height >= covered.viewportHeight - 1,
    JSON.stringify(covered))

  const narrow = await runAxe(page, SHARE_DIALOG)
  check('share: the full screen variant has no accessibility violations',
    narrow.violations.length === 0, JSON.stringify(narrow.violations.slice(0, 3)))

  // The traffic filter is the panel this gate was added for at this width: it used to be pinned to
  // the right edge of its control, so its 320px box lost the field it starts with on a 360px phone.
  // "Inside the viewport" is read as numbers off the drawn box, and the keyboard is checked the way
  // the panel promises: Escape closes it and the control that opened it holds the focus again.
  const filtered = await pressHubControl(page, LABELS.shareTrafficFilter)
  const box = await page.evaluate((labels) => {
    const panel = [...document.querySelectorAll('[role="dialog"]')]
      .find((dialog) => labels.includes(dialog.getAttribute('aria-label') ?? ''))
    if (!panel) return null
    const rect = panel.getBoundingClientRect()
    return {
      left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top),
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    }
  }, LABELS.shareTrafficFilter)
  check('share: the traffic filter stays inside a phone viewport',
    Boolean(box) && box.left >= 0 && box.right <= box.viewportWidth && box.top >= 0 && box.top < box.viewportHeight,
    JSON.stringify(box))

  const filterAxe = await runAxe(page, cssByLabels('[role="dialog"]', LABELS.shareTrafficFilter))
  check('share: the traffic filter panel has no accessibility violations',
    filterAxe.violations.length === 0, JSON.stringify(filterAxe.violations.slice(0, 3)))

  await page.keyboard.press('Escape')
  await sleep(500)
  const filterClosed = await page.evaluate((labels) => ({
    panel: [...document.querySelectorAll('[role="dialog"]')].some((dialog) => labels.includes(dialog.getAttribute('aria-label') ?? '')),
    focus: document.activeElement?.getAttribute('aria-label') ?? 'nothing',
  }), LABELS.shareTrafficFilter)
  check('share: escape closes the traffic filter and hands the focus back to its control',
    !filterClosed.panel && LABELS.shareTrafficFilter.includes(filterClosed.focus), JSON.stringify(filterClosed))

  await page.keyboard.press('Escape')
  await sleep(700)
  // The shell holds its own inactive panes inert at this width, so "released" is asked of the opener
  // rather than of the page: the control the surface was opened from is back under the keyboard and
  // no longer inside an inert subtree, which is what a person finds when they press Escape.
  const released = await page.evaluate((selector) => {
    const opener = (window.__gateOpeners ?? []).find((element) => element.isConnected)
    return {
      hub: Boolean(document.querySelector(selector)),
      focus: document.activeElement === opener,
      inert: Boolean(opener?.closest('[inert]')),
      active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? 'nothing',
    }
  }, SHARE_DIALOG)
  check('share: the full screen variant closes with escape and releases the app',
    !released.hub && released.focus && !released.inert, JSON.stringify(released))

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
}

/**
 * The directory this scenario publishes for itself. The tag name carries a per-run stamp on purpose:
 * the deliberate wrong guess below spends one of the address's free failures, and that counter is
 * keyed by the address rather than by whoever is guessing — a locked collection refuses the correct
 * password too, in 60-second steps that outlive the run. A fixed name would therefore hand the next
 * run against the same instance an address it cannot unlock, and a green run would silently depend
 * on how long ago the last one was.
 */
const COLLECTION_PROBE = {
  noteTitle: 'Collection directory probe',
  tagName: `Directory probe ${Date.now().toString(36).slice(-5)}`,
  password: 'directory-pass-900',
}

/**
 * The visit row is written after the response is sent (the worker hands `recordShareVisit` to
 * `waitUntil`), so it is polled rather than assumed to be there on the first read.
 */
async function waitForVisitChannel(page, slug, channel, attempts = 24) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const visits = await apiCall(page, 'GET', '/api/share/visits?limit=20')
    const row = (visits.data?.visits ?? []).find((visit) => visit.slug === slug && visit.channel === channel)
    if (row) return true
    await sleep(500)
  }
  return false
}

/**
 * The probe takes its own traces back out, because two of them change what this gate's a11y pass
 * over the share center reads — earlier in the same run, and again on a later run against the same
 * instance. A tag puts a row carrying an unnamed icon button and a `div[role=button]` into the hub's
 * sidebar, and a recorded visit makes the KPI cards draw their deltas; leaving either behind would
 * make the next run's red about the fixture rather than about the product, which is the same class
 * of defect as an assertion that holds only on a first run.
 *
 * The visit wipe is the product's own audit-trail delete, scoped to the note this probe created, so
 * it removes only what the probe wrote. It is checked rather than assumed: a silent failure here
 * would resurface as exactly the confusing red it exists to prevent.
 */
async function removeCollectionProbe(page, { noteId, collectionId, tagId }) {
  const visits = await apiCall(page, 'DELETE', `/api/share/visits?type=all&noteId=${noteId}`, { password: PASSWORD })
  const collection = await apiCall(page, 'DELETE', `/api/share/collections/${collectionId}`)
  const tag = await apiCall(page, 'DELETE', `/api/share/tags/${tagId}`)
  const statuses = { visits: visits.status, collection: collection.status, tag: tag.status }
  check('collection: the probe clears the visits, directory and tag it made',
    Object.values(statuses).every((status) => status === 200), JSON.stringify(statuses))
}

/**
 * The marker the sheet scenario types into the batch bar's field. A token is 1–32 characters of
 * `[a-z0-9_-]` (ADR-0004), so a field the sheet stopped validating would refuse this one and the
 * URLs below would come back unmarked.
 */
const SHEET_CHANNEL = 'gate-sheet'

/**
 * The batch QR sheet (SH-69) is the third way one selection leaves the app and the only one whose
 * product is paper, so what is asserted is what a person would notice was missing: the control
 * exists once there is a selection, the sheet carries one code per selected row with the marker the
 * bar holds, the print pipeline lets the sheet through and hides the app around it, and the browser
 * saying the dialog is done takes the sheet away again.
 *
 * The marker is read off the sheet's own URLs rather than from the bar's field, because those two
 * disagreeing is exactly the failure this guards: a batch of codes that lost its `?ref=` would
 * attribute every scan to nothing, and nothing about the sheet would look wrong.
 */
async function assertShareQrSheet(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600)
  const { opened, reason } = await openShareHub(page)
  check('qr sheet: the center opens for the sheet', opened, reason)
  if (!opened) return
  await waitForPanelSettled(page, SHARE_DIALOG)
  const listed = await gotoSidebarCategory(page, SHARE_LABELS.categoryAll)
  check('qr sheet: the list view is where the rows and the batch bar live', listed)

  // One selection, through the header's own control: the batch bar only draws once rows are picked.
  const selectors = await page.evaluate((selector) => {
    const hub = document.querySelector(selector)
    const boxes = [...(hub?.querySelectorAll('[role="checkbox"]') ?? [])].filter((box) => box.getBoundingClientRect().width > 0)
    boxes[0]?.click()
    return boxes.length
  }, SHARE_DIALOG)
  await sleep(900)
  const bar = await page.evaluate((labels) => {
    const control = [...document.querySelectorAll('button')].find((item) => labels.includes((item.textContent ?? '').trim()))
    if (!control) return null
    const box = control.getBoundingClientRect()
    const status = control.parentElement?.querySelector('[role="status"]')?.textContent ?? ''
    return {
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
      selected: Number(/(\d+)/.exec(status)?.[1] ?? 0),
    }
  }, LABELS.sharePrintQr)
  check('qr sheet: a selection draws the batch bar with the sheet control on it',
    Boolean(bar) && bar.selected > 0, `selectors=${selectors} bar=${JSON.stringify(bar)}`)
  if (!bar) return

  const marker = await page.evaluate((labels) => {
    const input = [...document.querySelectorAll('input')].find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
    if (!input) return null
    const box = input.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, LABELS.shareChannelField)
  if (marker) {
    await page.mouse.click(marker.x, marker.y)
    await page.keyboard.type(SHEET_CHANNEL)
    await sleep(400)
  }

  await page.mouse.click(bar.x, bar.y)
  await sleep(1_500)
  const sheet = await page.evaluate((channel) => {
    const node = document.querySelector('[data-share-qr-sheet]')
    if (!node) return null
    const urls = [...node.querySelectorAll('.share-qr-sheet-url')].map((url) => url.textContent ?? '')
    const codes = [...node.querySelectorAll('svg')]
    return {
      cells: node.querySelectorAll('.share-qr-sheet-cell').length,
      codes: codes.length,
      sizes: [...new Set(codes.map((code) => `${code.getAttribute('width')}x${code.getAttribute('height')}`))],
      offScreen: node.getBoundingClientRect().left < 0,
      hidden: node.getAttribute('aria-hidden') === 'true',
      inert: node.hasAttribute('inert'),
      // The codes carry the marker when the field did, and the header says so; a sheet whose URLs
      // dropped it is the failure this reads for.
      marked: urls.filter((url) => url.includes(`ref=${channel}`)).length,
      stated: (node.textContent ?? '').includes(`?ref=${channel}`),
      urls: urls.slice(0, 2),
    }
  }, SHEET_CHANNEL)
  check('qr sheet: the control hands the browser one code per selected row',
    Boolean(sheet) && sheet.cells === bar.selected && sheet.codes === sheet.cells && sheet.cells > 0,
    `sheet=${JSON.stringify(sheet)} selected=${bar.selected}`)
  check('qr sheet: every code is drawn at the sheet size and the sheet stays off screen and out of the tab order',
    Boolean(sheet) && sheet.sizes.length === 1 && sheet.sizes[0] === '160x160' && sheet.offScreen && sheet.hidden && sheet.inert,
    JSON.stringify(sheet))
  check('qr sheet: the marker the bar holds rides on every code and is stated on the sheet',
    Boolean(sheet) && sheet.marked === sheet.cells && sheet.stated, JSON.stringify(sheet))

  // Print media is the sheet's real surface: as long as the app is hidden and the sheet is laid out
  // in the page's own flow, the browser's print pipeline produces the sheet and nothing else.
  await page.emulateMediaType('print')
  await sleep(500)
  const printed = await page.evaluate(() => {
    const node = document.querySelector('[data-share-qr-sheet]')
    const root = document.querySelector('#root')
    const cell = node?.querySelector('.share-qr-sheet-cell')
    return {
      rootHidden: root ? getComputedStyle(root).display === 'none' : false,
      // The half that actually pins the allowance: that print stylesheet hides every other child of
      // the body, so a sheet the list does not name is the one that disappears. Reading only the app
      // being hidden would pass with the sheet hidden too — a blank page and a printed one would
      // read the same.
      sheetShown: node ? getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0 : false,
      position: node ? getComputedStyle(node).position : 'absent',
      breakInside: cell ? getComputedStyle(cell).breakInside : 'absent',
      columns: node ? getComputedStyle(node.querySelector('.share-qr-sheet-grid')).gridTemplateColumns.split(' ').length : 0,
    }
  })
  await page.emulateMediaType(null)
  check('qr sheet: the print pipeline lets the sheet through, laid out in the page flow, and hides the app around it',
    printed.rootHidden && printed.sheetShown && printed.position === 'static' && printed.columns === 3, JSON.stringify(printed))
  check('qr sheet: a code is never split from the name it opens',
    printed.breakInside === 'avoid', JSON.stringify(printed))

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await sleep(600)
  const gone = await page.evaluate(() => !document.querySelector('[data-share-qr-sheet]'))
  check('qr sheet: the browser saying the dialog is done takes the sheet away', gone)
  await page.keyboard.press('Escape')
  await sleep(500)
}

/**
 * The published directory end to end (ADR-0005 on ADR-0004's channel): a password-protected
 * collection over a tag, unlocked by a visitor who has never signed in — a fresh browser context,
 * so the visit is a real one rather than the owner's — a note opened from the directory, and the
 * visit read back by the owner with that collection's own marker.
 *
 * The marker is spelled here the way `collectionChannelToken` spells it. That is deliberate: a gate
 * that only read the marker out of the link could keep passing after the contract changed, so the
 * one place that must fail loudly when the prefix moves is this assertion.
 */
async function assertPublicCollectionPage(browser, page, consoleErrors) {
  await page.setViewport(DESKTOP_VIEWPORT)
  const note = await apiCall(page, 'POST', '/api/notes', {
    title: COLLECTION_PROBE.noteTitle,
    content: `# ${COLLECTION_PROBE.noteTitle}\n\nThis note is only reachable through the published directory.`,
  })
  const tag = await apiCall(page, 'POST', '/api/share/tags', { name: COLLECTION_PROBE.tagName })
  const share = await apiCall(page, 'POST', `/api/share/${note.data?.id ?? ''}`, { tags: [COLLECTION_PROBE.tagName] })
  const collection = await apiCall(page, 'POST', '/api/share/collections', {
    targetType: 'tag',
    targetValue: tag.data?.id ?? '',
    password: COLLECTION_PROBE.password,
  })
  // A create answers 201 for a new row and 200 for one that was already there; the tag name and the
  // note id are both minted per run, so this stays tolerant of either without depending on it.
  const created = (status) => status === 200 || status === 201
  const published = created(note.status) && created(tag.status) && share.status === 200 && collection.status === 200
  check('collection: the account publishes a password-protected directory', published,
    JSON.stringify({ note: note.status, tag: tag.status, share: share.status, collection: collection.status }))
  if (!published) return
  const noteSlug = share.data.share.slug
  const marker = `collection-${collection.data.slug}`

  const context = await browser.createBrowserContext()
  const visitor = await context.newPage()
  visitor.on('pageerror', (error) => consoleErrors.push({ text: `[collection] ${String(error)}`, url: '' }))
  // What the gate was told, in order. A refusal and a lock both leave the visitor looking at the same
  // password prompt, so without this the only readable failure is "it never unlocked".
  const answers = []
  visitor.on('response', (response) => {
    if (response.url().includes('/api/public/collection/')) answers.push(response.status())
  })
  try {
    await visitor.setViewport(DESKTOP_VIEWPORT)
    await visitor.setUserAgent(REAL_VISITOR_UA)
    await visitor.goto(`${BASE}/c/${collection.data.slug}`, { waitUntil: 'networkidle2' })

    const gate = await visitor.waitForSelector('input[type="password"]', { timeout: 20_000 }).then(() => true, () => false)
    const leakedBefore = await visitor.evaluate((title) => document.body.innerText.includes(title), COLLECTION_PROBE.noteTitle)
    check('collection: the directory asks for its password and shows nothing before it',
      gate && !leakedBefore, JSON.stringify({ gate, leakedBefore }))

    await visitor.type('input[type="password"]', 'not-the-password')
    await visitor.click('button[type="submit"]')
    await sleep(800)
    const refused = await visitor.evaluate((title) => ({
      gate: Boolean(document.querySelector('input[type="password"]')),
      leaked: document.body.innerText.includes(title),
    }), COLLECTION_PROBE.noteTitle)
    check('collection: a wrong password is refused and still reveals nothing',
      refused.gate && !refused.leaked, JSON.stringify(refused))

    // The field is React-controlled, so the second attempt replaces the whole value rather than
    // appending to the guess that was refused — the same select-all a person would do.
    await visitor.click('input[type="password"]')
    await visitor.keyboard.down('Control')
    await visitor.keyboard.press('KeyA')
    await visitor.keyboard.up('Control')
    await visitor.type('input[type="password"]', COLLECTION_PROBE.password)
    await visitor.click('button[type="submit"]')
    const unlocked = await visitor.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 15_000 }, COLLECTION_PROBE.noteTitle)
      .then(() => true, () => false)
    check('collection: the password unlocks the directory', unlocked, JSON.stringify({ answers }))

    const entry = await visitor.evaluate(() => {
      const anchor = [...document.querySelectorAll('a')].find((item) => (item.getAttribute('href') ?? '').includes('/s/'))
      return anchor?.getAttribute('href') ?? null
    })
    const linked = entry === `/s/${noteSlug}?ref=${marker}`
    check('collection: the entry links through this collection\'s own channel', linked, String(entry))

    // A locked directory has no entry to click: the two checks above already said so, and reporting
    // the missing element as a crash would hide that the earlier assertion is where to look.
    if (linked) {
      await Promise.all([
        visitor.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null),
        visitor.click(`a[href="/s/${noteSlug}?ref=${marker}"]`),
      ])
      const opened = await visitor.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 20_000 }, COLLECTION_PROBE.noteTitle)
        .then(() => true, () => false)
      const landed = await visitor.evaluate(() => ({ path: location.pathname, search: location.search }))
      check('collection: the note opens from the directory with its channel in the URL',
        opened && landed.path === `/s/${noteSlug}` && landed.search === `?ref=${marker}`, JSON.stringify(landed))
    }
  } finally {
    await context.close()
  }

  const recorded = await waitForVisitChannel(page, noteSlug, marker)
  check('collection: the visit is recorded with the collection channel', recorded)

  const { opened: hubOpened } = await openShareHub(page)
  // The center opens on whatever category it was last left in, and the split lives on the
  // dashboard's referrer card — so the category is chosen rather than assumed.
  const onDashboard = hubOpened && await gotoSidebarCategory(page, LABELS.shareCategoryDashboard)
  // The row has to read as the collection, by name — the localized copy with the tag name in it, and
  // never the raw marker. The copy pair is spelled here the way LABELS spells the others.
  const named = onDashboard && await page.waitForFunction(({ dialog, prefixes, tag }) => {
    const hub = document.querySelector(dialog)
    if (!hub) return false
    const wanted = prefixes.map((prefix) => `${prefix} ${tag}`)
    return [...hub.querySelectorAll('*')].some((element) => wanted.includes((element.textContent ?? '').trim()))
  }, { timeout: 20_000 }, { dialog: SHARE_DIALOG, prefixes: LABELS.shareChannelCollection, tag: COLLECTION_PROBE.tagName })
    .then(() => true, () => false)
  const rawShown = await page.evaluate(({ dialog, marker }) =>
    document.querySelector(dialog)?.textContent.includes(marker) ?? false, { dialog: SHARE_DIALOG, marker })
  check('collection: the dashboard names the collection that sent the visit and never the marker',
    named && !rawShown, JSON.stringify({ hubOpened, onDashboard, named, rawShown }))

  await page.keyboard.press('Escape')
  await sleep(700)
  await removeCollectionProbe(page, {
    noteId: note.data?.id ?? '',
    collectionId: collection.data?.id ?? '',
    tagId: tag.data?.id ?? '',
  })
}

const PLAYLIST_PROBE = {
  name: 'E2E Shared Playlist Probe',
}

/**
 * The one item the anonymous playlist page cannot be judged by, and only once a track is picked: axe
 * files the page's own media element under `no-autoplay-audio` because it cannot tell a reader's press
 * from an autoplay — the element carries `controls`, and the sound started because this scenario
 * pressed Enter on the row. It is named by the rule and by the element this page draws for a track, so
 * a second review item on the same surface, or the same rule about anything but this element, still
 * fails the gate (the shape is a bare tag selector: `audio`, or `video` for a shared clip).
 */
function isPlaylistMediaReviewItem(item) {
  return item.id === 'no-autoplay-audio' && /^(audio|video)$/.test(item.target)
}

/**
 * What a visitor gets at `/playlist/:slug`, read the way a visitor gets it: a browser context of its
 * own, a real user agent and no session. The page loads none of the app's store — that split is the
 * point of the surface — so nothing measured inside the signed-in page can stand in for it.
 *
 * The reminder is the half that only exists across two visits, so two are measured: the first has
 * nothing to compare against and must say nothing while it remembers the visit, and the second is
 * opened after a track is added behind the reader's back. That arrangement is what makes a stamp
 * written too early — or a claim that ran twice, which StrictMode makes it — read as silence rather
 * than as a passing gate, which is how it went unnoticed until a browser was pointed at the page.
 */
async function assertPublicPlaylistPage(browser, page, consoleErrors) {
  await page.setViewport(DESKTOP_VIEWPORT)
  const fixture = await seedMusicProbeTracks({ page })
  const listed = (await apiCall(page, 'GET', '/api/music/library')).data?.tracks ?? []
  const newestFor = (title) => listed
    .filter((track) => track.title === title)
    .sort((left, right) => right.createdAt - left.createdAt)[0]
  const [opening, later] = MUSIC_PROBE.titles.map(newestFor)
  const fixtureReady = fixture.unplayable.length === 0 && Boolean(opening) && Boolean(later)
  check('playlist link: the library holds the two playable probe tracks', fixtureReady,
    JSON.stringify({ unplayable: fixture.unplayable, titles: MUSIC_PROBE.titles }))
  if (!fixtureReady) return

  // A create answers 201 for a new row and 200 for one that was already there (the seed is fixed so a
  // rerun reuses it), and so does adding an item; the slug is the only thing that has to be new work.
  const accepted = (status) => status === 200 || status === 201
  const created = await apiCall(page, 'POST', '/api/music/playlists', { name: PLAYLIST_PROBE.name })
  const playlistId = created.data?.id ?? ''
  const firstAdd = playlistId
    ? await apiCall(page, 'POST', `/api/music/playlists/${playlistId}/items`, { trackId: opening.id })
    : { status: 0 }
  const shared = playlistId ? await apiCall(page, 'POST', `/api/music/playlists/${playlistId}/share`, {}) : { status: 0 }
  const slug = shared.data?.shareSlug ?? ''
  check('playlist link: the account shares a playlist holding one track',
    accepted(created.status) && accepted(firstAdd.status) && shared.status === 200 && Boolean(slug),
    JSON.stringify({ create: created.status, add: firstAdd.status, share: shared.status, slug }))
  if (!slug) return

  const context = await browser.createBrowserContext()
  const visitor = await context.newPage()
  visitor.on('pageerror', (error) => consoleErrors.push({ text: `[playlist] ${String(error)}`, url: '' }))
  const reminder = () => visitor.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? null)
  const rowTexts = () => visitor.evaluate(() => [...document.querySelectorAll('ol li')]
    .map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim()))
  const mentions = (values, text) => values.some((value) => (text ?? '').includes(value))
  try {
    await visitor.setViewport(DESKTOP_VIEWPORT)
    await visitor.setUserAgent(REAL_VISITOR_UA)
    // The page paints whichever theme the document carries, and this is the light reading — the two
    // themes of the shell are measured by scripts/check-contrast.mjs. A document with no account
    // setting follows the OS preference, so the preference is stated rather than inherited.
    await visitor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    await visitor.goto(`${BASE}/playlist/${slug}`, { waitUntil: 'networkidle2' })

    const firstRows = await rowTexts()
    const shown = await visitor.evaluate(() => ({
      name: document.querySelector('h1')?.textContent?.trim() ?? '',
      body: document.body.innerText,
      row: document.querySelector('ol li > *')?.tagName ?? null,
    }))
    // The heading is the playlist's own name, and the kicker above it is what says this is a shared
    // playlist: both are read, because a page that named neither would still pass a row count.
    check('playlist link: a visitor sees the shared tracks without a session',
      firstRows.length === 1 && firstRows[0].includes(opening.title) && shown.row === 'BUTTON' && shown.name === PLAYLIST_PROBE.name,
      JSON.stringify({ rows: firstRows, name: shown.name, row: shown.row }))
    check('playlist link: the page says what it is',
      mentions(LABELS.musicSharedPlaylist, shown.body))
    check('playlist link: a first visit has nothing to compare against and says nothing',
      (await reminder()) === null)

    // A reload with nothing added behind it is the same answer rather than a second one: the visit is
    // remembered, and "nothing changed" is reported as nothing. This is what makes the read after the
    // next track mean something.
    await visitor.reload({ waitUntil: 'networkidle2' })
    check('playlist link: reopening an unchanged playlist still reports no change', (await reminder()) === null)
    await checkSurfaceAxe(visitor, '', 'playlist link (nothing new)')

    // The track appears behind the visitor's back: the one arrangement in which the comparison has an
    // answer, and the one a reminder that compared against a stamp it had already moved cannot pass.
    const secondAdd = await apiCall(page, 'POST', `/api/music/playlists/${playlistId}/items`, { trackId: later.id })
    check('playlist link: a second track lands in the shared playlist', accepted(secondAdd.status), String(secondAdd.status))
    await visitor.reload({ waitUntil: 'networkidle2' })
    const reported = await reminder()
    const afterRows = await rowTexts()
    const badged = afterRows.filter((text) => mentions(LABELS.musicShareNewBadge, text))
    check('playlist link: the second visit names what changed',
      mentions(LABELS.musicShareSinceVisit, reported), `reminder=${JSON.stringify(reported)}`)
    check('playlist link: only the track that appeared carries the badge',
      afterRows.length === 2 && badged.length === 1 && badged[0].includes(later.title),
      JSON.stringify(afterRows))
    check('playlist link: the reminder says where the memory lives',
      mentions(LABELS.musicShareVisitMemoryNote, reported), String(reported))

    // Read with the reminder drawn rather than after dismissing it: the notice is a surface the fifth
    // round reshaped (the fill it used to carry put dim text on an accent tint), and the badge on a new
    // row is the accent on its own soft ground — the pair the token layer calibrates, and one this gate
    // can only vouch for by measuring it here.
    await checkSurfaceAxe(visitor, '', 'playlist link (the change named)')

    // The keyboard path, from the top of the page: the reminder's own control comes before the list it
    // describes, so Tab reaches it first, then a track. Enter on that track has to start that track.
    const reachedForget = await focusSurfaceControl(visitor, LABELS.musicShareForgetVisit)
    check('playlist link: the keyboard reaches the control that forgets the visit', reachedForget)
    const reachedRow = await (async () => {
      for (let press = 0; press < 6; press += 1) {
        await visitor.keyboard.press('Tab')
        if (await visitor.evaluate(() => Boolean(document.activeElement?.closest('ol')))) return true
      }
      return false
    })()
    check('playlist link: the keyboard reaches a track', reachedRow)
    let playingTitle = ''
    if (reachedRow) {
      const focusedRow = await visitor.evaluate(() => (document.activeElement?.textContent ?? '').replace(/\s+/g, ' ').trim())
      await visitor.keyboard.press('Enter')
      const started = await visitor.waitForFunction(() => {
        const media = document.querySelector('audio, video')
        return Boolean(media) && !media.paused && media.currentTime > 0
      }, { timeout: 15_000 }).then(() => true, () => false)
      const stream = await visitor.evaluate(() => {
        const media = document.querySelector('audio, video')
        return { tag: media?.tagName ?? null, src: media?.currentSrc ?? '', error: media?.error?.code ?? null }
      })
      // The row that was pressed is the track that must play: both the element's own source and the
      // element's tag follow that track (the fixture is a wav, so it is the audio half of the choice).
      const pressed = focusedRow.includes(later.title) ? later : opening
      playingTitle = pressed.title
      check('playlist link: Enter on a track plays that track',
        started && stream.tag === 'AUDIO' && stream.src.includes(`/playlists/${slug}/tracks/${pressed.id}/`),
        JSON.stringify({ focusedRow, stream, started }))
    }

    // The other half of the page's promise, and the half only a browser can arrange: the stream is
    // answered by the worker, so a failing one is made by refusing the request rather than by a
    // fixture — the shape the provider stub uses for its catalogue. The refusal is counted too, so a
    // green line here cannot be a stream that worked with an alert drawn for some other reason.
    const refusedStreams = []
    let refusing = true
    const refuseStreams = (request) => {
      const url = request.url()
      if (refusing && url.includes(`/playlists/${slug}/tracks/`) && url.endsWith('/stream')) {
        refusedStreams.push(url)
        return request.respond({ status: 502, contentType: 'text/plain', body: 'the file behind this track is gone' })
      }
      return request.continue()
    }
    const other = playingTitle === later.title ? opening : later
    await visitor.setRequestInterception(true)
    visitor.on('request', refuseStreams)
    try {
      const reachedOther = await focusSurfaceControl(visitor, [other.title])
      check('playlist link: the keyboard reaches the track that has not been tried', reachedOther)
      if (reachedOther) await visitor.keyboard.press('Enter')
      const announced = await visitor.waitForFunction((words) => {
        const alert = document.querySelector('[role="alert"]')
        return Boolean(alert) && words.some((word) => (alert.textContent ?? '').includes(word))
      }, { timeout: 15_000 }, LABELS.musicPlaybackFailed).then(() => true, () => false)
      // A sentence in the tree is not the same as one a reader can see: the bar it is drawn in is fixed
      // to the bottom of the window, and an alert with no box would satisfy the read above and nothing
      // else. Measured while the failure is on screen.
      const onScreen = await visitor.evaluate(() => {
        const box = document.querySelector('[role="alert"]')?.getBoundingClientRect()
        return Boolean(box) && box.width > 0 && box.height > 0
      })
      check('playlist link: the failing stream really was refused', refusedStreams.length === 1, `refused=${refusedStreams.length}`)
      check('playlist link: a track that will not play is named rather than left silent', announced, `onScreen=${onScreen}`)
      check('playlist link: the failure is drawn, not only announced', onScreen)
      await checkSurfaceAxe(visitor, '', 'playlist link (a track that will not play)', isPlaylistMediaReviewItem)
      // The control the bar offers is the browser's own, so a retry is not scriptable as a press: it is
      // the two calls that press makes — ask for the source again, then play it. The stream answers this
      // time, which is also the other shape a dead track takes: the same row, a source that works again.
      refusing = false
      await visitor.evaluate(() => {
        const media = document.querySelector('audio, video')
        if (!media) return
        media.load()
        void media.play()
      })
      const recovered = await visitor.waitForFunction(() => {
        const media = document.querySelector('audio, video')
        return Boolean(media) && !document.querySelector('[role="alert"]') && !media.paused && media.currentTime > 0
      }, { timeout: 15_000 }).then(() => true, () => false)
      check('playlist link: a stream that answers again takes the failure away', recovered,
        JSON.stringify({ refused: refusedStreams.length }))
    } finally {
      visitor.off('request', refuseStreams)
      await visitor.setRequestInterception(false)
    }

    // Forgetting has to be a fact about the memory and not about this render: a reload after it must
    // find a page that has never been here, and therefore one with nothing to report.
    const dismissed = await pressSurfaceControl(visitor, LABELS.musicShareForgetVisit)
    check('playlist link: the memory is forgotten from its own control', dismissed)
    await visitor.reload({ waitUntil: 'networkidle2' })
    const forgottenRows = await rowTexts()
    check('playlist link: after forgetting, the next visit is a first visit again',
      (await reminder()) === null && !forgottenRows.some((text) => mentions(LABELS.musicShareNewBadge, text)),
      JSON.stringify(forgottenRows))
  } finally {
    await context.close()
  }

  const removed = await apiCall(page, 'DELETE', `/api/music/playlists/${playlistId}`)
  check('playlist link: the probe playlist is removed', removed.status === 200, String(removed.status))
}

// -------------------------------------------------------------------------------------------------
// The surfaces whose accessible names only the static guard read (SH-93, closed here)
// -------------------------------------------------------------------------------------------------

/**
 * SH-93's ledger entry ended on a limit it could not fix from source: the 25 controls it had just
 * named were, for the attachment drive, the blog hub, a kanban board and the slides editor's layer
 * list, read by nothing but the static rule itself. A source read can say a name was written; only a
 * browser can say what a screen reader is told, and the rule's own text note says the same thing in
 * the other direction — it counts `{icon}` as a label, and it cannot see a name a wrapper drops.
 *
 * So each surface is opened the way a person opens it, driven to the state its controls appear in
 * (a search typed, a file selected, a view switched, a column collapsed) and read twice: axe for the
 * violations, and the browser's accessibility tree for the names. Both are needed and neither is
 * enough — axe reports a missing name but never the names that are there, and the tree reports what
 * the browser calls each control, which is the half these surfaces never had.
 */

/** What the four surfaces need on the account before they can be read: one file, one post, one link. */
const CONTROLS_FIXTURE = {
  filename: 'gate-controls.txt',
  postSlug: 'gate-controls-post',
  linkUrl: 'https://example.com/gate-controls',
  tag: 'gate-tag',
}

/**
 * `YYYY-MM-DD` for a day offset from today, in the timezone this script runs in. The gantt and
 * timeline windows are built around *now* (see `buildTimelineDays`), so a date the fixture pins to
 * a fixed day drifts out of the window as the calendar moves and the bars it draws with it.
 */
function gateDayKey(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * A board whose views each have something to read: subtasks on two cards, status groups for the
 * table's own header, and dates on the first card so the gantt, timeline and calendar draw it.
 */
const KANBAN_FENCE = [
  '',
  '```kanban',
  JSON.stringify({
    title: 'Gate board',
    columns: [
      { id: 'title', name: 'Title', type: 'title' },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
          { id: 'doing', label: 'Doing', color: 'blue' },
          { id: 'done', label: 'Done', color: 'green' },
        ],
      },
    ],
    views: [
      { id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' },
      { id: 'view-table', name: 'Table', type: 'table' },
      { id: 'view-list', name: 'List', type: 'list' },
      { id: 'view-gantt', name: 'Gantt', type: 'gantt', startField: 'startDate', endField: 'dueDate', progressField: 'progress' },
      { id: 'view-timeline', name: 'Timeline', type: 'timeline', startField: 'startDate', endField: 'dueDate' },
      { id: 'view-calendar', name: 'Calendar', type: 'calendar', dateField: 'startDate' },
    ],
    items: [
      {
        id: 'gate-controls-1',
        title: 'First card',
        properties: { status: 'todo', startDate: gateDayKey(0), dueDate: gateDayKey(2), progress: 25 },
        subtasks: [
          { id: 'gate-controls-s1', title: 'One', completed: true },
          { id: 'gate-controls-s2', title: 'Two', completed: false },
        ],
      },
      { id: 'gate-controls-2', title: 'Second card', properties: { status: 'doing' }, subtasks: [{ id: 'gate-controls-s3', title: 'Three', completed: false }] },
      { id: 'gate-controls-3', title: 'Third card', properties: { status: 'done' } },
    ],
  }),
  '```',
].join('\n')

/**
 * The board this scenario reads, inside the note. The view sweep above writes a board of its own into
 * the same note, so "a board is on screen" is not the same question as "this scenario's board is on
 * screen": asked the first way, the sweep's two-card fixture stood in for this one and every read
 * below was made on a board with no subtasks, no status column and none of these card ids. The
 * scenario therefore writes its own board when its own cards are absent, and reads only this block.
 */
const KANBAN_CONTROLS_FIXTURE = '.ink-prose [data-kanban]:has([data-item-id="gate-controls-1"])'

/**
 * The names these surfaces' controls carry, in both languages. Kept together rather than added to
 * `LABELS` because they are the assertion itself: the string in the locale file and the string the
 * browser reports for that control have to be the same string, and the four surfaces are read for
 * exactly that. An entry may be a `RegExp` where the name interpolates data (a filename, a column).
 */
const NAMED_CONTROLS = {
  attachmentsManage: ['管理附件', 'Manage attachments'],
  attachmentsGrid: ['网格相册', 'Grid Gallery'],
  attachmentsList: ['列表表格', 'List Table'],
  attachmentsSelectAll: ['全选附件', 'Select all attachments'],
  attachmentsSelectFile: [/选择 gate-controls/, /Select gate-controls/],
  attachmentsRemoveTag: [/移除 #gate-tag/, /Remove #gate-tag/],
  clear: ['清空', 'Clear'],
  moreActions: ['更多操作', 'More actions'],
  star: ['收藏', 'Star'],
  blogHub: ['博客管理中心', 'Blog Hub'],
  blogLinks: ['友链管理', 'Friend Links'],
  blogCategoryFilter: [/分类/, /Category/],
  blogRemoveTag: [/移除 gate-tag/, /Remove gate-tag/],
  kanbanStatusColumn: ['状态', 'Status'],
  kanbanSubtask: ['Two'],
  kanbanSelectCard: ['选择卡片', 'Select card'],
  kanbanSelectAll: ['全选', 'Select all items'],
  kanbanCardDetails: ['卡片详情', 'Card details'],
  kanbanExpandSubtasks: ['展开子任务', 'Expand subtasks'],
  kanbanCollapseSubtasks: ['折叠子任务', 'Collapse subtasks'],
  kanbanDeleteSubitem: ['删除', 'Delete'],
  // The strip that a collapsed column leaves behind names the column it reopens, so the name
  // interpolates a label and is matched by its opening words rather than in full. The wording is the
  // board's own (`preview.kanban_expand_column_named`); its predecessor named no column at all.
  kanbanExpandColumn: [/展开列「/, /Expand column /],
  kanbanCollapseColumn: ['收起此列', 'Collapse Column'],
  kanbanCollapse: ['折叠', 'Collapse'],
  kanbanExpand: ['展开', 'Expand'],
  slidesBringForward: ['上移一层', 'Bring forward'],
  slidesSendBackward: ['下移一层', 'Send backward'],
}

/**
 * Opens a surface that is a dialog and hands back a selector for it — the dialog that was not on
 * screen before the control was pressed. Scoping this way keeps the read on the surface instead of
 * on whichever dialog happens to be first in the document, and needs no locale-dependent selector.
 */
async function openSurfaceDialog(page, open, name) {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) dialog.setAttribute('data-gate-seen', '')
  })
  const pressed = await open()
  check(`${name}: the control a person presses opens it`, pressed)
  if (!pressed) return null
  await sleep(1_500)
  const marked = await page.evaluate((surface) => {
    const fresh = [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => !dialog.hasAttribute('data-gate-seen'))
    for (const dialog of document.querySelectorAll('[data-gate-seen]')) dialog.removeAttribute('data-gate-seen')
    const outer = fresh.find((dialog) => !fresh.some((other) => other !== dialog && other.contains(dialog))) ?? fresh[0]
    if (!outer) return false
    outer.setAttribute('data-gate-surface', surface)
    return true
  }, name)
  return marked ? `[data-gate-surface="${name}"]` : null
}

/**
 * The names the browser reports inside a root, read from its own accessibility tree over CDP and
 * scoped by real DOM containment. Nothing here comes from the markup: a name a wrapper drops, or one
 * that only ever existed as a `title`, is exactly what a source read cannot see and this can.
 */
async function surfaceAccessibleNames(page, root) {
  const client = await page.createCDPSession()
  try {
    await client.send('DOM.enable')
    await client.send('Accessibility.enable')
    const { root: document_ } = await client.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: document_.nodeId, selector: root })
    if (!nodeId) return null
    const { node: described } = await client.send('DOM.describeNode', { nodeId })
    const { nodes } = await client.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })
    const anchor = nodes.find((entry) => entry.backendNodeId === described.backendNodeId)
    if (!anchor) return null
    const children = new Map()
    for (const node of nodes) {
      if (!node.parentId) continue
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.nodeId])
    }
    const byId = new Map(nodes.map((node) => [node.nodeId, node]))
    const inside = new Set()
    const walk = (id) => {
      if (byId.get(id)?.backendNodeId) inside.add(byId.get(id).backendNodeId)
      for (const child of children.get(id) ?? []) walk(child)
    }
    walk(anchor.nodeId)
    const tree = await client.send('Accessibility.getFullAXTree')
    return tree.nodes
      .filter((node) => node.backendDOMNodeId && inside.has(node.backendDOMNodeId) && !node.ignored)
      .map((node) => node.name?.value ?? '')
      .filter((name) => name.trim().length > 0)
  } finally {
    await client.detach()
  }
}

/**
 * The name the browser reports for one control, read from that element's own accessibility node. The
 * surface-wide read above answers "is this name somewhere in here", which is what most of these
 * assertions need; a bare `<select>` needs the tighter question, because its options carry names of
 * their own and a surface-wide search would find one of those and call the control named.
 */
async function surfaceControlName(page, selector) {
  const client = await page.createCDPSession()
  try {
    await client.send('DOM.enable')
    await client.send('Accessibility.enable')
    const { root: document_ } = await client.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: document_.nodeId, selector })
    if (!nodeId) return null
    const { node: described } = await client.send('DOM.describeNode', { nodeId })
    const { nodes } = await client.send('Accessibility.getPartialAXTree', {
      backendNodeId: described.backendNodeId,
      fetchRelatives: false,
    })
    return nodes.find((node) => !node.ignored)?.name?.value ?? ''
  } finally {
    await client.detach()
  }
}

/** Asserts the browser reports a name for one control, and prints the one it did. */
async function checkControlName(page, selector, surface, wanted) {
  const name = await surfaceControlName(page, selector)
  const alternatives = Array.isArray(wanted) ? wanted : [wanted]
  const named = alternatives.some((label) => (label instanceof RegExp ? label.test(name ?? '') : name === label))
  check(`${surface}: the control carries the name the browser reports`, named, `name=${JSON.stringify(name)}`)
}

/** Asserts the browser is told each of these names, and reports the ones it was not. */
async function checkSurfaceNames(page, root, surface, wanted) {
  const names = await surfaceAccessibleNames(page, root)
  if (!names) {
    check(`${surface}: the browser could read the surface's own accessibility tree`, false, `no element for ${root}`)
    return
  }
  const matches = (label, name) => (label instanceof RegExp ? label.test(name) : name === label || name.includes(label))
  const alternatives = (entry) => (Array.isArray(entry) ? entry : [entry])
  const missing = wanted.filter((entry) => !names.some((name) => alternatives(entry).some((label) => matches(label, name))))
  check(
    `${surface}: every control it names is a name the browser reports`,
    missing.length === 0,
    `missing=${JSON.stringify(missing)} of ${names.length} names`,
  )
}

/**
 * axe declines to judge text over a background image, and the blog hub's hero is a two-stop gradient
 * of token surfaces (`--bg-surface` → `--bg-sunken`) with the hub's title and subtitle drawn on it. A
 * reader that cannot judge is answered by measuring rather than by waving: both stops and each line
 * of the hero are painted into a canvas for their sRGB bytes, and every stop is put through the WCAG
 * ratio against every line. Read on both themes this gate runs in, that came out title 17.8/15.4 and
 * subtitle 6.0/5.2 in light, 14.3/15.3 and 6.6/7.0 in dark — all four AA, so the allowance it grants
 * is for the reader's own limit and not for the text. The two stops bound the middle as well: a
 * gradient of two surfaces passes between them, so measuring the ends measures what is drawn.
 *
 * It fails in both directions. No gradient above the heading, or a stop under AA, and the check that
 * grants the allowance fails with it — a hero that stops being a gradient takes its own allowance
 * away. Returns `null` when there is nothing to measure.
 */
async function heroGradientContrast(page, root) {
  return page.evaluate((selector) => {
    // The hub draws two headings — the modal's own title in the header, and the dashboard's welcome
    // banner — and only the second one sits on the gradient. Picking "the first h2 in the dialog" is
    // what made the first reading return null while axe was naming a heading on a gradient; the
    // heading this measures is found the other way round, from the gradient up.
    let heading = null
    let hero = null
    let image = ''
    for (const candidate of document.querySelectorAll(`${selector} h2`)) {
      let node = candidate
      let drawn = ''
      while (node && !drawn) {
        const background = getComputedStyle(node).backgroundImage
        drawn = background === 'none' ? '' : background
        if (drawn) {
          heading = candidate
          hero = node
          image = drawn
          break
        }
        node = node.parentElement
      }
      if (image) break
    }
    if (!heading || !hero || !image) return null
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const toRgb = (color) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (a, b) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (light + 0.05) / (dark + 0.05)
    }
    const stops = (image.match(/oklch\([^)]*\)|rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) ?? []).map(toRgb)
    const lines = [heading, heading.nextElementSibling].filter(Boolean)
    const pairs = stops.flatMap((stop) => lines.map((line) => ratio(stop, toRgb(getComputedStyle(line).color))))
    return {
      image: image.slice(0, 90),
      stops: stops.length,
      worst: pairs.length ? Number(Math.min(...pairs).toFixed(2)) : 0,
    }
  }, root)
}

/**
 * axe over one surface, with nothing excused: a violation is a failure, and the only reader that can
 * answer axe here is one the surface brings for an item axe declined to judge — an `allowIncomplete`
 * that is true only while that reader's own measurement holds. This read used to carry a registry of
 * violations with a written reason each; the three it held over three rounds (the share hub's rows,
 * the board's tag palette, the kanban card's nested controls) are all fixed, and an empty registry is
 * plumbing rather than an allowance. A violation now has to be fixed or the surface left unread.
 */
async function checkSurfaceAxe(page, root, surface, allowIncomplete = () => false) {
  await ensureAxe(page)
  const report = await runAxe(page, root)
  check(
    `${surface}: axe finds nothing on it`,
    report.violations.length === 0,
    JSON.stringify(report.violations.slice(0, 3)),
  )
  const unreviewed = report.incomplete.filter((item) => !isReviewedIncomplete(item) && !allowIncomplete(item))
  check(`${surface}: no unexpected axe review items`, unreviewed.length === 0, JSON.stringify(unreviewed.slice(0, 3)))
  check(`${surface}: axe inspected the surface`, report.passes >= 5, `passes=${report.passes}`)
}

/**
 * The one axe review item the deck is allowed to raise, named once so both readers of this surface
 * ask the same question: the text on a page the author coloured, which axe declines to judge because
 * a box of the deck's own is over it. What was measured when this first came up (see `assertSlidesEditor`)
 * is that the allowance is located rather than waved — the item has to name a box on the page, and
 * there can be at most one per box — and that count is asserted where the deck's own element count is
 * known. This predicate is what the second reader (the layer list's, below) shares instead of
 * restating the reason.
 */
function isDeckCanvasReviewItem(item) {
  return item.id === 'color-contrast' && /overlapped by another element/.test(item.note) && Boolean(item.box)
}

/** The control a surface is opened from, and what it says its controls are called. */
async function assertDriveControlNames(page) {
  const root = await openSurfaceDialog(page, () => pressSurfaceControl(page, NAMED_CONTROLS.attachmentsManage), 'attachment drive')
  if (!root) return
  const files = await page.evaluate((selector) =>
    [...document.querySelectorAll(`${selector} button`)].filter((item) => /收藏|Star|取消收藏|Unstar/.test(item.getAttribute('aria-label') ?? '')).length, root)
  check('attachment drive: the account has a file for its rows to be drawn from', files >= 1, `files=${files}`)
  await checkSurfaceNames(page, root, 'attachment drive (grid)', [
    NAMED_CONTROLS.attachmentsGrid,
    NAMED_CONTROLS.attachmentsList,
    NAMED_CONTROLS.moreActions,
    NAMED_CONTROLS.star,
  ])
  await checkSurfaceAxe(page, root, 'attachment drive')

  await page.type(`${root} input`, 'gate')
  await sleep(800)
  await checkSurfaceNames(page, root, 'attachment drive (a search typed in)', [NAMED_CONTROLS.clear])

  const listed = await pressSurfaceControl(page, NAMED_CONTROLS.attachmentsList, root)
  check('attachment drive: the list view is one press away', listed)
  await checkSurfaceNames(page, root, 'attachment drive (list)', [NAMED_CONTROLS.attachmentsSelectAll, NAMED_CONTROLS.moreActions])
  await checkSurfaceAxe(page, root, 'attachment drive')

  // The inspector is the panel a selected file gets, and the tag it carries is removable there.
  // The row's own name button is what selects it — pressing a cell of the row would no longer select
  // anything, because the whole-row click target is gone (the row holds controls of its own).
  const selected = await page.evaluate((selector) => {
    const cell = [...document.querySelectorAll(`${selector} button`)].find((item) => /选择 gate-controls|Select gate-controls/.test(item.getAttribute('aria-label') ?? ''))
    const name = cell?.closest('tr')?.querySelector('td:nth-child(2) button')
    name?.click()
    return Boolean(name)
  }, root)
  await sleep(1_200)
  check('attachment drive: selecting a row draws the inspector', selected)
  await checkSurfaceNames(page, root, 'attachment drive (a file selected)', [NAMED_CONTROLS.attachmentsRemoveTag])

  await page.keyboard.press('Escape')
  await sleep(800)
  return root
}

/** The hub a person reaches from the note list's globe, the tag filter it draws, and its links view. */
async function assertBlogHubControlNames(page) {
  const root = await openSurfaceDialog(page, () => pressSurfaceControl(page, NAMED_CONTROLS.blogHub), 'blog hub')
  if (!root) return
  const hero = await heroGradientContrast(page, root)
  const gradientJudged = hero !== null && hero.stops >= 2 && hero.worst >= 4.5
  check('blog hub: the text axe declined to judge is measured — every gradient stop against every line',
    gradientJudged, JSON.stringify(hero))
  const allowGradient = (item) => gradientJudged && /background gradient/.test(item.note)
  await checkSurfaceAxe(page, root, 'blog hub', allowGradient)
  await checkSurfaceNames(page, root, 'blog hub', [NAMED_CONTROLS.moreActions, NAMED_CONTROLS.blogLinks])

  const filtered = await pressSurfaceControl(page, [CONTROLS_FIXTURE.tag], `${root} aside`)
  check('blog hub: the tag the fixture published its post with is a filter the sidebar offers', filtered)
  await checkSurfaceNames(page, root, 'blog hub (a tag filter active)', [NAMED_CONTROLS.blogRemoveTag])

  const links = await pressSurfaceControl(page, NAMED_CONTROLS.blogLinks, root)
  check('blog hub: the links view is one press away', links)
  // The link list's own filter is a bare `<select>`: without a label it is unnamed, which is what the
  // browser reads and what axe's `select-name` rule asks about.
  await checkControlName(page, `${root} select`, 'blog hub (the links list, its category filter)', NAMED_CONTROLS.blogCategoryFilter)
  await checkSurfaceAxe(page, root, 'blog hub', allowGradient)

  await page.keyboard.press('Escape')
  await sleep(800)
  return root
}

/**
 * The keyboard's way to the same control `pressSurfaceControl` clicks: find it by the name it
 * carries, put the focus on it for real, and report whether the focus landed. Patterns rather than
 * plain labels because the controls read this way are named with data in them (a day cell's number).
 * What the gate does next — Enter, Escape — is the assertion; this only gets the keyboard there, and
 * says so when it cannot.
 */
async function focusSurfaceControl(page, patterns, scope = '') {
  return page.evaluate(({ patterns, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    const matchers = patterns.map((pattern) => new RegExp(pattern))
    const control = [...(root?.querySelectorAll('button, [role="menuitem"], [role="option"]') ?? [])]
      .find((item) => {
        const name = item.getAttribute('aria-label') ?? item.getAttribute('title') ?? (item.textContent ?? '').trim()
        return matchers.some((matcher) => matcher.test(name)) && item.getClientRects().length > 0
      })
    if (!control) return false
    control.focus()
    return document.activeElement === control
  }, { patterns, scope })
}

/**
 * A board is read in every view its controls live in: the board (cards, subtask toggles), a column
 * collapsed (the strip that stopped being a `div` with a role), the table (rows, groups, select-all),
 * the list (rows whose toggle the guard used to call named while axe called it nameless), and the
 * gantt, timeline and calendar (whose rows used to be click handlers on `div`s, SH-110).
 */
async function assertKanbanControlNames(page) {
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('kanban: the preview pane never became visible')
  const drawn = await page.waitForFunction((selector) => {
    const block = document.querySelector(selector)
    return Boolean(block && block.querySelector('[data-kanban-canvas]'))
  }, { timeout: 20_000 }, KANBAN_CONTROLS_FIXTURE).then(() => true, () => false)
  check('kanban: the note draws a board for its controls to be read on', drawn)
  if (!drawn) return
  // The press is not the answer — the board that appears is. A press that found nothing to press and
  // a press that opened nothing are the same failure to a reader, so the surface it draws is what is
  // waited for, and the wait is the check rather than a step that throws when it times out.
  const pressed = await pressSurfaceControl(page, ['全屏', 'Full screen'], KANBAN_CONTROLS_FIXTURE)
  const surfaced = pressed && await page
    .waitForFunction(() => Boolean(document.querySelector('.kanban-fullscreen')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('kanban: the block card opens the board full screen', surfaced, `pressed=${pressed}`)
  if (!surfaced) return
  await waitForPanelSettled(page, '.kanban-fullscreen')
  const root = '.kanban-fullscreen'

  await checkSurfaceNames(page, root, 'kanban (board)', [NAMED_CONTROLS.kanbanCardDetails, NAMED_CONTROLS.kanbanExpandSubtasks])
  await checkSurfaceAxe(page, root, 'kanban')

  // A card's subtasks are read where they are drawn: the board draws them as their own rows (each a
  // checkbox named by the subtask it completes), and the bin for one is in the *table* view's nested
  // table, so it is asserted there. Reading a name on the surface that does not draw it is a failure
  // that says nothing about the app.
  const expanded = await pressSurfaceControl(page, NAMED_CONTROLS.kanbanExpandSubtasks, root)
  check('kanban: a card opens its subtasks', expanded)
  await checkSurfaceNames(page, root, 'kanban (subtasks open)', [NAMED_CONTROLS.kanbanCollapseSubtasks, NAMED_CONTROLS.kanbanSubtask])

  // Collapsing a column is what draws the strip that used to be a `div` with a button role.
  await pressSurfaceControl(page, ['To Do', '未开始', '待办'], root)
  const collapsed = await pressSurfaceControl(page, NAMED_CONTROLS.kanbanCollapseColumn)
  check('kanban: a column menu collapses its column', collapsed)
  await checkSurfaceNames(page, root, 'kanban (a column collapsed)', [NAMED_CONTROLS.kanbanExpandColumn])

  // Each view hides a different quarter of this surface's controls: the table's rows and groups
  // carry both toggles and the select-all, the list's rows carry the toggle and their own select.
  const views = [
    { view: 'table', label: ['表格', 'Table'], names: [NAMED_CONTROLS.kanbanSelectCard, NAMED_CONTROLS.kanbanSelectAll, NAMED_CONTROLS.kanbanExpand, NAMED_CONTROLS.kanbanExpandSubtasks] },
    { view: 'list', label: ['列表', 'List'], names: [NAMED_CONTROLS.kanbanSelectCard, NAMED_CONTROLS.kanbanExpandSubtasks] },
  ]
  for (const { view, label, names } of views) {
    const switched = await pressSurfaceControl(page, label, root)
    check(`kanban: the ${view} view is one press away`, switched)
    if (!switched) continue
    await checkSurfaceNames(page, root, `kanban (${view})`, names)
    if (view === 'table') {
      // The table's own subtask rows (checkbox, title, bin) live in a nested table under a row that is
      // open. Which state a row arrives in is not this reader's business: it opens one if none is
      // open, and then reads the names — a row that never opened leaves the assertion below red.
      const alreadyOpen = await page.evaluate((selector) =>
        [...document.querySelectorAll(`${selector} button`)].some((item) => /折叠子任务|Collapse subtasks/.test(item.getAttribute('aria-label') ?? '')), root)
      if (!alreadyOpen) await pressSurfaceControl(page, NAMED_CONTROLS.kanbanExpandSubtasks, root)
      await checkSurfaceNames(page, root, 'kanban (table, subtasks open)', [NAMED_CONTROLS.kanbanCollapseSubtasks, NAMED_CONTROLS.kanbanDeleteSubitem])
      // The status cell's `<select>` is read on its own for the reason above: a surface-wide search
      // for "Status" would be satisfied by the column header's own name.
      await checkControlName(page, `${root} [data-item-id="gate-controls-1"] select`, 'kanban (the status cell)', NAMED_CONTROLS.kanbanStatusColumn)
    }
    await checkSurfaceAxe(page, root, 'kanban')
  }

  // The gantt and timeline are the same board drawn against time, and both drew each item twice: a
  // row in the sidebar and a bar in the chart. Both were `div`s with a click handler, so a keyboard
  // could not open an item from either view at all and a screen reader was never told the row did
  // anything (SH-110). What the fix promises is a row that *is* the control, so it is read the way a
  // keyboard reads one — focus it, press Enter, and wait for the detail the pointer would have opened.
  for (const { view, label } of [
    { view: 'gantt', label: ['甘特图', 'Gantt'] },
    { view: 'timeline', label: ['时间轴', 'Timeline'] },
  ]) {
    const switched = await pressSurfaceControl(page, label, root)
    check(`kanban: the ${view} view is one press away`, switched)
    if (!switched) continue
    // Both rows that stand for the first card have to be buttons: the sidebar's (the item's name) and
    // the chart's (where the item sits in time). A `div` with the button role is not a button here.
    const rows = await page.evaluate((selector) => {
      const named = [...document.querySelectorAll(`${selector} button, ${selector} [role="button"]`)]
        .filter((item) => /First card/.test(item.textContent ?? ''))
      return { count: named.length, buttons: named.filter((item) => item.tagName === 'BUTTON').length }
    }, root)
    check(
      `kanban: the ${view} rows that open this card are buttons`,
      rows.count >= 2 && rows.buttons === rows.count,
      JSON.stringify(rows),
    )
    const focused = await focusSurfaceControl(page, ['First card'], root)
    check(`kanban: the keyboard reaches a ${view} row`, focused)
    if (focused) {
      await page.keyboard.press('Enter')
      const opened = await page
        .waitForFunction(() => {
          const dialog = [...document.querySelectorAll('div[role="dialog"]')]
            .find((item) => /First card/.test(item.textContent ?? ''))
          return Boolean(dialog)
        }, { timeout: 10_000 })
        .then(() => true, () => false)
      check(`kanban: Enter on a ${view} row opens the item's detail`, opened)
      if (opened) {
        await page.keyboard.press('Escape')
        await sleep(800)
      }
    }
    await checkSurfaceAxe(page, root, `kanban (${view})`)
  }

  // The calendar's day cell is the third of the three: its header number opened the day from a `div`'s
  // click handler wrapped around its own `+` button. The number is now a button named by the day it
  // opens, and the name is what this reads; pressing it would add a card, so the reach is the
  // assertion — which is exactly what could not be done before.
  const calendar = await pressSurfaceControl(page, ['日历', 'Calendar'], root)
  check('kanban: the calendar view is one press away', calendar)
  if (calendar) {
    const days = await page.evaluate((selector) =>
      [...document.querySelectorAll(`${selector} button`)]
        .filter((item) => /New item on \d+|在 \d+ 日新建项目/.test(item.getAttribute('aria-label') ?? '')).length, root)
    check('kanban: a calendar day cell names the day its number opens', days >= 28, `days=${days}`)
    const reached = await focusSurfaceControl(page, ['New item on \\d+', '在 \\d+ 日新建项目'], root)
    check('kanban: the keyboard reaches a calendar day cell', reached)
    await checkSurfaceAxe(page, root, 'kanban (calendar)')
  }

  await page.keyboard.press('Escape')
  await sleep(800)
}

/**
 * The layer list's two reorder controls. They were the one place in the client that kept a row's own
 * controls behind `display: none` until a hover, which put them out of the accessibility tree
 * altogether — unreachable by keyboard and by a screen reader, and invisible to axe, which skips a
 * hidden subtree. The row now reveals them the way the rest of the app does (opacity, plus
 * `focus-within`), so they are in the tree and this is their reader.
 */
async function assertSlidesLayerControlNames(page) {
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides layers: the preview pane never became visible')
  const pressed = await pressSurfaceControl(page, ['全屏', 'Full screen'], '.ink-prose [data-bento-slides]')
  const surfaced = pressed && await page
    .waitForFunction(() => Boolean(document.querySelector('.bento-slides-fullscreen')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('slides layers: the deck card opens the editor', surfaced, `pressed=${pressed}`)
  if (!surfaced) return
  await waitForPanelSettled(page, '.bento-slides-fullscreen')
  const root = '.bento-slides-fullscreen'
  // The deck's own page text is the one review item this surface raises, and the scenario above is
  // what measured it; here it is the same predicate rather than a second opinion.
  await checkSurfaceAxe(page, root, 'slides editor', isDeckCanvasReviewItem)
  await checkSurfaceNames(page, root, 'slides editor (layer list)', [NAMED_CONTROLS.slidesBringForward, NAMED_CONTROLS.slidesSendBackward])
  await page.keyboard.press('Escape')
  await sleep(800)
}

/** Puts the account's file, post and link in place once, and reports what it found or made. */
async function seedControlSurfaceData(page) {
  const listed = await apiCall(page, 'GET', '/api/files?pageSize=100')
  const existing = (listed.data?.files ?? []).find((file) => file.filename === CONTROLS_FIXTURE.filename)
  // A file found by name was put there by an earlier run: it has no `status` of its own, so the
  // fixture reports the read that found it (200) rather than a 0 that reads as a failed upload.
  const uploaded = existing ? { ...existing, status: 200 } : await page.evaluate(async (filename) => {
    const form = new FormData()
    form.set('file', new Blob(['gate control surface attachment'], { type: 'text/plain' }), filename)
    const response = await fetch('/api/files', { method: 'POST', headers: { 'X-Inkstone-Client': '1' }, body: form })
    const data = await response.json().catch(() => null)
    return { id: data?.id ?? data?.file?.id ?? null, status: response.status }
  }, CONTROLS_FIXTURE.filename)
  const tagged = uploaded?.id
    ? await apiCall(page, 'PATCH', `/api/files/${uploaded.id}`, { tags: [CONTROLS_FIXTURE.tag] })
    : { status: 0 }

  const posts = await apiCall(page, 'GET', '/api/blog/posts')
  const found = (posts.data?.posts ?? []).find((post) => post.slug === CONTROLS_FIXTURE.postSlug)
  const noteId = (await apiCall(page, 'GET', '/api/notes?limit=1')).data?.notes?.[0]?.id ?? ''
  const post = found ?? (await apiCall(page, 'POST', '/api/blog/posts', {
    noteId,
    title: 'Gate control surfaces',
    slug: CONTROLS_FIXTURE.postSlug,
    isPublished: true,
    tags: [CONTROLS_FIXTURE.tag],
  }))

  const links = await apiCall(page, 'GET', '/api/blog/links')
  const hasLink = (links.data?.links ?? []).some((link) => link.url === CONTROLS_FIXTURE.linkUrl)
  const link = hasLink ? { status: 200 } : await apiCall(page, 'POST', '/api/blog/links', {
    name: 'Gate control surfaces',
    url: CONTROLS_FIXTURE.linkUrl,
  })
  return { file: uploaded?.status ?? 0, tagged: tagged.status, post: post.status, link: link.status }
}

/**
 * The scenario: one fixture, four surfaces, and a final pass that fails an allowance nobody needed.
 * The boards and the deck are put into the note the way the other scenarios do it, so this runs on
 * its own rather than depending on what an earlier scenario happened to leave behind — the board by
 * the cards it declares (`KANBAN_CONTROLS_FIXTURE`), because the view sweep leaves a board of its own
 * in the same note and reading that one in this one's place is what the scoping above is for.
 */
async function assertNamedControlSurfaces(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600)
  const fixture = await seedControlSurfaceData(page)
  check('control surfaces: the account carries a file, a post and a link to read them on',
    fixture.file === 200 || fixture.file === 201, JSON.stringify(fixture))

  const hasBoard = await page.evaluate((selector) => Boolean(document.querySelector(selector)), KANBAN_CONTROLS_FIXTURE)
  const hasDeck = await slidesDeckOnScreen(page)
  if (!hasBoard || !hasDeck) {
    await ensurePaneVisible(page, '.cm-content')
    await writeAtEndOfNote(page, `${hasBoard ? '' : KANBAN_FENCE}${hasDeck ? '' : SLIDES_FENCE}`, 'control surfaces')
    await ensurePaneVisible(page, '.ink-prose')
  }

  await assertDriveControlNames(page)
  await assertBlogHubControlNames(page)
  await assertKanbanControlNames(page)
  await assertSlidesLayerControlNames(page)
  await page.evaluate(() => {
    for (const surface of document.querySelectorAll('[data-gate-surface]')) surface.removeAttribute('data-gate-surface')
  })
}

async function main() {
  console.log(`visual e2e against ${BASE}`)
  const browser = await puppeteer.launch({
    executablePath: chromeExecutablePath(),
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const consoleErrors = []
  try {
    const page = await browser.newPage()
    page.on('console', (message) => {
      // The failing resource's own URL travels with the message: a failed load is judged by what was
      // loaded and not only by what Chrome said about it.
      if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location()?.url ?? '' })
    })
    page.on('pageerror', (error) => consoleErrors.push({ text: String(error), url: '' }))

    await page.setViewport(MOBILE_VIEWPORT)
    await page.goto(BASE, { waitUntil: 'networkidle2' })

    // The sign-in helper also clears the owner's update prompt; every scenario below starts clicking
    // straight away, and the prompt's scrim would swallow the first of those clicks.
    await loginThroughUi(page, { username: USERNAME, password: PASSWORD })
    check('bootstrap: authenticated', true)
    const blocking = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null)
    check('bootstrap: no dialog is holding the app', blocking === null, `dialog: ${blocking}`)

    await typeProbeNote(page)
    await assertProseSurface(page, 'mobile-preview')
    await assertPaneTransition(page)
    await assertDesktopSplit(page)
    await assertPresentation(page)
    await assertPresentationSession(page)
    await assertPresentationPages(page)
    await assertGraphThemeFollow(page)
    await assertGraphKeyboardWalk(page)
    await assertPresentationAccessibility(page)
    await assertDeckExport(page)
    await assertDeckImageExport(page)
    await assertNoteExportCharts(page)
    await assertMindmapBlock(page)
    await assertMindmapSplitEditing(page)
    await assertSlidesEditor(page)
    await assertKanbanBoard(page)
    await assertFullscreenToolbars(page)
    await assertContextMenuNesting(page)
    await assertMusicSurface(page)
    await assertShareCenter(page)
    await assertShareQrSheet(page)
    await assertNamedControlSurfaces(page)
    await assertPublicCollectionPage(browser, page, consoleErrors)
    await assertPublicPlaylistPage(browser, page, consoleErrors)

    // Demo backend intentionally logs a 401 for the logged-out ping; only
    // render-breaking errors matter here.
    //
    // One library artifact is allowed by message: a mind map mounts into whatever pane the layout
    // gives it, and the edit-only layout keeps the preview hidden, so the library's first paint
    // measures a zero-sized box and draws link paths with NaN coordinates — which Chrome reports as
    // an error on the path element. Nothing is visibly wrong (the block is re-fitted by its
    // container watcher the moment the pane has a box — lib/markdown/mindmap/resize.ts), the map is
    // drawn again from real numbers, and this run asserts that drawing below. Every other page
    // error, including any other malformed path, still fails the gate.
    // A request this run provokes and then reads is not an app error. The online results scenario
    // presses audition on a stubbed catalogue hit, and the row it registers plays through the worker's
    // own stream route — which resolves a playable URL from the catalogue, unreachable from inside this
    // sandbox, so that one request answers 502. It is allowed by URL and not by message, so no other
    // failed load can hide behind it, and the scenario that provokes it asserts both the request and
    // the row that landed without a stream. The anonymous playlist scenario provokes the same answer
    // deliberately, on the public stream route, and asserts the sentence the visitor is given for it.
    const ALLOWED_PAGE_ERRORS = [
      { text: /Failed to load resource.*(401|403|404)/ },
      { text: /attribute d: Expected number, "M NaN/ },
      { text: /Failed to load resource.*5\d\d/, url: /(\/api\/music\/tracks\/[^/]+\/stream|\/api\/blog\/public\/music\/playlists\/[^/]+\/tracks\/[^/]+\/stream)/ },
    ]
    const fatal = consoleErrors.filter((entry) => !ALLOWED_PAGE_ERRORS.some((allowed) =>
      allowed.text.test(entry.text) && (!allowed.url || allowed.url.test(entry.url))))
    check('console: no page errors', fatal.length === 0, JSON.stringify(fatal.slice(0, 3)))
  } finally {
    await browser.close()
  }

  console.log(`visual e2e: ${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`visual e2e crashed: ${error.message}`)
  process.exit(1)
})
