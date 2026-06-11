export const APP_TIME_ZONE = "Asia/Shanghai";

const APP_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const APP_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function toAppDateString(date = new Date()): string {
  return APP_DATE_FORMATTER.format(date);
}

export function parseAppDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00+08:00`);
}

export function addAppDays(dateString: string, days: number): string {
  const date = parseAppDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return toAppDateString(date);
}

export function appWeekBounds(date = new Date()): { start: string; end: string } {
  const weekday = APP_WEEKDAY_FORMATTER.format(date);
  const dayIndex = WEEKDAY_INDEX[weekday] ?? 1;
  const daysFromMonday = dayIndex === 0 ? 6 : dayIndex - 1;
  const current = toAppDateString(date);
  const start = addAppDays(current, -daysFromMonday);
  return { start, end: addAppDays(start, 6) };
}
