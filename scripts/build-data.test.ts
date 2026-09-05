import { describe, expect, it } from "vitest";
import { parseAlertsInUaResponse, toRawAlerts } from "./build-data";

describe("Alerts.in.ua data", () => {
  it("converts Kyiv City air-raid intervals", () => {
    const alerts = toRawAlerts([
      {
        alert_type: "air_raid",
        location_uid: "31",
        started_at: "2026-09-05T03:53:16.000Z",
        finished_at: "2026-09-05T05:30:00.000Z",
      },
    ]);

    expect(alerts).toEqual([
      {
        type: "Повітряна тривога",
        addressPostName: "Київ",
        dateTimeStart: "2026-09-05T06:53:16.000+03:00",
        dateTimeEnd: "2026-09-05T08:30:00.000+03:00",
      },
    ]);
  });

  it("ignores other locations and alert types", () => {
    const alerts = toRawAlerts([
      { alert_type: "air_raid", location_uid: "14", started_at: "2026-09-05T03:53:16.000Z" },
      { alert_type: "chemical", location_uid: "31", started_at: "2026-09-05T03:53:16.000Z" },
    ]);

    expect(alerts).toEqual([]);
  });

  it("rejects an invalid API response", () => {
    expect(() => parseAlertsInUaResponse({ alerts: {} })).toThrow("Unexpected Alerts.in.ua response format.");
  });

  it("rejects invalid timestamps for Kyiv City air raids", () => {
    expect(() => toRawAlerts([{ alert_type: "air_raid", location_uid: 31, started_at: "not-a-date" }])).toThrow(
      "Alerts.in.ua returned an invalid Kyiv alert timestamp.",
    );
  });
});
