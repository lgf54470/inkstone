import { useEffect, useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import type { NoteTemplate, NoteTemplateCategory } from '@shared/types';
import { parseTemplateLibraryExport } from '@shared/note-templates';
import { EMPTY_DRAFT, splitTagInput, type TemplateDraft } from './gallery-persist';
import { cn } from '../../lib/cn';
import { Button } from '../../components/primitives';
import { Field, Input, Select, Textarea } from '../../components/form';
import { Modal } from '../../components/overlay';
import { useNoteTemplates } from '../../store/note-templates';
import { useUi } from '../../store/ui';
import { t } from '../../lib/i18n';

export function TemplateEditorModal({ template, categories, onClose }: {
    template: NoteTemplate | null;
    categories: NoteTemplateCategory[];
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<TemplateDraft>(template
        ? { name: template.name, description: template.description, content: template.content, categoryId: template.categoryId, tags: template.tags }
        : EMPTY_DRAFT);
    const [isError, setIsError] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => { nameRef.current?.focus(); }, []);
    const save = () => {
        if (!draft.name.trim()) {
            setIsError(true);
            return;
        }
        if (template)
            useNoteTemplates.getState().updateTemplate(template.id, draft);
        else
            useNoteTemplates.getState().createTemplate(draft);
        onClose();
    };
    return (<Modal open onClose={onClose} title={template ? t("templates.edit_template") : t("templates.create_template")} width={680} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{template ? t("common.save") : t("templates.create_template")}</Button>
        </>}>
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("templates.template_name")} required>
                    <Input ref={nameRef} invalid={isError} value={draft.name} onChange={(event) => {
                        setDraft({ ...draft, name: event.target.value });
                        setIsError(false);
                    }} placeholder={t("templates.template_name")}/>
                </Field>
                <Field label={t("templates.category")}>
                    <Select value={draft.categoryId ?? ''} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null })}>
                        <option value="">{t("templates.uncategorized")}</option>
                        {categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
                    </Select>
                </Field>
            </div>
            <Field label={t("templates.tags")} hint={t("templates.tag_hint")}>
                <Input value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: splitTagInput(event.target.value) })} placeholder={t("templates.tag_hint")}/>
            </Field>
            <Field label={t("templates.description")}>
                <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t("templates.description")}/>
            </Field>
            <Field label={t("templates.template_content")} hint={t("templates.template_content_hint")}>
                <Textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={16} spellCheck={false} className="min-h-[280px] font-mono text-[length:var(--text-12\.5)]"/>
            </Field>
        </div>
    </Modal>);
}

export function TemplateRenameDialog({ template, onClose }: {
    template: NoteTemplate;
    onClose: () => void;
}) {
    const [name, setName] = useState(template.name);
    const [isError, setIsError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const save = () => {
        if (!name.trim()) {
            setIsError(true);
            return;
        }
        useNoteTemplates.getState().updateTemplate(template.id, { name });
        onClose();
    };
    return (<Modal open onClose={onClose} title={t("templates.rename_template")} width={420} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{t("common.save")}</Button>
        </>}>
        <Field label={t("templates.template_name")} required>
            <Input ref={inputRef} invalid={isError} value={name} onChange={(event) => {
                setName(event.target.value);
                setIsError(false);
            }} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder={t("templates.template_name")}/>
        </Field>
    </Modal>);
}

export function MoveTemplateDialog({ template, categories, onClose }: {
    template: NoteTemplate;
    categories: NoteTemplateCategory[];
    onClose: () => void;
}) {
    const move = (categoryId: string | null) => {
        if (categoryId !== template.categoryId)
            useNoteTemplates.getState().updateTemplate(template.id, { categoryId });
        onClose();
    };
    return (<Modal open onClose={onClose} title={t("templates.move_to_category")} width={420}>
        <div className="space-y-1">
            <MoveChoice label={t("templates.uncategorized")} selected={template.categoryId === null} onClick={() => move(null)}/>
            {categories.map((category) => (<MoveChoice key={category.id} label={category.name} selected={template.categoryId === category.id} onClick={() => move(category.id)}/>))}
        </div>
    </Modal>);
}

export function MoveChoice({ label, selected, onClick }: {
    label: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (<button type="button" aria-pressed={selected} onClick={onClick} className={cn('flex min-h-10 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-left text-[length:var(--text-13)] transition-colors', selected ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected && <Check size={14} className="shrink-0"/>}
    </button>);
}

export function CategoryDialog({ dialog, onClose }: {
    dialog: { mode: 'create' } | { mode: 'rename'; category: NoteTemplateCategory };
    onClose: () => void;
}) {
    const [name, setName] = useState(dialog.mode === 'rename' ? dialog.category.name : '');
    const [isError, setIsError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const save = () => {
        if (!name.trim()) {
            setIsError(true);
            return;
        }
        if (dialog.mode === 'rename')
            useNoteTemplates.getState().renameCategory(dialog.category.id, name);
        else
            useNoteTemplates.getState().createCategory(name);
        onClose();
    };
    return (<Modal open onClose={onClose} title={dialog.mode === 'rename' ? t("templates.rename_category") : t("templates.new_category")} width={420} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{t("common.save")}</Button>
        </>}>
        <Field label={t("templates.category_name")} required>
            <Input ref={inputRef} invalid={isError} value={name} onChange={(event) => {
                setName(event.target.value);
                setIsError(false);
            }} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder={t("templates.category_name")}/>
        </Field>
    </Modal>);
}

export function ImportTemplatesModal({ onClose }: {
    onClose: () => void;
}) {
    const [text, setText] = useState('');
    const [isError, setIsError] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const importJson = () => {
        const data = parseTemplateLibraryExport(text);
        if (!data) {
            setIsError(true);
            return;
        }
        const { imported, skipped } = useNoteTemplates.getState().importTemplates(data);
        useUi.getState().toast({
            title: t("templates.imported_value0_skipped_value1", { value0: imported, value1: skipped }),
            tone: 'success',
        });
        onClose();
    };
    const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(String(reader.result ?? ''));
            setIsError(false);
        };
        reader.readAsText(file);
        event.target.value = '';
    };
    return (<Modal open onClose={onClose} title={t("templates.import_title")} width={560} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={importJson}>{t("templates.import_templates")}</Button>
        </>}>
        <div className="space-y-3">
            <p className="text-[length:var(--text-12)] leading-relaxed text-[var(--text-tertiary)]">{t("templates.import_hint")}</p>
            <Textarea value={text} aria-invalid={isError} onChange={(event) => {
                setText(event.target.value);
                setIsError(false);
            }} rows={10} spellCheck={false} placeholder={t("templates.import_paste_placeholder")} className="min-h-[180px] font-mono text-[length:var(--text-12)]"/>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={pickFile}/>
            <Button variant="secondary" icon={<Upload size={13}/>} onClick={() => fileRef.current?.click()}>{t("templates.import_file")}</Button>
        </div>
    </Modal>);
}

export function BatchMoveDialog({ categories, onMove, onClose }: {
    categories: NoteTemplateCategory[];
    onMove: (categoryId: string | null) => void;
    onClose: () => void;
}) {
    return (<Modal open onClose={onClose} title={t("templates.move_to_category")} width={420}>
        <div className="space-y-1">
            <MoveChoice label={t("templates.uncategorized")} selected={false} onClick={() => onMove(null)}/>
            {categories.map((category) => (<MoveChoice key={category.id} label={category.name} selected={false} onClick={() => onMove(category.id)}/>))}
        </div>
    </Modal>);
}

