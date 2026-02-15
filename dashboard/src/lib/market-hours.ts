const EASTERN_TZ = "America/New_York";

export function isUSRegularMarketHours(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN_TZ,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  const minute = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN_TZ,
      minute: "2-digit",
    }).format(now)
  );

  const mins = hour * 60 + minute;
  const open = 9 * 60 + 30; // 9:30 AM ET
  const close = 16 * 60; // 4:00 PM ET
  return mins >= open && mins < close;
}
