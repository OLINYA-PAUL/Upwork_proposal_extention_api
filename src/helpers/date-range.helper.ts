export function resolveDateRange(
  startDate?: string,
  endDate?: string,
): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  let start: Date;
  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date();
    start.setDate(start.getDate() - 30); // default last 30 days
  }
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

export function getDaysArray(start: Date, end: Date): string[] {
  const days: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return days;
}
