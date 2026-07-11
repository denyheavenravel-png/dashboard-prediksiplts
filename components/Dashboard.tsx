"use client";

import { useEffect, useMemo, useState } from "react";
import mqtt, { type MqttClient } from "mqtt";
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
const offlineAfterMs = 15_000;

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

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  anchor.download = `data-plts-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [mqttStatus, setMqttStatus] = useState<"menghubungkan" | "online" | "offline" | "error">("menghubungkan");
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_MQTT_WS_URL;
    const username = process.env.NEXT_PUBLIC_MQTT_USERNAME;
    const password = process.env.NEXT_PUBLIC_MQTT_PASSWORD;
    const topic = process.env.NEXT_PUBLIC_MQTT_TOPIC || "plts/device01/telemetry";

    if (!url || !username || !password) {
      setMqttStatus("error");
      setConnectionError("Environment variable MQTT belum lengkap di Vercel.");
      return;
    }

    let client: MqttClient | null = null;

    try {
      client = mqtt.connect(url, {
        username,
        password,
        clientId: `dashboard-plts-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        connectTimeout: 10_000,
        reconnectPeriod: 3_000,
        protocolVersion: 4,
      });
    } catch (error) {
      setMqttStatus("error");
      setConnectionError(error instanceof Error ? error.message : "Gagal membuat koneksi MQTT.");
      return;
    }

    client.on("connect", () => {
      setMqttStatus("online");
      setConnectionError("");
      client?.subscribe(topic, { qos: 0 }, (error) => {
        if (error) {
          setMqttStatus("error");
          setConnectionError(`Gagal subscribe: ${error.message}`);
        }
      });
    });

    client.on("message", (_topic, payload) => {
      try {
        const parsed = JSON.parse(payload.toString()) as Record<string, unknown>;
        const voltage = asNumber(parsed.voltage);
        const current = asNumber(parsed.current);
        const actualPower = asNumber(parsed.actual_power, voltage * current);
        const predictedPower = nullableNumber(parsed.predicted_power);
        const errorWatt = predictedPower === null ? null : Math.abs(actualPower - predictedPower);
        const errorPercent = errorWatt === null || actualPower === 0 ? null : (errorWatt / actualPower) * 100;

        setHistory((currentHistory) => {
          const next: Telemetry = {
            id: (currentHistory[currentHistory.length - 1]?.id ?? 0) + 1,
            device_id: String(parsed.device_id ?? "PLTS-01"),
            recorded_at: typeof parsed.timestamp === "string" ? parsed.timestamp : new Date().toISOString(),
            voltage,
            current,
            actual_power: actualPower,
            light_intensity: nullableNumber(parsed.light_intensity),
            temperature: nullableNumber(parsed.temperature),
            humidity: nullableNumber(parsed.humidity),
            predicted_power: predictedPower,
            error_watt: errorWatt,
            error_percent: errorPercent,
            model_version: typeof parsed.model_version === "string" ? parsed.model_version : null,
          };

          return [...currentHistory, next].slice(-maxHistory);
        });

        const now = new Date();
        setLastMessageAt(now);
        setDeviceOnline(true);
      } catch (error) {
        setConnectionError(error instanceof Error ? `Payload tidak valid: ${error.message}` : "Payload MQTT tidak valid.");
      }
    });

    client.on("reconnect", () => setMqttStatus("menghubungkan"));
    client.on("offline", () => setMqttStatus("offline"));
    client.on("close", () => setMqttStatus("offline"));
    client.on("error", (error) => {
      setMqttStatus("error");
      setConnectionError(error.message);
    });

    return () => {
      client?.end(true);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!lastMessageAt) {
        setDeviceOnline(false);
        return;
      }
      setDeviceOnline(Date.now() - lastMessageAt.getTime() <= offlineAfterMs);
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [lastMessageAt]);

  const data = history[history.length - 1] ?? emptyTelemetry;
  const measurementTime = dateTime(data.recorded_at);
  const powerAvailability = data.actual_power > 1 ? "TERSEDIA" : history.length ? "RENDAH" : "BELUM ADA DATA";

  const chartData = useMemo(
    () => history.map((item) => ({
      time: dateTime(item.recorded_at).time,
      aktual: Number(item.actual_power.toFixed(3)),
      prediksi: item.predicted_power === null ? null : Number(item.predicted_power.toFixed(3)),
    })),
    [history],
  );

  const mqttTone = mqttStatus === "online" ? "ok" : mqttStatus === "menghubungkan" ? "warn" : "off";

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
          <div><span>HiveMQ</span><StatusBadge status={mqttStatus} tone={mqttTone} /></div>
          <div><span>ESP32</span><StatusBadge status={deviceOnline ? "online" : "offline"} tone={deviceOnline ? "ok" : "off"} /></div>
        </div>
      </header>

      <section className="demo-notice">
        <div>
          <strong>Mode data ESP32 melalui HiveMQ Cloud.</strong>
          <span> Dashboard menerima telemetry real-time dari topic MQTT.</span>
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
          <span>Pesan terakhir</span>
          <strong>{lastMessageAt ? lastMessageAt.toLocaleTimeString("id-ID", { hour12: false }) : "—"}</strong>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PENGUKURAN PANEL</p>
            <h2>Parameter listrik dan hasil prediksi</h2>
          </div>
          <button className="export-button" type="button" disabled={!history.length} onClick={() => downloadCsv(history)}>Unduh CSV</button>
        </div>
        <div className="metric-grid">
          <MetricCard label="Voltage" value={history.length ? number(data.voltage) : "—"} unit="V" />
          <MetricCard label="Current" value={history.length ? number(data.current, 3) : "—"} unit="A" />
          <MetricCard label="Daya aktual" value={history.length ? number(data.actual_power) : "—"} unit="W" hint="Tegangan × arus" />
          <MetricCard label="Daya prediksi" value={number(data.predicted_power)} unit="W" hint={data.model_version ?? "JST belum terhubung"} />
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
          <MetricCard label="MAE" value="—" unit="W" />
          <MetricCard label="RMSE" value="—" unit="W" />
          <MetricCard label="MAPE" value="—" unit="%" />
          <MetricCard label="R²" value="—" />
        </div>
        <p className="model-note">
          Metrik akan ditampilkan setelah model JST dilatih dan backend prediksi dihubungkan.
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
              {!history.length && (
                <tr>
                  <td colSpan={9}>Menunggu data ESP32 dari HiveMQ...</td>
                </tr>
              )}
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
