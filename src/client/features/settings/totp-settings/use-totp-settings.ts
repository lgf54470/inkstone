import { useEffect, useRef, useState } from 'react';
import { type TotpSetupInfo, type TotpStatus } from '@shared/types';
import { api } from '../../../lib/api';
import { errorMessage, copyText } from './util';
import { downloadTextFile } from '../../../lib/export-note';
import { useUi } from '../../../store/ui';
import { t } from '../../../lib/i18n';

export type TotpPanel = 'none' | 'enable' | 'setup' | 'recovery' | 'regenerate' | 'disable';

type TotpCore = ReturnType<typeof useTotpCore>;

export type TotpSettingsState = ReturnType<typeof useTotpSettings>;

function useTotpCore() {
  const toast = useUi((state) => state.toast);
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [panel, setPanel] = useState<TotpPanel>('none');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<TotpSetupInfo | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  return { toast, status, setStatus, isLoading, setIsLoading, panel, setPanel, password, setPassword, code, setCode, setup, setSetup, recoveryCodes, setRecoveryCodes, isBusy, setIsBusy, error, setError, mountedRef, busyRef };
}

export function useTotpSettings() {
  const core = useTotpCore();
  useEffect(() => {
    core.mountedRef.current = true;
    void loadTotpFlow(core);
    return () => {
      core.mountedRef.current = false;
    };
  }, []);
  const load = () => void loadTotpFlow(core);
  const resetForm = (next: TotpPanel = 'none') => resetTotpForm(core, next);
  const beginSetup = () => void beginSetupFlow(core);
  const confirmSetup = () => void confirmSetupFlow(core);
  const cancelSetup = () => void cancelSetupFlow(core);
  const regenerate = () => void regenerateFlow(core);
  const disable = () => void disableFlow(core);
  const copy = (value: string, message: string) => void copyTotpFlow(core, value, message);
  const downloadRecoveryCodes = () => downloadTotpFlow(core.recoveryCodes);
  return { status: core.status, isLoading: core.isLoading, panel: core.panel, password: core.password, setPassword: core.setPassword, code: core.code, setCode: core.setCode, setup: core.setup, recoveryCodes: core.recoveryCodes, isBusy: core.isBusy, error: core.error, load, resetForm, beginSetup, confirmSetup, cancelSetup, regenerate, disable, copy, downloadRecoveryCodes };
}

async function loadTotpFlow(core: TotpCore) {
  core.setIsLoading(true);
  core.setError(null);
  try {
    const next = await api.auth.totp.status();
    if (core.mountedRef.current) core.setStatus(next);
  }
  catch (caught) {
    if (core.mountedRef.current) core.setError(errorMessage(caught));
  }
  finally {
    if (core.mountedRef.current) core.setIsLoading(false);
  }
}

function resetTotpForm(core: TotpCore, next: TotpPanel = 'none') {
  core.setPanel(next);
  core.setPassword('');
  core.setCode('');
  core.setError(null);
  if (next !== 'setup') core.setSetup(null);
  if (next !== 'recovery') core.setRecoveryCodes([]);
}

async function runTotpBusy(core: TotpCore, task: () => Promise<void>) {
  if (core.busyRef.current) return;
  core.busyRef.current = true;
  core.setIsBusy(true);
  core.setError(null);
  try {
    await task();
  }
  catch (caught) {
    if (core.mountedRef.current) core.setError(errorMessage(caught));
  }
  finally {
    core.busyRef.current = false;
    if (core.mountedRef.current) core.setIsBusy(false);
  }
}

function beginSetupFlow(core: TotpCore) {
  void runTotpBusy(core, async () => {
    if (!core.password) {
      core.setError(t('settings.enter_your_current_password'));
      return;
    }
    const next = await api.auth.totp.startSetup(core.password);
    if (!core.mountedRef.current) return;
    core.setSetup(next);
    core.setPassword('');
    core.setCode('');
    core.setPanel('setup');
  });
}

function confirmSetupFlow(core: TotpCore) {
  void runTotpBusy(core, async () => {
    if (!core.setup || core.code.replace(/\D/g, '').length !== 6) {
      core.setError(t('settings.totp_enter_six_digit_code'));
      return;
    }
    const result = await api.auth.totp.confirmSetup(core.setup.setupToken, core.code);
    if (!core.mountedRef.current) return;
    core.setStatus((current) => ({
      available: current?.available ?? true,
      enabled: true,
      enabledAt: result.enabledAt,
      recoveryCodesRemaining: result.recoveryCodesRemaining,
    }));
    core.setSetup(null);
    core.setCode('');
    core.setRecoveryCodes(result.recoveryCodes);
    core.setPanel('recovery');
    core.toast({
      title: t('settings.totp_enabled'),
      description: t('settings.totp_other_sessions_revoked'),
      tone: 'success',
    });
  });
}

function cancelSetupFlow(core: TotpCore) {
  void runTotpBusy(core, async () => {
    const pending = core.setup;
    resetTotpForm(core);
    if (pending) await api.auth.totp.cancelSetup(pending.setupToken).catch(() => { });
  });
}

function regenerateFlow(core: TotpCore) {
  void runTotpBusy(core, async () => {
    if (!core.password) {
      core.setError(t('settings.enter_your_current_password'));
      return;
    }
    if (core.code.replace(/\D/g, '').length !== 6) {
      core.setError(t('settings.totp_enter_six_digit_code'));
      return;
    }
    const result = await api.auth.totp.regenerateRecoveryCodes(core.password, core.code);
    if (!core.mountedRef.current) return;
    core.setStatus((current) => current && ({
      ...current,
      recoveryCodesRemaining: result.recoveryCodesRemaining,
    }));
    core.setPassword('');
    core.setCode('');
    core.setRecoveryCodes(result.recoveryCodes);
    core.setPanel('recovery');
    core.toast({ title: t('settings.totp_recovery_codes_replaced'), tone: 'success' });
  });
}

function disableFlow(core: TotpCore) {
  void runTotpBusy(core, async () => {
    if (!core.password) {
      core.setError(t('settings.enter_your_current_password'));
      return;
    }
    if (!core.code.trim()) {
      core.setError(t('settings.totp_enter_code_or_recovery'));
      return;
    }
    await api.auth.totp.disable(core.password, core.code);
    if (!core.mountedRef.current) return;
    core.setStatus((current) => ({
      available: current?.available ?? true,
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
    }));
    resetTotpForm(core);
    core.toast({
      title: t('settings.totp_disabled'),
      description: t('settings.totp_other_sessions_revoked'),
      tone: 'success',
    });
  });
}

async function copyTotpFlow(core: TotpCore, value: string, message: string) {
  try {
    await copyText(value);
    core.toast({ title: message, tone: 'success' });
  }
  catch {
    core.setError(t('settings.totp_copy_failed'));
  }
}

function downloadTotpFlow(recoveryCodes: string[]) {
  const content = [
    t('settings.totp_recovery_file_title'),
    t('settings.totp_recovery_file_warning'),
    '',
    ...recoveryCodes,
    '',
  ].join('\n');
  downloadTextFile('inkstone-recovery-codes.txt', content, 'text/plain;charset=utf-8');
}
