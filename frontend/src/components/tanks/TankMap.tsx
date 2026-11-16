import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { formatHours } from '../../utils/format';
import { formatRateMH } from '../../utils/units.ts';
import { MarkerColor, TankView, formatMeters, OVERFLOW_CRITICAL_H } from './TankCard';

/** Alvo de foco do mapa (nonce garante re-trigger no re-clique) */
export interface MapFocus {
  lat: number;
  lng: number;
  nonce: number;
}

/** Sem tanques com coordenadas: EUA continental (unidades imperiais são o padrão) */
const FALLBACK_CENTER: [number, number] = [39.8, -98.6];
const FALLBACK_ZOOM = 4;
const MAP_ZOOM = 15;
const FOCUS_ZOOM = 17;
const FIT_MAX_ZOOM = 17;

type LatLng = [number, number];

/** Coordenadas válidas do tanque; null/vazio não vira (0, 0) */
function tankPosition(view: TankView): LatLng | null {
  const { latitude, longitude } = view.tank as { latitude: unknown; longitude: unknown };
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

const MARKER_FILL: Record<MarkerColor, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  slate: '#64748b',
};

interface TankMapProps {
  views: TankView[];
  focus: MapFocus | null;
  onSelectTank: (id: string) => void;
}

/** Move o mapa para o alvo quando `focus` muda */
const FlyToFocus: React.FC<{ focus: MapFocus | null }> = ({ focus }) => {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], FOCUS_ZOOM, { animate: true });
    }
  }, [focus, map]);
  return null;
};

/**
 * Enquadra todos os tanques quando o conjunto de posições muda (primeira carga,
 * tanque novo). Atualizações periódicas com as mesmas posições não mexem no mapa.
 */
const FitToTanks: React.FC<{ positions: LatLng[] }> = ({ positions }) => {
  const map = useMap();
  const fittedKey = useRef<string | null>(null);
  const key = positions.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (positions.length === 0 || fittedKey.current === key) return;
    fittedKey.current = key;
    if (positions.length === 1) {
      map.setView(positions[0], MAP_ZOOM);
    } else {
      map.fitBounds(positions, { padding: [40, 40], maxZoom: FIT_MAX_ZOOM });
    }
  }, [key, map, positions]);
  return null;
};

/**
 * Mapa Leaflet com um marcador circular por tanque.
 * Usa CircleMarker (SVG) para evitar o problema do ícone default em bundlers.
 */
const TankMap: React.FC<TankMapProps> = ({ views, focus, onSelectTank }) => {
  const { t } = useTranslation();
  const positioned = views
    .map((v) => ({ view: v, position: tankPosition(v) }))
    .filter((p): p is { view: TankView; position: LatLng } => p.position !== null);
  const positions = positioned.map((p) => p.position);
  return (
    <div className="h-full w-full">
      <MapContainer
        center={positions[0] ?? FALLBACK_CENTER}
        zoom={positions.length ? MAP_ZOOM : FALLBACK_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToTanks positions={positions} />
        <FlyToFocus focus={focus} />

        {positioned.map(({ view: v, position }) => {
          const eta = v.etaOverflowHours;
          return (
            <CircleMarker
              key={v.tank.id}
              center={position}
              radius={v.critical ? 13 : 10}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: MARKER_FILL[v.markerColor],
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div className="min-w-[190px] space-y-1.5 font-sans">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{v.tank.code}</p>
                    <p className="text-xs text-slate-500">{v.tank.name}</p>
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-700">
                    <p>
                      {t('tankMap.level')}:{' '}
                      <span className="font-semibold tabular-nums">
                        {formatMeters(v.level)}
                      </span>
                    </p>
                    <p>
                      {t('tankMap.pace')}:{' '}
                      <span className="font-semibold tabular-nums">
                        {v.forecast?.fillRateMH != null
                          ? formatRateMH(Number(v.forecast.fillRateMH))
                          : '—'}
                      </span>
                    </p>
                    <p>
                      {t('tankMap.etaOverflow')}:{' '}
                      {eta != null ? (
                        <span
                          className={`font-semibold tabular-nums ${
                            eta <= OVERFLOW_CRITICAL_H ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
                          ~{formatHours(eta)}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t('tankMap.noForecast')}</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTank(v.tank.id)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {t('tankMap.viewDetails')}
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default TankMap;
