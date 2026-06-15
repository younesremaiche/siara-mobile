import { API_BASE_URL } from '../config/api';
import { getStoredAccessToken } from './sessionStorage';

// Called when API returns 401 or 403 (unauthorized)
let unauthorizedHandler = null;
let inMemoryAccessToken = null;

// Default ceiling for a single request so a hung connection can't block a
// screen forever. Callers can override with `timeout` (ms) or disable with 0.
const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

// LLM (Ollama) explanation endpoints are slow and non-streaming. They must wait
// longer than the server's OLLAMA_EXPLAIN_TIMEOUT_MS budget (60s by default),
// otherwise the client aborts before the server returns its answer or fallback.
// If you raise OLLAMA_EXPLAIN_TIMEOUT_MS on the API to get full (non-fallback)
// Ollama output, raise this to stay above it.
export const LLM_REQUEST_TIMEOUT_MS = 90000;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setInMemoryAccessToken(token) {
  inMemoryAccessToken = token || null;
}

export async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const {
    withAuth = false,
    accessToken = null,
    headers: optionHeaders,
    signal: callerSignal = null,
    timeout = DEFAULT_REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;

  const isFormDataBody =
    typeof FormData !== 'undefined'
    && fetchOptions.body instanceof FormData;

  let headers = {
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    ...optionHeaders,
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

  headers = Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined && value !== null),
  );

  if (__DEV__) {
    const logHeaders = { ...headers };
    if (logHeaders.Authorization) logHeaders.Authorization = '***';
    console.log(`[api] ${fetchOptions.method || 'GET'} ${url}`, {
      headers: logHeaders,
    });
  }

  // Bound the request with a timeout while still honoring a caller-supplied
  // AbortSignal (services like riskService pass their own for cancellation).
  let timedOut = false;
  const timeoutController = new AbortController();
  const timeoutId = timeout
    ? setTimeout(() => { timedOut = true; timeoutController.abort(); }, timeout)
    : null;
  if (callerSignal) {
    if (callerSignal.aborted) timeoutController.abort();
    else callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  let res;
  try {
    res = await fetch(url, {
      headers,
      signal: timeoutController.signal,
      ...fetchOptions,
    });
  } catch (fetchError) {
    if (timedOut) {
      const timeoutError = new Error(`Request timed out after ${timeout}ms: ${path}`);
      timeoutError.status = 0;
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw fetchError;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

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
        // Pass status/code/body so the handler can distinguish an expired token
        // (401) from a forced re-login or account block (403 session_version /
        // ACCOUNT_BANNED / ACCOUNT_INACTIVE) and surface the right message.
        unauthorizedHandler({ status: res.status, code: body?.code, response: body });
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

export async function predictDriverRisk(data, options = {}) {
  return request('/api/model/predict', {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });
}

// NOTE: The former getCurrentRisk/getRiskOverlay/getRiskExplanation/
// getNearbyZones/getRouteGuide/getCurrentWeather/getRiskForecast24h helpers were
// removed — they were unused dead code, and getCurrentRisk sent a { lat, lon }
// body the backend rejects. Use riskService.js / weatherService.js /
// siaraRiskApi.js (the canonical, cached implementations) instead.
