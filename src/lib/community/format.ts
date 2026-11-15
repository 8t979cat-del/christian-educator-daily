/** Timestamps are shown in the site's time zone, formatted on the server so every viewer sees the same text. */
export function formatWhen(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(d);
}

export const pluralPrayers = (n: number) => (n === 1 ? "1 person has prayed" : `${n} people have prayed`);
