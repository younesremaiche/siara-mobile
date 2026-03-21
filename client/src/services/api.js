import { API_BASE_URL } from '../config/api';

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Risk / Prediction endpoints ─────────────────────────

export async function predictDriverRisk(data) {
  return request('/api/model/predict', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getCurrentRisk(lat, lon) {
  return request('/api/risk/current', {
    method: 'POST',
    body: JSON.stringify({ lat, lon }),
  });
}

export async function getRiskOverlay(data) {
  return request('/api/risk/overlay', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRiskExplanation(data) {
  return request('/api/risk/explain', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getNearbyZones(lat, lon, options = {}) {
  return request('/api/risk/nearby-zones', {
    method: 'POST',
    body: JSON.stringify({ lat, lon, ...options }),
  });
}

export async function getRouteGuide(data) {
  return request('/api/risk/route', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Weather endpoints ───────────────────────────────────

export async function getCurrentWeather(lat, lon) {
  return request(`/api/weather/current?lat=${lat}&lon=${lon}`);
}

export async function getRiskForecast24h(lat, lon) {
  return request(`/api/risk/forecast24h?lat=${lat}&lon=${lon}`);
}
