// Driver-quiz REST persistence.
//
// The streaming prediction (score + Ollama explanation) lives in
// services/quizService.js. THIS module persists a completed attempt to the
// backend so the user's driver profile row (app.user_driver_quiz_profile)
// exists — that row is what powers the "Personalized" occurrence risk shown on
// the map's Current Occurrence Risk card. Without it, the occurrence endpoint
// finds no driver profile and returns only the model risk.
//
// Backend surface (api/contollers/driverQuiz.js):
//   POST /api/driver-quiz/start                  -> { attemptId, ... }
//   POST /api/driver-quiz/:attemptId/response    -> { answeredQuestions, ... }
//   POST /api/driver-quiz/:attemptId/complete    -> completed attempt + profile
//   GET  /api/driver-quiz/me/profile             -> { profile }
//   GET  /api/driver-quiz/me/history

import { request } from './api';
import {
  DRIVER_QUIZ_FLAT_QUESTIONS,
  DRIVER_QUIZ_TOTAL_QUESTIONS,
  getQuestionAnswerValue,
  getQuestionRiskScore,
} from '../constants/driverQuiz';
import {
  loadDriverQuizState,
  getDriverQuizBackendMarker,
  setDriverQuizBackendMarker,
} from './driverQuizStorage';

const QUIZ_VERSION = 'mobile-v1';
// The quiz uses a 0–5 frequency scale, so each question's per-answer risk is
// 0–5 and its max is 5. The backend scores risk = Σrisk / Σmax × 100.
const MAX_POINTS_PER_QUESTION = 5;

export async function startDriverQuizAttempt({ signal } = {}) {
  return request('/api/driver-quiz/start', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify({
      quizVersion: QUIZ_VERSION,
      totalQuestions: DRIVER_QUIZ_TOTAL_QUESTIONS,
    }),
    signal,
  });
}

export async function saveDriverQuizResponse(attemptId, response, { signal } = {}) {
  return request(`/api/driver-quiz/${attemptId}/response`, {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(response),
    signal,
  });
}

export async function completeDriverQuizAttempt(attemptId, { signal } = {}) {
  return request(`/api/driver-quiz/${attemptId}/complete`, {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify({}),
    signal,
  });
}

export async function fetchDriverQuizProfile({ signal } = {}) {
  return request('/api/driver-quiz/me/profile', { method: 'GET', withAuth: true, signal });
}

export async function fetchDriverQuizHistory({ limit, signal } = {}) {
  const path = limit
    ? `/api/driver-quiz/me/history?limit=${encodeURIComponent(limit)}`
    : '/api/driver-quiz/me/history';
  return request(path, { method: 'GET', withAuth: true, signal });
}

// Build the per-question response rows the backend expects from the modal's
// answer map ({ [questionId]: { value, riskScore, reversed } }).
function buildResponsesFromAnswers(answers) {
  return DRIVER_QUIZ_FLAT_QUESTIONS
    .map((question) => {
      const stored = answers?.[question.id];
      const value = getQuestionAnswerValue(stored);
      if (!Number.isFinite(value)) return null;
      const riskScore = getQuestionRiskScore(question, value);
      const riskPoints = Number.isFinite(riskScore) ? riskScore : 0;
      return {
        questionId: String(question.id),
        questionText: question.text,
        questionCategory: question.sectionId,
        selectedValue: value,
        riskPoints,
        maxPoints: MAX_POINTS_PER_QUESTION,
        answerSnapshot: { value, riskScore: riskPoints, reversed: Boolean(question.reversed) },
      };
    })
    .filter(Boolean);
}

// High-level: persist a completed driver quiz (start -> responses -> complete)
// so app.user_driver_quiz_profile exists for occurrence-risk personalization.
// Returns the completion payload, or null when there are no valid answers.
// Throws on network/HTTP failure so the caller can decide how to handle it.
export async function persistDriverQuizAttempt(answers, { signal } = {}) {
  const responses = buildResponsesFromAnswers(answers);
  if (responses.length === 0) return null;

  const started = await startDriverQuizAttempt({ signal });
  const attemptId = started?.attemptId || started?.attempt?.id || started?.id;
  if (!attemptId) {
    throw new Error('Driver quiz start did not return an attempt id');
  }

  // Serial so the attempt's answered_questions counter stays consistent.
  for (const response of responses) {
    // eslint-disable-next-line no-await-in-loop
    await saveDriverQuizResponse(attemptId, response, { signal });
  }

  return completeDriverQuizAttempt(attemptId, { signal });
}

// Make sure the locally-completed quiz is reflected in the backend driver
// profile so occurrence-risk personalization works. Idempotent: it persists at
// most once per local completion (keyed by the stored state's updatedAt), so it
// is safe to call on every map mount. Backfills quizzes that were completed
// before backend persistence existed. Returns { persisted, reason? }.
export async function ensureDriverQuizPersisted({ force = false, signal } = {}) {
  const state = await loadDriverQuizState();
  if (!state?.completed) return { persisted: false, reason: 'not_completed' };

  const answers = state.answers || {};
  if (Object.keys(answers).length === 0) return { persisted: false, reason: 'no_answers' };

  const signature = state.updatedAt || 'completed';
  if (!force) {
    const marker = await getDriverQuizBackendMarker();
    if (marker && marker === signature) {
      return { persisted: false, reason: 'already_persisted' };
    }
  }

  const result = await persistDriverQuizAttempt(answers, { signal });
  if (result) {
    await setDriverQuizBackendMarker(signature);
  }
  return { persisted: Boolean(result), result };
}
