import type { CSSProperties } from "react";

const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  close: "M6 6l12 12 M6 18L18 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  filter: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  sun: "M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  wallet:
    "M20 7H5a2 2 0 0 1 0-4h13v4 M3 5v14a2 2 0 0 0 2 2h15V7 M20 11h-5v6h5 M17 14h.01",
  food: "M4 3v7a3 3 0 0 0 6 0V3 M7 3v18 M17 3v18 M17 3c-4 3-4 9 0 9",
  transport:
    "M4 16h16l-2-8H6z M6 8V5h12v3 M6 16v4 M18 16v4 M7 12h.01 M17 12h.01",
  shopping: "M4 7h16l1 14H3z M8 8V6a4 4 0 0 1 8 0v2",
  bills: "M6 2h12v20l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h3",
  health: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
  entertainment:
    "M3 5h18v14H3z M8 5v14 M16 5v14 M3 9h5 M3 15h5 M16 9h5 M16 15h5",
  other: "M5 5h14v14H5z M9 12h6 M12 9v6",
  check: "M5 12l4 4L19 6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function categoryIcon(category: string): IconName {
  const name = category.toLowerCase();
  return [
    "food",
    "transport",
    "shopping",
    "bills",
    "health",
    "entertainment",
  ].includes(name)
    ? (name as IconName)
    : "other";
}
