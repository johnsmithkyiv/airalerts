import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DateTime } from "luxon";
import { AIR_ALERT_TYPE, KYIV_ZONE, buildDashboardData } from "../src/lib/aggregation";
import type { RawAlert } from "../src/lib/aggregation";

const SOURCE_PAGE_URL = "https://data.gov.ua/dataset/48330a76-8539-4079-8d83-42fa9ba6537c";
const SOURCE_DATA_URL =
  "https://data.gov.ua/dataset/83eda433-b4d9-47ac-89a0-5868dd4d5ce6/resource/08559e6a-863f-4d9b-86c1-d23e8b8b4630/download/airalerts.json";
const ALERTS_IN_UA_SOURCE_PAGE_URL = "https://alerts.in.ua/";
const ALERTS_IN_UA_HISTORY_URL = "https://api.alerts.in.ua/v1/regions/31/alerts/month_ago.json";
const ALERTS_IN_UA_ACTIVE_URL = "https://api.alerts.in.ua/v1/alerts/active.json";
const KYIV_CITY_UID = "31";
const OUTPUT_PATH = resolve("public/data/kyiv-air-alerts-dashboard.json");

export type AlertsInUaAlert = {
  alert_type?: string;
  location_uid?: string | number;
  started_at?: string;
  finished_at?: string | null;
};

type AlertsInUaResponse = {
  alerts?: AlertsInUaAlert[];
};

async function main() {
  const generatedAt = DateTime.utc().toISO();
  const capTime = DateTime.fromISO(generatedAt, { zone: KYIV_ZONE });
  const alertsInUaToken = getAlertsInUaToken();
  const [officialAlerts, recentAlerts, activeAlerts] = await Promise.all([
    fetchOfficialAlerts(),
    fetchAlertsInUaAlerts(ALERTS_IN_UA_HISTORY_URL, alertsInUaToken),
    fetchAlertsInUaAlerts(ALERTS_IN_UA_ACTIVE_URL, alertsInUaToken),
  ]);
  const officialCutoff = latestOfficialKyivAlertEnd(officialAlerts, capTime);
  assertOfficialDataIsRecentEnough(officialCutoff, capTime);
  const supplementalAlerts = selectSupplementalAlerts(
    mergeAlertsByStart([...toRawAlerts(recentAlerts), ...toRawAlerts(activeAlerts)]),
    officialCutoff,
  );
  const dashboardData = buildDashboardData([...officialAlerts, ...supplementalAlerts], {
    generatedAt,
    sourceName: "Kyiv City State Administration open data on data.gov.ua",
    sourcePageUrl: SOURCE_PAGE_URL,
    sourceDataUrl: SOURCE_DATA_URL,
    supplementalSourceName: "Alerts.in.ua recent Kyiv alert history and live status",
    supplementalSourcePageUrl: ALERTS_IN_UA_SOURCE_PAGE_URL,
    supplementalSourceDataUrl: ALERTS_IN_UA_HISTORY_URL,
    supplementalAlerts: supplementalAlerts.length,
  });

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(`${OUTPUT_PATH}.tmp`, `${JSON.stringify(dashboardData, null, 2)}\n`, "utf8");
  await rename(`${OUTPUT_PATH}.tmp`, OUTPUT_PATH);

  console.log(
    `Generated ${OUTPUT_PATH} from ${dashboardData.metadata.totalAlerts.toLocaleString("en-US")} Kyiv air-alert records (${countKyivAirAlerts(
      officialAlerts,
    ).toLocaleString("en-US")} official + ${supplementalAlerts.length.toLocaleString("en-US")} Alerts.in.ua supplemental).`,
  );
}

async function fetchOfficialAlerts(): Promise<RawAlert[]> {
  const response = await fetch(SOURCE_DATA_URL);

  if (!response.ok) {
    throw new Error(`Failed to download official data: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as RawAlert[];
}

async function fetchAlertsInUaAlerts(url: string, token: string): Promise<AlertsInUaAlert[]> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!response.ok) {
    throw new Error(`Failed to download Alerts.in.ua data: ${response.status} ${response.statusText}`);
  }

  return parseAlertsInUaResponse(await response.json());
}

function getAlertsInUaToken(): string {
  const token = process.env.ALERTS_IN_UA_TOKEN;

  if (!token) {
    throw new Error("ALERTS_IN_UA_TOKEN is required to generate dashboard data.");
  }

  return token;
}

export function parseAlertsInUaResponse(payload: unknown): AlertsInUaAlert[] {
  if (!isAlertsInUaResponse(payload)) {
    throw new Error("Unexpected Alerts.in.ua response format.");
  }

  return payload.alerts;
}

export function toRawAlerts(alerts: AlertsInUaAlert[]): RawAlert[] {
  return alerts.flatMap((alert) => {
    if (alert.location_uid !== KYIV_CITY_UID && alert.location_uid !== Number(KYIV_CITY_UID)) {
      return [];
    }

    if (alert.alert_type !== "air_raid") {
      return [];
    }

    const start = parseAlertTime(alert.started_at);
    const end = alert.finished_at ? parseAlertTime(alert.finished_at) : null;

    if (!start || (alert.finished_at && !end)) {
      throw new Error("Alerts.in.ua returned an invalid Kyiv alert timestamp.");
    }

    if (end && end <= start) {
      throw new Error("Alerts.in.ua returned an alert ending before it started.");
    }

    return [toRawAlert(start, end)];
  });
}

function mergeAlertsByStart(alerts: RawAlert[]): RawAlert[] {
  const alertsByStart = new Map<string, RawAlert>();

  for (const alert of alerts) {
    if (!alert.dateTimeStart) {
      throw new Error("Alerts.in.ua returned an alert without a start time.");
    }

    const start = alert.dateTimeStart;
    const existing = alertsByStart.get(start);

    if (!existing) {
      alertsByStart.set(start, alert);
      continue;
    }

    if (!existing.dateTimeEnd || !alert.dateTimeEnd) {
      alertsByStart.set(start, { ...existing, dateTimeEnd: null });
      continue;
    }

    if (alert.dateTimeEnd > existing.dateTimeEnd) {
      alertsByStart.set(start, alert);
    }
  }

  return Array.from(alertsByStart.values());
}

function selectSupplementalAlerts(alerts: RawAlert[], cutoff: DateTime | null): RawAlert[] {
  return alerts.filter((alert) => {
    const start = parseAlertTime(alert.dateTimeStart);
    return start !== null && (!cutoff || start > cutoff);
  });
}

function assertOfficialDataIsRecentEnough(cutoff: DateTime | null, capTime: DateTime): void {
  if (cutoff && cutoff < capTime.minus({ days: 28 })) {
    throw new Error("Official data is more than 28 days behind; refusing to publish an incomplete data series.");
  }
}

function latestOfficialKyivAlertEnd(rawAlerts: RawAlert[], capTime: DateTime): DateTime | null {
  let latest: DateTime | null = null;

  for (const alert of rawAlerts) {
    if (!isKyivAirAlert(alert)) {
      continue;
    }

    const end = alert.dateTimeEnd ? parseAlertTime(alert.dateTimeEnd) : capTime;

    if (end && (!latest || end > latest)) {
      latest = end;
    }
  }

  return latest;
}

function countKyivAirAlerts(rawAlerts: RawAlert[]): number {
  return rawAlerts.filter(isKyivAirAlert).length;
}

function isKyivAirAlert(alert: RawAlert): boolean {
  return alert.type === AIR_ALERT_TYPE && alert.addressPostName === "Київ";
}

function parseAlertTime(value: string | undefined): DateTime | null {
  if (!value) {
    return null;
  }

  const parsed = DateTime.fromISO(value, { zone: KYIV_ZONE });
  return parsed.isValid ? parsed : null;
}

function toRawAlert(start: DateTime, end: DateTime | null): RawAlert {
  const dateTimeStart = start.toISO();
  const dateTimeEnd = end?.toISO() ?? null;

  if (!dateTimeStart || (end && !dateTimeEnd)) {
    throw new Error("Failed to serialize Alerts.in.ua alert interval.");
  }

  return {
    type: AIR_ALERT_TYPE,
    addressPostName: "Київ",
    dateTimeStart,
    dateTimeEnd,
  };
}

function isAlertsInUaResponse(payload: unknown): payload is Required<AlertsInUaResponse> {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "alerts" in payload &&
    Array.isArray((payload as AlertsInUaResponse).alerts)
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
