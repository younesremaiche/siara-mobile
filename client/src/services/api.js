import { API_BASE_URL } from '../config/api';
import { getStoredAccessToken } from './sessionStorage';

let unauthorizedHandler = null;

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function shouldJsonEncode(body) {
  return body != null
    && typeof body === 'object'
    && !(body instanceof FormData);
}

async function parseResponseBody(response) {
  const rawText = await response.text().catch(() => '');
  if (!rawText) {
    return null;
  }

  const contentType = response.headers?.get?.('content-type') || '';

  if (__DEV__) {
    console.info('[api] response_body_check', {
      status: response.status,
      contentType,
      textLength: rawText.length,
      textPreview: rawText.substring(0, 100),
    });
  }

  // If content-type is JSON, parse it
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText);
    } catch (error) {
      if (__DEV__) {
        console.error('[api] json_parse_error', {
          message: error.message,
          textPreview: rawText.substring(0, 200),
        });
      }
      throw new Error(`JSON Parse error: ${error.message}`);
    }
  }

  // If it looks like HTML (starts with < or contains <!DOCTYPE), it's an error page
  if (rawText.trim().startsWith('<')) {
    if (__DEV__) {
      console.error('[api] received_html_instead_of_json', {
        status: response.status,
        contentType,
        textPreview: rawText.substring(0, 200),
      });
    }
    throw new Error('Backend returned HTML instead of JSON. Status: ' + response.status);
  }

  // Otherwise try to parse as JSON anyway
  try {
    return JSON.parse(rawText);
  } catch (error) {
    if (__DEV__) {
      console.error('[api] unexpected_response_format', {
        contentType,
        textPreview: rawText.substring(0, 200),
      });
    }
    return rawText;
  }
}

function buildErrorMessage(status, payload) {
  if (payload && typeof payload === 'object') {
    return payload.message || payload.error || `API ${status}`;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return `API ${status}`;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

async function request(path, options = {}) {
  const {
    authToken = null,
    withAuth = false,
    headers: optionHeaders = {},
    body,
    method: optionMethod = 'GET',
    ...fetchOptions
  } = options;
  const method = String(optionMethod).toUpperCase();
  const url = buildUrl(path);
  const token = authToken || (withAuth ? await getStoredAccessToken() : null);
  const headers = {
    ...(shouldJsonEncode(body) ? { 'Content-Type': 'application/json' } : {}),
    ...optionHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (__DEV__) {
    console.info('[api] request', { method, url });
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      method,
      headers,
      body: shouldJsonEncode(body) ? JSON.stringify(body) : body,
    });

    const data = await parseResponseBody(response);
    if (!response.ok) {
      if (__DEV__) {
        console.warn('[api] response_error', {
          method,
          url,
          status: response.status,
          body: data,
        });
      }

      const error = new Error(buildErrorMessage(response.status, data));
      error.status = response.status;
      error.response = {
        status: response.status,
        data,
      };

      if (
        (response.status === 401 || response.status === 403)
        && unauthorizedHandler
        && (withAuth || Boolean(authToken) || Boolean(token))
      ) {
        Promise.resolve(unauthorizedHandler(error)).catch(() => {});
      }

      throw error;
    }

    return data;
  } catch (error) {
    if (!error?.status && __DEV__) {
      console.error('[api] network_error', {
        method,
        url,
        message: error?.message || 'Network request failed',
      });
    }

    throw error;
  }
}

export { request };

export function checkApiHealth() {
  return request('/health');
}

// ─── Risk / Prediction endpoints ─────────────────────────

export async function predictDriverRisk(data) {
  return request('/api/model/predict', {
    method: 'POST',
    body: data,
  });
}

export async function getCurrentRisk(lat, lon) {
  return request('/api/risk/current', {
    method: 'POST',
    body: { lat, lon },
  });
}

export async function getRiskOverlay(data) {
  return request('/api/risk/overlay', {
    method: 'POST',
    body: data,
  });
}

export async function getRiskExplanation(data) {
  return request('/api/risk/explain', {
    method: 'POST',
    body: data,
  });
}

export async function getNearbyZones(lat, lon, options = {}) {
  return request('/api/risk/nearby-zones', {
    method: 'POST',
    body: { lat, lon, ...options },
  });
}

export async function getRouteGuide(data) {
  return request('/api/risk/route', {
    method: 'POST',
    body: data,
  });
}

// ─── Weather endpoints ───────────────────────────────────

export async function getCurrentWeather(lat, lon) {
  return request(`/api/weather/current?lat=${lat}&lon=${lon}`);
}

export async function getRiskForecast24h(lat, lon) {
  return request(`/api/risk/forecast24h?lat=${lat}&lon=${lon}`);
}
