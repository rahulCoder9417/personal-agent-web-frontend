import {
  siAirtable,
  siAsana,
  siCalendly,
  siClickup,
  siDropbox,
  siGithub,
  siGmail,
  siGoogle,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglesheets,
  siHubspot,
  siImessage,
  siJira,
  siLinear,
  siNotion,
  siTelegram,
  siTodoist,
  siTrello,
  siWhatsapp,
  siZoom,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "@/lib/format";

// Brand marks from simple-icons (CC0). Slack isn't in the set, so it gets a neutral glyph.
// AI providers are left out on purpose: they are named in plain text only, never shown as a logo.
// (Google's mark is here for the "Continue with Google" button on the sign-in pages.)
const ICONS: Record<string, SimpleIcon> = {
  gmail: siGmail,
  google: siGoogle,
  googlecalendar: siGooglecalendar,
  notion: siNotion,
  whatsapp: siWhatsapp,
  telegram: siTelegram,
  imessage: siImessage,
  github: siGithub,
  googledrive: siGoogledrive,
  googlesheets: siGooglesheets,
  linear: siLinear,
  hubspot: siHubspot,
  trello: siTrello,
  asana: siAsana,
  todoist: siTodoist,
  airtable: siAirtable,
  googledocs: siGoogledocs,
  dropbox: siDropbox,
  jira: siJira,
  clickup: siClickup,
  calendly: siCalendly,
  zoom: siZoom,
};

const ALIASES: Record<string, string> = {
  calendar: "googlecalendar",
  google_calendar: "googlecalendar",
  "google-calendar": "googlecalendar",
  drive: "googledrive",
  google_drive: "googledrive",
  "google-drive": "googledrive",
  sheets: "googlesheets",
  google_sheets: "googlesheets",
  "google-sheets": "googlesheets",
};

function resolve(name: string): string {
  const key = name.toLowerCase();
  return ALIASES[key] ?? key;
}

/**
 * The logo for an app or chat app, looked up by slug.
 * Falls back to the API's own icon URL, then to the slug's first letter.
 */
export function BrandIcon({
  name,
  size = 18,
  iconUrl,
  className,
}: {
  name: string;
  size?: number;
  iconUrl?: string | null;
  className?: string;
}) {
  const key = resolve(name);
  const icon = ICONS[key];

  if (icon) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill={`#${icon.hex}`} className={cn("shrink-0", className)}>
        <path d={icon.path} />
      </svg>
    );
  }
  if (key === "slack") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="#4A154B" strokeWidth={2.4} strokeLinecap="round" className={cn("shrink-0", className)}>
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </svg>
    );
  }
  if (key === "web") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="#151515" strokeWidth={1.8} strokeLinecap="round" className={cn("shrink-0", className)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
      </svg>
    );
  }
  if (iconUrl) {
    // The catalog's own icon, from the integration provider's CDN.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" width={size} height={size} className={cn("shrink-0", className)} />;
  }
  return (
    <span aria-hidden className={cn("shrink-0 font-mono font-semibold uppercase", className)} style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>
      {key.slice(0, 2)}
    </span>
  );
}

/** The brand's own colour, when the mark has one worth tinting with (black marks get a neutral tile). */
function tintOf(name: string): string | null {
  const key = resolve(name);
  if (key === "slack") return "#4A154B";
  const hex = ICONS[key]?.hex;
  if (!hex || hex === "000000" || hex === "181717" || hex === "191919") return null;
  return `#${hex}`;
}

/** An app's logo on a soft tile of its own colour: how apps appear in lists across the product. */
export function AppIcon({ name, size = 36, iconUrl, className }: { name: string; size?: number; iconUrl?: string | null; className?: string }) {
  const tint = tintOf(name);
  return (
    <span
      className={cn("grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: tint ? `color-mix(in srgb, ${tint} 11%, white)` : "var(--surface-2)",
      }}
    >
      <BrandIcon name={name} size={Math.round(size * 0.5)} iconUrl={iconUrl} />
    </span>
  );
}
