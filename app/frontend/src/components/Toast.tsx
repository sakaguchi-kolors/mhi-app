import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastVariant = 'default' | 'error';

export type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

export interface ToastState {
  msg: string;
  visible: boolean;
  variant: ToastVariant;
  show: (m: string, opts?: ToastOptions) => void;
}

export function useToast(): ToastState {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState<ToastVariant>('default');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const show = useCallback((m: string, opts?: ToastOptions) => {
    setMsg(m);
    setVariant(opts?.variant ?? 'default');
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), opts?.duration ?? 2200);
  }, []);

  return { msg, visible, variant, show };
}

export function Toast({ state }: { state: ToastState }) {
  return (
    <div className={`toast ${state.variant === 'error' ? 'error' : ''} ${state.visible ? 'show' : ''}`}>
      {state.msg}
    </div>
  );
}
