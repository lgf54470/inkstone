import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { TotpLoginChallenge } from '@shared/types'
import { Logo } from '../../components/primitives'
import { Input } from '../../components/form'
import { cn } from '../../lib/cn'
import { ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { initialLoginCredentials } from '../../lib/runtime'
import { useSession } from '../../store/session'

interface LoginFlow {
  firstRun: boolean
  registerMode: boolean
  showModeSwitch: boolean
  registrationClosed: boolean
  username: string
  password: string
  confirmation: string
  isBusy: boolean
  error: string | null
  authError: string | null
  challenge: TotpLoginChallenge | null
  verificationCode: string
  isRecoveryMode: boolean
  setMode: (mode: 'login' | 'register') => void
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  setConfirmation: (value: string) => void
  setVerificationCode: (value: string) => void
  setIsRecoveryMode: (value: boolean | ((prev: boolean) => boolean)) => void
  setError: (value: string | null) => void
  setChallenge: (value: TotpLoginChallenge | null) => void
  backToPassword: () => void
  submit: () => Promise<void>
}

interface AuthStore {
  passwordLogin: (username: string, password: string) => Promise<TotpLoginChallenge | null>
  totpLogin: (challengeToken: string, code: string) => Promise<unknown>
  passwordRegister: (username: string, password: string) => Promise<unknown>
}

interface LoginContext extends LoginFlow {
  busyRef: { current: boolean }
  password: string
  auth: AuthStore
  setIsBusy: (busy: boolean) => void
}

type LoginActionContext = Omit<LoginContext, 'backToPassword' | 'submit'>

const TRACKING_H1 = 'tracking-[var(--tracking-h1)]'
const TRACKING_TAGLINE = 'tracking-[var(--tracking-tagline)]'
const TRACKING_FOOTER = 'tracking-[var(--tracking-footer)]'
const HALO_TOP = 'top-[-22%]'
const HALO_BLUR = 'blur-[120px]'

function reportFlowError(ctx: LoginActionContext, caught: unknown) {
  ctx.busyRef.current = false
  ctx.setIsBusy(false)
  ctx.setError(caught instanceof ApiError ? caught.message : t('auth.network_error_try_again'))
}

async function runTotpFlow(ctx: LoginActionContext) {
  if (!ctx.verificationCode.trim()) {
    ctx.setError(ctx.isRecoveryMode ? t('auth.enter_recovery_code') : t('auth.enter_authenticator_code'))
    return
  }
  ctx.busyRef.current = true
  ctx.setIsBusy(true)
  try {
    await ctx.auth.totpLogin(ctx.challenge!.challengeToken, ctx.verificationCode)
  } catch (caught) {
    ctx.busyRef.current = false
    ctx.setIsBusy(false)
    if (caught instanceof ApiError && caught.code === 'two_factor_challenge_expired') {
      ctx.setChallenge(null)
      ctx.setVerificationCode('')
      ctx.setIsRecoveryMode(false)
    }
    ctx.setError(caught instanceof ApiError ? caught.message : t('auth.network_error_try_again'))
  }
}

async function runCredentialsFlow(ctx: LoginActionContext) {
  if (!ctx.username.trim() || !ctx.password) {
    ctx.setError(t('auth.enter_a_username_and_password'))
    return
  }
  if (ctx.registerMode && ctx.password !== ctx.confirmation) {
    ctx.setError(t('common.the_passwords_do_not_match'))
    return
  }
  ctx.busyRef.current = true
  ctx.setIsBusy(true)
  try {
    if (ctx.registerMode) {
      await ctx.auth.passwordRegister(ctx.username.trim(), ctx.password)
    } else {
      const nextChallenge = await ctx.auth.passwordLogin(ctx.username.trim(), ctx.password)
      if (nextChallenge) {
        ctx.setChallenge(nextChallenge)
        ctx.setPassword('')
        ctx.setConfirmation('')
        ctx.setVerificationCode('')
        ctx.setIsRecoveryMode(false)
        ctx.busyRef.current = false
        ctx.setIsBusy(false)
      }
    }
  } catch (caught) {
    reportFlowError(ctx, caught)
  }
}

async function submitLoginFlow(ctx: LoginActionContext) {
  if (ctx.busyRef.current) return
  ctx.setError(null)
  if (ctx.challenge) {
    await runTotpFlow(ctx)
  } else {
    await runCredentialsFlow(ctx)
  }
}

function resetLoginChallenge(ctx: LoginActionContext) {
  ctx.setChallenge(null)
  ctx.setVerificationCode('')
  ctx.setIsRecoveryMode(false)
  ctx.setError(null)
}

function useLoginFlow(): LoginFlow {
  const initialCredentials = initialLoginCredentials()
  const site = useSession((state) => state.site)
  const authError = useSession((state) => state.authError)
  const passwordLogin = useSession((state) => state.passwordLogin)
  const totpLogin = useSession((state) => state.totpLogin)
  const passwordRegister = useSession((state) => state.passwordRegister)
  const auth = { passwordLogin, totpLogin, passwordRegister }
  const firstRun = Boolean(site && !site.initialized)
  const [mode, setMode] = useState<'login' | 'register'>(firstRun ? 'register' : 'login')
  const [username, setUsername] = useState(initialCredentials.username)
  const [password, setPassword] = useState(initialCredentials.password)
  const [confirmation, setConfirmation] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<TotpLoginChallenge | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const busyRef = useRef(false)
  const registerMode = mode === 'register' || firstRun
  const showModeSwitch = Boolean(!firstRun && site?.registrationOpen)
  const registrationClosed = Boolean(site && site.initialized && !site.registrationOpen)
  const ctx: LoginActionContext = {
    firstRun, registerMode, showModeSwitch, registrationClosed, username, password, confirmation, isBusy, error, authError: authError ?? null, challenge, verificationCode, isRecoveryMode, busyRef, auth,
    setMode, setUsername, setPassword, setConfirmation, setVerificationCode, setIsRecoveryMode, setError, setChallenge,
    setIsBusy,
  }
  return {
    firstRun, registerMode, showModeSwitch, registrationClosed, username, password, confirmation, isBusy, error, authError: authError ?? null, challenge, verificationCode, isRecoveryMode,
    setMode, setUsername, setPassword, setConfirmation, setVerificationCode, setIsRecoveryMode, setError, setChallenge,
    backToPassword: () => resetLoginChallenge(ctx),
    submit: () => submitLoginFlow(ctx),
  }
}

function LoginHeader({ flow }: { flow: LoginFlow }) {
  return (
    <div className='mb-6 flex flex-col items-center text-center md:mb-8'>
      <div
        className={cn(
          'mb-5 flex size-14 items-center justify-center rounded-[var(--r-18)]',
          'border border-[var(--border-default)] bg-[var(--bg-surface)]',
          'text-[var(--accent)] shadow-[var(--shadow-pop)]',
        )}
      >
        <Logo size={27} />
      </div>
      <h1 className={`text-[length:var(--text-30)] font-semibold ${TRACKING_H1} text-[var(--text-primary)]`} style={{ fontFamily: 'var(--font-serif)' }}>
        {t('common.product_name')}
      </h1>
      <p className='mt-2.5 text-[length:var(--text-13)] leading-relaxed text-[var(--text-tertiary)]'>
        {flow.challenge
          ? t('auth.two_step_verification_description')
          : flow.firstRun
            ? t('auth.create_the_owner_account_this_step_appears_only_once')
            : t('auth.between_the_paper_and_ink_the_pen_comes_to_life_an_inkstone_is_used_to_p')}
      </p>
    </div>
  )
}

function ChallengeIdentityRow({ username }: { username: string }) {
  return (
    <div className='mb-3 flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
      <KeyRound size={14} className='shrink-0 text-[var(--accent)]' />
      <span className='min-w-0 truncate'>@{username.trim()}</span>
    </div>
  )
}

function ChallengeCodeField({ flow }: { flow: LoginFlow }) {
  return (
    <Input
      aria-label={flow.isRecoveryMode ? t('auth.recovery_code') : t('auth.authenticator_code')}
      value={flow.verificationCode}
      maxLength={flow.isRecoveryMode ? 24 : 8}
      onChange={(event) =>
        flow.setVerificationCode(
          flow.isRecoveryMode ? event.target.value.toUpperCase() : event.target.value.replace(/\D/g, '').slice(0, 6),
        )
      }
      disabled={flow.isBusy}
      placeholder={flow.isRecoveryMode ? 'XXXX-XXXX-XXXX-XXXX' : '000000'}
      autoComplete={flow.isRecoveryMode ? 'off' : 'one-time-code'}
      autoCapitalize={flow.isRecoveryMode ? 'characters' : 'none'}
      inputMode={flow.isRecoveryMode ? 'text' : 'numeric'}
      spellCheck={false}
      autoFocus
    />
  )
}

function CredentialsFields({ flow }: { flow: LoginFlow }) {
  return (
    <>
      <Input
        aria-label={t('common.username')}
        value={flow.username}
        onChange={(event) => flow.setUsername(event.target.value)}
        disabled={flow.isBusy}
        placeholder={t('common.username')}
        autoComplete='username'
        autoCapitalize='none'
        spellCheck={false}
      />
      <Input
        aria-label={t('common.password')}
        type='password'
        value={flow.password}
        maxLength={LIMITS.passwordMaxLength}
        onChange={(event) => flow.setPassword(event.target.value)}
        disabled={flow.isBusy}
        placeholder={flow.registerMode ? t('auth.password_minimum_8_characters') : t('common.password')}
        autoComplete={flow.registerMode ? 'new-password' : 'current-password'}
      />
    </>
  )
}

function ConfirmationField({ flow }: { flow: LoginFlow }) {
  if (flow.challenge || !flow.registerMode) return null
  return (
    <Input
      aria-label={t('auth.confirm_password')}
      type='password'
      value={flow.confirmation}
      maxLength={LIMITS.passwordMaxLength}
      onChange={(event) => flow.setConfirmation(event.target.value)}
      disabled={flow.isBusy}
      placeholder={t('auth.confirm_password')}
      autoComplete='new-password'
    />
  )
}

function SubmitButton({ flow }: { flow: LoginFlow }) {
  const label = flow.challenge
    ? t('auth.verify_and_sign_in')
    : flow.registerMode
      ? flow.firstRun
        ? t('auth.create_owner_account')
        : t('auth.sign_up')
      : t('auth.sign_in')
  return (
    <button
      type='submit'
      disabled={flow.isBusy}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--r-lg)]',
        'bg-[var(--accent)] text-[length:var(--text-13\\.5)] font-medium text-[var(--accent-contrast)]',
        'transition-[transform,opacity,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]',
        'hover:bg-[var(--accent-hover)] active:translate-y-px disabled:opacity-50',
      )}
    >
      {flow.isBusy && <Loader2 size={16} className='animate-[ink-spin_.7s_linear_infinite]' />}
      {label}
    </button>
  )
}

function LinkButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      className={cn('text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]', className)}
    >
      {children}
    </button>
  )
}

function ChallengeLinks({ flow }: { flow: LoginFlow }) {
  if (!flow.challenge) return null
  return (
    <div className='flex items-center justify-between gap-3 pt-1'>
      <LinkButton onClick={flow.backToPassword} className='inline-flex items-center gap-1'>
        <ArrowLeft size={12} />
        {t('auth.back_to_password')}
      </LinkButton>
      <LinkButton
        disabled={flow.isBusy}
        onClick={() => {
          flow.setIsRecoveryMode((value) => !value)
          flow.setVerificationCode('')
          flow.setError(null)
        }}
      >
        {flow.isRecoveryMode ? t('auth.use_authenticator_code') : t('auth.use_recovery_code')}
      </LinkButton>
    </div>
  )
}

function ModeSwitchLink({ flow }: { flow: LoginFlow }) {
  if (flow.challenge || !flow.showModeSwitch) return null
  return (
    <LinkButton
      disabled={flow.isBusy}
      onClick={() => {
        flow.setMode(flow.registerMode ? 'login' : 'register')
        flow.setError(null)
      }}
      className='mx-auto block'
    >
      {flow.registerMode ? t('auth.already_have_an_account_sign_in') : t('auth.no_account_create_one')}
    </LinkButton>
  )
}

function LoginAlert({ flow }: { flow: LoginFlow }) {
  const message = flow.error || flow.authError
  if (!message) return null
  return (
    <div role='alert' className='anim-rise mt-4 flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2.5'>
      <TriangleAlert size={14} className='mt-[1px] shrink-0 text-[var(--danger)]' />
      <span className='text-[length:var(--text-12)] leading-relaxed text-[var(--text-secondary)]'>{message}</span>
    </div>
  )
}

function LoginFooter({ registrationClosed }: { registrationClosed: boolean }) {
  return (
    <div className='mt-6 space-y-2 text-center md:mt-8'>
      {registrationClosed && (
        <p className="text-[length:var(--text-11\\.5)] leading-relaxed text-[var(--text-quaternary)]">
          {t('auth.this_is_a_private_instance_registration_is_closed_so_only_existing_accou')}
        </p>
      )}
      <p className={`text-[length:var(--text-11)] ${TRACKING_TAGLINE} text-[var(--text-quaternary)]`}>
        {t('auth.live_split_view_markdown_preview_realtime_multi_device_sync_multiple_web')}
      </p>
    </div>
  )
}

function Backdrop() {
  return (
    <div aria-hidden='true' className='pointer-events-none absolute inset-0 overflow-hidden'>
      <div className={`absolute left-1/2 ${HALO_TOP} size-180 -translate-x-1/2 rounded-full opacity-[0.13] ${HALO_BLUR}`} style={{ background: 'var(--accent)' }} />
      <div
        className='absolute inset-0 opacity-[0.5]'
        style={{
          backgroundImage:
            'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 80% 55% at 50% 40%, var(--mask-ink) 20%, transparent 78%)',
        }}
      />
    </div>
  )
}

export function LoginPage() {
  const flow = useLoginFlow()
  return (
    <div className='relative flex min-h-full flex-col items-center justify-center overflow-y-auto px-4 pt-[calc(32px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))] md:px-6 md:py-10'>
      <Backdrop />
      <div className='anim-rise relative w-full max-w-95'>
        <LoginHeader flow={flow} />
        <form
          className='space-y-2.5'
          onSubmit={(event) => {
            event.preventDefault()
            void flow.submit()
          }}
        >
          {flow.challenge ? (
            <>
              <ChallengeIdentityRow username={flow.username} />
              <ChallengeCodeField flow={flow} />
            </>
          ) : (
            <>
              <CredentialsFields flow={flow} />
              <ConfirmationField flow={flow} />
            </>
          )}
          <SubmitButton flow={flow} />
          <ChallengeLinks flow={flow} />
          <ModeSwitchLink flow={flow} />
        </form>
        <LoginAlert flow={flow} />
        <LoginFooter registrationClosed={flow.registrationClosed} />
      </div>
      <footer className={`pointer-events-none mt-6 text-center text-[length:var(--text-11)] ${TRACKING_FOOTER} text-[var(--text-quaternary)] md:mt-8`}>
        {t('auth.self_hosted_on_cloudflare_workers_your_data_is_yours')}
      </footer>
    </div>
  )
}
