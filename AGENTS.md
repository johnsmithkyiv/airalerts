# Air Alerts Dashboard Deployment

This is a static Vite dashboard published through GitHub Pages at `https://johnsmithkyiv.github.io/airalerts/`.

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
