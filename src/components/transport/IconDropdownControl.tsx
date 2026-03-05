import { useEffect, useRef, useState } from 'react';

interface DropdownOption<T extends string> {
  id: T;
  label: string;
}

interface IconDropdownControlProps<T extends string> {
  icon: string;
  title: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function IconDropdownControl<T extends string>({
  icon,
  title,
  value,
  options,
  onChange,
  disabled = false,
}: IconDropdownControlProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((state) => !state)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-daw-border bg-black/30 hover:bg-white/5 transition-colors text-slate-300"
        title={title}
      >
        <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
        <span className="text-[10px] uppercase font-sans tracking-wider text-slate-400">
          {active?.label ?? value}
        </span>
        <span className="material-symbols-outlined text-[12px] leading-none text-slate-500">arrow_drop_down</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 min-w-[120px] border border-daw-border rounded bg-daw-panel shadow-lg z-50 overflow-hidden">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              disabled={disabled}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wider border-b last:border-b-0 border-daw-border transition-colors ${
                option.id === value
                  ? 'bg-daw-accent/15 text-daw-accent'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
