interface Props {
  current: 1 | 2 | 3;
}

const STEPS = ['Business', 'First store', 'Demo sale'];

export function OnboardingProgress({ current }: Props) {
  return (
    <ol className="flex items-center justify-center gap-3 text-sm">
      {STEPS.map((label, i) => {
        const num = i + 1;
        const active = num === current;
        const done = num < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                done
                  ? 'bg-primary text-primary-foreground'
                  : active
                    ? 'border-2 border-primary text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? '✓' : num}
            </span>
            <span className={active ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {num < STEPS.length && <span className="text-muted-foreground">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
