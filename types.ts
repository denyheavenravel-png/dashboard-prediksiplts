export type Telemetry = {
  id: number;
  device_id: string;
  recorded_at: string;
  voltage: number;
  current: number;
  actual_power: number;
  light_intensity: number | null;
  temperature: number | null;
  humidity: number | null;
  predicted_power: number | null;
  error_watt: number | null;
  error_percent: number | null;
  model_version: string | null;
};

export type LatestResponse = {
  device_status: "online" | "offline" | "belum_ada_data";
  model_status: "aktif" | "belum_dilatih";
  data: Telemetry | null;
};

export type ModelMetrics = {
  model_ready?: boolean;
  model_status?: string;
  model_version?: string | null;
  test?: {
    mae?: number;
    rmse?: number;
    mape_percent?: number | null;
    r2?: number;
  };
  message?: string;
};
