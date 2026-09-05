export type DaypartKey = "night" | "work" | "leisure";

export type DaypartStats = {
  alertCount: number;
  alertHours: number;
  periodHours: number;
  alertPercent: number;
};

export type PeriodStats = {
  id: string;
  label: string;
  start: string;
  end: string;
  alertCount: number;
  alertHours: number;
  periodHours: number;
  alertPercent: number;
  dayparts: Record<DaypartKey, DaypartStats>;
};

export type DashboardData = {
  metadata: {
    generatedAt: string;
    sourceName: string;
    sourcePageUrl: string;
    sourceDataUrl: string;
    supplementalSourceName?: string;
    supplementalSourcePageUrl?: string;
    supplementalSourceDataUrl?: string;
    supplementalAlerts?: number;
    timezone: string;
    totalAlerts: number;
    firstAlertStart: string | null;
    lastAlertEnd: string | null;
    ongoingAlertsCappedAt: string | null;
  };
  daily: PeriodStats[];
  weekly: PeriodStats[];
  monthly: PeriodStats[];
};
