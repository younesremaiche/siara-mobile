import {
  API_BASE_URL,
  getApiBaseUrlDiagnostics,
  logResolvedApiBaseUrl,
} from '../config/api';
import { STREAM_STATUS_LABELS } from '../constants/driverQuiz';
import { predictDriverRisk } from './api';

const STILL_WAITING_MS = 10_000;
// gemma3:4b on CPU takes ~130s to generate the explanation (plus a possible
// cold model load). Give it real headroom while staying under the upstream
// caps (Node proxy + Flask both allow 300s).
const STREAM_HARD_TIMEOUT_MS = 240_000;
const PREDICT_HARD_TIMEOUT_MS = 240_000;

// Ollama explanation generation can fail (model offline, timeout, 500). The
// quiz prediction itself is independent and may already be in hand via the
// interim `result` event. Treat these codes as recoverable: complete the quiz
// with a fallback explanation rather than failing the submission.
const OLLAMA_FALLBACK_CODES = new Set([
  'OLLAMA_REQUEST_FAILED',
  'OLLAMA_TIMEOUT',
  'OLLAMA_ERROR',
  'OLLAMA_STREAM_ERROR',
  'OLLAMA_UNEXPECTED_ERROR',
  'LLM_PROVIDER_UNSUPPORTED',
]);
const FALLBACK_EXPLANATION_TEXT =
  'Your result was calculated successfully. SIARA could not generate a detailed AI explanation right now, so this summary is based on your quiz score and risk category.';

function logQuizDebug(label, payload) {
  if (!__DEV__) {
    return;
  }

  console.info(`[quizService] ${label}`, payload);
}

function logQuizError(label, payload) {
  if (!__DEV__) {
    return;
  }

  console.error(`[quizService] ${label}`, payload);
}

function emitDiagnostics(handlers, patch) {
  handlers?.onDiagnostics?.(patch);
}

function safeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildQuizApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function createTimeoutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abortWithReason(controller, reason) {
  if (!controller || controller.signal?.aborted) {
    return;
  }

  try {
    controller.abort(reason);
  } catch (_error) {
    controller.abort();
  }
}

function normalizeAbortError(error, code, fallbackMessage) {
  if (error?.name !== 'AbortError') {
    return error;
  }

  const normalized = new Error(error?.message || fallbackMessage);
  normalized.code = code;
  return normalized;
}

function normalizeProbabilities(probabilities) {
  if (!probabilities || typeof probabilities !== 'object') {
    return null;
  }

  const entries = Object.entries(probabilities)
    .map(([label, value]) => [label, safeNumber(value)])
    .filter(([, value]) => value != null);

  if (!entries.length) {
    return null;
  }

  return Object.fromEntries(entries);
}

function tryParseJsonString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return value;
  }
}

function normalizeStructuredExplanation(value) {
  const parsedValue = tryParseJsonString(value);
  return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
    ? parsedValue
    : null;
}

function mergeExplanationFields(payload, overrides = {}) {
  const basePayload = payload && typeof payload === 'object' ? payload : {};
  const resultPayload =
    basePayload.result && typeof basePayload.result === 'object' ? basePayload.result : {};

  return {
    ...resultPayload,
    ...basePayload,
    ...overrides,
  };
}

export function normalizeQuizPredictionResponse(response) {
  const payload = response && typeof response === 'object' ? response : {};
  const mergedPayload = mergeExplanationFields(payload);

  return {
    risk_label: mergedPayload.risk_label || null,
    risk_percent: safeNumber(mergedPayload.risk_percent),
    risk_score: safeNumber(mergedPayload.risk_score),
    explanation_text: mergedPayload.explanation_text || null,
    advice_text: mergedPayload.advice_text || null,
    structured_explanation: normalizeStructuredExplanation(
      mergedPayload.structured_explanation
      || mergedPayload.structuredExplanation
      || mergedPayload.explanation_structured
      || mergedPayload.explanation,
    ),
    explanation_status:
      mergedPayload.explanation_status
      || mergedPayload.status
      || mergedPayload.explanationState
      || null,
    fallback:
      mergedPayload.fallback
      ?? mergedPayload.explanation_fallback
      ?? mergedPayload.used_fallback
      ?? mergedPayload.usedFallback
      ?? null,
    explanation_source:
      mergedPayload.explanation_source
      || mergedPayload.explanationSource
      || null,
    deterministic_advice:
      mergedPayload.deterministic_advice
      || mergedPayload.deterministicAdvice
      || mergedPayload.fallback_advice
      || null,
    class_probabilities: normalizeProbabilities(mergedPayload.class_probabilities),
    xai: mergedPayload.xai && typeof mergedPayload.xai === 'object' ? mergedPayload.xai : null,
    raw: mergedPayload,
  };
}

async function parseErrorResponse(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return json?.error || json?.message || JSON.stringify(json);
    }
    return await response.text();
  } catch (_error) {
    return `HTTP ${response.status}`;
  }
}

function createHttpError(status, message) {
  const error = new Error(message || `HTTP ${status}`);
  error.status = status;
  return error;
}

function createDetailedError(message, { code = null, status = null, response = null } = {}) {
  const error = new Error(message || 'Request failed');
  if (code) {
    error.code = code;
  }
  if (status != null) {
    error.status = status;
  }
  if (response != null) {
    error.response = response;
  }
  return error;
}

function parseSseBlock(block) {
  const lines = String(block || '').replace(/\r/g, '').split('\n');
  let event = 'message';
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  if (!dataLines.length) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch (_error) {
    return { event, data: { raw: dataLines.join('\n') } };
  }
}

function createStreamFormatParser(contentType, onEvent) {
  const normalizedContentType = String(contentType || '').toLowerCase();
  const format = normalizedContentType.includes('text/event-stream')
    ? 'sse'
    : normalizedContentType.includes('application/x-ndjson')
      || normalizedContentType.includes('application/ndjson')
      || normalizedContentType.includes('application/jsonl')
      ? 'ndjson'
      : 'text';
  let buffer = '';

  return {
    format,
    push(chunk) {
      if (!chunk) {
        return;
      }

      if (format === 'text') {
        onEvent('chunk', { content: chunk });
        return;
      }

      buffer += chunk;
      const boundaryToken = format === 'sse' ? '\n\n' : '\n';
      let boundaryIndex = buffer.indexOf(boundaryToken);

      while (boundaryIndex !== -1) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + boundaryToken.length);

        if (format === 'sse') {
          const parsed = parseSseBlock(block);
          if (parsed) {
            onEvent(parsed.event, parsed.data);
          }
        } else {
          const trimmedBlock = block.trim();
          if (trimmedBlock) {
            try {
              const parsed = JSON.parse(trimmedBlock);
              onEvent(parsed.event || 'message', parsed.data ?? parsed);
            } catch (_error) {
              onEvent('chunk', { content: trimmedBlock });
            }
          }
        }

        boundaryIndex = buffer.indexOf(boundaryToken);
      }
    },
    flush() {
      const trailing = buffer.trim();
      buffer = '';
      if (!trailing) {
        return;
      }

      if (format === 'sse') {
        const parsed = parseSseBlock(trailing);
        if (parsed) {
          onEvent(parsed.event, parsed.data);
        }
        return;
      }

      if (format === 'ndjson') {
        try {
          const parsed = JSON.parse(trailing);
          onEvent(parsed.event || 'message', parsed.data ?? parsed);
        } catch (_error) {
          onEvent('chunk', { content: trailing });
        }
        return;
      }

      onEvent('chunk', { content: trailing });
    },
  };
}

function createRequestTimers({
  controller,
  stillWaitingMs,
  hardTimeoutMs,
  onStillWaiting,
  onHardTimeout,
}) {
  const timers = [];

  if (stillWaitingMs > 0) {
    timers.push(
      setTimeout(() => {
        onStillWaiting?.();
      }, stillWaitingMs),
    );
  }

  if (hardTimeoutMs > 0) {
    timers.push(
      setTimeout(() => {
        onHardTimeout?.();
        abortWithReason(controller, 'request-timeout');
      }, hardTimeoutMs),
    );
  }

  return () => {
    timers.forEach((timer) => clearTimeout(timer));
  };
}

async function streamFetchResponse(response, onEvent) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const unsupportedError = new Error(
      'Readable stream is not available in this React Native runtime.',
    );
    unsupportedError.code = 'STREAM_UNSUPPORTED';
    throw unsupportedError;
  }

  const contentType = response.headers?.get?.('content-type') || 'text/event-stream';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createStreamFormatParser(contentType, onEvent);

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    parser.push(decoder.decode(value, { stream: true }));
  }

  parser.push(decoder.decode());
  parser.flush();
}

async function streamXmlHttpRequest(url, payload, controller, onEvent) {
  if (typeof XMLHttpRequest === 'undefined') {
    const unsupportedError = new Error(
      'XMLHttpRequest streaming is not available in this React Native runtime.',
    );
    unsupportedError.code = 'STREAM_UNSUPPORTED';
    throw unsupportedError;
  }

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let contentType = 'text/event-stream';
    let parser = null;
    let processedLength = 0;
    let finished = false;

    const cleanup = () => {
      if (controller?.signal && abortListener) {
        controller.signal.removeEventListener('abort', abortListener);
      }
      xhr.onprogress = null;
      xhr.onreadystatechange = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.onabort = null;
      xhr.ontimeout = null;
    };

    const settle = (callback, value) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      callback(value);
    };

    const processNewText = () => {
      if (!parser) {
        parser = createStreamFormatParser(contentType, onEvent);
      }
      const nextText = xhr.responseText?.slice(processedLength) || '';
      if (!nextText) {
        return;
      }
      processedLength = xhr.responseText.length;
      parser.push(nextText);
    };

    const abortListener = () => {
      try {
        xhr.abort();
      } catch (_error) {
        // ignore abort exceptions from already-finished requests
      }
    };

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.responseType = 'text';
    xhr.timeout = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) {
        contentType = xhr.getResponseHeader('content-type') || contentType;
        processNewText();
      }
    };

    xhr.onprogress = () => {
      processNewText();
    };

    xhr.onload = () => {
      processNewText();
      parser?.flush();

      if (xhr.status >= 200 && xhr.status < 300) {
        settle(resolve);
        return;
      }

      settle(
        reject,
        createHttpError(xhr.status, xhr.responseText || `HTTP ${xhr.status}`),
      );
    };

    xhr.onerror = () => {
      settle(
        reject,
        createDetailedError(
          'The live explanation request failed before the stream could be read.',
          { code: 'STREAM_XHR_FAILED' },
        ),
      );
    };

    xhr.onabort = () => {
      const abortError = new Error('The live explanation stream was aborted.');
      abortError.name = 'AbortError';
      settle(reject, abortError);
    };

    xhr.ontimeout = () => {
      settle(
        reject,
        createTimeoutError(
          'STREAM_TIMEOUT',
          'The live explanation stream timed out.',
        ),
      );
    };

    if (controller?.signal) {
      if (controller.signal.aborted) {
        abortListener();
        return;
      }
      controller.signal.addEventListener('abort', abortListener, { once: true });
    }

    xhr.send(JSON.stringify(payload));
  });
}

function createStreamState() {
  return {
    streamedExplanation: '',
    finalResult: null,
    interimResult: null,
    streamError: null,
    streamErrorCode: null,
    streamErrorData: null,
    chunkCount: 0,
  };
}

function handleStreamEvent(event, data, state, handlers) {
  logQuizDebug('stream_event', {
    event,
    status: data?.status || null,
    message: data?.message || null,
    fallback: data?.fallback ?? null,
  });
  emitDiagnostics(handlers, {
    lastSseEvent: event,
  });

  if (event === 'status') {
    const nextStatus =
      data?.message || STREAM_STATUS_LABELS[data?.status] || 'Working on explanation...';
    handlers?.onStatus?.(nextStatus);
      emitDiagnostics(handlers, {
        streamStarted: true,
        requestMode: 'stream',
        currentStatus: nextStatus,
        stillWaiting: false,
      });
    return;
  }

  if (event === 'result') {
    const normalizedResult = normalizeQuizPredictionResponse(data);
    state.interimResult = normalizedResult;
    handlers?.onResult?.(normalizedResult, { interim: true });
    emitDiagnostics(handlers, {
      streamStarted: true,
      requestMode: 'stream',
      interimResultReceived: true,
    });
    return;
  }

  if (event === 'chunk') {
    const content = typeof data?.content === 'string' ? data.content : '';
    if (content) {
      state.streamedExplanation += content;
      state.chunkCount += 1;
      handlers?.onChunk?.({
        content,
        explanationText: state.streamedExplanation,
      });
      logQuizDebug('stream_chunk_received', {
        chunkCount: state.chunkCount,
      });
      emitDiagnostics(handlers, {
        chunkReceived: true,
        chunkCount: state.chunkCount,
      });
    }
    return;
  }

  if (event === 'done') {
    const mergedPayload = mergeExplanationFields(data, {
      explanation_text:
        data?.explanation_text
        || data?.result?.explanation_text
        || state.streamedExplanation
        || null,
      structured_explanation:
        data?.structured_explanation || data?.result?.structured_explanation || null,
      explanation_status: STREAM_STATUS_LABELS.done,
    });

    state.finalResult = normalizeQuizPredictionResponse(mergedPayload);
    logQuizDebug('stream_done', {
      hasExplanation: Boolean(state.finalResult?.explanation_text),
    });
    handlers?.onStatus?.(STREAM_STATUS_LABELS.done);
    handlers?.onDone?.(state.finalResult);
    emitDiagnostics(handlers, {
      finalResultReceived: true,
      requestMode: 'stream',
      currentStatus: STREAM_STATUS_LABELS.done,
    });
    return;
  }

  if (event === 'error') {
    const code = data?.code || null;
    // Ollama-only failures are recoverable: the prediction succeeded (interim
    // result was already received), only the optional AI explanation failed.
    // Synthesize a fallback `done` so the quiz still completes normally. This
    // mirrors the backend fix for clients running against an older backend
    // that hasn't been redeployed yet.
    if (OLLAMA_FALLBACK_CODES.has(code) && state.interimResult) {
      const fallbackText = data?.fallback_text || FALLBACK_EXPLANATION_TEXT;
      const merged = mergeExplanationFields(
        { ...(state.interimResult.raw || {}), ...data },
        {
          explanation_text: fallbackText,
          structured_explanation: null,
          explanation_status: STREAM_STATUS_LABELS.done,
          fallback: true,
          explanation_source: 'fallback',
          explanation_error: { code, message: data?.error, details: data?.details },
        },
      );
      const fallbackResult = normalizeQuizPredictionResponse(merged);
      state.streamedExplanation = fallbackText;
      state.finalResult = fallbackResult;
      logQuizDebug('stream_fallback_after_error', {
        code,
        message: data?.error || null,
      });
      handlers?.onChunk?.({
        content: fallbackText,
        explanationText: fallbackText,
      });
      handlers?.onStatus?.(STREAM_STATUS_LABELS.done);
      handlers?.onDone?.(fallbackResult);
      emitDiagnostics(handlers, {
        finalResultReceived: true,
        fallbackTriggered: true,
        requestMode: 'stream',
        currentStatus: STREAM_STATUS_LABELS.done,
      });
      return;
    }

    state.streamError = data?.error || data?.message || 'Live explanation stream failed';
    state.streamErrorCode = code || 'STREAM_ERROR_EVENT';
    state.streamErrorData = data;
    handlers?.onError?.(state.streamError, data);
    logQuizError('stream_error_event', {
      message: state.streamError,
      code: state.streamErrorCode,
      details: data?.details || null,
    });
    handlers?.onStatus?.(state.streamError);
    emitDiagnostics(handlers, {
      requestMode: 'error',
      currentStatus: state.streamError,
    });
  }
}

export function getQuizFriendlyErrorMessage(error) {
  const message = String(error?.message || '').trim();

  if (
    error?.code === 'STREAM_TIMEOUT'
    || message.toLowerCase().includes('timed out')
  ) {
    return 'Ollama did not return a response in time. Please retry after the local model finishes loading.';
  }

  if (error?.code === 'NO_FINAL_RESULT') {
    return 'The live Ollama stream ended before a final explanation was returned.';
  }

  if (message.toLowerCase().includes('ollama')) {
    return message;
  }

  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return 'Unable to reach the driver assessment service. Confirm EXPO_PUBLIC_API_BASE_URL points to a reachable backend and that Ollama is running on the backend machine.';
  }

  if (error?.status === 404) {
    return 'The driver assessment endpoint is not available on this backend yet.';
  }

  if (error?.status === 400) {
    return 'The driver assessment request was rejected. Please retry the quiz and submit again.';
  }

  if (message) {
    return message;
  }

  return 'The driver assessment could not be completed right now. Please try again.';
}

export async function predictDriverRiskQuiz(payload, options = {}) {
  const controller =
    options.controller
    || (typeof AbortController !== 'undefined' ? new AbortController() : null);
  const diagnostics = getApiBaseUrlDiagnostics();

  logResolvedApiBaseUrl();
  logQuizDebug('predict_request_start', {
    url: buildQuizApiUrl('/api/model/predict'),
    payload,
    diagnostics,
  });
  emitDiagnostics(options.handlers, {
    requestMode: 'predict',
    currentStatus: 'Starting Ollama prediction request...',
  });

  const clearTimers = createRequestTimers({
    controller,
    stillWaitingMs: 0,
    hardTimeoutMs: PREDICT_HARD_TIMEOUT_MS,
    onHardTimeout: () => {
      logQuizError('predict_timeout', {
        timeoutMs: PREDICT_HARD_TIMEOUT_MS,
      });
    },
  });

  try {
    const response = await predictDriverRisk(payload, {
      signal: controller?.signal,
    });
    const normalized = normalizeQuizPredictionResponse(response);
    logQuizDebug('predict_final_payload', normalized.raw || normalized);
    return normalized;
  } catch (error) {
    const normalizedError = normalizeAbortError(
      error,
      'PREDICT_TIMEOUT',
      'The Ollama prediction request timed out.',
    );
    throw normalizedError;
  } finally {
    clearTimers();
  }
}

export async function predictDriverRiskQuizStream(payload, handlers = {}, options = {}) {
  const diagnostics = getApiBaseUrlDiagnostics();
  const controller =
    options.controller
    || (typeof AbortController !== 'undefined' ? new AbortController() : null);
  const streamUrl = buildQuizApiUrl('/api/model/predict/stream');
  const shouldUseXhrStreaming =
    options.preferXhr
    ?? (
      typeof navigator !== 'undefined'
      && navigator.product === 'ReactNative'
      && typeof XMLHttpRequest !== 'undefined'
    );

  logResolvedApiBaseUrl();
  handlers?.onStatus?.(STREAM_STATUS_LABELS.starting);
  emitDiagnostics(handlers, {
    ...diagnostics,
    requestMode: 'stream',
    streamStarted: false,
    lastSseEvent: 'none',
    chunkReceived: false,
    chunkCount: 0,
    finalResultReceived: false,
    fallbackTriggered: false,
    stillWaiting: false,
    currentStatus: STREAM_STATUS_LABELS.starting,
  });
  logQuizDebug('stream_request_start', {
    url: streamUrl,
    payload,
    diagnostics,
  });

  const clearTimers = createRequestTimers({
    controller,
    stillWaitingMs: STILL_WAITING_MS,
    hardTimeoutMs: STREAM_HARD_TIMEOUT_MS,
    onStillWaiting: () => {
      const message =
        'Still waiting for the live explanation stream. We will keep trying a little longer.';
      handlers?.onStillWaiting?.(message);
      emitDiagnostics(handlers, {
        stillWaiting: true,
        currentStatus: message,
      });
      logQuizDebug('stream_still_waiting', {
        thresholdMs: STILL_WAITING_MS,
      });
    },
    onHardTimeout: () => {
      logQuizError('stream_timeout', {
        timeoutMs: STREAM_HARD_TIMEOUT_MS,
      });
    },
  });

  try {
    const state = createStreamState();

    if (shouldUseXhrStreaming) {
      logQuizDebug('stream_transport_selected', {
        url: streamUrl,
        transport: 'xhr',
      });
      await streamXmlHttpRequest(streamUrl, payload, controller, (event, data) => {
        handleStreamEvent(event, data, state, handlers);
      });
    } else {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        signal: controller?.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorMessage = await parseErrorResponse(response);
        throw createHttpError(response.status, errorMessage);
      }

      const responseContentType = response.headers?.get?.('content-type') || null;
      const canUseFetchReader = Boolean(response.body && typeof response.body.getReader === 'function');
      logQuizDebug('stream_response_opened', {
        url: streamUrl,
        contentType: responseContentType,
        transport: canUseFetchReader ? 'fetch-reader' : 'unsupported',
      });

      if (!canUseFetchReader) {
        const unsupportedError = new Error(
          'Readable stream is not available in this runtime.',
        );
        unsupportedError.code = 'STREAM_UNSUPPORTED';
        throw unsupportedError;
      }

      await streamFetchResponse(response, (event, data) => {
        handleStreamEvent(event, data, state, handlers);
      });
    }

    if (!state.finalResult) {
      if (state.streamError) {
        throw createDetailedError(state.streamError, {
          code: state.streamErrorCode,
          response: state.streamErrorData,
        });
      }
      throw createTimeoutError(
        'NO_FINAL_RESULT',
        state.streamError || 'Live explanation stream ended before completion.',
      );
    }

    logQuizDebug('stream_final_payload', state.finalResult.raw || state.finalResult);
    handlers?.onResult?.(state.finalResult, { interim: false });
    return state.finalResult;
  } catch (streamError) {
    const normalizedStreamError = normalizeAbortError(
      streamError,
      'STREAM_TIMEOUT',
      'The live explanation stream timed out.',
    );
    logQuizError('caught_error', {
      mode: 'stream',
      message: normalizedStreamError?.message || String(normalizedStreamError),
      status: normalizedStreamError?.status ?? null,
      code: normalizedStreamError?.code ?? null,
    });
    handlers?.onError?.(
      normalizedStreamError?.message || 'The live explanation stream failed.',
      normalizedStreamError?.response || null,
    );
    emitDiagnostics(handlers, {
      requestMode: 'error',
      currentStatus: normalizedStreamError?.message || 'Live stream failed.',
    });
    throw normalizedStreamError;
  } finally {
    clearTimers();
  }
}
