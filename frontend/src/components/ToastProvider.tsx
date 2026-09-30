'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

export interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the dialog shows a text input and resolves to its value (or null on cancel). */
  input?: { placeholder?: string; required?: boolean };
}

interface DialogState extends DialogOptions {
  resolve: (value: string | boolean | null) => void;
}

interface ToastContextType {
  confirm: (options: Omit<DialogOptions, 'input'>) => Promise<boolean>;
  prompt: (options: DialogOptions & { input: NonNullable<DialogOptions['input']> }) => Promise<string | null>;
  toast: (item: { type?: ToastType; title?: string; message: string }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const dialogRef = useRef<DialogState | null>(null);

  const openDialog = useCallback((options: DialogOptions) => {
    return new Promise<string | boolean | null>((resolve) => {
      // A newly opened dialog cancels any dialog that is still pending.
      dialogRef.current?.resolve(options.input ? null : false);
      const next = { ...options, resolve };
      dialogRef.current = next;
      setInputValue('');
      setDialog(next);
    });
  }, []);

  const closeDialog = useCallback((value: string | boolean | null) => {
    dialogRef.current?.resolve(value);
    dialogRef.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback(
    (options: Omit<DialogOptions, 'input'>) => openDialog(options) as Promise<boolean>,
    [openDialog],
  );
  const prompt = useCallback(
    (options: DialogOptions & { input: NonNullable<DialogOptions['input']> }) =>
      openDialog(options) as Promise<string | null>,
    [openDialog],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = 'info', title, message }: { type?: ToastType; title?: string; message: string }) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        removeToast(id);
      }, 5000);
    },
    [removeToast],
  );

  const success = useCallback((message: string, title?: string) => toast({ type: 'success', title, message }), [toast]);
  const error = useCallback((message: string, title?: string) => toast({ type: 'error', title, message }), [toast]);
  const info = useCallback((message: string, title?: string) => toast({ type: 'info', title, message }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, confirm, prompt }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5 ${
              t.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
                : t.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                : 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0 text-xs sm:text-sm">
              {t.title && <div className="font-semibold text-white mb-0.5">{t.title}</div>}
              <div className="leading-relaxed break-words whitespace-pre-wrap">{t.message}</div>
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="text-zinc-400 hover:text-white transition shrink-0 p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => closeDialog(dialog.input ? null : false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeDialog(dialog.input ? null : false);
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog.input) {
                const value = inputValue.trim();
                if (dialog.input.required !== false && !value) return;
                closeDialog(value);
              } else {
                closeDialog(true);
              }
            }}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl space-y-3"
          >
            <h3 className="text-sm font-bold text-ink">{dialog.title}</h3>
            {dialog.message && <p className="text-xs text-muted leading-relaxed">{dialog.message}</p>}
            {dialog.input && (
              <input
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={dialog.input.placeholder}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md text-xs"
              />
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => closeDialog(dialog.input ? null : false)}
                className="px-3 py-1.5 rounded-md border border-line text-xs font-semibold text-muted hover:bg-paper cursor-pointer"
              >
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button
                type="submit"
                autoFocus={!dialog.input}
                className={`px-3 py-1.5 rounded-md text-xs font-bold text-white cursor-pointer ${
                  dialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent hover:bg-accent-deep'
                }`}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      confirm: async () => false,
      prompt: async () => null,
      toast: ({ message }: { message: string }) => console.log(message),
      success: (message: string) => console.log('Success:', message),
      error: (message: string) => console.error('Error:', message),
      info: (message: string) => console.log('Info:', message),
    };
  }
  return ctx;
}
