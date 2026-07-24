export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatTime(startTime: string): string {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns today's date if it's the ritual's session day, otherwise the next occurrence. */
export function nextSessionDate(dayOfWeek: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

export function isSessionDay(dayOfWeek: number, from: Date = new Date()): boolean {
  return from.getDay() === dayOfWeek;
}
