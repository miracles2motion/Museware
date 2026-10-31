import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { useUi } from '../store/useUi';

type ButtonVariant = 'default' | 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'default',
  size = 'md',
  block,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}) {
  const variantClass = variant === 'default' ? '' : `btn-${variant}`;
  const sizeClass = size === 'md' ? '' : `btn-${size}`;
  return (
    <button
      type="button"
      className={`btn ${variantClass} ${sizeClass} ${block ? 'btn-block' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  active,
  size,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: 'sm';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      data-active={active ? 'true' : undefined}
      className={`icon-btn tip ${size === 'sm' ? 'icon-btn-sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string; icon?: ReactNode }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.title || o.label}
          title={o.title || o.label}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.icon ? null : o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'wide';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  right,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        {right}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Menu({
  open,
  onClose,
  children,
  align = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const clamp = () => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      const dx =
        rect.left < 8
          ? 8 - rect.left
          : rect.right > window.innerWidth - 8
            ? window.innerWidth - 8 - rect.right
            : 0;
      const dy =
        rect.top < 8
          ? 8 - rect.top
          : rect.bottom > window.innerHeight - 8
            ? window.innerHeight - 8 - rect.bottom
            : 0;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [open, align, children]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className="menu"
      style={{
        right: align === 'right' ? 0 : undefined,
        left: align === 'left' ? 0 : undefined,
        top: 'calc(100% + 6px)',
      }}
      role="menu"
    >
      {children}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id} data-tone={t.tone}>
          <span style={{ flex: 1 }}>{t.text}</span>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Banner({
  tone = 'accent',
  children,
  action,
}: {
  tone?: 'accent' | 'ok' | 'warn' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="banner" data-tone={tone}>
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 12,
}: {
  width?: number | string;
  height?: number;
}) {
  return <div className="skeleton" style={{ width, height }} />;
}

export function useClickOutside(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [close]);
  return ref;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}
