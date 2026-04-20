import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DRIVER_QUIZ_LEGACY_ANSWERS_KEY,
  DRIVER_QUIZ_LEGACY_COMPLETED_KEY,
  DRIVER_QUIZ_STORAGE_KEY,
} from '../constants/driverQuiz';

const EMPTY_STATE = Object.freeze({
  completed: false,
  answers: {},
  payload: null,
  result: null,
  updatedAt: null,
});

function normalizeStoredState(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') {
    return { ...EMPTY_STATE };
  }

  return {
    completed: rawValue.completed === true,
    answers: rawValue.answers && typeof rawValue.answers === 'object' ? rawValue.answers : {},
    payload: rawValue.payload && typeof rawValue.payload === 'object' ? rawValue.payload : null,
    result: rawValue.result && typeof rawValue.result === 'object' ? rawValue.result : null,
    updatedAt: rawValue.updatedAt || null,
  };
}

async function loadLegacyDriverQuizState() {
  const [completedValue, answersValue] = await Promise.all([
    AsyncStorage.getItem(DRIVER_QUIZ_LEGACY_COMPLETED_KEY),
    AsyncStorage.getItem(DRIVER_QUIZ_LEGACY_ANSWERS_KEY),
  ]);

  if (!completedValue && !answersValue) {
    return { ...EMPTY_STATE };
  }

  let parsedAnswers = {};
  try {
    parsedAnswers = answersValue ? JSON.parse(answersValue) : {};
  } catch (_error) {
    parsedAnswers = {};
  }

  return normalizeStoredState({
    completed: completedValue === 'true',
    answers: parsedAnswers?.answers || {},
    payload: parsedAnswers?.featureScores || null,
    result: parsedAnswers
      ? {
          risk_label: parsedAnswers.prediction || null,
          risk_percent: parsedAnswers.riskPercent ?? null,
          explanation_text: parsedAnswers.explanation_text || null,
          advice_text: parsedAnswers.advice || null,
          class_probabilities: parsedAnswers.class_probabilities || null,
          xai: parsedAnswers.xai || null,
        }
      : null,
    updatedAt: parsedAnswers?.completedAt || null,
  });
}

export async function loadDriverQuizState() {
  try {
    const raw = await AsyncStorage.getItem(DRIVER_QUIZ_STORAGE_KEY);
    if (raw) {
      return normalizeStoredState(JSON.parse(raw));
    }

    const legacyState = await loadLegacyDriverQuizState();
    if (legacyState.completed || Object.keys(legacyState.answers).length > 0) {
      await saveDriverQuizState(legacyState);
      return legacyState;
    }
  } catch (error) {
    console.warn('[driverQuizStorage] load failed', error?.message || error);
  }

  return { ...EMPTY_STATE };
}

export async function saveDriverQuizState(state) {
  const normalized = normalizeStoredState(state);
  const payload = JSON.stringify({
    ...normalized,
    updatedAt: normalized.updatedAt || new Date().toISOString(),
  });
  await AsyncStorage.setItem(DRIVER_QUIZ_STORAGE_KEY, payload);
  return normalized;
}

export async function clearDriverQuizState() {
  await AsyncStorage.multiRemove([
    DRIVER_QUIZ_STORAGE_KEY,
    DRIVER_QUIZ_LEGACY_COMPLETED_KEY,
    DRIVER_QUIZ_LEGACY_ANSWERS_KEY,
  ]);
}
