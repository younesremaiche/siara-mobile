import { API_BASE_URL } from '../config/api';
import { getStoredAccessToken } from './sessionStorage';

// Called when API returns 401 or 403 (unauthorized)
let unauthorizedHandler = null;
let inMemoryAccessToken = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setInMemoryAccessToken(token) {
  inMemoryAccessToken = token || null;
}

export async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const { withAuth = false, accessToken = null, ...fetchOptions } = options;

  const isFormDataBody =
    typeof FormData !== 'undefined'
    && fetchOptions.body instanceof FormData;

  let headers = {
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  };

  if (isFormDataBody && headers['Content-Type']) {
    delete headers['Content-Type'];
  }

  // Add Bearer token if withAuth is true
  if (withAuth) {
    const token = accessToken || inMemoryAccessToken || await getStoredAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (__DEV__) {
    console.log(`[api] ${fetchOptions.method || 'GET'} ${url}`, {
      headers: { ...headers, Authorization: headers.Authorization ? '***' : undefined },
    });
  }

  const res = await fetch(url, {
    headers,
    ...fetchOptions,
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  let body = '';
  try {
    if (isJson) {
      body = await res.json();
    } else {
      body = await res.text().catch(() => '');
    }
  } catch (error) {
    body = await res.text().catch(() => '');
  }

  if (!res.ok) {
    if (__DEV__) {
      console.warn(`[api] Error ${res.status}`, {
        url,
        status: res.status,
        contentType,
        body: typeof body === 'string' ? body.substring(0, 200) : body,
      });
    }

    // Create error with status code for app to handle specially
    const errorMessage = typeof body === 'string' 
      ? `API ${res.status}: ${body}` 
      : `API ${res.status}: ${body?.message || 'Error'}`;
    
    const error = new Error(errorMessage);
    error.status = res.status;
    error.code = body?.code;
    error.response = body;

    // Handle 401 Unauthorized and 403 Forbidden (but don't throw yet - let caller decide)
    if ((res.status === 401 || res.status === 403) && unauthorizedHandler) {
      // Only call handler for 401, not for 403 with EMAIL_VERIFICATION_REQUIRED
      if (res.status === 401 || body?.code !== 'EMAIL_VERIFICATION_REQUIRED') {
        unauthorizedHandler();
      }
    }

    throw error;
  }

  if (__DEV__) {
    console.log(`[api] Response ${res.status}`, {
      contentType,
      hasBody: !!body,
    });
  }

  return body;
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
