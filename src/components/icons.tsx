// Hand-rolled SVG icon set (lucide-style 24px strokes) — one visual language,
// no emoji-as-icons, consistent 2px stroke.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Icon>
)

export const IconCrown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2 8 4 4 6-6 6 6 4-4v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" />
  </Icon>
)

export const IconSwords = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
    <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" opacity={0.5} />
  </Icon>
)

export const IconScroll = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" />
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
  </Icon>
)

export const IconTrophy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </Icon>
)

export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </Icon>
)

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </Icon>
)

export const IconRestart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 1 9 9" />
    <path d="M3 12h6" />
    <path d="m6 9-3 3 3 3" opacity={0} />
    <path d="M12 21a9 9 0 0 1-9-9" opacity={0.4} />
  </Icon>
)

export const IconFlag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.5 2q2 0 3.5-1v11q-1.5 1-3.5 1C13 15 11 13 8 13a6 6 0 0 0-4 1.2" />
  </Icon>
)

export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </Icon>
)

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
)

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconBot = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="8" width="14" height="11" rx="2" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1" />
    <path d="M9 13h.01" strokeWidth={2.6} />
    <path d="M15 13h.01" strokeWidth={2.6} />
    <path d="M9.5 16.5c.8.6 4.2.6 5 0" />
  </Icon>
)

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M17 4.5a4 4 0 0 1 0 7" />
    <path d="M19.5 21a7 7 0 0 0-3.5-6" />
  </Icon>
)

export const IconDoor = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 4h3a2 2 0 0 1 2 2v14" />
    <path d="M2 20h20" />
    <path d="M13 20V4a1 1 0 0 0-1.2-1L5 4.7A1 1 0 0 0 4 5.7V20" />
    <path d="M10 12h.01" strokeWidth={2.6} />
  </Icon>
)

export const IconKey = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </Icon>
)

export const IconBook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </Icon>
)

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" strokeWidth={2.6} />
  </Icon>
)

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
)

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
)
