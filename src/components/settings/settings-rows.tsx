import { useId, type ReactNode } from "react";
import { cn } from "@/lib/format";

// The parts every settings screen is built from: groups of settings, one under another in a single
// column, each a card of rows with the setting's name and a line of help on the left and its
// control on the right (under it, on a phone).

/** Settings read as one column: wide enough for a setting and its control side by side, and no wider (the page's padding is outside it). */
export const SETTINGS_COLUMN = "box-content max-w-[720px]";

/** A group of settings: a heading, a line on what is in it, then its card or cards. */
export function SettingsGroup({
  id,
  title,
  description,
  children,
  className,
}: {
  /** An anchor, so a link can lead to the group. */
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className={cn("flex scroll-mt-4 flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {description && <p className="text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * One setting in a card: its name and a line of help on the left, the control on the right. On a
 * phone, and when the control needs the room (`wide`), the control goes under the words.
 */
export function SettingRow({
  label,
  htmlFor,
  help,
  wide = false,
  children,
  className,
}: {
  label: ReactNode;
  /** The control's id, so the name is its `<label>`. */
  htmlFor?: string;
  help?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0",
        !wide && "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13.5px] font-medium">
            {label}
          </label>
        ) : (
          <span className="text-[13.5px] font-medium">{label}</span>
        )}
        {help && <div className="text-[12.5px] text-muted">{help}</div>}
      </div>
      {children !== undefined && <div className={cn("min-w-0", !wide && "sm:w-[280px] sm:shrink-0")}>{children}</div>}
    </div>
  );
}
