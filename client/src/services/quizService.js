import { API_BASE_URL } from '../config/api';
import { STREAM_STATUS_LABELS } from '../constants/driverQuiz';
import { predictDriverRisk } from './api';

function safeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildQuizApiUrl(path) {
  return `${API_BASE_URL}${path}`;
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

async function readSseStream(response, onEvent) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(block);
        if (parsed) {
          onEvent(parsed.event, parsed.data);
        }
        boundary = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    const trailing = parseSseBlock(buffer);
    if (trailing) {
      onEvent(trailing.event, trailing.data);
    }
    return;
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    const blocks = String(text || '').replace(/\r/g, '').split('\n\n');
    blocks.forEach((block) => {
      const parsed = parseSseBlock(block);
      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
    });
    return;
  }

  const unsupportedError = new Error(
    'Readable stream is not available in this React Native runtime.',
  );
  unsupportedError.code = 'STREAM_UNSUPPORTED';
  throw unsupportedError;
}

function createStreamState() {
  return {
    streamedExplanation: '',
    finalResult: null,
    streamError: null,
    fallback: false,
  };
}

function handleStreamEvent(event, data, state, handlers) {
  if (event === 'status') {
    const nextStatus =
      data?.message || STREAM_STATUS_LABELS[data?.status] || 'Working on explanation...';
    handlers?.onStatus?.(nextStatus);
    if (data?.fallback) {
      state.fallback = true;
      handlers?.onFallback?.(true);
    }
    return;
  }

  if (event === 'result') {
    const normalizedResult = normalizeQuizPredictionResponse(data);
    handlers?.onResult?.(normalizedResult, { interim: true });
    return;
  }

  if (event === 'chunk') {
    const content = typeof data?.content === 'string' ? data.content : '';
    if (content) {
      state.streamedExplanation += content;
      handlers?.onChunk?.({
        content,
        explanationText: state.streamedExplanation,
      });
    }
    if (data?.fallback) {
      state.fallback = true;
      handlers?.onFallback?.(true);
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
      fallback:
        data?.fallback
        ?? data?.result?.fallback
        ?? state.fallback
        ?? null,
      explanation_status: STREAM_STATUS_LABELS.done,
    });

    state.finalResult = normalizeQuizPredictionResponse(mergedPayload);
    handlers?.onStatus?.(STREAM_STATUS_LABELS.done);
    handlers?.onDone?.(state.finalResult);
    return;
  }

  if (event === 'error') {
    state.streamError = data?.error || 'Live explanation stream failed';
    handlers?.onError?.(state.streamError);
  }
}

export function getQuizFriendlyErrorMessage(error) {
  const message = String(error?.message || '').trim();

  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return 'Unable to reach the driver assessment service. Confirm EXPO_PUBLIC_API_BASE_URL points to a reachable backend on the same network.';
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

export async function predictDriverRiskQuiz(payload) {
  const response = await predictDriverRisk(payload);
  return normalizeQuizPredictionResponse(response);
}

export async function predictDriverRiskQuizStream(payload, handlers = {}) {
  handlers?.onStatus?.(STREAM_STATUS_LABELS.starting);

  try {
    const response = await fetch(buildQuizApiUrl('/api/model/predict/stream'), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);
      throw createHttpError(response.status, errorMessage);
    }

    const state = createStreamState();
    await readSseStream(response, (event, data) => {
      handleStreamEvent(event, data, state, handlers);
    });

    if (!state.finalResult) {
      throw new Error(state.streamError || 'Live explanation stream ended before completion.');
    }

    handlers?.onResult?.(state.finalResult, { interim: false });
    return state.finalResult;
  } catch (streamError) {
    handlers?.onStreamFallback?.(streamError);

    const fallbackResponse = await predictDriverRiskQuiz(payload);
    const normalizedFallback = {
      ...fallbackResponse,
      explanation_status:
        fallbackResponse.explanation_status || STREAM_STATUS_LABELS.done,
    };

    handlers?.onStatus?.(normalizedFallback.explanation_status);
    handlers?.onDone?.(normalizedFallback);
    handlers?.onResult?.(normalizedFallback, { interim: false, fromFallback: true });
    return normalizedFallback;
  }
}
