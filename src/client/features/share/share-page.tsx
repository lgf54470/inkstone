import { useState } from 'react';
import { KeyRound, Lock, Moon, Sun } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import type { PublicNote } from '@shared/types';
import { fullTime } from '../../lib/time';
import { readingMinutes, countText } from '@shared/markdown-utils';
import { Avatar, Button, Logo } from '../../components/primitives';
import { Input } from '../../components/form';
import { LoadingBlock } from '../../components/feedback';
import { Tooltip } from '../../components/overlay';
import { t } from "../../lib/i18n";
import type { ShareRenderBundle } from './use-share-page';
import { useShareLoad, useShareRendering } from './use-share-page';

export function SharePage({ slug }: {
    slug: string;
}) {
    const loadBundle = useShareLoad(slug);
    const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
    const toggleTheme = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
    };
    const renderBundle = useShareRendering(loadBundle.note, dark);
    return (
        <div className="h-full overflow-y-auto overscroll-contain bg-[var(--bg-base)]">
            <SharePageHeader siteName={loadBundle.note?.site.name ?? 'Inkstone'} dark={dark} onToggleTheme={toggleTheme} />
            <main className="mx-auto max-w-[860px] px-4 pb-[calc(64px+env(safe-area-inset-bottom))] md:px-5 md:pb-24">
                <SharePageBody loadBundle={loadBundle} renderBundle={renderBundle} />
            </main>
        </div>
    );
}

function SharePageHeader({ siteName, dark, onToggleTheme }: {
    siteName: string
    dark: boolean
    onToggleTheme: () => void
}) {
    return (
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/85 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="mx-auto flex h-12 max-w-[860px] items-center gap-3 px-4 md:px-5">
                <span className="flex items-center gap-1.5 text-[var(--accent)]">
                    <Logo size={15}/>
                </span>
                <span className="text-[length:var(--text-12\.5)] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                    {siteName}
                </span>
                <span className="flex-1"/>
                <Tooltip label={t("share.switch_theme")} side="left">
                    <button type="button" onClick={onToggleTheme} aria-label={t("share.switch_theme")} className="inline-flex size-9 items-center justify-center rounded-[var(--r-md)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:size-7">
                        {dark ? <Sun size={14}/> : <Moon size={14}/>}
                    </button>
                </Tooltip>
            </div>
        </header>
    );
}

type ShareLoadBundle = ReturnType<typeof useShareLoad>

function SharePageBody({ loadBundle, renderBundle }: {
    loadBundle: ShareLoadBundle
    renderBundle: ShareRenderBundle
}) {
    const { isPasswordRequired, isLoading, error, note } = loadBundle
    if (isLoading && !isPasswordRequired) {
        return <div className="pt-24">
            <LoadingBlock label={t("share.opening")}/>
        </div>
    }
    if (isPasswordRequired) {
        return <SharePasswordView loadBundle={loadBundle} />
    }
    if (error) {
        return (
            <div className="mx-auto max-w-[380px] pt-[18vh] text-center">
                <h1 className="text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]">{t("share.content_unavailable")}</h1>
                <p role="alert" className="mt-2 text-[length:var(--text-13)] leading-relaxed text-[var(--text-tertiary)]">{error}</p>
            </div>
        )
    }
    if (!note)
        return null
    return <ShareNoteView note={note} renderBundle={renderBundle} />
}

function SharePasswordView({ loadBundle }: {
    loadBundle: ShareLoadBundle
}) {
    const { password, setPassword, error, isLoading, load } = loadBundle
    return (
        <div className="anim-rise mx-auto max-w-[340px] pt-[16vh] text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[var(--r-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]">
                <Lock size={20}/>
            </div>
            <h1 className="text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]">{t("share.this_note_requires_a_password")}</h1>
            <p className="mt-1.5 text-[length:var(--text-12\.5)] text-[var(--text-tertiary)]">{t("share.ask_the_person_who_shared_this_note_for_its_passcode")}</p>
            <form className="mt-5 space-y-2.5" onSubmit={(event) => {
                event.preventDefault();
                void load(password);
            }}>
                <Input aria-label={t("common.access_passcode")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("common.access_passcode")} autoComplete="current-password" maxLength={LIMITS.passwordMaxLength} autoFocus leading={<KeyRound size={13}/>} invalid={Boolean(error)}/>
                {error && <p role="alert" className="text-[length:var(--text-12)] text-[var(--danger)]">{error}</p>}
                <Button type="submit" variant="primary" block loading={isLoading}>{t("share.view_content")}</Button>
            </form>
        </div>
    )
}

function ShareNoteView({ note, renderBundle }: {
    note: PublicNote
    renderBundle: ShareRenderBundle
}) {
    const stats = countText(note.content);
    return (
        <article className="pt-7 md:pt-10">
            <header className="mb-6 md:mb-8">
                <h1 className="text-[length:var(--text-26)] leading-[1.25] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[length:var(--text-30)]">
                    {note.title || t("common.untitled_note")}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                    <span className="flex items-center gap-1.5">
                        <Avatar src={note.author.avatarUrl} name={note.author.name} size={18}/>
                        {note.author.name}
                    </span>
                    <span>·</span>
                    <span>{fullTime(note.updatedAt)}</span>
                    {stats && (<>
                        <span>·</span>
                        <span>{stats.words}{t("common.words")}</span>
                        <span>·</span>
                        <span>{t("common.about")}{readingMinutes(stats.words)}{t("common.min")}</span>
                    </>)}
                </div>
            </header>

            <div
                ref={renderBundle.hostRef}
                onClick={renderBundle.onContentClick}
                onKeyDown={renderBundle.onContentKeyDown}
                className="ink-prose"
                style={{ maxWidth: 'none' }}
                dangerouslySetInnerHTML={renderBundle.htmlObj}
            />

            <footer className="mt-16 border-t border-[var(--border-subtle)] pt-6 text-center">
                <a href="/" className="inline-flex items-center gap-1.5 text-[length:var(--text-11\.5)] text-[var(--text-quaternary)] transition-colors hover:text-[var(--accent)]">
                    <Logo size={12}/>{t("share.shared_via_site", { site: note.site.name })}</a>
            </footer>
        </article>
    );
}