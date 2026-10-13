import type { SVGProps } from "react";

// Line icons drawn for this app (24px grid, 1.75 stroke), shared by the rail and the screens.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
  </Base>
);

export const ApprovalsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" />
    <path d="M9 12l2 2 4-4" />
  </Base>
);

export const AutomationsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
    <path d="M12 8v4l2.5 1.5" />
  </Base>
);

export const ActivityIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Base>
);

export const AppsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Base>
);

export const CrewIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14.3a5 5 0 0 1 3.5 4.7v1" />
  </Base>
);

export const MoreIcon = (p: IconProps) => (
  <Base strokeWidth={2.4} {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Base>
);

export const ComputerIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M8.5 20h7M12 16.5V20" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
    <circle cx="14" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);

export const PaperclipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.8 17a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />
  </Base>
);

export const SendIcon = (p: IconProps) => (
  <Base strokeWidth={2.2} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Base>
);

export const KeyIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="M11.2 12.3 20 3.5M16.5 7l3 3" />
  </Base>
);

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Base>
);

export const WarningIcon = (p: IconProps) => (
  <Base strokeWidth={2} {...p}>
    <path d="M12 8v5M12 16.5h.01M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
  </Base>
);

export const ExternalIcon = (p: IconProps) => (
  <Base strokeWidth={2.2} {...p}>
    <path d="M8 16 17 7M9 7h8v8" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base strokeWidth={2} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base strokeWidth={2} {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
);

export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
  </Base>
);

export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
    <path d="M14 3.5V8h4" />
  </Base>
);

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

/** A pencil on a page: start something new (a new chat). */
export const NewChatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4 7.5-7.5Z" />
  </Base>
);

/** A page with its side column marked: show or hide the list of chats. */
export const PanelIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Base>
);

/** A page with its right-hand column marked: show or hide the chat's side panel. */
export const PanelRightIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M14.5 4.5v15" />
  </Base>
);

/** Two chevrons pointing left: fold the sidebar down to its icons (turned round, open it again). */
export const ChevronsLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m11 17-5-5 5-5" />
    <path d="m18 17-5-5 5-5" />
  </Base>
);

/** A pencil: rename. */
export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4L16.5 4.5Z" />
    <path d="M14.5 6.5l3 3" />
  </Base>
);
