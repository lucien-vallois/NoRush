import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import {
  AuthResponse,
  User,
  Tank,
  Sensor,
  Reading,
  Alert,
  PaginatedResponse,
  AlertsPaginatedResponse,
  TankForecast,
  GaugeReport,
  GaugeReportParams,
} from "../types";
import i18n from "../i18n";
import { getUnitSystem } from "../i18n/units.ts";

class ApiService {
  private api: AxiosInstance;
  private refreshPromise: Promise<AuthResponse> | null = null;
  private baseURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - Add auth token + UI language (Accept-Language)
    this.api.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // O backend devolve alertas e mensagens de erro neste idioma
        config.headers["Accept-Language"] = i18n.language;
        // ...e compõe alertas neste sistema de unidades (métrico/imperial)
        if (config.params === undefined) config.params = {};
        if (config.params.units === undefined) {
          config.params.units = getUnitSystem();
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor - Handle common errors
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const request = error.config;
        const isAuthRequest =
          request?.url?.startsWith("/auth/login") ||
          request?.url?.startsWith("/auth/refresh");
        if (
          error.response?.status === 401 &&
          !isAuthRequest &&
          request &&
          !request._retried
        ) {
          request._retried = true;
          try {
            if (!this.refreshPromise) {
              this.refreshPromise = this.refreshToken().finally(() => {
                this.refreshPromise = null;
              });
            }
            await this.refreshPromise;
            return this.api.request(request);
          } catch {
            this.clearAuthToken();
            if (window.location.pathname !== "/login")
              window.location.assign("/login");
          }
        }
        return Promise.reject(error);
      },
    );
  }

  private getAuthToken(): string | null {
    return localStorage.getItem("auth_token");
  }

  private setAuthToken(token: string): void {
    localStorage.setItem("auth_token", token);
    window.dispatchEvent(new Event("norush:token"));
  }

  private clearAuthToken(): void {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("norush:token"));
  }

  // Auth methods
  async login(credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const response = await this.api.post<AuthResponse>(
      "/auth/login",
      credentials,
    );
    const { accessToken, refreshToken, user } = response.data;

    this.setAuthToken(accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));

    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post("/auth/logout");
    } finally {
      this.clearAuthToken();
    }
  }

  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await this.api.post<AuthResponse>("/auth/refresh", {
      refreshToken,
    });
    const { accessToken } = response.data;

    this.setAuthToken(accessToken);
    localStorage.setItem("refresh_token", response.data.refreshToken);

    return response.data;
  }

  async getProfile(): Promise<User> {
    const response = await this.api.get<User>("/auth/profile");
    return response.data;
  }

  // Tank methods
  async getTanks(filters?: any): Promise<Tank[]> {
    const response = await this.api.get<Tank[]>("/tanks", { params: filters });
    return response.data;
  }

  async getTank(id: string): Promise<Tank> {
    const response = await this.api.get<Tank>(`/tanks/${id}`);
    return response.data;
  }

  async getTankStats(id: string): Promise<any> {
    const response = await this.api.get(`/tanks/${id}/stats`);
    return response.data;
  }

  async createTank(
    tank: import("../utils/tankForm.ts").TankPayload,
  ): Promise<Tank> {
    const response = await this.api.post<Tank>("/tanks", tank);
    return response.data;
  }

  async updateTank(
    id: string,
    tank: Partial<Tank> | import("../utils/tankForm.ts").TankPayload,
  ): Promise<Tank> {
    const response = await this.api.patch<Tank>(`/tanks/${id}`, tank);
    return response.data;
  }

  async deleteTank(id: string): Promise<void> {
    await this.api.delete(`/tanks/${id}`);
  }

  // Sensor methods
  async getSensors(filters?: any): Promise<Sensor[]> {
    const response = await this.api.get<Sensor[]>("/sensors", {
      params: filters,
    });
    return response.data;
  }

  async getSensor(id: string): Promise<Sensor> {
    const response = await this.api.get<Sensor>(`/sensors/${id}`);
    return response.data;
  }

  async getSensorStats(id: string): Promise<any> {
    const response = await this.api.get(`/sensors/${id}/stats`);
    return response.data;
  }

  async createSensor(
    sensor: Omit<Sensor, "id" | "createdAt" | "updatedAt">,
  ): Promise<Sensor> {
    const response = await this.api.post<Sensor>("/sensors", sensor);
    return response.data;
  }

  async updateSensor(id: string, sensor: Partial<Sensor>): Promise<Sensor> {
    const response = await this.api.patch<Sensor>(`/sensors/${id}`, sensor);
    return response.data;
  }

  async deleteSensor(id: string): Promise<void> {
    await this.api.delete(`/sensors/${id}`);
  }

  // Device provisioning (admin): o secret só volta nestas respostas
  async getDevicesAuthMode(): Promise<"shared" | "device" | "hybrid" | null> {
    const response = await this.api.get("/devices");
    return response.data?.authMode ?? null;
  }

  async provisionDevice(
    dto: import("../types").ProvisionDeviceRequest,
  ): Promise<import("../types").DeviceCredential> {
    const response = await this.api.post("/devices", dto);
    return response.data;
  }

  async rotateDeviceCredential(
    sensorId: string,
  ): Promise<import("../types").DeviceCredential> {
    const response = await this.api.post(
      `/devices/${encodeURIComponent(sensorId)}/credentials`,
    );
    return response.data;
  }

  async revokeDeviceCredential(sensorId: string): Promise<void> {
    await this.api.delete(`/devices/${encodeURIComponent(sensorId)}/credentials`);
  }

  // Reading methods
  async getReadings(filters?: any): Promise<PaginatedResponse<Reading>> {
    const response = await this.api.get<PaginatedResponse<Reading>>(
      "/readings",
      { params: filters },
    );
    return response.data;
  }

  async getReading(id: string): Promise<Reading> {
    const response = await this.api.get<Reading>(`/readings/${id}`);
    return response.data;
  }

  async getReadingsBySensor(
    sensorId: string,
    filters?: any,
  ): Promise<PaginatedResponse<Reading>> {
    const response = await this.api.get<PaginatedResponse<Reading>>(
      `/readings/sensor/${sensorId}`,
      { params: filters },
    );
    return response.data;
  }

  async getReadingsByTank(
    tankId: string,
    filters?: any,
  ): Promise<PaginatedResponse<Reading>> {
    const response = await this.api.get<PaginatedResponse<Reading>>(
      `/readings/tank/${tankId}`,
      { params: filters },
    );
    return response.data;
  }

  async getLatestReadings(sensorId: string, limit = 10): Promise<Reading[]> {
    const response = await this.api.get<Reading[]>(
      `/readings/sensor/${sensorId}/latest`,
      {
        params: { limit },
      },
    );
    return response.data;
  }

  async getLatestReadingsByTank(
    tankId: string,
    limit = 10,
  ): Promise<Reading[]> {
    const response = await this.api.get<Reading[]>(
      `/readings/tank/${tankId}/latest`,
      { params: { limit } },
    );
    return response.data;
  }

  async getReadingStats(
    sensorId?: string,
    tankId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (sensorId) params.append("sensorId", sensorId);
    if (tankId) params.append("tankId", tankId);
    if (startDate) params.append("startDate", startDate.toISOString());
    if (endDate) params.append("endDate", endDate.toISOString());

    const response = await this.api.get("/readings/global/stats", { params });
    return response.data;
  }

  // Alert methods
  async getAlerts(filters?: any): Promise<AlertsPaginatedResponse> {
    const response = await this.api.get<AlertsPaginatedResponse>("/alerts", {
      params: filters,
    });
    return response.data;
  }

  async getAlert(id: string): Promise<Alert> {
    const response = await this.api.get<Alert>(`/alerts/${id}`);
    return response.data;
  }

  async getActiveAlerts(): Promise<Alert[]> {
    const response = await this.api.get<Alert[]>("/alerts/active");
    return response.data;
  }

  async getCriticalAlerts(): Promise<Alert[]> {
    const response = await this.api.get<Alert[]>("/alerts/critical");
    return response.data;
  }

  async acknowledgeAlert(id: string, notes?: string): Promise<Alert> {
    const response = await this.api.post<Alert>(`/alerts/${id}/acknowledge`, {
      notes,
    });
    return response.data;
  }

  async resolveAlert(id: string, resolutionNotes?: string): Promise<Alert> {
    const response = await this.api.post<Alert>(`/alerts/${id}/resolve`, {
      resolutionNotes,
    });
    return response.data;
  }

  async bulkAcknowledge(alertIds: string[], notes?: string): Promise<Alert[]> {
    const response = await this.api.post<Alert[]>("/alerts/bulk/acknowledge", {
      alertIds,
      notes,
    });
    return response.data;
  }

  async bulkResolve(
    alertIds: string[],
    resolutionNotes?: string,
  ): Promise<Alert[]> {
    const response = await this.api.post<Alert[]>("/alerts/bulk/resolve", {
      alertIds,
      resolutionNotes,
    });
    return response.data;
  }

  async getAlertStats(): Promise<any> {
    const response = await this.api.get("/alerts/dashboard");
    return response.data;
  }

  // Dashboard methods
  async getDashboardStats(): Promise<any> {
    const response = await this.api.get("/sensors/dashboard");
    return response.data;
  }

  async getHealth(): Promise<import("../types").SystemHealth> {
    const response = await this.api.get("/health");
    return response.data;
  }

  async getMeta(): Promise<import("../types").ApiMeta> {
    const response = await this.api.get("/meta");
    return response.data;
  }

  // Prediction methods
  async getPredictions(): Promise<TankForecast[]> {
    const response = await this.api.get<TankForecast[]>("/predictions");
    return response.data;
  }

  // Gauge report: daily gauge day or 12-hour shift
  async getGaugeReport(params: GaugeReportParams): Promise<GaugeReport> {
    const response = await this.api.get<GaugeReport>("/gauge-reports", { params });
    return response.data;
  }

  /** CSV in the console's unit system; the file name is built here (the header is not exposed cross-origin). */
  async downloadGaugeReportCsv(params: GaugeReportParams): Promise<Blob> {
    const response = await this.api.get("/gauge-reports/csv", {
      params: { ...params, units: getUnitSystem() },
      responseType: "blob",
    });
    return response.data as Blob;
  }

  // Timeseries (TimescaleDB continuous aggregates)
  async getTimeseries(params: {
    sensorId?: string;
    tankId?: string;
    bucket?: "5m" | "1h" | "raw";
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ bucket: string; view?: string; count: number; series: any[] }> {
    const response = await this.api.get("/readings/timeseries", { params });
    return response.data;
  }

  // IoT Gateway methods
  async getGatewayStats(): Promise<any> {
    const response = await this.api.get("/iot/gateway/stats");
    return response.data;
  }

  async getGatewayHealth(): Promise<any> {
    const response = await this.api.get("/iot/gateway/health");
    return response.data;
  }

  async simulateSensorData(
    sensorId: string,
    protocol: "mqtt" | "http" = "mqtt",
    count = 1,
  ): Promise<any> {
    const response = await this.api.post("/iot/test/simulate", null, {
      params: { sensorId, protocol, count },
    });
    return response.data;
  }

  // Generic request method
  async request<T = any>(
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.api.request<T>(config);
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
