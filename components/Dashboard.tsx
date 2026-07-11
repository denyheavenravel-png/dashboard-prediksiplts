"use client";

import { useEffect, useMemo, useState } from "react";
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

const refreshIntervalMs = 5000;
const maxHistory = 120;

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

function StatusBadge({ status, tone = "ok" }: { status: string; tone?: "ok" | "warn" | "off" }) {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function makeInitialHistory(): Telemetry[] {
  const baseTime = new Date("2026-06-12T14:22:11+07:00").getTime();

  return Array.from({ length: 21 }, (_, index) => {
    const wave = Math.sin(index / 3.4);
    const voltage = 18.15 + wave * 0.26 + index * 0.004;
    const current = 0.515 + wave * 0.035 + index * 0.0017;
    const actualPower = voltage * current;
    const predictedPower = actualPower * (0.965 + Math.cos(index / 4.1) * 0.018);
    const errorWatt = Math.abs(actualPower - predictedPower);

    return {
      id: index + 1,
      device_id: "PLTS-DEMO-01",
      recorded_at: new Date(baseTime + index * 30_000).toISOString(),
      voltage: round(voltage),
      current: round(current),
      actual_power: round(actualPower),
      light_intensity: Math.round(14500 + wave * 900 + index * 28),
      temperature: round(35.4 + Math.sin(index / 5) * 0.8, 2),
      humidity: round(69.2 - Math.sin(index / 5) * 2.5, 2),
      predicted_power: round(predictedPower),
      error_watt: round(errorWatt),
      error_percent: round((errorWatt / actualPower) * 100, 2),
      model_version: "JST-demo-v1",
    };
  });
}

function makeNextPoint(previous: Telemetry, id: number): Telemetry {
  const now = new Date();
  const phase = id / 5;
  const voltage = clamp(previous.voltage + (Math.random() - 0.5) * 0.16, 17.2, 19.4);
  const current = clamp(previous.current + (Math.random() - 0.5) * 0.035, 0.38, 0.72);
  const actualPower = voltage * current;
  const predictionFactor = 0.965 + Math.sin(phase) * 0.018 + (Math.random() - 0.5) * 0.012;
  const predictedPower = actualPower * predictionFactor;
  const errorWatt = Math.abs(actualPower - predictedPower);

  return {
    id,
    device_id: "PLTS-DEMO-01",
    recorded_at: now.toISOString(),
    voltage: round(voltage),
    current: round(current),
    actual_power: round(actualPower),
    light_intensity: Math.round(clamp((previous.light_intensity ?? 15000) + (Math.random() - 0.5) * 650, 10000, 23000)),
    temperature: round(clamp((previous.temperature ?? 36) + (Math.random() - 0.5) * 0.18, 31, 43), 2),
    humidity: round(clamp((previous.humidity ?? 68) + (Math.random() - 0.5) * 0.5, 45, 90), 2),
    predicted_power: round(predictedPower),
    error_watt: round(errorWatt),
    error_percent: round((errorWatt / actualPower) * 100, 2),
    model_version: "JST-demo-v1",
  };
}

function downloadCsv(history: Telemetry[]) {
  const headers = [
    "waktu",
    "tegangan_v",
    "arus_a",
    "daya_aktual_w",
    "daya_prediksi_w",
    "cahaya_lux",
    "suhu_c",
    "kelembapan_rh",
    "error_w",
    "error_persen",
  ];

  const rows = history.map((item) => [
    item.recorded_at,
    item.voltage,
    item.current,
    item.actual_power,
    item.predicted_power ?? "",
    item.light_intensity ?? "",
    item.temperature ?? "",
    item.humidity ?? "",
    item.error_watt ?? "",
    item.error_percent ?? "",
  ]);

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `data-demo-plts-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [history, setHistory] = useState<Telemetry[]>(makeInitialHistory);
  const [simulationActive, setSimulationActive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    if (!simulationActive) return;

    const interval = window.setInterval(() => {
      setHistory((current) => {
        const previous = current[current.length - 1];
        const next = makeNextPoint(previous, previous.id + 1);
        return [...current, next].slice(-maxHistory);
      });
      setLastRefresh(new Date());
    }, refreshIntervalMs);

    return () => window.clearInterval(interval);
  }, [simulationActive]);

  const data = history[history.length - 1];
  const measurementTime = dateTime(data.recorded_at);
  const powerAvailability = data.actual_power > 1 ? "TERSEDIA" : "RENDAH";

  const chartData = useMemo(
    () => history.map((item) => ({
      time: dateTime(item.recorded_at).time,
      aktual: Number(item.actual_power.toFixed(3)),
      prediksi: item.predicted_power === null ? null : Number(item.predicted_power.toFixed(3)),
    })),
    [history],
  );

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TUGAS AKHIR · PLTS 50 WP</p>
          <h1>Prediksi Daya PLTS Mini</h1>
          <p className="subtitle">
            Monitoring berbasis IoT dan prediksi daya menggunakan jaringan syaraf tiruan
          </p>
        </div>
        <div className="status-stack">
          <div><span>Dashboard</span><StatusBadge status="online" /></div>
          <div><span>Sumber data</span><StatusBadge status="mode demo" tone="warn" /></div>
          <div><span>Simulasi</span><StatusBadge status={simulationActive ? "aktif" : "berhenti"} tone={simulationActive ? "ok" : "off"} /></div>
        </div>
      </header>

      <section className="demo-notice">
        <div>
          <strong>Mode tampilan dashboard.</strong>
          <span> Data saat ini adalah data simulasi dan akan diganti dengan data ESP32 pada tahap integrasi.</span>
        </div>
        <button className="simulation-button" type="button" onClick={() => setSimulationActive((value) => !value)}>
          {simulationActive ? "Jeda simulasi" : "Mulai simulasi"}
        </button>
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
          <strong>{lastRefresh ? lastRefresh.toLocaleTimeString("id-ID", { hour12: false }) : "—"}</strong>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PENGUKURAN PANEL</p>
            <h2>Parameter listrik dan hasil prediksi</h2>
          </div>
          <button className="export-button" type="button" onClick={() => downloadCsv(history)}>Unduh CSV Demo</button>
        </div>
        <div className="metric-grid">
          <MetricCard label="Voltage" value={number(data.voltage)} unit="V" />
          <MetricCard label="Current" value={number(data.current, 3)} unit="A" />
          <MetricCard label="Daya aktual" value={number(data.actual_power)} unit="W" hint="Tegangan × arus" />
          <MetricCard label="Daya prediksi" value={number(data.predicted_power)} unit="W" hint="JST-demo-v1" />
          <MetricCard label="Error prediksi" value={number(data.error_watt)} unit="W" />
          <MetricCard label="Persentase error" value={number(data.error_percent)} unit="%" />
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
          <MetricCard label="Intensitas cahaya" value={number(data.light_intensity, 0)} unit="lux" />
          <MetricCard label="Suhu" value={number(data.temperature)} unit="°C" />
          <MetricCard label="Kelembapan" value={number(data.humidity)} unit="%RH" />
        </div>
      </section>

      <section className="section-block chart-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GRAFIK REAL-TIME</p>
            <h2>Daya aktual dibandingkan daya prediksi</h2>
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="time" minTickGap={28} stroke="#94a3b8" fontSize={12} />
              <YAxis unit=" W" stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="aktual" name="Daya aktual" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="prediksi" name="Daya prediksi" stroke="#fbbf24" strokeWidth={2.5} dot={false} connectNulls />
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
          <MetricCard label="MAE" value="0,1734" unit="W" />
          <MetricCard label="RMSE" value="0,2186" unit="W" />
          <MetricCard label="MAPE" value="2,14" unit="%" />
          <MetricCard label="R²" value="0,9621" />
        </div>
        <p className="model-note">
          Nilai evaluasi di atas hanya contoh tampilan. Nilai sebenarnya akan berasal dari hasil pelatihan dataset pengukuran Anda.
        </p>
      </section>

      <section className="section-block table-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RIWAYAT DATA</p>
            <h2>Pengukuran terbaru</h2>
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
              {[...history].reverse().slice(0, 15).map((item) => (
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
        <p>prediksiplts.my.id · Monitoring dan Prediksi Daya PLTS untuk Pengisian Baterai</p>
      </footer>
    </main>
  );
}
