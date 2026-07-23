interface KeyboardShortcutHintProps {
  keys: string[];
  label?: string;
}

export function KeyboardShortcutHint({ keys, label }: KeyboardShortcutHintProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text/55">
      {label && <span>{label}</span>}
      {keys.map(key => (
        <kbd key={key} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text/70 shadow-sm">
          {key}
        </kbd>
      ))}
    </span>
  );
}
