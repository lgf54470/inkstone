import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_NEW_NOTE_TEMPLATE } from '@shared/constants';
import { renderNewNoteTemplate } from '@shared/markdown-utils';
import { Input, SettingRow, Switch, Textarea } from '../../components/form';
import { Button } from '../../components/primitives';
import { useSession } from '../../store/session';
import { t, useLocale } from "../../lib/i18n";

export function NoteSettings() {
    const notes = useSession((s) => s.settings.notes);
    const update = useSession((s) => s.updateSettings);
    const locale = useLocale();

    const setTemplate = useCallback((newNoteTemplate: string) => void update({ notes: { newNoteTemplate } }), [update]);
    const restoreDefault = useCallback(() => void update({ notes: { newNoteTemplate: DEFAULT_NEW_NOTE_TEMPLATE } }), [update]);
    const setSyncTitleToFrontMatter = useCallback((syncTitleToFrontMatter: boolean) => void update({ notes: { syncTitleToFrontMatter } }), [update]);
    const setSyncFrontMatterTitle = useCallback((syncFrontMatterTitle: boolean) => void update({ notes: { syncFrontMatterTitle } }), [update]);
    // Live preview: what the template looks like with the placeholders filled in.
    const [demoTitle, setDemoTitle] = useState('');
    const [demoFolder, setDemoFolder] = useState('');
    const [demoTag, setDemoTag] = useState('');
    const preview = useMemo(() => {
        const demoTags = demoTag.split(/[,]|\uFF0C/).map((item) => item.trim()).filter(Boolean).join(', ');
        return renderNewNoteTemplate(
            notes.newNoteTemplate,
            demoTitle.trim() || t("common.new_note"),
            new Date(),
            { folder: demoFolder.trim(), tags: demoTags },
        );
    }, [notes.newNoteTemplate, demoTitle, demoFolder, demoTag, locale]);
    const hasContextualPlaceholders = notes.newNoteTemplate.includes('{{folder}}') || notes.newNoteTemplate.includes('{{tags}}');

    return (<div className="space-y-6">
      <section>
        <SettingRow
          title={t("settings.new_note_template")}
          description={t("settings.new_note_template_description")}
        >
          <div className="flex w-[340px] max-w-full flex-col items-end gap-2">
            <Textarea
              aria-label={t("settings.new_note_template")}
              value={notes.newNoteTemplate}
              onChange={(e) => setTemplate(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full font-mono text-[12.5px]"
            />
            <Button size="sm" variant="ghost" onClick={restoreDefault}>
              {t("settings.restore_default_template")}
            </Button>
          </div>
        </SettingRow>
        <p className="pt-3 text-[11.5px] leading-relaxed text-[var(--text-quaternary)]">
          {t("settings.new_note_template_hint")}
        </p>

        <div className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
            {t("settings.new_note_template_preview")}
          </h3>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input aria-label={t("settings.template_preview_title")} placeholder={t("settings.template_preview_title")} value={demoTitle} onChange={(e) => setDemoTitle(e.target.value)}/>
            <Input aria-label={t("settings.template_preview_folder")} placeholder={t("settings.template_preview_folder")} value={demoFolder} onChange={(e) => setDemoFolder(e.target.value)}/>
            <Input aria-label={t("settings.template_preview_tag")} placeholder={t("settings.template_preview_tag")} value={demoTag} onChange={(e) => setDemoTag(e.target.value)}/>
          </div>
          <pre className="max-h-52 overflow-auto whitespace-pre rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">{preview.cursor === null ? preview.content : (<>
              {preview.content.slice(0, preview.cursor)}
              <span aria-hidden="true" className="mx-px inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-[var(--accent)] align-middle"/>
              {preview.content.slice(preview.cursor)}
            </>)}</pre>
          {hasContextualPlaceholders && (<p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-quaternary)]">
              {t("settings.template_preview_context")}
            </p>)}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t("settings.title_sync")}
        </h3>

        <SettingRow title={t("settings.sync_title_to_frontmatter")} description={t("settings.sync_title_to_frontmatter_desc")}>
          <Switch checked={notes.syncTitleToFrontMatter} onChange={setSyncTitleToFrontMatter} label={t("settings.sync_title_to_frontmatter")}/>
        </SettingRow>

        <SettingRow title={t("settings.sync_frontmatter_title")} description={t("settings.sync_frontmatter_title_desc")}>
          <Switch checked={notes.syncFrontMatterTitle} onChange={setSyncFrontMatterTitle} label={t("settings.sync_frontmatter_title")}/>
        </SettingRow>
      </section>
    </div>);
}