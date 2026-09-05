import { DateTime } from "luxon";
import type { DashboardData, DaypartKey, DaypartStats, PeriodStats } from "../types";

export const KYIV_ZONE = "Europe/Kyiv";
export const AIR_ALERT_TYPE = "Повітряна тривога";

export type RawAlert = {
  uid?: number;
  CATUTTC?: string;
  addressAdminUnitL2?: string;
  addressPostName?: string;
  type?: string;
  dateTimeStart?: string;
  dateTimeEnd?: string | null;
};

type Interval = {
  start: DateTime;
  end: DateTime;
};

type Period = "day" | "week" | "month";

const DAYPART_KEYS: DaypartKey[] = ["night", "work", "leisure"];

type MetadataInput = Pick<DashboardData["metadata"], "generatedAt" | "sourceName" | "sourcePageUrl" | "sourceDataUrl"> &
  Partial<
    Pick<
      DashboardData["metadata"],
      "supplementalSourceName" | "supplementalSourcePageUrl" | "supplementalSourceDataUrl" | "supplementalAlerts"
    >
  >;

export function buildDashboardData(rawAlerts: RawAlert[], metadata: MetadataInput): DashboardData {
  const capTime = DateTime.fromISO(metadata.generatedAt, { zone: KYIV_ZONE });
  const countableIntervals = parseAlerts(rawAlerts, capTime);
  const mergedIntervals = mergeIntervals(countableIntervals);

  return {
    metadata: {
      ...metadata,
      timezone: KYIV_ZONE,
      totalAlerts: countableIntervals.length,
      firstAlertStart: countableIntervals[0]?.start.toISO() ?? null,
      lastAlertEnd: countableIntervals.at(-1)?.end.toISO() ?? null,
      ongoingAlertsCappedAt: rawAlerts.some((alert) => isKyivAirAlert(alert) && !alert.dateTimeEnd)
        ? capTime.toISO()
        : null,
    },
    daily: aggregatePeriod(countableIntervals, mergedIntervals, "day"),
    weekly: aggregatePeriod(countableIntervals, mergedIntervals, "week"),
    monthly: aggregatePeriod(countableIntervals, mergedIntervals, "month"),
  };
}

function parseAlerts(rawAlerts: RawAlert[], capTime: DateTime): Interval[] {
  return rawAlerts
    .filter(isKyivAirAlert)
    .map((alert) => {
      const start = parseKyivTime(alert.dateTimeStart);
      const end = alert.dateTimeEnd ? parseKyivTime(alert.dateTimeEnd) : capTime;

      return start && end && end > start ? { start, end } : null;
    })
    .filter((interval): interval is Interval => interval !== null)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

function isKyivAirAlert(alert: RawAlert): boolean {
  return alert.type === AIR_ALERT_TYPE && alert.addressPostName === "Київ";
}

function parseKyivTime(value: string | undefined): DateTime | null {
  if (!value) {
    return null;
  }

  const parsed = DateTime.fromISO(value, { zone: KYIV_ZONE });
  return parsed.isValid ? parsed : null;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);

    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }

    if (interval.end > previous.end) {
      previous.end = interval.end;
    }
  }

  return merged;
}

function aggregatePeriod(countableIntervals: Interval[], durationIntervals: Interval[], period: Period): PeriodStats[] {
  const periods = new Map<string, PeriodStats>();

  for (const interval of countableIntervals) {
    const start = interval.start.startOf(period);
    const stats = ensurePeriod(periods, start, period);

    stats.alertCount += 1;
    stats.dayparts[getDaypart(interval.start)].alertCount += 1;
  }

  for (const interval of durationIntervals) {
    let cursor = interval.start;

    while (cursor < interval.end) {
      const periodStart = cursor.startOf(period);
      const periodEnd = nextPeriod(periodStart, period);
      const segmentEnd = DateTime.min(periodEnd, getNextDaypartBoundary(cursor), interval.end);
      const stats = ensurePeriod(periods, periodStart, period);
      const daypart = getDaypart(cursor);
      const alertHours = segmentEnd.diff(cursor, "hours").hours;

      stats.alertHours += alertHours;
      stats.dayparts[daypart].alertHours += alertHours;
      cursor = segmentEnd;
    }
  }

  return Array.from(periods.values())
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((stats) => ({
      ...stats,
      alertHours: round(stats.alertHours, 2),
      alertPercent: round((stats.alertHours / stats.periodHours) * 100, 2),
      dayparts: finalizeDayparts(stats.dayparts, stats.periodHours),
    }));
}

function ensurePeriod(periods: Map<string, PeriodStats>, start: DateTime, period: Period): PeriodStats {
  const id = period === "day" ? start.toISODate() ?? start.toFormat("yyyy-MM-dd") : period === "week" ? start.toFormat("kkkk-'W'WW") : start.toFormat("yyyy-MM");
  const existing = periods.get(id);

  if (existing) {
    return existing;
  }

  const end = nextPeriod(start, period);
  const periodHours = round(end.diff(start, "hours").hours, 2);
  const stats: PeriodStats = {
    id,
    label: period === "day" ? start.toFormat("d LLL yyyy") : period === "week" ? `Week ${start.toFormat("WW, yyyy")}` : start.toFormat("LLLL yyyy"),
    start: start.toISODate() ?? id,
    end: end.minus({ milliseconds: 1 }).toISODate() ?? id,
    alertCount: 0,
    alertHours: 0,
    periodHours,
    alertPercent: 0,
    dayparts: createDayparts(start, end),
  };

  periods.set(id, stats);
  return stats;
}

function nextPeriod(start: DateTime, period: Period): DateTime {
  return period === "day" ? start.plus({ days: 1 }) : period === "week" ? start.plus({ weeks: 1 }) : start.plus({ months: 1 });
}

function createDayparts(periodStart: DateTime, periodEnd: DateTime): Record<DaypartKey, DaypartStats> {
  const dayparts = emptyDayparts();
  let cursor = periodStart;

  while (cursor < periodEnd) {
    const segmentEnd = DateTime.min(getNextDaypartBoundary(cursor), periodEnd);
    dayparts[getDaypart(cursor)].periodHours += segmentEnd.diff(cursor, "hours").hours;
    cursor = segmentEnd;
  }

  for (const key of DAYPART_KEYS) {
    dayparts[key].periodHours = round(dayparts[key].periodHours, 2);
  }

  return dayparts;
}

function emptyDayparts(): Record<DaypartKey, DaypartStats> {
  return {
    night: { alertCount: 0, alertHours: 0, periodHours: 0, alertPercent: 0 },
    work: { alertCount: 0, alertHours: 0, periodHours: 0, alertPercent: 0 },
    leisure: { alertCount: 0, alertHours: 0, periodHours: 0, alertPercent: 0 },
  };
}

function finalizeDayparts(dayparts: Record<DaypartKey, DaypartStats>, periodHours: number): Record<DaypartKey, DaypartStats> {
  return {
    night: finalizeDaypart(dayparts.night, periodHours),
    work: finalizeDaypart(dayparts.work, periodHours),
    leisure: finalizeDaypart(dayparts.leisure, periodHours),
  };
}

function finalizeDaypart(daypart: DaypartStats, periodHours: number): DaypartStats {
  const alertHours = round(daypart.alertHours, 2);

  return {
    ...daypart,
    alertHours,
    periodHours: round(daypart.periodHours, 2),
    alertPercent: periodHours > 0 ? round((alertHours / periodHours) * 100, 2) : 0,
  };
}

function getDaypart(value: DateTime): DaypartKey {
  const hour = value.hour + value.minute / 60 + value.second / 3600 + value.millisecond / 3_600_000;

  if (hour < 8 || hour >= 23) {
    return "night";
  }

  if (hour < 17) {
    return "work";
  }

  return "leisure";
}

function getNextDaypartBoundary(value: DateTime): DateTime {
  const hour = value.hour + value.minute / 60 + value.second / 3600 + value.millisecond / 3_600_000;
  const startOfDay = value.startOf("day");

  if (hour < 8) {
    return startOfDay.set({ hour: 8 });
  }

  if (hour < 17) {
    return startOfDay.set({ hour: 17 });
  }

  if (hour < 23) {
    return startOfDay.set({ hour: 23 });
  }

  return startOfDay.plus({ days: 1 }).set({ hour: 8 });
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
