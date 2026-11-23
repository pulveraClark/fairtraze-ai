import type { TaskPriority } from "@shared/taskTypes";

// Inline SVG icons for the Tasks board (the app has no icon library). All decorative: every icon
// is shown next to text, so status is never conveyed by color or shape alone.

interface IconProps { className?: string }

const base = { fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;

export function GripIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function LockIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 118 0v3" />
    </svg>
  );
}

export function AlertTriangleIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l9 16H3L12 4zm0 6v4m0 3v.01" />
    </svg>
  );
}

export function CalendarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path strokeLinecap="round" d="M4 10h16M9 3v4m6-4v4" />
    </svg>
  );
}

export function FlagIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4m0 0h11l-2 4 2 4H5" />
    </svg>
  );
}

export function CheckSquareIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

export function CommitIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="3.5" />
      <path strokeLinecap="round" d="M3 12h5.5m7 0H21" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="M20 20l-4.2-4.2" />
    </svg>
  );
}

export function FilterIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6 7v6l-4-2v-4L4 5z" />
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Priority arrows: up (high), equals (medium), down (low). Always paired with the word. */
export function PriorityIcon({ priority, className = "h-4 w-4" }: IconProps & { priority: TaskPriority }) {
  if (priority === "HIGH") {
    return (
      <svg className={className} {...base}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 14l6-6 6 6M6 19l6-6 6 6" />
      </svg>
    );
  }
  if (priority === "LOW") {
    return (
      <svg className={className} {...base}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 10l6 6 6-6M6 5l6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" d="M5 9h14M5 15h14" />
    </svg>
  );
}

export function StarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
    </svg>
  );
}

export function ChevronUpIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
