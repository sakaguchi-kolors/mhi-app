import { useCallback, useRef, useState } from 'react';

export interface ToastState {
  msg: string;
  visible: boolean;
  show: (m: string) => void;
}

export function useToast(): ToastState {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m); setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);
  return { msg, visible, show };
}

export function Toast({ state }: { state: ToastState }) {
  return <div className={`toast ${state.visible ? 'show' : ''}`}>{state.msg}</div>;
}
