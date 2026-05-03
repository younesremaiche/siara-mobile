import { request } from './api';

// Calls SIARA risk endpoint with the spec's payload shape: { lat, lng, timestamp }.
// The pre-existing api.js#getCurrentRisk sends { lat, lon } which the Node controller
// rejects (validateLatLng requires `lng`), so the live notification uses this helper.
export async function fetchCurrentRisk({ lat, lng, timestamp } = {}) {
  return request('/api/risk/current', {
    method: 'POST',
    body: JSON.stringify({
      lat,
      lng,
      timestamp: timestamp || new Date().toISOString(),
    }),
  });
}

export async function fetchCurrentWeather({ lat, lng } = {}) {
  return request(`/api/weather/current?lat=${lat}&lng=${lng}`);
}

// Normalizes the risk response into the small shape the notification needs.
export function pickRiskSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const percentRaw =
    raw.danger_percent ?? raw.risk_percent ?? raw.risk_score ?? raw.overall_risk_score ?? null;
  const labelRaw =
    raw.danger_level ?? raw.risk_label ?? raw.overall_risk_label ?? null;

  const percent = percentRaw == null ? null : Math.max(0, Math.min(100, Number(percentRaw)));
  const level = labelRaw ? String(labelRaw) : null;

  return {
    percent: Number.isFinite(percent) ? Math.round(percent) : null,
    level: level ? level[0].toUpperCase() + level.slice(1) : null,
  };
}

export function pickWeatherSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const temp = raw.temperature_2m ?? raw.temperature ?? raw.temp ?? null;
  const cond = raw.condition ?? raw.summary ?? raw.weather ?? raw.weather_description ?? null;
  const precipitation = raw.precipitation ?? null;

  const parts = [];
  if (cond) parts.push(String(cond));
  else if (precipitation != null && Number(precipitation) > 0) parts.push('Rain');
  if (temp != null && Number.isFinite(Number(temp))) parts.push(`${Math.round(Number(temp))}°C`);

  return parts.length ? parts.join(' · ') : null;
}
