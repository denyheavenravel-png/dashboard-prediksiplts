"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Telemetry } from "@/lib/types";

const maxHistory = 120;
const pollIntervalMs = 60_000;
const offlineAfterMs = 20 * 60 * 1000;

type ApiTelemetry = {
  id: number;
  device_id: string;
  voltage: number;
  current: number;
  actual_power: number;
  light_intensity: number;
  temperature: number;
  humidity: number;
  received_at: string;
  predicted_power?: number | null;
  error_watt?: number | null;
  error_percent?: number | null;
  model_version?: string | null;
};

const emptyTelemetry: Telemetry = {
  id: 0,
  device_id: "PLTS-01",
  recorded_at: "",
  voltage: 0,
  current: 0,
  actual_power: 0,
  light_intensity: null,
  temperature: null,
  humidity: null,
  predicted_power: null,
  error_watt: null,
  error_percent: null,
  model_version: null,
};

function number(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return value.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function dateTime(value?: string): { date: string; time: string } {
  if (!value) return { date: "—", time: "—" };

  const date = new Date(value);

  return {
    date: date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }),
    time: date.toLocaleTimeString("id-ID", {
      hour12: false,
      timeZone: "Asia/Jakarta",
    }),
  };
}

function StatusBadge({
  status,
  tone = "ok",
}: {
  status: string;
  tone?: "ok" | "warn" | "off";
}) {
  return <span className={`badge badge-${tone}`}>{status.toUpperCase()}</span>;
}

function MetricCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-value-row">
        <strong className="metric-value">{value}</strong>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {hint && <p className="metric-hint">{hint}</p>}
    </article>
  );
}

function toTelemetry(item: ApiTelemetry): Telemetry {
  return {
    id: item.id,
    device_id: item.device_id,
    recorded_at: item.received_at,
    voltage: Number(item.voltage),
    current: Number(item.current),
    actual_power: Number(item.actual_power),
    light_intensity:
      item.light_intensity === null || item.light_intensity === undefined
        ? null
        : Number(item.light_intensity),
    temperature:
      item.temperature === null || item.temperature === undefined
        ? null
        : Number(item.temperature),
    humidity:
      item.humidity === null || item.humidity === undefined
        ? null
        : Number(item.humidity),
    predicted_power:
      item.predicted_power === null || item.predicted_power === undefined
        ? null
        : Number(item.predicted_power),
    error_watt:
      item.error_watt === null || item.error_watt === undefined
        ? null
        : Number(item.error_watt),
    error_percent:
      item.error_percent === null || item.error_percent === undefined
        ? null
        : Number(item.error_percent),
    model_version: item.model_version ?? null,
  };
}

export default function Dashboard() {
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [apiStatus, setApiStatus] = useState<
    "menghubungkan" | "online" | "offline" | "error"
  >("menghubungkan");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");

  const loadData = useCallback(async () => {
    if (!apiBase) {
      setApiStatus("error");
      setConnectionError(
        "Environment variable NEXT_PUBLIC_API_BASE_URL belum diisi di Vercel.",
      );
      return;
    }

    try {
      setApiStatus((current) =>
        current === "online" ? "online" : "menghubungkan",
      );

      const response = await fetch(
        `${apiBase}/api/history?limit=${maxHistory}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`API merespons HTTP ${response.status}`);
      }

      const rows = (await response.json()) as ApiTelemetry[];

      const ordered = [...rows]
        .map(toTelemetry)
        .sort(
          (a, b) =>
            new Date(a.recorded_at).getTime() -
            new Date(b.recorded_at).getTime(),
        );

      setHistory(ordered);
      setApiStatus("online");
      setConnectionError("");
      setLastRefreshAt(new Date());
    } catch (error) {
      setApiStatus("error");
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Dashboard gagal membaca Backend API.",
      );
    }
  }, [apiBase]);

  useEffect(() => {
    void loadData();

    const interval = window.setInterval(() => {
      void loadData();
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [loadData]);

  const data = history[history.length - 1] ?? emptyTelemetry;
  const measurementTime = dateTime(data.recorded_at);

  const latestTimestamp = data.recorded_at
    ? new Date(data.recorded_at).getTime()
    : 0;

  const deviceOnline =
    latestTimestamp > 0 &&
    Date.now() - latestTimestamp <= offlineAfterMs;

  const powerAvailability =
    data.actual_power > 1
      ? "TERSEDIA"
      : history.length
        ? "RENDAH"
        : "BELUM ADA DATA";

  const chartData = useMemo(
    () =>
      history.map((item) => ({
        time: dateTime(item.recorded_at).time,
        aktual: Number(item.actual_power.toFixed(3)),
        prediksi:
          item.predicted_power === null
            ? null
            : Number(item.predicted_power.toFixed(3)),
      })),
    [history],
  );

  const apiTone =
    apiStatus === "online"
      ? "ok"
      : apiStatus === "menghubungkan"
        ? "warn"
        : "off";

  function downloadCsv() {
    if (!apiBase) return;
    window.open(`${apiBase}/api/export.csv`, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TUGAS AKHIR · PLTS 50 WP</p>
          <h1>Prediksi Daya PLTS Mini</h1>
          <p className="subtitle">
            Monitoring berbasis IoT dan prediksi daya menggunakan jaringan
            syaraf tiruan
          </p>
        </div>

        <div className="status-stack">
          <div>
            <span>Dashboard</span>
            <StatusBadge status="online" />
          </div>
          <div>
            <span>Backend API</span>
            <StatusBadge status={apiStatus} tone={apiTone} />
          </div>
          <div>
            <span>ESP32</span>
            <StatusBadge
              status={deviceOnline ? "online" : "offline"}
              tone={deviceOnline ? "ok" : "off"}
            />
          </div>
        </div>
      </header>

      <section className="demo-notice">
        <div>
          <strong>Mode data melalui Docker dan PostgreSQL.</strong>
          <span>
            {" "}
            Dashboard membaca riwayat permanen dari Backend API.
          </span>
          {connectionError && <span> Pesan: {connectionError}</span>}
        </div>
      </section>

      <section className="summary-strip">
        <div>
          <span>Ketersediaan daya</span>
          <strong>{powerAvailability}</strong>
        </div>
        <div>
          <span>Tanggal pengukuran</span>
          <strong>{measurementTime.date}</strong>
        </div>
        <div>
          <span>Waktu pengukuran</span>
          <strong>{measurementTime.time}</strong>
        </div>
        <div>
          <span>Pembaruan dashboard</span>
          <strong>
            {lastRefreshAt
              ? lastRefreshAt.toLocaleTimeString("id-ID", {
                  hour12: false,
                })
              : "—"}
          </strong>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PENGUKURAN PANEL</p>
            <h2>Parameter listrik dan hasil prediksi</h2>
          </div>

          <button
            className="export-button"
            type="button"
            disabled={!history.length || !apiBase}
            onClick={downloadCsv}
          >
            Unduh CSV
          </button>
        </div>

        <div className="metric-grid">
          <MetricCard
            label="Voltage"
            value={history.length ? number(data.voltage) : "—"}
            unit="V"
          />
          <MetricCard
            label="Current"
            value={history.length ? number(data.current, 3) : "—"}
            unit="A"
          />
          <MetricCard
            label="Daya aktual"
            value={history.length ? number(data.actual_power) : "—"}
            unit="W"
            hint="Tegangan × arus"
          />
          <MetricCard
            label="Daya prediksi"
            value={number(data.predicted_power)}
            unit="W"
            hint={data.model_version ?? "JST belum terhubung"}
          />
          <MetricCard
            label="Error prediksi"
            value={number(data.error_watt)}
            unit="W"
          />
          <MetricCard
            label="Persentase error"
            value={number(data.error_percent)}
            unit="%"
          />
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KONDISI LINGKUNGAN</p>
            <h2>Masukan jaringan syaraf tiruan</h2>
          </div>
        </div>

        <div className="metric-grid environment-grid">
          <MetricCard
            label="Intensitas cahaya"
            value={number(data.light_intensity, 0)}
            unit="lux"
          />
          <MetricCard
            label="Suhu"
            value={number(data.temperature)}
            unit="°C"
          />
          <MetricCard
            label="Kelembapan"
            value={number(data.humidity)}
            unit="%RH"
          />
        </div>
      </section>

      <section className="section-block chart-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GRAFIK RIWAYAT</p>
            <h2>Daya aktual dibandingkan daya prediksi</h2>
          </div>
        </div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="rgba(148, 163, 184, 0.15)"
              />
              <XAxis
                dataKey="time"
                minTickGap={28}
                stroke="#94a3b8"
                fontSize={12}
              />
              <YAxis unit=" W" stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="aktual"
                name="Daya aktual"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="prediksi"
                name="Daya prediksi"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVALUASI MODEL</p>
            <h2>Metrik pengujian JST</h2>
          </div>
        </div>

        <div className="metric-grid model-grid">
          <MetricCard label="MAE" value="—" unit="W" />
          <MetricCard label="RMSE" value="—" unit="W" />
          <MetricCard label="MAPE" value="—" unit="%" />
          <MetricCard label="R²" value="—" />
        </div>

        <p className="model-note">
          Metrik akan ditampilkan setelah model JST dilatih dan backend
          prediksi dihubungkan.
        </p>
      </section>

      <section className="section-block table-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RIWAYAT DATA</p>
            <h2>Pengukuran tersimpan di PostgreSQL</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Voltage</th>
                <th>Current</th>
                <th>Aktual</th>
                <th>Prediksi</th>
                <th>Lux</th>
                <th>Suhu</th>
                <th>RH</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {!history.length && (
                <tr>
                  <td colSpan={9}>Belum ada riwayat dari Backend API.</td>
                </tr>
              )}

              {[...history]
                .reverse()
                .slice(0, 15)
                .map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.recorded_at).time}</td>
                    <td>{number(item.voltage)} V</td>
                    <td>{number(item.current, 3)} A</td>
                    <td>{number(item.actual_power)} W</td>
                    <td>{number(item.predicted_power)} W</td>
                    <td>{number(item.light_intensity, 0)}</td>
                    <td>{number(item.temperature)} °C</td>
                    <td>{number(item.humidity)} %</td>
                    <td>{number(item.error_percent)} %</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <p>
          prediksiplts.my.id · Monitoring dan Prediksi Daya PLTS untuk
          Pengisian Baterai
        </p>
      </footer>
    </main>
  );
}
