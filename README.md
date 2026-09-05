# Kyiv Air Alerts Dashboard

Browser dashboard for Kyiv city air-alert statistics based on official historical open data from Kyiv City State Administration on `data.gov.ua`, supplemented with recent Kyiv alert intervals and live status from Alerts.in.ua.

## Data Source

Historical source:

- Dataset: `Статистика повітряних тривог на території Києва`
- Publisher: `Київська міська державна адміністрація`
- Official page: https://data.gov.ua/dataset/48330a76-8539-4079-8d83-42fa9ba6537c
- JSON resource: https://data.gov.ua/dataset/83eda433-b4d9-47ac-89a0-5868dd4d5ce6/resource/08559e6a-863f-4d9b-86c1-d23e8b8b4630/download/airalerts.json

Recent supplement and live status:

- Provider: Alerts.in.ua
- Page: https://alerts.in.ua/
- Kyiv history: https://api.alerts.in.ua/v1/regions/31/alerts/month_ago.json
- Active alerts: https://api.alerts.in.ua/v1/alerts/active.json

The dashboard uses a build-time script to download the official JSON, append Alerts.in.ua intervals newer than the latest official Kyiv alert, and generate `public/data/kyiv-air-alerts-dashboard.json`. The API token is used only during the build and is never shipped to the browser. Alerts.in.ua is an informational source and is used only to cover recent lag in the official open data.

## Run

```bash
npm install
ALERTS_IN_UA_TOKEN="your-token" npm run dev
```

## Build

```bash
ALERTS_IN_UA_TOKEN="your-token" npm run build
```

## Tests

```bash
npm test
```

## GitHub Pages

The repository is published at `https://johnsmithkyiv.github.io/airalerts/` through `.github/workflows/deploy.yml`.

1. In the GitHub repository, enable **Settings -> Pages -> Source: GitHub Actions**.
2. Add `ALERTS_IN_UA_TOKEN` under **Settings -> Secrets and variables -> Actions**.
3. Run **Deploy GitHub Pages** manually for the first publication. It then refreshes and deploys the data hourly.

## Metric Definitions

- Alert counts are counted by alert start time in the `Europe/Kyiv` timezone.
- Alert hours are split across calendar day/week/month boundaries.
- Percent of day/week/month is `alert hours / total calendar period hours`, with daylight-saving changes included.
- Overlapping alert intervals are merged for duration calculations to avoid double-counting time.
