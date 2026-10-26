// Šematski simboli elemenata (linijski, prate boju teksta).
const P: Record<string, JSX.Element> = {
  ahu: (
    <>
      <rect x="3" y="4" width="34" height="20" rx="2" />
      <circle cx="14" cy="14" r="6" />
      <path d="M14 8v12M8 14h12" />
      <path d="M24 9h9M24 14h9M24 19h9" />
    </>
  ),
  'duct-rect': (
    <>
      <rect x="3" y="9" width="34" height="10" />
      <path d="M11 9v10M29 9v10" />
    </>
  ),
  'duct-round': (
    <>
      <path d="M8 8h24M8 20h24" />
      <ellipse cx="8" cy="14" rx="3" ry="6" />
      <path d="M32 8a3 6 0 0 1 0 12" />
    </>
  ),
  elbow: <path d="M4 10h14a10 10 0 0 1 10 10v5M4 18h14a2 2 0 0 1 2 2v5" />,
  transition: <path d="M3 6h10l14 5h10M3 22h10l14-5h10M13 6v16M27 11v6" />,
  damper: (
    <>
      <rect x="3" y="7" width="34" height="14" />
      <path d="M14 19l12-10" />
      <circle cx="20" cy="14" r="1.6" />
    </>
  ),
  obstruction: (
    <>
      <path d="M3 7h34M3 21h34" />
      <circle cx="20" cy="14" r="4" />
    </>
  ),
  zeta: (
    <>
      <rect x="3" y="7" width="34" height="14" />
      <path d="M16 10h8l-7 8h7" />
    </>
  ),
  tee: <path d="M3 7h34M3 15h12v10M25 25V15h12" />,
  dovetail: <path d="M3 11h8c8 0 12-7 22-7h4M3 17h8c8 0 12 7 22 7h4M33 11c-5 0-8 1-11 3 3 2 6 3 11 3" />,
  silencer: (
    <>
      <rect x="3" y="6" width="34" height="16" />
      <path d="M8 6l-4 4M14 6l-10 10M20 6L6 20M26 6L12 20M32 6L18 20M37 7L24 20M37 13l-7 7" strokeWidth="1" />
    </>
  ),
  firedamper: (
    <>
      <rect x="3" y="6" width="34" height="16" />
      <path d="M14 6l12 16M26 6L14 22" />
    </>
  ),
  filter: (
    <>
      <rect x="3" y="6" width="34" height="16" />
      <path d="M12 6l4 4-4 4 4 4-4 4M24 6l4 4-4 4 4 4-4 4" />
    </>
  ),
  coil: (
    <>
      <rect x="3" y="6" width="34" height="16" />
      <path d="M8 14c2-5 4-5 6 0s4 5 6 0 4-5 6 0 4 5 6 0" />
    </>
  ),
  vav: (
    <>
      <rect x="3" y="7" width="34" height="14" />
      <path d="M10 17l18-6M24 9l4 2-2 4" />
    </>
  ),
  equip: (
    <>
      <rect x="6" y="5" width="28" height="18" rx="2" />
      <path d="M12 14h16" />
    </>
  ),
  diffuser: (
    <>
      <rect x="7" y="3" width="26" height="22" />
      <rect x="12" y="7" width="16" height="14" />
      <rect x="17" y="11" width="6" height="6" />
    </>
  ),
  grille: (
    <>
      <rect x="5" y="5" width="30" height="18" />
      <path d="M5 10h30M5 14h30M5 18h30" />
    </>
  ),
  valve: (
    <>
      <circle cx="20" cy="14" r="10" />
      <circle cx="20" cy="14" r="4" />
    </>
  ),
  open: <path d="M3 7h26M3 21h26M33 5l4 4M33 23l4-4M33 14h4" />,
};

export function Icon({ k, className }: { k: string; className?: string }) {
  return (
    <svg className={'ico ' + (className || '')} viewBox="0 0 40 28" aria-hidden="true">
      {P[k] || P.equip}
    </svg>
  );
}
