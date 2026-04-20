export const DRIVER_QUIZ_STORAGE_KEY = 'siara.driverQuiz.state.v1';
export const DRIVER_QUIZ_LEGACY_COMPLETED_KEY = 'siara_quiz_completed';
export const DRIVER_QUIZ_LEGACY_ANSWERS_KEY = 'siara_quiz_answers';

export const DRIVER_QUIZ_PAYLOAD_KEYS = [
  'dissociative',
  'anxious',
  'risky',
  'angry',
  'high_velocity',
  'distress_reduction',
  'patient',
  'careful',
  'errors',
  'violations',
  'lapses',
];

export const STREAM_STATUS_LABELS = {
  starting: 'Preparing explanation...',
  loading_model: 'Loading local language model...',
  generating: 'Generating explanation...',
  finalizing: 'Finalizing response...',
  fallback: 'Using deterministic fallback explanation...',
  done: 'Explanation ready.',
};

export const DRIVER_QUIZ_SCALE_OPTIONS = [
  { value: 0, label: 'Never', color: '#22c55e' },
  { value: 1, label: 'Rarely', color: '#84cc16' },
  { value: 2, label: 'Sometimes', color: '#eab308' },
  { value: 3, label: 'Often', color: '#f97316' },
  { value: 4, label: 'Very Often', color: '#ef4444' },
  { value: 5, label: 'Always', color: '#dc2626' },
];

export const DRIVER_QUIZ_SECTIONS = [
  {
    id: 'attention',
    title: 'Attention & Focus',
    icon: 'eye-outline',
    accentColor: '#6366f1',
    questions: [
      {
        id: 1,
        text: "How often do you find your mind wandering away from driving while you're behind the wheel?",
        reversed: false,
      },
      {
        id: 2,
        text: "How often do you realize you missed something on the road because you weren't fully paying attention?",
        reversed: false,
      },
    ],
  },
  {
    id: 'anxiety',
    title: 'Driving Anxiety',
    icon: 'alert-circle-outline',
    accentColor: '#8b5cf6',
    questions: [
      {
        id: 3,
        text: 'How often do you feel nervous or tense when driving, even in normal traffic?',
        reversed: false,
      },
      {
        id: 4,
        text: "How often do you worry about getting into a crash while you're driving?",
        reversed: false,
      },
    ],
  },
  {
    id: 'risk-taking',
    title: 'Risk Taking',
    icon: 'flash-outline',
    accentColor: '#f97316',
    questions: [
      {
        id: 5,
        text: "How often do you take chances while driving, like overtaking when it's a bit risky?",
        reversed: false,
      },
      {
        id: 6,
        text: 'How often do you feel comfortable driving faster than others when the road is clear?',
        reversed: false,
      },
      {
        id: 7,
        text: 'How often do you push yourself to drive in situations you know are a bit dangerous (like on narrow or busy roads)?',
        reversed: false,
      },
    ],
  },
  {
    id: 'anger',
    title: 'Anger & Aggression',
    icon: 'flame-outline',
    accentColor: '#ef4444',
    questions: [
      {
        id: 8,
        text: 'How often do you feel angry or furious at other drivers when they annoy you?',
        reversed: false,
      },
      {
        id: 9,
        text: 'How often do you get frustrated and drive more aggressively after being cut off?',
        reversed: false,
      },
      {
        id: 10,
        text: 'How often do you shout at other drivers or make rude gestures at them?',
        reversed: false,
      },
    ],
  },
  {
    id: 'sensation',
    title: 'Sensation Seeking',
    icon: 'speedometer-outline',
    accentColor: '#dc2626',
    questions: [
      {
        id: 11,
        text: 'How often do you drive much faster than the speed limit for the thrill of it?',
        reversed: false,
      },
      {
        id: 12,
        text: 'How often do you feel excited when driving at very high speeds on open roads?',
        reversed: false,
      },
    ],
  },
  {
    id: 'stress-relief',
    title: 'Stress Relief',
    icon: 'leaf-outline',
    accentColor: '#14b8a6',
    questions: [
      {
        id: 13,
        text: 'How often do you drive to relax or reduce stress?',
        reversed: true,
      },
      {
        id: 14,
        text: 'How often do you take a drive just to clear your mind or calm down?',
        reversed: true,
      },
      {
        id: 15,
        text: 'How often do you feel less stressed after a long drive?',
        reversed: true,
      },
    ],
  },
  {
    id: 'patience',
    title: 'Patience & Calmness',
    icon: 'happy-outline',
    accentColor: '#22c55e',
    questions: [
      {
        id: 16,
        text: "How often do you stay calm and patient even when you're stuck in a traffic jam?",
        reversed: true,
      },
      {
        id: 17,
        text: 'How often do you keep your cool when other drivers are slow or make mistakes?',
        reversed: true,
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety Consciousness',
    icon: 'shield-checkmark-outline',
    accentColor: '#16a34a',
    questions: [
      {
        id: 18,
        text: 'How often do you drive carefully to avoid accidents?',
        reversed: true,
      },
      {
        id: 19,
        text: 'How often do you follow all traffic rules (speed limits, signals, etc.) because safety is important to you?',
        reversed: true,
      },
      {
        id: 20,
        text: 'How often do you pay extra attention to the road and surroundings to avoid mistakes?',
        reversed: true,
      },
    ],
  },
  {
    id: 'violations',
    title: 'Traffic Violations',
    icon: 'warning-outline',
    accentColor: '#f97316',
    questions: [
      {
        id: 21,
        text: 'How often do you exceed the speed limit when driving?',
        reversed: false,
      },
      {
        id: 22,
        text: 'How often do you tailgate (follow too closely) the vehicle in front of you?',
        reversed: false,
      },
      {
        id: 23,
        text: 'How often do you overtake another vehicle by briefly driving in the oncoming lane?',
        reversed: false,
      },
      {
        id: 24,
        text: 'How often do you drive through a red light or fail to fully stop at a stop sign?',
        reversed: false,
      },
      {
        id: 25,
        text: 'How often do you use your mobile phone (text or call) while driving?',
        reversed: false,
      },
      {
        id: 26,
        text: 'How often do you get angry at other drivers and express it by shouting or honking?',
        reversed: false,
      },
    ],
  },
  {
    id: 'errors',
    title: 'Driving Errors',
    icon: 'alert-outline',
    accentColor: '#f59e0b',
    questions: [
      {
        id: 27,
        text: 'How often do you misjudge the distance or speed of another vehicle when overtaking or merging?',
        reversed: false,
      },
      {
        id: 28,
        text: 'How often do you accidentally press the gas pedal when you meant to hit the brake (or vice versa)?',
        reversed: false,
      },
      {
        id: 29,
        text: "How often do you fail to notice a traffic sign or signal until it's too late?",
        reversed: false,
      },
      {
        id: 30,
        text: 'How often do you overlook a pedestrian or cyclist when making a turn?',
        reversed: false,
      },
      {
        id: 31,
        text: 'How often do you have to brake suddenly because you only just noticed something you missed?',
        reversed: false,
      },
    ],
  },
  {
    id: 'lapses',
    title: 'Memory Lapses',
    icon: 'cloud-outline',
    accentColor: '#6366f1',
    questions: [
      {
        id: 32,
        text: 'How often do you find yourself driving on "autopilot," arriving at your destination without remembering parts of the trip?',
        reversed: false,
      },
      {
        id: 33,
        text: 'How often do you miss your exit or turn because you were distracted or daydreaming?',
        reversed: false,
      },
      {
        id: 34,
        text: 'How often do you get lost or forget which way to go while driving?',
        reversed: false,
      },
      {
        id: 35,
        text: 'How often do you forget where you parked your car?',
        reversed: false,
      },
    ],
  },
  {
    id: 'habits',
    title: 'Driving Habits',
    icon: 'car-sport-outline',
    accentColor: '#64748b',
    questions: [
      {
        id: 36,
        text: 'How often do you forget to signal when changing lanes or turning?',
        reversed: false,
      },
      {
        id: 37,
        text: 'How often do you forget to check your mirrors or blind spots before changing lanes?',
        reversed: false,
      },
      {
        id: 38,
        text: 'How often do you become distracted (by something like a phone or music) and then miss something happening on the road?',
        reversed: false,
      },
      {
        id: 39,
        text: 'How often do you start driving without fastening your seatbelt and realize it soon after?',
        reversed: false,
      },
      {
        id: 40,
        text: 'How often do you find yourself multitasking (like adjusting the radio or grabbing something) and briefly drifting out of your lane?',
        reversed: false,
      },
    ],
  },
];

export const DRIVER_QUIZ_FLAT_QUESTIONS = DRIVER_QUIZ_SECTIONS.flatMap((section, sectionIndex) =>
  section.questions.map((question, questionIndex) => ({
    ...question,
    sectionId: section.id,
    sectionTitle: section.title,
    sectionIndex,
    sectionIcon: section.icon,
    sectionAccentColor: section.accentColor,
    questionIndex,
  })),
);

export const DRIVER_QUIZ_TOTAL_QUESTIONS = DRIVER_QUIZ_FLAT_QUESTIONS.length;

export function getDriverQuizQuestionAt(index) {
  return DRIVER_QUIZ_FLAT_QUESTIONS[index] || null;
}

export function getDriverQuizSectionById(sectionId) {
  return DRIVER_QUIZ_SECTIONS.find((section) => section.id === sectionId) || null;
}

export function getQuestionAnswerValue(answer) {
  if (answer && typeof answer === 'object') {
    const numericObjectValue = Number(answer.value);
    if (Number.isFinite(numericObjectValue)) {
      return numericObjectValue;
    }
  }

  const numericValue = Number(answer);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function getQuestionRiskScore(question, answerValue) {
  const numericValue = Number(answerValue);
  if (!Number.isFinite(numericValue) || !question) {
    return null;
  }

  return question.reversed ? 5 - numericValue : numericValue;
}

export function avg(list) {
  if (!list.length) {
    return 0;
  }

  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

export function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

export function scoreToPercent(value) {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), 5);
  return Math.round((clamped / 5) * 100);
}

export function computeSectionMeans(sourceAnswers) {
  const sections = {};

  DRIVER_QUIZ_SECTIONS.forEach((section) => {
    const scores = section.questions
      .map((question) => {
        const storedAnswer = sourceAnswers?.[question.id];
        if (storedAnswer && typeof storedAnswer === 'object') {
          const riskScore = Number(storedAnswer.riskScore);
          if (Number.isFinite(riskScore)) {
            return riskScore;
          }
        }

        const answerValue = getQuestionAnswerValue(storedAnswer);
        return getQuestionRiskScore(question, answerValue);
      })
      .filter((value) => typeof value === 'number');

    sections[section.id] = avg(scores);
  });

  return sections;
}

export function buildDriverQuizPayload(sourceAnswers) {
  const sectionMeans = computeSectionMeans(sourceAnswers);

  return {
    dissociative: round(sectionMeans.attention || 0),
    anxious: round(sectionMeans.anxiety || 0),
    risky: round(sectionMeans['risk-taking'] || 0),
    angry: round(sectionMeans.anger || 0),
    high_velocity: round(sectionMeans.sensation || 0),
    distress_reduction: round(sectionMeans['stress-relief'] || 0),
    patient: round(sectionMeans.patience || 0),
    careful: round(sectionMeans.safety || 0),
    errors: round(avg([sectionMeans.errors || 0, sectionMeans.habits || 0])),
    violations: round(sectionMeans.violations || 0),
    lapses: round(sectionMeans.lapses || 0),
  };
}

export function isDriverQuizComplete(answers) {
  return DRIVER_QUIZ_FLAT_QUESTIONS.every((question) => {
    const value = getQuestionAnswerValue(answers?.[question.id]);
    return Number.isFinite(value);
  });
}
