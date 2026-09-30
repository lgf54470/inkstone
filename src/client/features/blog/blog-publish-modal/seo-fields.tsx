import { Image as ImageIcon, Search } from 'lucide-react'
import { Field, Input, Switch, Textarea } from '../../../components/form'
import { t } from '../../../lib/i18n'

/**
 * The slice of the publish form this group reads and writes: the dialog passes its whole form, but
 * the group only knows about the values it owns, so adding a field elsewhere cannot silently widen it.
 */
export interface SeoFieldsForm {
  seoTitle: string
  setSeoTitle: (value: string) => void
  seoDescription: string
  setSeoDescription: (value: string) => void
  seoImageUrl: string
  setSeoImageUrl: (value: string) => void
  seoCanonicalUrl: string
  setSeoCanonicalUrl: (value: string) => void
  seoNoindex: boolean
  setSeoNoindex: (value: boolean) => void
}

/**
 * What a search result or a chat client shows instead of the post page. Every field is optional and
 * empty means "use what the post itself says", so the group is what an author opens only when the
 * automatic preview is wrong — which is why it states that rule once, above the fields, rather than
 * repeating it as a hint under each one.
 */
export function SeoFields({ form }: { form: SeoFieldsForm }) {
  return (
    <section className='space-y-3 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
      <SeoHeading />
      <SeoTextFields form={form} />
      <NoindexRow form={form} />
    </section>
  )
}

function SeoHeading() {
  return (
    <div className='flex items-start gap-2'>
      <Search size={13} className='mt-0.5 shrink-0 text-[var(--accent)]' />
      <div>
        <h3 className='font-medium text-[var(--text-secondary)]'>{t('blog.seo_section')}</h3>
        <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('blog.seo_section_hint')}
        </p>
      </div>
    </div>
  )
}

function SeoTextFields({ form }: { form: SeoFieldsForm }) {
  return (
    <>
      <Field label={t('blog.seo_title_label')}>
        <Input value={form.seoTitle} onChange={(e) => form.setSeoTitle(e.target.value)} />
      </Field>

      <Field label={t('blog.seo_description_label')}>
        <Textarea
          value={form.seoDescription}
          onChange={(e) => form.setSeoDescription(e.target.value)}
          rows={2}
          className='resize-none'
        />
      </Field>

      <Field label={t('blog.seo_image_label')}>
        <Input
          leading={<ImageIcon size={13} className='text-[var(--text-quaternary)]' />}
          value={form.seoImageUrl}
          onChange={(e) => form.setSeoImageUrl(e.target.value)}
        />
      </Field>

      <Field label={t('blog.seo_canonical_label')}>
        <Input value={form.seoCanonicalUrl} onChange={(e) => form.setSeoCanonicalUrl(e.target.value)} />
      </Field>
    </>
  )
}

/** The one flag in the group that is read rather than shown: a post nobody should find. */
function NoindexRow({ form }: { form: SeoFieldsForm }) {
  return (
    <div className='flex items-center justify-between border-t border-[var(--border-subtle)] pt-3'>
      <div>
        <span className='block font-medium text-[var(--text-primary)]'>{t('blog.seo_noindex_label')}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('blog.seo_noindex_hint')}
        </span>
      </div>
      <Switch checked={form.seoNoindex} onChange={form.setSeoNoindex} label={t('blog.seo_noindex_label')} />
    </div>
  )
}
