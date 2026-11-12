// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "maintenance";
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
}

// Tank types
export interface TankDimensions {
  height: number;
  diameter: number;
  volume: number;
}

export interface TankArqueacao {
  level: number;
  volume: number;
}

export interface Tank {
  id: string;
  code: string;
  name: string;
  description?: string;
  dimensions: TankDimensions;
  arqueacaoTable?: TankArqueacao[];
  latitude: number;
  longitude: number;
  status: "active" | "maintenance" | "inactive" | "error";
  maxLevelThreshold?: number;
  minLevelThreshold?: number;
  overflowThreshold?: number;
  lowLevelThreshold?: number;
  installationDate?: Date;
  lastMaintenanceDate?: Date;
  nextMaintenanceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Sensor types
export interface Sensor {
  id: string;
  sensorId: string;
  name: string;
  type:
    | "magnetostrictive"
    | "radar_level"
    | "float_switch"
    | "ultrasonic"
    | "pressure"
    | "capacitive";
  protocol: "mqtt" | "http" | "modbus" | "lorawan";
  tankId: string;
  tank?: Tank;
  status: "active" | "inactive" | "maintenance" | "error" | "offline";
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string;
  measurementRangeMin?: number;
  measurementRangeMax?: number;
  accuracy?: number;
  powerVoltage?: number;
  batteryLevel?: number;
  lastTransmissionAt?: Date;
  transmissionCount: number;
  errorCount: number;
  calibrationDate?: Date;
  nextCalibrationDate?: Date;
  installationDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Corpo de POST /devices (provisionamento de uma haste/dispositivo) */
export interface ProvisionDeviceRequest {
  tankId?: string;
  sensorId?: string;
  name?: string;
  type?: Sensor["type"];
  model?: string;
  manufacturer?: string;
  measurementRangeMin?: number;
  measurementRangeMax?: number;
}

/** Credencial emitida no provisionamento/rotação: o secret aparece uma única vez */
export interface DeviceCredential {
  sensorId: string;
  secret: string;
  credentialVersion: number;
  issuedAt: string;
  notice: string;
}

// Reading types
export interface OilWaterInterface {
  oilLevel: number;
  waterLevel: number;
  interfaceLevel: number;
}

export interface ReadingMetadata {
  signalStrength?: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  rawData?: any;
}

export interface Reading {
  id: string;
  sensorId: string;
  sensor?: Sensor;
  level: number;
  volume?: number;
  oilWaterInterface?: OilWaterInterface;
  metadata?: ReadingMetadata;
  quality?: number;
  isCalibrated: boolean;
  isProcessed: boolean;
  timestamp: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface ReadingFilters {
  sensorId?: string;
  tankId?: string;
  startDate?: string;
  endDate?: string;
  minLevel?: number;
  maxLevel?: number;
  minVolume?: number;
  maxVolume?: number;
  minQuality?: number;
  calibratedOnly?: boolean;
  processedOnly?: boolean;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

// Alert types
// Valores alinhados com backend/src/entities/alert.entity.ts (AlertSeverity / AlertStatus)
export const AlertSeverity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const AlertStatus = {
  ACTIVE: "active",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved",
  FALSE_POSITIVE: "false_positive",
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export interface Alert {
  id: string;
  type:
    | "high_level"
    | "low_level"
    | "overflow_risk"
    | "sensor_offline"
    | "battery_low"
    | "sensor_error"
    | "maintenance_due"
    | "calibration_due"
    | "communication_error"
    | "power_failure";
  severity: AlertSeverity;
  title: string;
  message: string;
  tankId: string;
  tank?: Tank;
  sensorId?: string;
  sensor?: Sensor;
  currentLevel?: number;
  currentVolume?: number;
  thresholdValue?: number;
  status: AlertStatus;
  acknowledgedAt?: Date;
  acknowledgedBy?: User;
  resolvedAt?: Date;
  resolvedBy?: User;
  resolutionNotes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertFilters {
  type?: string;
  severity?: string;
  status?: string;
  tankId?: string;
  sensorId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  unacknowledgedOnly?: boolean;
  criticalOnly?: boolean;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

// Shape do retorno de GET /alerts (backend: AlertsService.findAll)
export interface AlertsPaginatedResponse {
  alerts: Alert[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Dashboard types
export interface DashboardStats {
  overview: {
    total: number;
    active: number;
    online: number;
    offline: number;
    maintenance: number;
    lowBattery: number;
  };
  distribution: {
    byType: Record<string, number>;
    byProtocol: Record<string, number>;
  };
  healthScore: number;
}

export interface TankStats {
  tank: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
  sensors: {
    total: number;
    byStatus: Record<string, number>;
  };
  alerts: {
    active: number;
  };
  lastReading?: {
    level: number;
    volume?: number;
    timestamp: string;
    sensorName: string;
  };
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  message: string;
  statusCode: number;
  error?: string;
}

// Prediction types (GET /predictions)
export interface ForecastThresholds {
  maxLevel: number | null;
  overflow: number | null;
  minLevel: number | null;
  lowLevel: number | null;
}

export type ForecastTrend = "rising" | "falling" | "stable" | "unknown";

export interface TankForecast {
  tankId: string;
  tankCode: string;
  tankName: string;
  sensorId: string;
  currentLevel: number | null;
  lastReadingAt: string | null;
  dataFresh: boolean;
  /** Ritmo de nível em m/h (negativo = esvaziando) */
  fillRateMH: number | null;
  /** Ritmo volumétrico em m³/h (negativo = esvaziando) */
  fillRateM3H: number | null;
  trend: ForecastTrend;
  /** R² da regressão (0-1) */
  confidence: number;
  etaMaxLevelHours: number | null;
  etaOverflowHours: number | null;
  etaMinLevelHours: number | null;
  thresholds: ForecastThresholds;
  predictedAt: string;
}

// WebSocket types
export interface SystemHealth {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  components: {
    api: "up" | "down";
    database: "up" | "down";
    /** "disabled": HTTP-only deployment (MQTT_ENABLED=false). */
    mqtt: "up" | "down" | "disabled";
  };
}

export interface WebSocketMessage {
  type: string;
  payload: any;
  /** ISO 8601, conforme emitido pelo gateway */
  timestamp: string;
}

// Payloads de eventos WebSocket emitidos pelo gateway global (shape {type, payload, timestamp})
export interface ReadingEventPayload {
  /** ID de negócio do sensor (ex.: "SENSOR-001") */
  sensorId: string;
  tankId: string;
  level: number;
  volume?: number;
  timestamp: string;
}

export interface AlertEventPayload {
  sensorId: string;
  tankId: string;
  reason: string;
  level?: number;
  timestamp: string;
}

export interface AnomalyEventPayload {
  sensorId: string;
  tankId: string;
  level: number;
  zScore: number;
  mean: number;
  timestamp: string;
}

export interface ForecastEventPayload {
  predictedAt: string;
  forecasts: TankForecast[];
}

export interface ConnectedEventPayload {
  status: string;
  timestamp: string;
}

/** Alerta de WS enriquecido para exibição transitória na UI */
export interface LiveAlert extends AlertEventPayload {
  id: number;
  receivedAtMs: number;
}

// Form types
export interface LoginForm {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Utility types
export type LoadingState = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Chart types
export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TimeSeriesData {
  name: string;
  data: ChartDataPoint[];
}

// Gauge report (daily gauge day or 12-hour shift); levels in m, volumes in L
export type GaugeReportPeriod = "daily" | "day" | "night";

export interface GaugeReportLayer {
  opening: number | null;
  closing: number | null;
  removed: number;
  produced: number | null;
}

export interface GaugeReportPoint {
  at: string;
  level: number;
  interfaceLevel: number | null;
  totalL: number;
  oilL: number | null;
  waterL: number | null;
}

export interface GaugeReportTank {
  tankId: string;
  code: string;
  name: string;
  status: string;
  gaugeId: string | null;
  highLevelThreshold: number | null;
  hasInterface: boolean;
  opening: GaugeReportPoint | null;
  closing: GaugeReportPoint | null;
  total: GaugeReportLayer;
  oil: GaugeReportLayer | null;
  water: GaugeReportLayer | null;
  removals: { layer: "oil" | "water" | "total"; start: string; end: string; amountL: number }[];
  maxLevel: number | null;
  samples: number;
  longestGapMinutes: number;
  alarms: { highLevel: number; overflowRisk: number; offline: number; total: number };
}

export interface GaugeReport {
  period: {
    kind: GaugeReportPeriod;
    date: string;
    startHour: number;
    timeZone: string;
    start: string;
    end: string;
    hours: number;
  };
  generatedAt: string;
  deadbandInches: number;
  tanks: GaugeReportTank[];
  totals: {
    oilProducedL: number;
    waterProducedL: number;
    totalProducedL: number;
    oilRemovedL: number;
    waterRemovedL: number;
    totalRemovedL: number;
    oilClosingL: number;
    waterClosingL: number;
  };
}

export interface GaugeReportParams {
  period: GaugeReportPeriod;
  date?: string;
  startHour: number;
  tz: string;
}
