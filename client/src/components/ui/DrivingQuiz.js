// DrivingQuiz.js
// Complete React Native port of the web client DrivingQuiz.jsx
// 12 sections, 40 questions, feature-score computation, SHAP/XAI results display

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../theme/colors';
import { API_BASE_URL } from '../../config/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_COMPLETED = 'siara_quiz_completed';
const STORAGE_ANSWERS = 'siara_quiz_answers';

// ─────────────────────────────────────────────────────────────────────────────
// Answer options (0-5 Likert scale)
// ─────────────────────────────────────────────────────────────────────────────
const ANSWER_OPTIONS = [
  { value: 0, label: 'Never', color: '#22c55e' },
  { value: 1, label: 'Rarely', color: '#84cc16' },
  { value: 2, label: 'Sometimes', color: '#eab308' },
  { value: 3, label: 'Often', color: '#f97316' },
  { value: 4, label: 'Very Often', color: '#ef4444' },
  { value: 5, label: 'Always', color: '#dc2626' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Quiz sections — 12 sections, 40 questions total
// ─────────────────────────────────────────────────────────────────────────────
const QUIZ_SECTIONS = [
  // ── Section 1: Attention & Focus (2 questions) ──
  {
    key: 'attention',
    title: 'Attention & Focus',
    reversed: false,
    questions: [
      'How often do you find your mind wandering away from driving while you\'re behind the wheel?',
      'How often do you realize you missed something on the road because you weren\'t fully paying attention?',
    ],
  },
  // ── Section 2: Driving Anxiety (2 questions) ──
  {
    key: 'anxiety',
    title: 'Driving Anxiety',
    reversed: false,
    questions: [
      'How often do you feel nervous or tense when driving, even in normal traffic?',
      'How often do you worry about getting into a crash while you\'re driving?',
    ],
  },
  // ── Section 3: Risk Taking (3 questions) ──
  {
    key: 'risk',
    title: 'Risk Taking',
    reversed: false,
    questions: [
      'How often do you take chances while driving, like overtaking when it\'s a bit risky?',
      'How often do you feel comfortable driving faster than others when the road is clear?',
      'How often do you push yourself to drive in situations you know are a bit dangerous (like on narrow or busy roads)?',
    ],
  },
  // ── Section 4: Anger & Aggression (3 questions) ──
  {
    key: 'anger',
    title: 'Anger & Aggression',
    reversed: false,
    questions: [
      'How often do you feel angry or furious at other drivers when they annoy you?',
      'How often do you get frustrated and drive more aggressively after being cut off?',
      'How often do you shout at other drivers or make rude gestures at them?',
    ],
  },
  // ── Section 5: Sensation Seeking (2 questions) ──
  {
    key: 'sensation',
    title: 'Sensation Seeking',
    reversed: false,
    questions: [
      'How often do you drive much faster than the speed limit for the thrill of it?',
      'How often do you feel excited when driving at very high speeds on open roads?',
    ],
  },
  // ── Section 6: Stress Relief (3 questions, ALL reversed) ──
  {
    key: 'stress',
    title: 'Stress Relief',
    reversed: true,
    questions: [
      'How often do you drive to relax or reduce stress?',
      'How often do you take a drive just to clear your mind or calm down?',
      'How often do you feel less stressed after a long drive?',
    ],
  },
  // ── Section 7: Patience & Calmness (2 questions, ALL reversed) ──
  {
    key: 'patience',
    title: 'Patience & Calmness',
    reversed: true,
    questions: [
      'How often do you stay calm and patient even when you\'re stuck in a traffic jam?',
      'How often do you keep your cool when other drivers are slow or make mistakes?',
    ],
  },
  // ── Section 8: Safety Consciousness (3 questions, ALL reversed) ──
  {
    key: 'safety',
    title: 'Safety Consciousness',
    reversed: true,
    questions: [
      'How often do you drive carefully to avoid accidents?',
      'How often do you follow all traffic rules (speed limits, signals, etc.) because safety is important to you?',
      'How often do you pay extra attention to the road and surroundings to avoid mistakes?',
    ],
  },
  // ── Section 9: Traffic Violations (6 questions) ──
  {
    key: 'violations',
    title: 'Traffic Violations',
    reversed: false,
    questions: [
      'How often do you drive significantly above the speed limit?',
      'How often do you follow too closely behind the vehicle in front of you (tailgating)?',
      'How often do you overtake other vehicles in risky or no-overtaking zones?',
      'How often do you drive through red lights or ignore traffic signals?',
      'How often do you use your phone (calling, texting, browsing) while driving?',
      'How often do you honk aggressively or flash your lights at other drivers?',
    ],
  },
  // ── Section 10: Driving Errors (5 questions) ──
  {
    key: 'errors',
    title: 'Driving Errors',
    reversed: false,
    questions: [
      'How often do you misjudge the distance between your car and the vehicle ahead?',
      'How often do you accidentally press the wrong pedal (gas instead of brake or vice versa)?',
      'How often do you miss or misread road signs or traffic signals?',
      'How often do you overlook pedestrians or cyclists when turning or reversing?',
      'How often do you have to brake suddenly because you didn\'t notice the car ahead slowing down?',
    ],
  },
  // ── Section 11: Memory Lapses (4 questions) ──
  {
    key: 'lapses',
    title: 'Memory Lapses',
    reversed: false,
    questions: [
      'How often do you drive on \'autopilot\' and realize you don\'t remember the last few minutes of driving?',
      'How often do you miss your exit or turn because you weren\'t paying attention?',
      'How often do you get lost or take a wrong route on roads you should know well?',
      'How often do you forget where you parked your car?',
    ],
  },
  // ── Section 12: Driving Habits (5 questions) ──
  {
    key: 'habits',
    title: 'Driving Habits',
    reversed: false,
    questions: [
      'How often do you forget to use your turn signal when changing lanes or turning?',
      'How often do you forget to check your mirrors before changing lanes or merging?',
      'How often do you get distracted by things outside the car (billboards, scenery, etc.)?',
      'How often do you forget to put on your seatbelt before starting to drive?',
      'How often do you eat, drink, or do other tasks while driving?',
    ],
  },
];

const TOTAL_QUESTIONS = QUIZ_SECTIONS.reduce((sum, s) => sum + s.questions.length, 0); // 40

// ─────────────────────────────────────────────────────────────────────────────
// Feature display metadata
// ─────────────────────────────────────────────────────────────────────────────
const FEATURE_LABELS = {
  dissociative: 'Attention & Focus',
  anxious: 'Driving Anxiety',
  risky: 'Risk Taking',
  angry: 'Anger & Aggression',
  high_velocity: 'Sensation Seeking',
  distress_reduction: 'Stress Relief',
  patient: 'Patience & Calmness',
  careful: 'Safety Consciousness',
  violations: 'Traffic Violations',
  errors: 'Driving Errors & Habits',
  lapses: 'Memory Lapses',
};

const FEATURE_ORDER = [
  'dissociative',
  'anxious',
  'risky',
  'angry',
  'high_velocity',
  'distress_reduction',
  'patient',
  'careful',
  'violations',
  'errors',
  'lapses',
];

const PROTECTIVE_TRAITS = ['patient', 'careful', 'distress_reduction'];

// ─────────────────────────────────────────────────────────────────────────────
// Build the lookup of section-key -> flat indices (computed once)
// ─────────────────────────────────────────────────────────────────────────────
const SECTION_INDICES = (() => {
  const map = {};
  let idx = 0;
  QUIZ_SECTIONS.forEach((sec) => {
    map[sec.key] = [];
    sec.questions.forEach(() => {
      map[sec.key].push(idx);
      idx++;
    });
  });
  return map;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build feature scores from answers object { 0: val, 1: val, ... }
// ─────────────────────────────────────────────────────────────────────────────
function buildFeatureScores(answers) {
  const avg = (indices, reversed = false) => {
    const vals = indices
      .map((i) => {
        const v = answers[i];
        if (v === undefined || v === null) return null;
        return reversed ? 5 - v : v;
      })
      .filter((v) => v !== null);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return {
    dissociative: avg(SECTION_INDICES.attention, false),
    anxious: avg(SECTION_INDICES.anxiety, false),
    risky: avg(SECTION_INDICES.risk, false),
    angry: avg(SECTION_INDICES.anger, false),
    high_velocity: avg(SECTION_INDICES.sensation, false),
    distress_reduction: avg(SECTION_INDICES.stress, true),
    patient: avg(SECTION_INDICES.patience, true),
    careful: avg(SECTION_INDICES.safety, true),
    violations: avg(SECTION_INDICES.violations, false),
    errors: avg([...SECTION_INDICES.errors, ...SECTION_INDICES.habits], false),
    lapses: avg(SECTION_INDICES.lapses, false),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: risk-level from percentage
// ─────────────────────────────────────────────────────────────────────────────
function getRiskLevel(percent) {
  if (percent <= 25) return { label: 'Low Risk', color: Colors.severityLow };
  if (percent <= 50) return { label: 'Moderate Risk', color: Colors.severityMedium };
  if (percent <= 75) return { label: 'High Risk', color: Colors.severityHigh };
  return { label: 'Critical Risk', color: Colors.severityCritical };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: SHAP impact for a feature
// ─────────────────────────────────────────────────────────────────────────────
function getImpact(xai, feature) {
  if (!xai || xai[feature] === undefined || xai[feature] === null) return null;
  const val = xai[feature];
  const isProtective = PROTECTIVE_TRAITS.includes(feature);
  // Protective traits: negative SHAP = increases risk, positive = decreases risk
  // Risk traits: positive SHAP = increases risk, negative = decreases risk
  const increasesRisk = isProtective ? val < 0 : val > 0;
  return {
    arrow: increasesRisk ? '\u2191' : '\u2193', // up or down arrow
    color: increasesRisk ? Colors.error : Colors.success,
    text: increasesRisk ? 'Increases Risk' : 'Decreases Risk',
  };
}

function getImpactPercent(xai, feature) {
  if (!xai || xai[feature] === undefined || xai[feature] === null) return 0;
  const total = Object.values(xai).reduce((sum, v) => sum + Math.abs(v), 0);
  if (total === 0) return 0;
  return Math.round((Math.abs(xai[feature]) / total) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: color for a feature score bar
// ─────────────────────────────────────────────────────────────────────────────
function getScoreBarColor(score, feature) {
  const isProtective = PROTECTIVE_TRAITS.includes(feature);
  if (isProtective) {
    // High = good (green), low = concerning (orange/red)
    if (score >= 4) return Colors.severityLow;
    if (score >= 3) return '#84cc16';
    if (score >= 2) return Colors.severityMedium;
    return Colors.severityHigh;
  }
  // Risk trait: low = good, high = bad
  if (score <= 1) return Colors.severityLow;
  if (score <= 2) return '#84cc16';
  if (score <= 3) return Colors.severityMedium;
  if (score <= 4) return Colors.severityHigh;
  return Colors.severityCritical;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: flat question index from section + question indices
// ─────────────────────────────────────────────────────────────────────────────
function getFlatIndex(sectionIdx, questionIdx) {
  let idx = 0;
  for (let i = 0; i < sectionIdx; i++) {
    idx += QUIZ_SECTIONS[i].questions.length;
  }
  return idx + questionIdx;
}

// =============================================================================
// DrivingQuiz Component
// =============================================================================
export default function DrivingQuiz({ visible, onClose, onComplete, forceShow }) {
  // ── State ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('quiz'); // 'quiz' | 'loading' | 'results'
  const [sectionIdx, setSectionIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef(null);

  // ── Derived values ──────────────────────────────────────────────────────
  const section = QUIZ_SECTIONS[sectionIdx];
  const flatIdx = getFlatIndex(sectionIdx, questionIdx);
  const answeredCount = Object.keys(answers).length;
  const progress = answeredCount / TOTAL_QUESTIONS;
  const isAllAnswered = answeredCount >= TOTAL_QUESTIONS;
  const canGoBack = sectionIdx > 0 || questionIdx > 0;

  // ── Check AsyncStorage on mount / visibility change ─────────────────────
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const done = await AsyncStorage.getItem(STORAGE_COMPLETED);
        if (done === 'true' && !forceShow) {
          setAlreadyCompleted(true);
        } else {
          setAlreadyCompleted(false);
          resetQuiz();
        }
      } catch (_) {
        setAlreadyCompleted(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, forceShow]);

  // ── Animate question card in ────────────────────────────────────────────
  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ── Handle answer selection ─────────────────────────────────────────────
  const handleAnswer = useCallback(
    (value) => {
      const newAnswers = { ...answers, [flatIdx]: value };
      setAnswers(newAnswers);

      // Auto-advance after a brief delay for visual feedback
      setTimeout(() => {
        if (questionIdx < section.questions.length - 1) {
          setQuestionIdx((q) => q + 1);
          animateIn();
        } else if (sectionIdx < QUIZ_SECTIONS.length - 1) {
          setSectionIdx((s) => s + 1);
          setQuestionIdx(0);
          animateIn();
        }
        // else: last question — user sees the Submit button
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 220);
    },
    [answers, flatIdx, questionIdx, sectionIdx, section, animateIn],
  );

  // ── Navigate back ───────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (questionIdx > 0) {
      setQuestionIdx((q) => q - 1);
    } else if (sectionIdx > 0) {
      const prevSection = QUIZ_SECTIONS[sectionIdx - 1];
      setSectionIdx((s) => s - 1);
      setQuestionIdx(prevSection.questions.length - 1);
    }
    animateIn();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [questionIdx, sectionIdx, animateIn]);

  // ── Skip quiz entirely ──────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    if (onComplete) onComplete({ skipped: true });
    onClose?.();
  }, [onComplete, onClose]);

  // ── Submit answers to model API ─────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setPhase('loading');
    const featureScores = buildFeatureScores(answers);

    try {
      const res = await fetch(`${API_BASE_URL}/api/model/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(featureScores),
      });
      const data = await res.json();

      const resultData = {
        risk_label: data.risk_label,
        risk_percent: data.risk_percent,
        class_probabilities: data.class_probabilities,
        xai: data.xai,
        advice_text: data.advice_text,
        featureScores,
      };

      setResult(resultData);
      setPhase('results');

      // Persist to AsyncStorage
      await AsyncStorage.setItem(STORAGE_COMPLETED, 'true');
      await AsyncStorage.setItem(
        STORAGE_ANSWERS,
        JSON.stringify({
          answers,
          featureScores,
          prediction: data.risk_label,
          riskPercent: data.risk_percent,
          xai: data.xai,
          advice: data.advice_text,
          completedAt: new Date().toISOString(),
        }),
      );
    } catch (_err) {
      const featureScoresForError = buildFeatureScores(answers);
      setResult({
        risk_label: 'Unknown',
        risk_percent: 0,
        class_probabilities: null,
        xai: null,
        advice_text:
          'Could not reach the prediction server. Please check your connection and try again.',
        featureScores: featureScoresForError,
      });
      setPhase('results');
    }
  }, [answers]);

  // ── Continue (close with result payload) ────────────────────────────────
  const handleContinue = useCallback(() => {
    if (onComplete && result) {
      onComplete({
        skipped: false,
        prediction: result.risk_label,
        riskPercent: result.risk_percent,
        featureScores: result.featureScores,
        xai: result.xai,
        advice: result.advice_text,
      });
    }
    onClose?.();
  }, [onComplete, onClose, result]);

  // ── Reset / retry ───────────────────────────────────────────────────────
  const resetQuiz = useCallback(() => {
    setSectionIdx(0);
    setQuestionIdx(0);
    setAnswers({});
    setResult(null);
    setPhase('quiz');
    fadeAnim.setValue(1);
  }, [fadeAnim]);

  // ── If already completed and not forced, render nothing ─────────────────
  if (alreadyCompleted && !forceShow) {
    return null;
  }

  // =====================================================================
  // Render
  // =====================================================================
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* ── Header ──────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={styles.headerTitle}>Driver Profile Assessment</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeBtnText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>
              {phase === 'results'
                ? 'Your personalized driving risk profile'
                : `${TOTAL_QUESTIONS} questions across ${QUIZ_SECTIONS.length} categories`}
            </Text>
          </View>

          {/* ── Progress bar (quiz phase only) ──────────────────── */}
          {phase === 'quiz' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {answeredCount} of {TOTAL_QUESTIONS} answered
              </Text>
            </View>
          )}

          {/* ── Scrollable body ─────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ════════════════ QUIZ PHASE ════════════════ */}
            {phase === 'quiz' && (
              <>
                {/* Section header */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{sectionIdx + 1}</Text>
                  </View>
                  <View style={styles.sectionMeta}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionCounter}>
                      Question {questionIdx + 1} of {section.questions.length}
                    </Text>
                  </View>
                  {section.reversed && (
                    <View style={styles.reversedBadge}>
                      <Text style={styles.reversedBadgeText}>Protective</Text>
                    </View>
                  )}
                </View>

                {/* Question card with animation */}
                <Animated.View
                  style={[
                    styles.questionCard,
                    {
                      opacity: fadeAnim,
                      transform: [
                        {
                          translateY: fadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [14, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.questionNumber}>Q{flatIdx + 1}</Text>
                  <Text style={styles.questionText}>
                    {section.questions[questionIdx]}
                  </Text>
                </Animated.View>

                {/* Answer buttons */}
                <View style={styles.answersContainer}>
                  {ANSWER_OPTIONS.map((opt) => {
                    const isSelected = answers[flatIdx] === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.answerBtn,
                          isSelected && {
                            backgroundColor: opt.color + '18',
                            borderColor: opt.color,
                          },
                        ]}
                        onPress={() => handleAnswer(opt.value)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.answerIndicator,
                            { backgroundColor: opt.color },
                          ]}
                        />
                        <Text
                          style={[
                            styles.answerLabel,
                            isSelected && { color: opt.color, fontWeight: '700' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <View
                            style={[
                              styles.answerCheck,
                              { backgroundColor: opt.color },
                            ]}
                          >
                            <Text style={styles.answerCheckText}>{'\u2713'}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Navigation row */}
                <View style={styles.navRow}>
                  <TouchableOpacity
                    style={[styles.navBackBtn, !canGoBack && styles.navBtnDisabled]}
                    onPress={goBack}
                    disabled={!canGoBack}
                  >
                    <Text
                      style={[
                        styles.navBackText,
                        !canGoBack && styles.navBackTextDisabled,
                      ]}
                    >
                      {'\u2190'} Back
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                    <Text style={styles.skipBtnText}>Skip Quiz</Text>
                  </TouchableOpacity>
                </View>

                {/* Submit when all answered */}
                {isAllAnswered && (
                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleSubmit}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.submitBtnText}>Get My Risk Profile</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* ════════════════ LOADING PHASE ════════════════ */}
            {phase === 'loading' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.btnPrimary} />
                <Text style={styles.loadingTitle}>
                  Analyzing your driving profile...
                </Text>
                <Text style={styles.loadingSubtext}>
                  Our model is computing your risk assessment
                </Text>
              </View>
            )}

            {/* ════════════════ RESULTS PHASE ════════════════ */}
            {phase === 'results' && result && (
              <>
                {/* ── Overall risk circle ── */}
                <View style={styles.riskCircleContainer}>
                  <View
                    style={[
                      styles.riskCircle,
                      {
                        borderColor: getRiskLevel(result.risk_percent || 0).color,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.riskPercent,
                        { color: getRiskLevel(result.risk_percent || 0).color },
                      ]}
                    >
                      {result.risk_percent != null
                        ? `${Math.round(result.risk_percent)}%`
                        : '--'}
                    </Text>
                    <Text style={styles.riskPercentLabel}>Risk Score</Text>
                  </View>
                  <Text
                    style={[
                      styles.riskLabel,
                      { color: getRiskLevel(result.risk_percent || 0).color },
                    ]}
                  >
                    {result.risk_label || getRiskLevel(result.risk_percent || 0).label}
                  </Text>
                </View>

                {/* ── Class probabilities ── */}
                {result.class_probabilities &&
                  typeof result.class_probabilities === 'object' && (
                    <View style={styles.probabilitiesCard}>
                      <Text style={styles.probabilitiesTitle}>
                        Class Probabilities
                      </Text>
                      {Object.entries(result.class_probabilities).map(
                        ([cls, prob]) => (
                          <View key={cls} style={styles.probRow}>
                            <Text style={styles.probLabel}>{cls}</Text>
                            <View style={styles.probBarBg}>
                              <View
                                style={[
                                  styles.probBarFill,
                                  {
                                    width: `${Math.round((prob || 0) * 100)}%`,
                                    backgroundColor: Colors.btnPrimary,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.probValue}>
                              {((prob || 0) * 100).toFixed(1)}%
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}

                {/* ── Feature breakdown ── */}
                <Text style={styles.featureSectionTitle}>Feature Breakdown</Text>
                <View style={styles.featureList}>
                  {FEATURE_ORDER.map((feature) => {
                    const score = result.featureScores?.[feature] ?? 0;
                    const barColor = getScoreBarColor(score, feature);
                    const barWidth = `${Math.round((score / 5) * 100)}%`;
                    const impact = getImpact(result.xai, feature);
                    const impactPct = getImpactPercent(result.xai, feature);
                    const isProtective = PROTECTIVE_TRAITS.includes(feature);

                    return (
                      <View key={feature} style={styles.featureCard}>
                        {/* Feature header row */}
                        <View style={styles.featureHeaderRow}>
                          <View style={styles.featureLabelRow}>
                            {isProtective && (
                              <View style={styles.protectiveDot} />
                            )}
                            <Text style={styles.featureLabel}>
                              {FEATURE_LABELS[feature]}
                            </Text>
                          </View>
                          <Text style={[styles.featureScore, { color: barColor }]}>
                            {score.toFixed(1)}
                            <Text style={styles.featureScoreMax}> / 5</Text>
                          </Text>
                        </View>

                        {/* Score bar */}
                        <View style={styles.featureBarBg}>
                          <View
                            style={[
                              styles.featureBarFill,
                              { width: barWidth, backgroundColor: barColor },
                            ]}
                          />
                        </View>

                        {/* SHAP impact badge */}
                        {impact && (
                          <View
                            style={[
                              styles.impactBadge,
                              { backgroundColor: impact.color + '14' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.impactArrow,
                                { color: impact.color },
                              ]}
                            >
                              {impact.arrow}
                            </Text>
                            <Text
                              style={[
                                styles.impactText,
                                { color: impact.color },
                              ]}
                            >
                              {impact.text}
                            </Text>
                            {impactPct > 0 && (
                              <Text
                                style={[
                                  styles.impactPercent,
                                  { color: impact.color },
                                ]}
                              >
                                {' \u00B7 '}
                                {impactPct}%
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* ── Advice ── */}
                {result.advice_text ? (
                  <View style={styles.adviceCard}>
                    <Text style={styles.adviceTitle}>Personalized Advice</Text>
                    <Text style={styles.adviceText}>{result.advice_text}</Text>
                  </View>
                ) : null}

                {/* ── Action buttons ── */}
                <View style={styles.resultActions}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={resetQuiz}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.retryBtnText}>Retake Quiz</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.continueBtn}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.continueBtnText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// Styles
// =============================================================================
const CARD_HORIZONTAL_PADDING = 20;

const styles = StyleSheet.create({
  // ── Overlay & card shell ───────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 32, 44, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.92,
    maxHeight: SCREEN_HEIGHT * 0.88,
    backgroundColor: Colors.white,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Colors.btnPrimary,
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 22,
    paddingBottom: 18,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.white,
    flex: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
  },

  // ── Progress bar ───────────────────────────────────────────────────────
  progressContainer: {
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: Colors.white,
  },
  progressBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.btnPrimary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: Colors.grey,
    marginTop: 6,
    textAlign: 'right',
  },

  // ── Scroll body ────────────────────────────────────────────────────────
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 16,
    paddingBottom: 28,
  },

  // ── Section header ─────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.violetLight,
    borderWidth: 1.5,
    borderColor: Colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.btnPrimary,
  },
  sectionMeta: {
    flex: 1,
    marginLeft: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.heading,
  },
  sectionCounter: {
    fontSize: 12,
    color: Colors.subtext,
    marginTop: 2,
  },
  reversedBadge: {
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  reversedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Question card ──────────────────────────────────────────────────────
  questionCard: {
    backgroundColor: Colors.violetLight,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    marginBottom: 18,
  },
  questionNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.btnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.heading,
    lineHeight: 23,
  },

  // ── Answer buttons ─────────────────────────────────────────────────────
  answersContainer: {
    marginBottom: 18,
  },
  answerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  answerIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: 14,
  },
  answerLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  answerCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerCheckText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Navigation row ─────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navBackBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  navBackText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.btnPrimary,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBackTextDisabled: {
    color: Colors.grey,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.grey,
  },

  // ── Submit button ──────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: Colors.btnPrimary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.btnPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Loading phase ──────────────────────────────────────────────────────
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.heading,
    marginTop: 20,
  },
  loadingSubtext: {
    fontSize: 13,
    color: Colors.subtext,
    marginTop: 6,
  },

  // ── Results: risk circle ───────────────────────────────────────────────
  riskCircleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  riskCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  riskPercent: {
    fontSize: 32,
    fontWeight: '800',
  },
  riskPercentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.subtext,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  riskLabel: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Results: class probabilities ───────────────────────────────────────
  probabilitiesCard: {
    backgroundColor: Colors.violetLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    marginBottom: 20,
  },
  probabilitiesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
    marginBottom: 12,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  probLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    width: 80,
  },
  probBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 10,
  },
  probBarFill: {
    height: 8,
    borderRadius: 4,
  },
  probValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    width: 48,
    textAlign: 'right',
  },

  // ── Results: feature breakdown ─────────────────────────────────────────
  featureSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.heading,
    marginBottom: 14,
  },
  featureList: {
    marginBottom: 20,
  },
  featureCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  featureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  protectiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: 6,
  },
  featureLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.heading,
    flexShrink: 1,
  },
  featureScore: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  featureScoreMax: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.subtext,
  },
  featureBarBg: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  featureBarFill: {
    height: 8,
    borderRadius: 4,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  impactArrow: {
    fontSize: 13,
    fontWeight: '800',
    marginRight: 4,
  },
  impactText: {
    fontSize: 11,
    fontWeight: '600',
  },
  impactPercent: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Results: advice card ───────────────────────────────────────────────
  adviceCard: {
    backgroundColor: Colors.violetLight,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    marginBottom: 20,
  },
  adviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.btnPrimary,
    marginBottom: 10,
  },
  adviceText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.text,
    lineHeight: 21,
  },

  // ── Results: action buttons ────────────────────────────────────────────
  resultActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  retryBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.btnPrimary,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.btnPrimary,
  },
  continueBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.btnPrimary,
    paddingVertical: 14,
    alignItems: 'center',
    marginLeft: 8,
    ...Platform.select({
      ios: {
        shadowColor: Colors.btnPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
