import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Button from '../ui/Button';
import Card from '../ui/Card';
import QuizExplanationCard from './QuizExplanationCard';
import { getApiBaseUrlDiagnostics } from '../../config/api';
import { Colors } from '../../theme/colors';
import {
  buildDriverQuizPayload,
  DRIVER_QUIZ_FLAT_QUESTIONS,
  DRIVER_QUIZ_SCALE_OPTIONS,
  DRIVER_QUIZ_TOTAL_QUESTIONS,
  getDriverQuizQuestionAt,
  getDriverQuizSectionById,
  getQuestionAnswerValue,
  getQuestionRiskScore,
  scoreToPercent,
  STREAM_STATUS_LABELS,
} from '../../constants/driverQuiz';
import { clearDriverQuizState, loadDriverQuizState, saveDriverQuizState } from '../../services/driverQuizStorage';
import { getQuizFriendlyErrorMessage, predictDriverRiskQuizStream } from '../../services/quizService';

function getRiskTone(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('extreme') || normalized.includes('critical')) return { color: '#dc2626', soft: 'rgba(220,38,38,0.12)' };
  if (normalized.includes('high') || normalized.includes('elevated')) return { color: '#f97316', soft: 'rgba(249,115,22,0.12)' };
  if (normalized.includes('moderate') || normalized.includes('medium')) return { color: '#eab308', soft: 'rgba(234,179,8,0.12)' };
  return { color: '#22c55e', soft: 'rgba(34,197,94,0.12)' };
}

function formatPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(2)}%` : null;
}

function formatScore(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(4) : null;
}

function getProbabilityColor(value) {
  const percent = Number(value) * 100;
  if (percent >= 80) return Colors.severityCritical;
  if (percent >= 60) return Colors.severityHigh;
  if (percent >= 40) return Colors.severityMedium;
  return Colors.severityLow;
}

function mergeQuizResult(previous, nextResult, overrides = {}) {
  const current = previous && typeof previous === 'object' ? previous : {};
  const incoming = nextResult && typeof nextResult === 'object' ? nextResult : {};
  return {
    ...current,
    ...incoming,
    ...overrides,
    risk_label: incoming.risk_label ?? current.risk_label ?? null,
    risk_percent: incoming.risk_percent ?? current.risk_percent ?? null,
    risk_score: incoming.risk_score ?? current.risk_score ?? null,
    explanation_text: incoming.explanation_text ?? current.explanation_text ?? null,
    advice_text: incoming.advice_text ?? current.advice_text ?? null,
    structured_explanation: incoming.structured_explanation ?? current.structured_explanation ?? null,
    explanation_status: incoming.explanation_status ?? current.explanation_status ?? overrides.explanation_status ?? null,
    fallback: incoming.fallback ?? current.fallback ?? overrides.fallback ?? null,
    deterministic_advice: incoming.deterministic_advice ?? current.deterministic_advice ?? null,
    class_probabilities: incoming.class_probabilities ?? current.class_probabilities ?? null,
    xai: incoming.xai ?? current.xai ?? null,
  };
}

function appendUniqueStatus(previous, message) {
  const normalized = String(message || '').trim();
  if (!normalized || previous[previous.length - 1] === normalized) return previous;
  return [...previous, normalized];
}

function buildInitialState() {
  return {
    stage: 'quiz',
    answers: {},
    currentIndex: 0,
    result: null,
    latestPayload: null,
    statusMessages: [],
    streamStatus: '',
    streamedExplanation: '',
    hasReceivedFirstChunk: false,
    stillWaitingNotice: '',
    errorMessage: '',
  };
}

function buildInitialDiagnosticsState() {
  return {
    ...getApiBaseUrlDiagnostics(),
    requestMode: 'idle',
    streamStarted: false,
    lastSseEvent: 'none',
    chunkReceived: false,
    chunkCount: 0,
    finalResultReceived: false,
    fallbackTriggered: false,
    stillWaiting: false,
    currentStatus: '',
  };
}

export default function DriverQuizModal({ visible, onClose, onComplete, forceShow = false }) {
  const [stage, setStage] = useState('quiz');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [latestPayload, setLatestPayload] = useState(null);
  const [statusMessages, setStatusMessages] = useState([]);
  const [streamStatus, setStreamStatus] = useState('');
  const [streamedExplanation, setStreamedExplanation] = useState('');
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false);
  const [stillWaitingNotice, setStillWaitingNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [devDiagnostics, setDevDiagnostics] = useState(buildInitialDiagnosticsState);
  const activeRequestControllerRef = useRef(null);
  const activeSubmissionIdRef = useRef(0);
  const mountedRef = useRef(true);

  const currentQuestion = getDriverQuizQuestionAt(currentIndex);
  const currentSection = getDriverQuizSectionById(currentQuestion?.sectionId);
  const currentValue = getQuestionAnswerValue(currentQuestion ? answers[currentQuestion.id] : null);
  const answeredCount = useMemo(
    () => DRIVER_QUIZ_FLAT_QUESTIONS.reduce((count, question) => (Number.isFinite(getQuestionAnswerValue(answers?.[question.id])) ? count + 1 : count), 0),
    [answers],
  );
  const progressPercent = Math.max(answeredCount ? (answeredCount / DRIVER_QUIZ_TOTAL_QUESTIONS) * 100 : 2, 2);
  const probabilityEntries = useMemo(
    () => Object.entries(result?.class_probabilities || {}).sort(([, left], [, right]) => right - left),
    [result],
  );
  const explanationText = result?.explanation_text || streamedExplanation || '';
  const latestStatus = streamStatus || statusMessages[statusMessages.length - 1] || STREAM_STATUS_LABELS.starting;

  const resetQuiz = useCallback(() => {
    const initialState = buildInitialState();
    setStage(initialState.stage);
    setCurrentIndex(initialState.currentIndex);
    setAnswers(initialState.answers);
    setResult(initialState.result);
    setLatestPayload(initialState.latestPayload);
    setStatusMessages(initialState.statusMessages);
    setStreamStatus(initialState.streamStatus);
    setStreamedExplanation(initialState.streamedExplanation);
    setHasReceivedFirstChunk(initialState.hasReceivedFirstChunk);
    setStillWaitingNotice(initialState.stillWaitingNotice);
    setErrorMessage(initialState.errorMessage);
    setDevDiagnostics(buildInitialDiagnosticsState());
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeRequestControllerRef.current) {
        activeRequestControllerRef.current.abort();
        activeRequestControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let isActive = true;

    (async () => {
      try {
        const storedState = await loadDriverQuizState();
        if (!isActive) return;
        if (storedState.completed && storedState.result && !forceShow) {
          setStage('result');
          setCurrentIndex(0);
          setAnswers(storedState.answers || {});
          setResult(storedState.result || null);
          setLatestPayload(storedState.payload || null);
          setStatusMessages(storedState.result?.explanation_status ? [storedState.result.explanation_status] : [STREAM_STATUS_LABELS.done]);
          setStreamStatus(storedState.result?.explanation_status || STREAM_STATUS_LABELS.done);
          setStreamedExplanation(storedState.result?.explanation_text || '');
          setStillWaitingNotice('');
          setErrorMessage('');
          return;
        }
        resetQuiz();
      } catch (error) {
        if (isActive) {
          console.warn('[DriverQuizModal] failed to load persisted state', error?.message || error);
          resetQuiz();
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [forceShow, resetQuiz, visible]);

  const cancelActiveSubmission = useCallback(() => {
    activeSubmissionIdRef.current += 1;
    if (activeRequestControllerRef.current) {
      activeRequestControllerRef.current.abort();
      activeRequestControllerRef.current = null;
    }
  }, []);
  const closeModal = useCallback(() => {
    cancelActiveSubmission();
    onClose?.();
  }, [cancelActiveSubmission, onClose]);
  useEffect(() => {
    if (!visible) {
      cancelActiveSubmission();
    }
  }, [cancelActiveSubmission, visible]);
  const handleSkip = useCallback(() => {
    cancelActiveSubmission();
    onComplete?.({ skipped: true });
    closeModal();
  }, [cancelActiveSubmission, closeModal, onComplete]);
  const goBack = useCallback(() => setCurrentIndex((previous) => Math.max(0, previous - 1)), []);

  const finishWithResult = useCallback(async (payload, nextResult, nextAnswers) => {
    setLatestPayload(payload);
    setResult(nextResult);
    setStage('result');
    setErrorMessage('');
    await saveDriverQuizState({ completed: true, answers: nextAnswers, payload, result: nextResult });
  }, []);

  const submitAnswers = useCallback(async (nextAnswers) => {
    cancelActiveSubmission();
    const submissionId = activeSubmissionIdRef.current + 1;
    activeSubmissionIdRef.current = submissionId;
    const requestController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeRequestControllerRef.current = requestController;
    const payload = buildDriverQuizPayload(nextAnswers);
    setLatestPayload(payload);
    setStage('loading');
    setResult(null);
    setStatusMessages([STREAM_STATUS_LABELS.starting]);
    setStreamStatus(STREAM_STATUS_LABELS.starting);
    setStreamedExplanation('');
    setHasReceivedFirstChunk(false);
    setStillWaitingNotice('');
    setErrorMessage('');
    setDevDiagnostics((previous) => ({
      ...previous,
      ...buildInitialDiagnosticsState(),
      requestMode: 'stream',
      currentStatus: STREAM_STATUS_LABELS.starting,
    }));

    try {
      const finalResult = await predictDriverRiskQuizStream(payload, {
        onStatus: (message) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setStreamStatus(message);
          setStillWaitingNotice('');
          setStatusMessages((previous) => appendUniqueStatus(previous, message));
        },
        onStillWaiting: (message) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setStillWaitingNotice(message);
          setStatusMessages((previous) => appendUniqueStatus(previous, message));
        },
        onDiagnostics: (patch) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setDevDiagnostics((previous) => ({
            ...previous,
            ...patch,
          }));
        },
        onChunk: ({ explanationText: partialText }) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setHasReceivedFirstChunk(true);
          setStillWaitingNotice('');
          setStreamedExplanation(partialText || '');
          setResult((previous) => mergeQuizResult(previous, { explanation_text: partialText || '' }, { explanation_status: streamStatus || previous?.explanation_status || null }));
        },
        onResult: (partialResult) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setResult((previous) => mergeQuizResult(previous, partialResult));
        },
        onDone: (doneResult) => {
          if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) return;
          setResult((previous) => mergeQuizResult(previous, doneResult));
          if (doneResult?.explanation_text) setStreamedExplanation(doneResult.explanation_text);
        },
      }, {
        controller: requestController,
      });

      if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) {
        return;
      }

      const finalizedResult = mergeQuizResult(result, finalResult, {
        explanation_status: finalResult?.explanation_status || STREAM_STATUS_LABELS.done,
      });
      if (__DEV__) {
        console.info('[DriverQuizModal] final payload', {
          payload,
          result: finalizedResult,
        });
      }
      await finishWithResult(payload, finalizedResult, nextAnswers);
    } catch (error) {
      if (!mountedRef.current || activeSubmissionIdRef.current !== submissionId) {
        return;
      }
      if (__DEV__) {
        console.error('[DriverQuizModal] submission error', {
          message: error?.message || String(error),
          status: error?.status ?? null,
          code: error?.code ?? null,
        });
      }
      setStage('result');
      setResult(null);
      setErrorMessage(getQuizFriendlyErrorMessage(error));
    } finally {
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = null;
      }
    }
  }, [cancelActiveSubmission, finishWithResult, result, streamStatus]);

  const handleAnswerPress = useCallback((value) => {
    if (!currentQuestion) return;
    const answer = { value, riskScore: getQuestionRiskScore(currentQuestion, value), reversed: currentQuestion.reversed };
    const nextAnswers = { ...answers, [currentQuestion.id]: answer };
    setAnswers(nextAnswers);
    if (currentIndex >= DRIVER_QUIZ_TOTAL_QUESTIONS - 1) {
      submitAnswers(nextAnswers);
      return;
    }
    setCurrentIndex((previous) => previous + 1);
  }, [answers, currentIndex, currentQuestion, submitAnswers]);

  const handleContinue = useCallback(() => {
    cancelActiveSubmission();
    onComplete?.({ skipped: false, result, payload: latestPayload });
    closeModal();
  }, [cancelActiveSubmission, closeModal, latestPayload, onComplete, result]);

  const handleRetry = useCallback(async () => {
    cancelActiveSubmission();
    await clearDriverQuizState();
    resetQuiz();
  }, [cancelActiveSubmission, resetQuiz]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeModal}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <LinearGradient colors={[Colors.gradientFrom, Colors.gradientTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Driver Quiz</Text>
                <Text style={styles.headerTitle}>Driver Profile Assessment</Text>
                <Text style={styles.headerSubtitle}>
                  {stage === 'quiz'
                    ? 'Answer the full 40-question assessment and we will stream the backend explanation as it arrives.'
                    : 'Review your latest SIARA driver profile result and explanation.'}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Skip quiz" hitSlop={10} onPress={handleSkip} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            {(stage === 'quiz' || stage === 'loading') && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, progressPercent)}%` }]} />
                </View>
                <View style={styles.progressMetaRow}>
                  <Text style={styles.progressText}>{answeredCount} of {DRIVER_QUIZ_TOTAL_QUESTIONS} questions</Text>
                  <Text style={styles.progressText}>{Math.round(progressPercent)}%</Text>
                </View>
              </View>
            )}
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {stage === 'quiz' && currentQuestion && currentSection ? (
              <>
                <Card style={styles.questionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={[styles.sectionIconWrap, { backgroundColor: `${currentSection.accentColor}18` }]}>
                      <Ionicons name={currentSection.icon} size={20} color={currentSection.accentColor} />
                    </View>
                    <View style={styles.sectionHeaderCopy}>
                      <Text style={styles.sectionTitle}>{currentSection.title}</Text>
                      <Text style={styles.sectionMeta}>Section {currentSection.sectionIndex + 1} of 12</Text>
                    </View>
                    <View style={[styles.sectionCountPill, { backgroundColor: `${currentSection.accentColor}12` }]}>
                      <Text style={[styles.sectionCountText, { color: currentSection.accentColor }]}>
                        {currentQuestion.questionIndex + 1}/{currentSection.questions.length}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.questionNumber}>Question {currentIndex + 1} of {DRIVER_QUIZ_TOTAL_QUESTIONS}</Text>
                  <Text style={styles.questionText}>{currentQuestion.text}</Text>

                  <View style={styles.answerList}>
                    {DRIVER_QUIZ_SCALE_OPTIONS.map((option) => {
                      const selected = currentValue === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${option.label}, ${option.value}`}
                          onPress={() => handleAnswerPress(option.value)}
                          style={({ pressed }) => [
                            styles.answerButton,
                            {
                              borderColor: selected ? option.color : Colors.borderLight,
                              backgroundColor: selected ? `${option.color}18` : Colors.surface,
                              opacity: pressed ? 0.9 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.answerColorDot, { backgroundColor: option.color }]} />
                          <View style={styles.answerCopy}>
                            <Text style={[styles.answerLabel, { color: selected ? option.color : Colors.heading }]}>{option.label}</Text>
                            <Text style={styles.answerValue}>{option.value}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>

                <View style={styles.footerButtons}>
                  <Button variant="secondary" onPress={goBack} disabled={currentIndex === 0} style={styles.footerButton}>Back</Button>
                  <Button variant="ghost" onPress={handleSkip} style={styles.skipButton} textStyle={styles.skipButtonText}>Skip for now</Button>
                </View>
              </>
            ) : null}

            {stage === 'loading' ? (
              <>
                <View style={styles.loadingHero}>
                  {hasReceivedFirstChunk ? (
                    <View style={styles.typingIndicatorRow}>
                      <View style={styles.typingDot} />
                      <View style={styles.typingDot} />
                      <View style={styles.typingDot} />
                    </View>
                  ) : (
                    <ActivityIndicator size="large" color={Colors.primary} />
                  )}
                  <Text style={styles.loadingTitle}>
                    {hasReceivedFirstChunk ? 'Streaming your explanation live' : 'Analyzing your driving profile'}
                  </Text>
                  <Text style={styles.loadingText}>
                    {hasReceivedFirstChunk
                      ? 'New Ollama text is appended below as soon as each chunk arrives from the backend stream.'
                      : 'The backend is scoring your responses and opening the live SIARA assistant explanation stream.'}
                  </Text>
                </View>

                <Card title="Live Status" style={styles.loadingCard}>
                  {statusMessages.slice(-5).map((message) => (
                    <View key={message} style={styles.statusRow}>
                      <Ionicons name="sparkles-outline" size={16} color={message === latestStatus ? Colors.secondary : Colors.primary} />
                      <Text style={styles.statusText}>{message}</Text>
                    </View>
                  ))}

                  {stillWaitingNotice ? (
                    <View style={styles.noticeBanner}>
                      <Ionicons name="time-outline" size={16} color={Colors.severityHigh} />
                      <Text style={styles.noticeBannerText}>{stillWaitingNotice}</Text>
                    </View>
                  ) : null}
                </Card>

                <ResultSummary result={result} latestPayload={latestPayload} pending />

                {__DEV__ ? <DiagnosticsCard diagnostics={devDiagnostics} /> : null}

                <QuizExplanationCard
                  explanationText={explanationText}
                  structuredExplanation={result?.structured_explanation}
                  isStreaming
                  status={latestStatus}
                  fallback={false}
                  riskLabel={result?.risk_label}
                  riskPercent={result?.risk_percent}
                  riskTone={result?.risk_label ? getRiskTone(result.risk_label) : null}
                  deterministicAdvice={result?.deterministic_advice || result?.advice_text}
                />
              </>
            ) : null}

            {stage === 'result' ? (
              <>
                <ResultSummary result={result} latestPayload={latestPayload} errorMessage={errorMessage} />
                {stillWaitingNotice ? (
                  <View style={styles.noticeBannerStandalone}>
                    <Ionicons name="time-outline" size={16} color={Colors.severityHigh} />
                    <Text style={styles.noticeBannerText}>{stillWaitingNotice}</Text>
                  </View>
                ) : null}

                {__DEV__ ? <DiagnosticsCard diagnostics={devDiagnostics} /> : null}

                <Card title="Probabilities / Details">
                  {probabilityEntries.length ? (
                    <View style={styles.probabilityList}>
                      {probabilityEntries.map(([label, value]) => (
                        <View key={label} style={styles.probabilityRow}>
                          <View style={styles.probabilityCopy}>
                            <Text style={styles.probabilityLabel}>{label}</Text>
                            <Text style={styles.probabilityValue}>{formatPercent(Number(value) * 100) || 'N/A'}</Text>
                          </View>
                          <View style={styles.probabilityTrack}>
                            <View style={[styles.probabilityFill, { width: `${Math.max(4, Math.min(100, Number(value) * 100))}%`, backgroundColor: getProbabilityColor(value) }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.bodyText}>Class probabilities were not included in this response.</Text>
                  )}
                </Card>

                {latestPayload ? (
                  <Card title="Feature Signals">
                    <View style={styles.signalList}>
                      {Object.entries(latestPayload).map(([key, value]) => (
                        <View key={key} style={styles.signalRow}>
                          <View style={styles.signalCopy}>
                            <Text style={styles.signalLabel}>{key.replaceAll('_', ' ')}</Text>
                            <Text style={styles.signalValue}>{formatScore(value) || '0.0000'}</Text>
                          </View>
                          <View style={styles.signalTrack}>
                            <View style={[styles.signalFill, { width: `${Math.max(4, scoreToPercent(value))}%`, backgroundColor: getProbabilityColor(scoreToPercent(value) / 100) }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </Card>
                ) : null}

                <QuizExplanationCard
                  explanationText={explanationText}
                  structuredExplanation={result?.structured_explanation}
                  isStreaming={false}
                  status={result?.explanation_status || latestStatus}
                  fallback={false}
                  riskLabel={result?.risk_label}
                  riskPercent={result?.risk_percent}
                  riskTone={result?.risk_label ? getRiskTone(result.risk_label) : null}
                  deterministicAdvice={result?.deterministic_advice || result?.advice_text}
                />

                <View style={styles.resultButtons}>
                  <Button onPress={handleContinue} style={styles.resultButton}>Continue</Button>
                  <Button variant="secondary" onPress={handleRetry} style={styles.resultButton}>Retry</Button>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DiagnosticsCard({ diagnostics }) {
  const rows = [
    ['API base', diagnostics?.apiBaseUrl],
    ['Mode', diagnostics?.requestMode],
    ['Stream started', diagnostics?.streamStarted ? 'yes' : 'no'],
    ['Last SSE event', diagnostics?.lastSseEvent],
    ['Chunk received', diagnostics?.chunkReceived ? `yes (${diagnostics?.chunkCount || 0})` : 'no'],
    ['Final result', diagnostics?.finalResultReceived ? 'yes' : 'no'],
    ['Fallback', diagnostics?.fallbackTriggered ? 'yes' : 'no'],
    ['Still waiting', diagnostics?.stillWaiting ? 'yes' : 'no'],
  ];

  return (
    <Card title="Dev Diagnostics" style={styles.diagnosticsCard}>
      <View style={styles.diagnosticsRows}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.diagnosticsRow}>
            <Text style={styles.diagnosticsLabel}>{label}</Text>
            <Text style={styles.diagnosticsValue}>{String(value || 'n/a')}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ResultSummary({ result, latestPayload, errorMessage, pending = false }) {
  return (
    <Card style={styles.summaryCard}>
      <LinearGradient colors={['rgba(124,58,237,0.08)', 'rgba(59,130,246,0.08)']} style={styles.summaryGradient}>
        <Text style={styles.resultHeaderLabel}>Model Result</Text>

        {result?.risk_label ? (
          <View style={[styles.riskPill, { backgroundColor: getRiskTone(result.risk_label).soft }]}>
            <Text style={[styles.riskPillText, { color: getRiskTone(result.risk_label).color }]}>{result.risk_label}</Text>
          </View>
        ) : (
          <Text style={styles.pendingResultText}>{pending ? 'Waiting for model result...' : 'Assessment unavailable'}</Text>
        )}

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Risk Percent</Text>
            <Text style={styles.metricValue}>{formatPercent(result?.risk_percent) || (pending ? 'Pending' : 'N/A')}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Risk Score</Text>
            <Text style={styles.metricValue}>{formatScore(result?.risk_score) || (pending ? 'Pending' : 'N/A')}</Text>
          </View>
        </View>

        {latestPayload ? <Text style={styles.payloadHint}>Backend payload includes {Object.keys(latestPayload).length} modeled driver features.</Text> : null}

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color={Colors.error} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headerCopy: { flex: 1 },
  eyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  headerTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  headerSubtitle: { color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 20 },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  progressWrap: { marginTop: 18 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: Colors.white },
  progressMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  progressText: { color: 'rgba(255,255,255,0.84)', fontSize: 12, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  questionCard: { marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  sectionIconWrap: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { color: Colors.heading, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  sectionMeta: { color: Colors.subtext, fontSize: 12, fontWeight: '700' },
  sectionCountPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  sectionCountText: { fontSize: 12, fontWeight: '800' },
  questionNumber: { color: Colors.subtext, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  questionText: { color: Colors.heading, fontSize: 24, fontWeight: '800', lineHeight: 32, marginBottom: 18 },
  answerList: { gap: 12 },
  answerButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 14 },
  answerColorDot: { width: 14, height: 14, borderRadius: 999 },
  answerCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  answerLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  answerValue: { color: Colors.subtext, fontSize: 14, fontWeight: '800' },
  footerButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  footerButton: { flex: 1 },
  skipButton: { flex: 1, backgroundColor: Colors.surface, borderColor: Colors.border },
  skipButtonText: { color: Colors.subtext },
  loadingHero: { alignItems: 'center', paddingTop: 16, paddingBottom: 6 },
  loadingTitle: { color: Colors.heading, fontSize: 22, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  loadingText: { color: Colors.subtext, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  typingIndicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36 },
  typingDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: Colors.secondary },
  loadingCard: { width: '100%' },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  statusText: { flex: 1, color: Colors.textDark, fontSize: 14, lineHeight: 20 },
  summaryCard: { padding: 0, overflow: 'hidden' },
  summaryGradient: { padding: 18 },
  resultHeaderLabel: { color: Colors.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  riskPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginBottom: 16 },
  riskPillText: { fontSize: 14, fontWeight: '800' },
  pendingResultText: { color: Colors.heading, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  metricRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metricCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.84)', borderRadius: 16, padding: 14 },
  metricLabel: { color: Colors.subtext, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  metricValue: { color: Colors.heading, fontSize: 20, fontWeight: '800' },
  payloadHint: { color: Colors.subtext, fontSize: 12, lineHeight: 18 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: 'rgba(220,38,38,0.16)', backgroundColor: 'rgba(220,38,38,0.08)', borderRadius: 14, padding: 12, marginTop: 14 },
  errorBannerText: { flex: 1, color: Colors.error, fontSize: 13, lineHeight: 18 },
  noticeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: Colors.blueBorder, backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 14, padding: 12, marginTop: 6 },
  noticeBannerStandalone: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: Colors.blueBorder, backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 14, padding: 12 },
  noticeBannerText: { flex: 1, color: Colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  diagnosticsCard: { borderColor: Colors.border },
  diagnosticsRows: { gap: 8 },
  diagnosticsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  diagnosticsLabel: { flex: 1, color: Colors.subtext, fontSize: 12, fontWeight: '700' },
  diagnosticsValue: { flex: 1, color: Colors.textDark, fontSize: 12, textAlign: 'right' },
  bodyText: { color: Colors.textDark, fontSize: 14, lineHeight: 22 },
  probabilityList: { gap: 14 },
  probabilityRow: { gap: 8 },
  probabilityCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  probabilityLabel: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  probabilityValue: { color: Colors.subtext, fontSize: 13, fontWeight: '700' },
  probabilityTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.border, overflow: 'hidden' },
  probabilityFill: { height: '100%', borderRadius: 999 },
  signalList: { gap: 14 },
  signalRow: { gap: 8 },
  signalCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  signalLabel: { flex: 1, color: Colors.heading, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  signalValue: { color: Colors.subtext, fontSize: 13, fontWeight: '700' },
  signalTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.border, overflow: 'hidden' },
  signalFill: { height: '100%', borderRadius: 999 },
  resultButtons: { flexDirection: 'row', gap: 12, marginTop: 2 },
  resultButton: { flex: 1 },
});
