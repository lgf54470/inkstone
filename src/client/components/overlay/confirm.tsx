import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../primitives';
import { t } from '../../lib/i18n';
import { Modal } from './modal';



export interface ConfirmOptions {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
}


export interface ConfirmRequest {
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
}


export let enqueueConfirm: ((request: ConfirmRequest) => void) | null = null;



export function confirm(options: ConfirmOptions): Promise<boolean> {
    if (!enqueueConfirm)
        return Promise.resolve(window.confirm(options.title));
    return new Promise((resolve) => {
        enqueueConfirm?.({ options, resolve });
    });
}


export function ConfirmHost() {
    const [current, setCurrent] = useState<ConfirmRequest | null>(null);
    const currentRef = useRef<ConfirmRequest | null>(null);
    const queueRef = useRef<ConfirmRequest[]>([]);
    useEffect(() => {
        enqueueConfirm = (request) => {
            if (currentRef.current) {
                queueRef.current.push(request);
                return;
            }
            currentRef.current = request;
            setCurrent(request);
        };
        return () => {
            enqueueConfirm = null;
            currentRef.current?.resolve(false);
            for (const request of queueRef.current)
                request.resolve(false);
            currentRef.current = null;
            queueRef.current = [];
        };
    }, []);
    const finish = useCallback((request: ConfirmRequest | null, value: boolean) => {
        if (!request || currentRef.current !== request)
            return;
        request.resolve(value);
        const next = queueRef.current.shift() ?? null;
        currentRef.current = next;
        setCurrent(next);
    }, []);
    const options = current?.options;
    return (<Modal open={Boolean(current)} onClose={() => finish(current, false)} title={options?.title} description={options?.description} width={440} footer={<>
          <Button variant="ghost" onClick={() => finish(current, false)}>
            {options?.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button variant={options?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => finish(current, true)} data-autofocus>
            {options?.confirmLabel ?? t("overlay.confirm")}
          </Button>
        </>}>
      <div />
    </Modal>);
}
