import { useEffect, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData, DaypartKey, PeriodStats } from "./types";

type PeriodMode = "daily" | "weekly" | "monthly";
type MetricMode = "count" | "hours" | "percent";
type ChartRange = "recent" | "year" | "all";
type ChartPeriodStats = PeriodStats & {
  chartLabel: string;
  isProjectedPeriod?: boolean;
  actualNight?: number;
  actualWork?: number;
  actualLeisure?: number;
  projectedNightTotal?: number;
  projectedWorkTotal?: number;
  projectedLeisureTotal?: number;
};

type DaypartValues = Record<DaypartKey, number>;
type PeriodProjection = {
  alertCount: number;
  alertHours: number;
};

const KYIV_ZONE = "Europe/Kyiv";
const CHART_ANIMATION_DURATION = 700;
const DEFAULT_VISIBLE_CHART_POINTS: Record<PeriodMode, number> = {
  daily: 45,
  weekly: 52,
  monthly: 60,
};
const MAX_ANIMATED_CHART_POINTS = 90;

const periodLabels: Record<PeriodMode, { singular: string; plural: string }> = {
  daily: { singular: "dag", plural: "dager" },
  weekly: { singular: "uke", plural: "uker" },
  monthly: { singular: "måned", plural: "måneder" },
};

const metricLabels: Record<MetricMode, string> = {
  count: "Alarmer",
  hours: "Timer",
  percent: "Andel av perioden",
};
const chartRangeLabels: Record<ChartRange, string> = {
  recent: "Nylig",
  year: "Siste år",
  all: "Siden 2022",
};

const MONTHLY_CHART_START: PeriodStats = {
  id: "2022-01",
  label: "januar 2022",
  start: "2022-01-01",
  end: "2022-01-31",
  alertCount: 0,
  alertHours: 0,
  periodHours: 744,
  alertPercent: 0,
  dayparts: {
    night: { alertCount: 0, alertHours: 0, periodHours: 279, alertPercent: 0 },
    work: { alertCount: 0, alertHours: 0, periodHours: 279, alertPercent: 0 },
    leisure: { alertCount: 0, alertHours: 0, periodHours: 186, alertPercent: 0 },
  },
};

const DAYPARTS: Array<{
  key: DaypartKey;
  label: string;
  hours: string;
  color: string;
  stroke: string;
  actualKey: "actualNight" | "actualWork" | "actualLeisure";
  projectedTotalKey: "projectedNightTotal" | "projectedWorkTotal" | "projectedLeisureTotal";
}> = [
  {
    key: "night",
    label: "Natt",
    hours: "23:00-08:00",
    color: "#7f1d1d",
    stroke: "#ef4444",
    actualKey: "actualNight",
    projectedTotalKey: "projectedNightTotal",
  },
  {
    key: "work",
    label: "Dagtid",
    hours: "08:00-17:00",
    color: "#f7b267",
    stroke: "#f7b267",
    actualKey: "actualWork",
    projectedTotalKey: "projectedWorkTotal",
  },
  {
    key: "leisure",
    label: "Kveldstid",
    hours: "17:00-23:00",
    color: "#5cc8ff",
    stroke: "#5cc8ff",
    actualKey: "actualLeisure",
    projectedTotalKey: "projectedLeisureTotal",
  },
];

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("monthly");
  const [metricMode, setMetricMode] = useState<MetricMode>("hours");
  const [chartRange, setChartRange] = useState<ChartRange>("recent");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/kyiv-air-alerts-dashboard.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Dashboard-data er ikke generert. Kjør npm run data og last siden på nytt.");
        }

        return response.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : "Kunne ikke laste dashboard-data.");
      });
  }, []);

  if (error) {
    return (
      <main className="shell">
        <section className="error-card">
          <p>Kunne ikke laste dashboard-data.</p>
          <strong>{error}</strong>
        </section>
      </main>
    );
  }

  if (!data) {
    return <main className="shell loading">Laster flyalarmstatistikk for Kyiv...</main>;
  }

  const periods = data[periodMode];
  const chartRangeOptions: Array<[ChartRange, string]> =
    periodMode === "daily"
      ? [
          ["recent", "Nylig"],
          ["year", "Siste år"],
        ]
      : [
          ["recent", "Nylig"],
          ["year", "Siste år"],
          ["all", "Siden 2022"],
        ];
  const latest = periods.at(-1);
  const previous = periods.at(-2);
  const currentPeriod = latest && isPeriodIncomplete(latest, data.metadata.generatedAt) ? latest : undefined;
  const trendPeriod = currentPeriod ? previous : latest;
  const trendReference = currentPeriod ? periods.at(-3) : previous;
  const selectedTrendIndex = selectedPeriodId ? periods.findIndex((period) => period.id === selectedPeriodId) : -1;
  const selectedTrendPeriod = selectedTrendIndex >= 0 ? periods[selectedTrendIndex] : undefined;
  const displayedTrendPeriod = selectedTrendPeriod ?? trendPeriod;
  const displayedTrendReference = selectedTrendPeriod ? periods[selectedTrendIndex - 1] : trendReference;
  const displayedCurrentPeriod = selectedTrendPeriod
    ? selectedTrendPeriod.id === currentPeriod?.id
      ? currentPeriod
      : undefined
    : currentPeriod;
  const projectedTrendPeriod =
    selectedTrendPeriod && selectedTrendPeriod.id === currentPeriod?.id ? getProjectedPeriodStats(selectedTrendPeriod, data.metadata.generatedAt) : undefined;
  const currentProjection = currentPeriod ? getProjectedPeriodValues(currentPeriod, data.metadata.generatedAt) : undefined;
  const chartPeriods = getChartPeriods(periods, periodMode, chartRange, data.metadata.generatedAt);
  const projectionIndex = currentPeriod ? chartPeriods.findIndex((period) => period.id === currentPeriod.id) : -1;
  const projectedValues = currentPeriod ? getProjectedDaypartMetricValues(currentPeriod, data.metadata.generatedAt, metricMode) : undefined;
  const chartData = chartPeriods.map((period, index) => {
    const isCurrentProjectedPeriod = projectedValues !== undefined && projectionIndex > 0 && index === projectionIndex;
    const projectionValues =
      projectedValues !== undefined && projectionIndex > 0 && (index === projectionIndex || index === projectionIndex - 1)
        ? index === projectionIndex
          ? projectedValues
          : getDaypartMetricValues(period, metricMode)
        : undefined;

    return {
      ...period,
      chartLabel: formatChartLabel(period, periodMode),
      isProjectedPeriod: isCurrentProjectedPeriod,
      actualNight: isCurrentProjectedPeriod ? undefined : getDaypartMetricValue(period, "night", metricMode),
      actualWork: isCurrentProjectedPeriod ? undefined : getDaypartMetricValue(period, "work", metricMode),
      actualLeisure: isCurrentProjectedPeriod ? undefined : getDaypartMetricValue(period, "leisure", metricMode),
      projectedNightTotal: projectionValues ? round(projectionValues.night, 2) : undefined,
      projectedWorkTotal: projectionValues ? round(projectionValues.night + projectionValues.work, 2) : undefined,
      projectedLeisureTotal: projectionValues ? round(projectionValues.night + projectionValues.work + projectionValues.leisure, 2) : undefined,
    };
  });
  const recentPeriods = periods
    .slice(-12)
    .map((period, index, recent) => ({
      period,
      previous: periods[periods.length - recent.length + index - 1],
      projection: currentPeriod?.id === period.id ? currentProjection : undefined,
    }))
    .reverse();
  const periodLabel = periodLabels[periodMode];
  const chartLegend =
    `${chartRangeLabels[chartRange]}. Viser ${chartData.length} ${periodLabel.plural}. Stiplet linje viser fremskrevet nivå for inneværende ${periodLabel.singular}.`;

  return (
    <main className="shell">
      <div className="toolbar" aria-label="Dataoppdatering og valg">
        {data.metadata.lastAlertEnd ? <p className="metadata-pill">Data til og med: {formatDateTime(data.metadata.lastAlertEnd)} Kyiv-tid</p> : null}
        <div className="toolbar-controls" aria-label="Valg for oversikten">
          <SegmentedControl<PeriodMode>
            label="Periode"
            value={periodMode}
            options={[
              ["daily", "Dag"],
              ["weekly", "Uke"],
              ["monthly", "Måned"],
            ]}
            onChange={(mode) => {
              setPeriodMode(mode);
              setSelectedPeriodId(null);

              if (mode === "daily" && chartRange === "all") {
                setChartRange("year");
              }
            }}
          />
          <SegmentedControl<MetricMode>
            label="Vis i"
            value={metricMode}
            options={[
              ["hours", "Timer"],
              ["count", "Antall"],
              ["percent", "Prosent"],
            ]}
            onChange={setMetricMode}
          />
            <SegmentedControl<ChartRange>
              label="Tidsrom"
              value={chartRange}
              options={chartRangeOptions}
              onChange={setChartRange}
            />
        </div>
      </div>

      <section className="panel trend-panel">
        {displayedTrendPeriod ? (
          <TrendInsight
            period={projectedTrendPeriod ?? displayedTrendPeriod}
            referencePeriod={displayedTrendReference}
            currentPeriod={projectedTrendPeriod ? undefined : displayedCurrentPeriod}
            periodLabel={periodLabel.singular}
            generatedAt={data.metadata.generatedAt}
            isSelected={selectedTrendPeriod !== undefined}
            isProjected={projectedTrendPeriod !== undefined}
          />
        ) : null}
      </section>

      <ChartPanel title={`${metricLabels[metricMode]} per ${periodLabel.singular}`}>
        <PrimaryChart data={chartData} metric={metricMode} />
        <ChartLegend summary={chartLegend} />
      </ChartPanel>

      <section className="panel table-panel">
        <div className="table-header">
          <div>
            <h2>Siste perioder</h2>
            <p>De siste 12 periodene. Klikk på en periode for å vise trendteksten. Inneværende periode vises med fremskrevet nivå og faktisk så langt.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Periode</th>
                <th>Alarmer</th>
                <th>Timer</th>
                <th>Endring mot forrige</th>
              </tr>
            </thead>
            <tbody>
              {recentPeriods.map(({ period, previous, projection }) => {
                const displayAlertHours = projection?.alertHours ?? period.alertHours;
                const isSelected = selectedPeriodId === period.id;

                return (
                  <tr className={isSelected ? "selected-period" : undefined} key={period.id}>
                    <td>
                      <button
                        type="button"
                        className="period-select"
                        aria-pressed={isSelected}
                        aria-label={`Vis trend for ${formatPeriodLabel(period)}`}
                        onClick={() => setSelectedPeriodId((selected) => (selected === period.id ? null : period.id))}
                      >
                        <strong>{formatPeriodLabel(period)}</strong>
                        <span>{formatDate(period.start)} til {formatDate(period.end)}</span>
                        {projection ? <span className="projection-label">Inneværende periode</span> : null}
                      </button>
                    </td>
                    <ProjectedMetricCell actual={formatAlertCount(period.alertCount)} projected={projection ? formatAlertCount(projection.alertCount) : undefined} />
                    <ProjectedMetricCell actual={formatHours(period.alertHours)} projected={projection ? formatHours(projection.alertHours) : undefined} />
                    <td className={`change ${getChangeDirection(displayAlertHours, previous?.alertHours)}`}>
                      {formatPercentChange(displayAlertHours, previous?.alertHours)}
                      {projection ? <span>basert på fremskrevet nivå</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <div className="footer-links" aria-label="Kilder">
          <span>Kilder:</span>
          <a className="metadata-pill" href={data.metadata.sourcePageUrl} target="_blank" rel="noreferrer">
            Historiske data: data.gov.ua
          </a>
          {data.metadata.supplementalSourcePageUrl ? (
            <a className="metadata-pill" href={data.metadata.supplementalSourcePageUrl} target="_blank" rel="noreferrer">
              Nylige data: Alerts.in.ua
            </a>
          ) : null}
        </div>
        <p>
          Datatidssone: {data.metadata.timezone}. Historiske data kommer fra data.gov.ua; nyere data suppleres fra Alerts.in.ua ved databygging. Antall telles etter
          starttidspunkt; varighetsprosenter bruker sammenslåtte flyalarm-intervaller.
        </p>
      </footer>
    </main>
  );
}

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
};

function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented">
      <span>{label}</span>
      <div>
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            className={value === optionValue ? "active" : undefined}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

type ChartPanelProps = {
  title: string;
  children: ReactNode;
};

function ChartPanel({ title, children }: ChartPanelProps) {
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ChartLegend({ summary }: { summary: string }) {
  return (
    <div className="chart-legend">
      <p>{summary}</p>
      <div className="chart-legend-items">
        {DAYPARTS.map((daypart) => (
          <span key={daypart.key}>
            <i style={{ background: daypart.color }} />
            {daypart.label} ({daypart.hours})
          </span>
        ))}
        <span>
          <i className="legend-dash" />
          Stiplet: fremskrevet nivå
        </span>
      </div>
    </div>
  );
}

type TrendInsightProps = {
  period: PeriodStats;
  referencePeriod: PeriodStats | undefined;
  currentPeriod: PeriodStats | undefined;
  periodLabel: string;
  generatedAt: string;
  isSelected: boolean;
  isProjected: boolean;
};

function TrendInsight({ period, referencePeriod, currentPeriod, periodLabel, generatedAt, isSelected, isProjected }: TrendInsightProps) {
  const direction = getTrendDirection(period, referencePeriod);
  const projectionSentence = currentPeriod ? formatCurrentProjectionSentence(currentPeriod, generatedAt) : null;
  const comparisonSentence = referencePeriod
    ? isProjected
      ? `Fremskrivingen for ${formatPeriodLabel(period)} bygger på data så langt og anslår ${formatAlertCountChange(
          period.alertCount,
          referencePeriod.alertCount,
        )} og ${formatAlertHoursChange(period.alertHours, referencePeriod.alertHours)}, sammenlignet med ${formatPeriodLabel(referencePeriod)}.`
      : `Sammenlignet med ${formatPeriodLabel(referencePeriod)} hadde ${formatPeriodLabel(period)} ${formatAlertCountChange(
          period.alertCount,
          referencePeriod.alertCount,
        )} og ${formatAlertHoursChange(period.alertHours, referencePeriod.alertHours)}.`
    : `Ingen foregående ${periodLabel} er tilgjengelig for sammenligning med ${formatPeriodLabel(period)}.`;

  return (
    <article className={`trend-insight ${direction}`}>
      <div>
        <span>{isProjected ? `Fremskrevet ${periodLabel}` : isSelected ? `Valgt ${periodLabel}` : "Trend"}</span>
        <strong>{getTrendHeadline(direction)}</strong>
      </div>
      <p>
        {comparisonSentence} {getTrendDescription(direction)} {formatBurdenSentence(period, referencePeriod, isProjected)}
        {projectionSentence ? ` ${projectionSentence}` : null}
      </p>
    </article>
  );
}

type ChartProps = {
  data: ChartPeriodStats[];
};

function PrimaryChart({ data, metric }: ChartProps & { metric: MetricMode }) {
  const suffix = metric === "percent" ? " %" : metric === "hours" ? " t" : "";
  const animate = data.length <= MAX_ANIMATED_CHART_POINTS;

  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={data} margin={{ top: 18, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#314158" />
        <XAxis dataKey="chartLabel" tick={{ fill: "#9fb0c7", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tick={{ fill: "#9fb0c7", fontSize: 12 }} tickLine={false} axisLine={false} width={42} />
        <Tooltip content={<DashboardTooltip suffix={suffix} />} />
        {DAYPARTS.map((daypart) => (
          <Area
            key={daypart.key}
            type="monotone"
            dataKey={daypart.actualKey}
            stackId="actual"
            stroke={daypart.stroke}
            fill={daypart.color}
            fillOpacity={daypart.key === "night" ? 0.96 : 0.82}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={animate}
            animationDuration={CHART_ANIMATION_DURATION}
            animationEasing="ease-out"
          />
        ))}
        {DAYPARTS.map((daypart) => (
          <Line
            key={daypart.projectedTotalKey}
            type="monotone"
            dataKey={daypart.projectedTotalKey}
            stroke={daypart.stroke}
            strokeDasharray="7 7"
            strokeWidth={3}
            dot={{ fill: "#09111f", r: 4, stroke: daypart.stroke, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={animate}
            animationDuration={CHART_ANIMATION_DURATION}
            animationEasing="ease-out"
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartPeriodStats }>;
};

function DashboardTooltip({ active, payload, suffix }: TooltipProps & { suffix: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  const period = payload[0].payload;
  const actualRows = getTooltipRows(period, "actual");
  const projectionRows = period.isProjectedPeriod ? getTooltipRows(period, "projected") : [];

  return (
    <div className="tooltip">
      <strong>{formatPeriodLabel(period)}</strong>
      {actualRows.length > 0 ? <TooltipRows title="Faktisk" rows={actualRows} suffix={suffix} /> : null}
      {projectionRows.length > 0 ? <TooltipRows title="Fremskrevet nivå" rows={projectionRows} suffix={suffix} /> : null}
    </div>
  );
}

type TooltipRow = {
  label: string;
  color: string;
  value: number;
};

function TooltipRows({ title, rows, suffix }: { title: string; rows: TooltipRow[]; suffix: string }) {
  return (
    <div className="tooltip-section">
      <span className="tooltip-heading">{title}</span>
      {rows.map((row) => (
        <span className="tooltip-row" key={row.label}>
          <i style={{ background: row.color }} />
          {row.label}: {formatChartValue(row.value, suffix)}
        </span>
      ))}
    </div>
  );
}

function getTooltipRows(period: ChartPeriodStats, mode: "actual" | "projected"): TooltipRow[] {
  return DAYPARTS.map((daypart) => ({
    label: daypart.label,
    color: daypart.color,
    value: mode === "actual" ? getActualChartDaypartValue(period, daypart.key) : getProjectedChartDaypartValue(period, daypart.key),
  })).filter((row): row is TooltipRow => row.value !== undefined);
}

function getActualChartDaypartValue(period: ChartPeriodStats, daypart: DaypartKey): number | undefined {
  if (daypart === "night") {
    return period.actualNight;
  }

  if (daypart === "work") {
    return period.actualWork;
  }

  return period.actualLeisure;
}

function getProjectedChartDaypartValue(period: ChartPeriodStats, daypart: DaypartKey): number | undefined {
  if (period.projectedNightTotal === undefined) {
    return undefined;
  }

  if (daypart === "night") {
    return period.projectedNightTotal;
  }

  if (daypart === "work") {
    return period.projectedWorkTotal !== undefined ? round(period.projectedWorkTotal - period.projectedNightTotal, 2) : undefined;
  }

  return period.projectedLeisureTotal !== undefined && period.projectedWorkTotal !== undefined
    ? round(period.projectedLeisureTotal - period.projectedWorkTotal, 2)
    : undefined;
}

function ProjectedMetricCell({ actual, projected }: { actual: string; projected: string | undefined }) {
  if (!projected) {
    return <td>{actual}</td>;
  }

  return (
    <td>
      <strong className="projected-value">{projected}</strong>
      <span className="projection-label">Fremskrevet</span>
      <span>Så langt: {actual}</span>
    </td>
  );
}

function formatChartLabel(period: PeriodStats, periodMode: PeriodMode): string {
  if (periodMode === "daily") {
    return `${period.id.slice(8, 10)}.${period.id.slice(5, 7)}`;
  }

  if (periodMode === "weekly") {
    const [year, week] = period.id.split("-W");
    return `${year} u${week}`;
  }

  return period.id;
}

function getChartPeriods(periods: PeriodStats[], periodMode: PeriodMode, chartRange: ChartRange, generatedAt: string): PeriodStats[] {
  const chartPeriods =
    periodMode === "monthly"
      ? periods[0]?.id === MONTHLY_CHART_START.id
        ? periods
        : [MONTHLY_CHART_START, ...periods]
      : periods;

  if (chartRange === "all") {
    return periodMode === "daily" ? chartPeriods.slice(-365) : chartPeriods;
  }

  if (chartRange === "year") {
    const start = DateTime.fromISO(generatedAt, { zone: KYIV_ZONE }).minus({ years: 1 }).toISODate();
    return start ? chartPeriods.filter((period) => period.end >= start) : chartPeriods;
  }

  return chartPeriods.slice(-DEFAULT_VISIBLE_CHART_POINTS[periodMode]);
}

function getDaypartMetricValues(period: PeriodStats, metric: MetricMode): DaypartValues {
  return {
    night: getDaypartMetricValue(period, "night", metric),
    work: getDaypartMetricValue(period, "work", metric),
    leisure: getDaypartMetricValue(period, "leisure", metric),
  };
}

function getDaypartMetricValue(period: PeriodStats, daypart: DaypartKey, metric: MetricMode): number {
  const stats = period.dayparts[daypart];

  if (metric === "count") {
    return stats.alertCount;
  }

  if (metric === "hours") {
    return stats.alertHours;
  }

  return stats.alertPercent;
}

function getProjectedDaypartMetricValues(period: PeriodStats, generatedAt: string, metric: MetricMode): DaypartValues {
  return {
    night: getProjectedDaypartMetricValue(period, generatedAt, "night", metric),
    work: getProjectedDaypartMetricValue(period, generatedAt, "work", metric),
    leisure: getProjectedDaypartMetricValue(period, generatedAt, "leisure", metric),
  };
}

function getProjectedPeriodValues(period: PeriodStats, generatedAt: string): PeriodProjection {
  return {
    alertCount: Math.round(sumDaypartValues(getProjectedDaypartMetricValues(period, generatedAt, "count"))),
    alertHours: round(sumDaypartValues(getProjectedDaypartMetricValues(period, generatedAt, "hours")), 2),
  };
}

function getProjectedPeriodStats(period: PeriodStats, generatedAt: string): PeriodStats {
  const projectedCounts = getProjectedDaypartMetricValues(period, generatedAt, "count");
  const projectedHours = getProjectedDaypartMetricValues(period, generatedAt, "hours");
  const alertHours = round(sumDaypartValues(projectedHours), 2);

  return {
    ...period,
    alertCount: Math.round(sumDaypartValues(projectedCounts)),
    alertHours,
    alertPercent: period.periodHours > 0 ? round((alertHours / period.periodHours) * 100, 2) : 0,
    dayparts: {
      night: {
        ...period.dayparts.night,
        alertCount: projectedCounts.night,
        alertHours: projectedHours.night,
        alertPercent: period.periodHours > 0 ? round((projectedHours.night / period.periodHours) * 100, 2) : 0,
      },
      work: {
        ...period.dayparts.work,
        alertCount: projectedCounts.work,
        alertHours: projectedHours.work,
        alertPercent: period.periodHours > 0 ? round((projectedHours.work / period.periodHours) * 100, 2) : 0,
      },
      leisure: {
        ...period.dayparts.leisure,
        alertCount: projectedCounts.leisure,
        alertHours: projectedHours.leisure,
        alertPercent: period.periodHours > 0 ? round((projectedHours.leisure / period.periodHours) * 100, 2) : 0,
      },
    },
  };
}

function getProjectedDaypartMetricValue(period: PeriodStats, generatedAt: string, daypart: DaypartKey, metric: MetricMode): number {
  const stats = period.dayparts[daypart];
  const elapsedHours = getElapsedDaypartHours(period, generatedAt, daypart);

  if (metric === "percent") {
    const projectedHours = projectValue(stats.alertHours, elapsedHours, stats.periodHours);
    return period.periodHours > 0 ? round((projectedHours / period.periodHours) * 100, 2) : 0;
  }

  const projectedValue = projectValue(metric === "count" ? stats.alertCount : stats.alertHours, elapsedHours, stats.periodHours);
  return metric === "count" ? Math.round(projectedValue) : round(projectedValue, 2);
}

function projectValue(value: number, elapsedHours: number, periodHours: number): number {
  if (elapsedHours <= 0 || periodHours <= 0) {
    return 0;
  }

  return value / Math.min(elapsedHours / periodHours, 1);
}

function sumDaypartValues(values: DaypartValues): number {
  return values.night + values.work + values.leisure;
}

function hasElapsedPeriodHours(period: PeriodStats, generatedAt: string): boolean {
  const { start, generated } = getPeriodTimes(period, generatedAt);
  return generated > start;
}

function getElapsedDaypartHours(period: PeriodStats, generatedAt: string, daypart: DaypartKey): number {
  const { start, end, generated } = getPeriodTimes(period, generatedAt);

  if (generated <= start) {
    return 0;
  }

  const elapsedEnd = generated < end ? generated : end;
  let cursor = start;
  let elapsedHours = 0;

  while (cursor < elapsedEnd) {
    const segmentEnd = DateTime.min(getNextDaypartBoundary(cursor), elapsedEnd);

    if (getDaypart(cursor) === daypart) {
      elapsedHours += segmentEnd.diff(cursor, "hours").hours;
    }

    cursor = segmentEnd;
  }

  return elapsedHours;
}

function getPeriodTimes(period: PeriodStats, generatedAt: string): { start: DateTime; end: DateTime; generated: DateTime } {
  const start = DateTime.fromISO(period.start, { zone: KYIV_ZONE }).startOf("day");
  const end = DateTime.fromISO(period.end, { zone: KYIV_ZONE }).plus({ days: 1 }).startOf("day");
  const generated = DateTime.fromISO(generatedAt, { zone: KYIV_ZONE });

  return { start, end, generated };
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

function formatChartValue(value: number, suffix: string): string {
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 2 })}${suffix}`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

type TrendDirection = "major-up" | "up" | "slight-up" | "major-down" | "down" | "slight-down" | "flat" | "mixed" | "unknown";

function getTrendDirection(latest: PeriodStats, previous: PeriodStats | undefined): TrendDirection {
  if (!previous) {
    return "unknown";
  }

  const countDirection = compareValues(latest.alertCount, previous.alertCount);
  const hoursDirection = compareValues(latest.alertHours, previous.alertHours);

  if (countDirection === "flat" && hoursDirection === "flat") {
    return "flat";
  }

  if (countDirection === "flat") {
    return hoursDirection === "flat" ? "flat" : getTrendDirectionWithMagnitude(hoursDirection, latest, previous);
  }

  if (hoursDirection === "flat") {
    return getTrendDirectionWithMagnitude(countDirection, latest, previous);
  }

  if (countDirection !== hoursDirection) {
    return "mixed";
  }

  return getTrendDirectionWithMagnitude(hoursDirection, latest, previous);
}

function getTrendDirectionWithMagnitude(direction: "up" | "down", latest: PeriodStats, previous: PeriodStats): TrendDirection {
  const countChange = getRelativeChange(latest.alertCount, previous.alertCount);
  const hoursChange = getRelativeChange(latest.alertHours, previous.alertHours);
  const largestChange = Math.max(countChange, hoursChange);

  if (largestChange < 0.05) {
    return "flat";
  }

  if (largestChange >= 0.5) {
    return direction === "up" ? "major-up" : "major-down";
  }

  if (largestChange >= 0.2) {
    return direction;
  }

  return direction === "up" ? "slight-up" : "slight-down";
}

function getRelativeChange(value: number, previous: number): number {
  if (previous === 0) {
    return value === 0 ? 0 : Infinity;
  }

  return Math.abs((value - previous) / previous);
}

function compareValues(value: number, previous: number): "up" | "down" | "flat" {
  if (Math.abs(value - previous) < 0.01) {
    return "flat";
  }

  return value > previous ? "up" : "down";
}

function getTrendHeadline(direction: TrendDirection): string {
  switch (direction) {
    case "major-up":
      return "Betydelig høyere belastning enn i perioden før";
    case "up":
      return "Høyere belastning enn i perioden før";
    case "slight-up":
      return "Litt høyere belastning enn i perioden før";
    case "major-down":
      return "Betydelig lavere belastning enn i perioden før";
    case "down":
      return "Lavere belastning enn i perioden før";
    case "slight-down":
      return "Litt lavere belastning enn i perioden før";
    case "mixed":
      return "Blandet trend: antall og varighet går hver sin vei";
    case "flat":
      return "Belastningen er omtrent uendret";
    default:
      return "Trend kan ikke sammenlignes";
  }
}

function getTrendDescription(direction: TrendDirection): string {
  switch (direction) {
    case "major-up":
      return "Økningen er betydelig sammenlignet med forrige periode.";
    case "up":
      return "Økningen er tydelig sammenlignet med forrige periode.";
    case "slight-up":
      return "Økningen er liten sammenlignet med forrige periode.";
    case "major-down":
      return "Nedgangen er betydelig sammenlignet med forrige periode.";
    case "down":
      return "Nedgangen er tydelig sammenlignet med forrige periode.";
    case "slight-down":
      return "Nedgangen er liten sammenlignet med forrige periode.";
    case "mixed":
      return "Antall alarmer og samlet varslingstid utviklet seg i motsatt retning.";
    case "flat":
      return "Forskjellene er små, så belastningen regnes som omtrent uendret.";
    default:
      return "Det finnes ikke en sammenlignbar foregående periode.";
  }
}

function formatAlertCountChange(value: number, previous: number): string {
  if (previous === 0) {
    return value === 0 ? `${formatAlertCount(value)} (ingen endring)` : `${formatAlertCount(value)} (opp fra ingen alarmer)`;
  }

  return `${formatAlertCount(value)} (${formatPercentChange(value, previous)})`;
}

function formatAlertHoursChange(value: number, previous: number): string {
  if (previous === 0) {
    return value === 0 ? `${formatHours(value)} med flyalarm (ingen endring)` : `${formatHours(value)} med flyalarm (opp fra 0 t)`;
  }

  return `${formatHours(value)} med flyalarm (${formatPercentChange(value, previous)})`;
}

function formatBurdenSentence(period: PeriodStats, referencePeriod: PeriodStats | undefined, isProjected: boolean): string {
  if (period.alertCount === 0 && period.alertHours === 0) {
    return "Ingen registrerte avbrudd fra flyalarmer i denne perioden.";
  }

  return `${formatDaypartBurden(
    period,
    referencePeriod,
    "night",
    "Natt",
    "23:00-08:00",
    isProjected,
  )} ${formatDaypartBurden(
    period,
    referencePeriod,
    "work",
    "Dagtid",
    "08:00-17:00",
    isProjected,
  )} ${formatDaypartBurden(
    period,
    referencePeriod,
    "leisure",
    "Kveldstid",
    "17:00-23:00",
    isProjected,
  )}`;
}

function formatDaypartBurden(
  period: PeriodStats,
  referencePeriod: PeriodStats | undefined,
  daypart: DaypartKey,
  label: string,
  hours: string,
  isProjected: boolean,
): string {
  const stats = period.dayparts[daypart];

  if (stats.alertCount === 0 && stats.alertHours === 0) {
    return `${label} (${hours}): ingen registrerte alarmer.`;
  }

  const count = stats.alertCount === 0 ? "Ingen alarmer startet" : `${formatAlertCount(stats.alertCount)} startet`;
  const activity = `${label} (${hours}): ${count} i tidsrommet, og det var ${formatHours(stats.alertHours)} med flyalarm.`;

  return referencePeriod ? `${activity} ${formatDaypartImpact(daypart, stats.alertHours, referencePeriod, isProjected)}` : activity;
}

function formatDaypartImpact(daypart: DaypartKey, alertHours: number, referencePeriod: PeriodStats, isProjected: boolean): string {
  const direction = compareValues(alertHours, referencePeriod.dayparts[daypart].alertHours);
  const prefix = isProjected ? "Fremskrivingen tyder på" : "Dette ga";
  const reference = `enn i ${formatPeriodLabel(referencePeriod)}.`;

  if (daypart === "night") {
    if (direction === "down") {
      return `${prefix} bedre mulighet for søvn og restitusjon ${reference}`;
    }

    if (direction === "up") {
      return `${prefix} dårligere mulighet for søvn og restitusjon ${reference}`;
    }

    return `${prefix} omtrent samme mulighet for søvn og restitusjon som i ${formatPeriodLabel(referencePeriod)}.`;
  }

  if (daypart === "work") {
    if (direction === "down") {
      return `${prefix} færre avbrudd i arbeid, møter og tilgang til tjenester ${reference}`;
    }

    if (direction === "up") {
      return `${prefix} flere avbrudd i arbeid, møter og tilgang til tjenester ${reference}`;
    }

    return `${prefix} omtrent samme påvirkning på arbeid, møter og tilgang til tjenester som i ${formatPeriodLabel(referencePeriod)}.`;
  }

  if (direction === "down") {
    return `${prefix} bedre mulighet til fritidsaktiviteter og å koble av ${reference}`;
  }

  if (direction === "up") {
    return `${prefix} dårligere mulighet til fritidsaktiviteter og å koble av ${reference}`;
  }

  return `${prefix} omtrent samme mulighet til fritidsaktiviteter og å koble av som i ${formatPeriodLabel(referencePeriod)}.`;
}

function formatCurrentProjectionSentence(period: PeriodStats, generatedAt: string): string | null {
  if (!hasElapsedPeriodHours(period, generatedAt)) {
    return null;
  }

  const { alertCount: projectedCount, alertHours: projectedHours } = getProjectedPeriodValues(period, generatedAt);

  return `Så langt ligger ${formatPeriodLabel(period)} an til omtrent ${formatAlertCount(projectedCount)} og ${formatHours(projectedHours)} med flyalarm.`;
}

function isPeriodIncomplete(period: PeriodStats, generatedAt: string): boolean {
  const generatedDate = formatKyivDate(generatedAt);
  return period.start <= generatedDate && generatedDate <= period.end;
}

function formatKyivDate(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}

function formatAlertCount(value: number): string {
  return `${value.toLocaleString("nb-NO")} ${pluralize(value, "alarm", "alarmer")}`;
}

function pluralize(value: number, singular: string, plural: string): string {
  return Math.abs(value) === 1 ? singular : plural;
}

function formatHours(value: number): string {
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} t`;
}

function formatPercentChange(value: number, previous: number | undefined): string {
  if (previous === undefined || previous === 0) {
    return "i/a";
  }

  const change = ((value - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

function getChangeDirection(value: number, previous: number | undefined): "up" | "down" | "flat" | "unknown" {
  if (previous === undefined || previous === 0) {
    return "unknown";
  }

  if (value > previous) {
    return "up";
  }

  if (value < previous) {
    return "down";
  }

  return "flat";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatPeriodLabel(period: PeriodStats): string {
  if (period.id.includes("-W")) {
    const [year, week] = period.id.split("-W");
    return `uke ${Number(week)}, ${year}`;
  }

  if (period.id.length === 7) {
    return new Intl.DateTimeFormat("nb-NO", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${period.id}-01T00:00:00Z`));
  }

  return formatDate(period.id);
}

export default App;
