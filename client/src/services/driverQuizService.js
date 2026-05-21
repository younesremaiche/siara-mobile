// Driver-quiz CRUD endpoints used by the in-app onboarding/profile flow.
// The Ollama-backed prediction lives in services/quizService.js; this file
// covers the simpler REST surface at /api/driver-quiz.

import { request } from './api';

export async function fetchDriverQuiz({ signal } = {}) {
  return request('/api/driver-quiz', { method: 'GET', withAuth: true, signal });
}

export async function fetchDriverQuizQuestions({ signal } = {}) {
  return request('/api/driver-quiz/questions', { method: 'GET', signal });
}

export async function submitDriverQuiz(answers, { signal } = {}) {
  return request('/api/driver-quiz', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify({ answers }),
    signal,
  });
}

export async function fetchDriverQuizHistory({ limit, signal } = {}) {
  const path = limit ? `/api/driver-quiz/history?limit=${encodeURIComponent(limit)}` : '/api/driver-quiz/history';
  return request(path, { method: 'GET', withAuth: true, signal });
}
