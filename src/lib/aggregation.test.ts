import { describe, expect, it } from "vitest";
import { buildDashboardData, type RawAlert } from "./aggregation";

const baseMetadata = {
  generatedAt: "2024-01-10T00:00:00.000Z",
  sourceName: "test",
  sourcePageUrl: "https://example.com/source",
  sourceDataUrl: "https://example.com/data.json",
};

function alert(dateTimeStart: string, dateTimeEnd: string | null): RawAlert {
  return {
    type: "Повітряна тривога",
    addressPostName: "Київ",
    dateTimeStart,
    dateTimeEnd,
  };
}

describe("buildDashboardData", () => {
  it("counts alerts by start period", () => {
    const dashboard = buildDashboardData(
      [alert("2024-01-01T10:00:00", "2024-01-01T11:00:00"), alert("2024-01-08T10:00:00", "2024-01-08T11:00:00")],
      baseMetadata,
    );

    expect(dashboard.weekly.map((period) => period.alertCount)).toEqual([1, 1]);
    expect(dashboard.daily.map((period) => period.alertCount)).toEqual([1, 1]);
    expect(dashboard.monthly[0].alertCount).toBe(2);
  });

  it("splits alert hours across day boundaries", () => {
    const dashboard = buildDashboardData([alert("2024-01-01T23:30:00", "2024-01-02T00:30:00")], baseMetadata);

    expect(dashboard.daily.find((period) => period.id === "2024-01-01")?.alertHours).toBe(0.5);
    expect(dashboard.daily.find((period) => period.id === "2024-01-02")?.alertHours).toBe(0.5);
  });

  it("splits alert hours across month boundaries", () => {
    const dashboard = buildDashboardData([alert("2024-01-31T23:00:00", "2024-02-01T01:00:00")], baseMetadata);

    expect(dashboard.monthly.find((period) => period.id === "2024-01")?.alertHours).toBe(1);
    expect(dashboard.monthly.find((period) => period.id === "2024-02")?.alertHours).toBe(1);
  });

  it("merges overlapping intervals for duration calculations", () => {
    const dashboard = buildDashboardData(
      [alert("2024-01-01T10:00:00", "2024-01-01T12:00:00"), alert("2024-01-01T11:00:00", "2024-01-01T13:00:00")],
      baseMetadata,
    );

    expect(dashboard.weekly[0].alertCount).toBe(2);
    expect(dashboard.weekly[0].alertHours).toBe(3);
    expect(dashboard.weekly[0].dayparts.work.alertHours).toBe(3);
  });

  it("calculates percentage against full calendar period hours", () => {
    const dashboard = buildDashboardData([alert("2024-01-01T00:00:00", "2024-01-02T00:00:00")], baseMetadata);

    expect(dashboard.weekly[0].periodHours).toBe(168);
    expect(dashboard.weekly[0].alertPercent).toBe(14.29);
  });

  it("counts alerts by start daypart", () => {
    const dashboard = buildDashboardData(
      [
        alert("2024-01-01T07:30:00", "2024-01-01T08:00:00"),
        alert("2024-01-01T10:00:00", "2024-01-01T10:30:00"),
        alert("2024-01-01T18:00:00", "2024-01-01T18:30:00"),
        alert("2024-01-01T22:30:00", "2024-01-01T23:00:00"),
      ],
      baseMetadata,
    );

    expect(dashboard.daily[0].dayparts.night.alertCount).toBe(1);
    expect(dashboard.daily[0].dayparts.work.alertCount).toBe(1);
    expect(dashboard.daily[0].dayparts.leisure.alertCount).toBe(2);
  });

  it("splits alert hours by daypart", () => {
    const dashboard = buildDashboardData([alert("2024-01-01T07:30:00", "2024-01-01T23:30:00")], baseMetadata);
    const day = dashboard.daily[0];

    expect(day.alertHours).toBe(16);
    expect(day.dayparts.night.alertHours).toBe(1);
    expect(day.dayparts.work.alertHours).toBe(9);
    expect(day.dayparts.leisure.alertHours).toBe(6);
    expect(day.dayparts.night.periodHours).toBe(9);
    expect(day.dayparts.work.periodHours).toBe(9);
    expect(day.dayparts.leisure.periodHours).toBe(6);
    expect(day.dayparts.night.alertPercent).toBe(4.17);
  });
});
