# Find metrics in code

Search the project for what it emits before you look at Grafana. The code says which series should exist and which labels they carry. The datasource says which of them actually do.

## Where metrics are defined

| Stack | Search for |
|---|---|
| Go | `prometheus.New(Counter\|Gauge\|Histogram\|Summary)`, `promauto.`, OTel `meter.(Int64\|Float64)(Counter\|UpDownCounter\|Histogram\|Gauge)` |
| Node / TS | `new (client.)?(Counter\|Gauge\|Histogram\|Summary)(`, `meter.create(Counter\|Histogram\|UpDownCounter\|ObservableGauge)` |
| Python | `(Counter\|Gauge\|Histogram\|Summary)(` from `prometheus_client`, `meter.create_(counter\|histogram\|up_down_counter)` |
| Java / Kotlin | `Counter.builder(`, `Timer.builder(`, `DistributionSummary.builder(`, `@Timed`, `@Counted`, `meterRegistry.`, OTel `meter.counterBuilder(` |
| .NET | `Meter.Create(Counter\|Histogram\|UpDownCounter)`, prometheus-net `Metrics.Create(Counter\|Histogram)` |

Read each definition for the name, type, unit, label or attribute keys, and histogram buckets. Note the file and line.

## Metrics nobody wrote by hand

Auto-instrumentation emits series with no definition in the repo. Look for:

- OTel auto-instrumentation: `@opentelemetry/auto-instrumentations-node`, `opentelemetry-instrument`, the Java agent jar, `OTEL_*` env vars in deploy config. These emit the semantic-convention HTTP, RPC, and DB metrics, such as `http.server.request.duration`.
- Framework exporters: Spring Boot Actuator (`http.server.requests`), `express-prom-bundle`, `prometheus-fastapi-instrumentator`, `django-prometheus`, ASP.NET Core meters.
- Runtime defaults: `process_*`, `go_*`, `nodejs_*`, `jvm_*`, `python_gc_*`.
- Beyla or a service mesh, which measure traffic from outside the process.

## How the name changes on the way to Prometheus

The name in code is often not the name in the datasource. Expect these, then confirm against the datasource:

- OTel to Prometheus: dots become underscores, the unit becomes a suffix (`_seconds`, `_bytes`), counters gain `_total`, and histograms split into `_bucket`, `_sum`, and `_count`. `service.name` usually lands in `job`, and other resource attributes land on `target_info` rather than on each series. Prometheus 3 with UTF-8 names can keep the dots, depending on the translation setting.
- Micrometer: dots become underscores, timers become `_seconds` with `_count`, `_sum`, and `_max`, and gain `_bucket` only when histograms are turned on.
- Python `prometheus_client`: counters gain `_total` and `_created`.
- Go and Node Prometheus clients: the name as written.

## Labels that come from deployment

Scrape and deploy config add the labels a dashboard filters on. Read `ServiceMonitor` and `PodMonitor` resources, `prometheus.io/*` annotations, Alloy or collector configs, Helm values, `OTEL_SERVICE_NAME`, and `OTEL_RESOURCE_ATTRIBUTES`. These give `job`, `namespace`, `cluster`, and `service` values, which become the dashboard's variables.

## Logs

Find the logger and its output format. JSON output means `| json` in LogQL, key=value output means `| logfmt`. List the fields the code attaches, such as request id, route, status, and error. Loki stream labels come from the shipping config, not the code, so take them from the datasource.

## The inventory

Write one row per metric:

| In code | Expected series | Type | Unit | Labels | Defined at |
|---|---|---|---|---|---|
| `http.server.request.duration` (auto) | `http_server_request_duration_seconds_bucket` | histogram | s | `http_route`, `http_response_status_code` | `otel.ts:12` |

In a large repo, hand the search to a subagent on the `swarm workers` role, one per service or package, and keep only the tables.
