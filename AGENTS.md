# Air Alerts Dashboard Deployment

This is a static Vite dashboard published through GitHub Pages at `https://johnsmithkyiv.github.io/airalerts/`.

## Current Setup

- Repository: `https://github.com/johnsmithkyiv/airalerts`
- The `main` branch deploys automatically, and the workflow also refreshes data hourly at minute 17 UTC.
- Historical data comes from `data.gov.ua`; recent Kyiv City alerts and live status come from Alerts.in.ua.
- `ALERTS_IN_UA_TOKEN` is stored only as a GitHub Actions repository secret. Never request, display, store, or commit it.
- The chart tooltip has no label for actual values; only projected values show the yellow `Fremskrevet` label.

## Build

The data build requires an Alerts.in.ua API token:

```bash
npm test
ALERTS_IN_UA_TOKEN="your-token" npm run build
```

`vite.config.ts` sets `base: "/airalerts/"`, and `src/App.tsx` loads dashboard data via `import.meta.env.BASE_URL`. Do not change these to root-relative paths unless the hosting path changes.

## GitHub Pages Deployment

- The scheduled workflow is `.github/workflows/deploy.yml`.
- Enable GitHub Pages in the repository settings with **Source: GitHub Actions**.
- Add `ALERTS_IN_UA_TOKEN` as an Actions repository secret. Never store or commit this token.
- The workflow runs hourly and can be started manually from the Actions tab.

## Verification

```bash
curl -I https://johnsmithkyiv.github.io/airalerts/
curl -I https://johnsmithkyiv.github.io/airalerts/data/kyiv-air-alerts-dashboard.json
```

Both endpoints should return `200` after deployment.
