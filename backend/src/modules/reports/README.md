# Reports module

On-demand reports over a period, downloaded as Excel, CSV or PDF. This is the
API's report catalog; the console's daily **gauge report** (opening and
closing gauges, production, hauls) is a separate module,
[gauge-report](../gauge-report/), with its own CSV and print layout.

| File | Role |
| --- | --- |
| `reports.service.ts` | Validation, format dispatch, CSV, usage counters |
| `services/report-data.service.ts` | Queries that build each report's summary, rows and charts |
| `services/excel-report.service.ts` | `.xlsx` workbooks (SheetJS) |
| `services/pdf-report.service.ts` | PDF from Handlebars templates, printed by headless Chromium (Puppeteer) |
| `templates/*.hbs` | PDF layouts; `base.hbs` is shared |
| `reports.controller.ts` | REST API |

## Types and formats

| `type` | Excel | CSV | PDF |
| --- | --- | --- | --- |
| `tank_level_history` | yes | yes | no |
| `sensor_performance` | yes | yes | no |
| `alert_summary` | yes | yes | **yes** |
| `system_overview` | yes | not offered (no table of rows) | no |
| `maintenance_schedule` | yes | yes | no |
| `production_analysis` | yes | yes | no |

A type has PDF when `templates/<type with dashes>.hbs` exists; only the alert
summary has one today. `GET /reports/available` and the preview list exactly
the formats that work for each type, and asking for a PDF without a layout is
refused with 400 (`unsupportedReportFormat`) instead of failing. Startup logs
one line with the layouts found.

CSV cells are quoted per RFC 4180 and guarded against formula injection (a
leading `= + - @` is prefixed with `'`), the same rules as the gauge report CSV
(`src/common/csv.ts`).

## Request

`POST /reports/generate` takes:

| Field | Rules |
| --- | --- |
| `type` | one of the types above |
| `format` | `excel`, `csv` or `pdf` |
| `startDate`, `endDate` | ISO 8601; start not after end; at most 90 days apart |
| `tankIds` | optional, up to 50 tank UUIDs |
| `sensorIds` | optional, up to 100 gauge UUIDs |
| `title` | optional, used in the file name |

The answer is the file itself, with `Content-Disposition: attachment` and the
matching content type. Six shortcuts take the same fields without `type`,
with the same validation, and each uses the filters that apply to its type:
`POST /reports/tank-level-history`, `sensor-performance`, `alert-summary`,
`system-overview`, `maintenance-schedule`, `production-analysis`.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /reports/generate` | admin, operator | Generate and download |
| `POST /reports/<type with dashes>` | admin, operator (maintenance schedule: admin, maintenance) | Shortcut for one type |
| `GET /reports/preview?type=…` | admin, operator | Summary and row count without generating a file; same filters as query (`startDate`, `endDate`, comma-separated `tankIds`, `sensorIds`) |
| `GET /reports/available` | signed-in user | The catalog: title, description, formats and parameters per type |
| `GET /reports/stats` | admin | Reports generated since the API started (in memory): totals by type and format, average generation time, last one |

Reports are generated on request only: nothing is scheduled, stored or sent.

## Runtime notes

- PDF needs Chromium. The API image (`backend/Dockerfile`) installs it and sets
  `PUPPETEER_EXECUTABLE_PATH`; elsewhere Puppeteer uses its own download, or
  the path you set. Without Chromium, PDF requests fail and Excel/CSV keep
  working.
- SheetJS comes from its official registry (`cdn.sheetjs.com`): the npm
  package stopped receiving fixes at 0.18.5.

## Tests

`dto/generate-report.dto.spec.ts` (validation of the shortcut bodies) and
`../../common/csv.spec.ts` (CSV quoting and formula guard). PDF output was
checked by hand against Chrome when Puppeteer was upgraded; there is no
automated PDF test, since CI has no browser for it.
