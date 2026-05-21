const pool = require("../db");

const DEFAULT_QUIZ_VERSION = "siara-driver-quiz-v1";
const DEFAULT_TOTAL_QUESTIONS = 40;
const RESULT_LABELS = Object.freeze({
  LOW: "low_risk",
  MODERATE: "moderate_risk",
  HIGH: "high_risk",
  VERY_HIGH: "very_high_risk",
});

const RESULT_TEMPLATES = Object.freeze({
  [RESULT_LABELS.LOW]: {
    title: "Low-risk driving profile",
    description: "Your answers suggest generally safe driving habits.",
    recommendation:
      "Continue maintaining safe habits such as respecting speed limits, avoiding distractions, and staying alert.",
  },
  [RESULT_LABELS.MODERATE]: {
    title: "Moderate-risk driving profile",
    description: "Your answers show some habits that may increase accident risk.",
    recommendation:
      "Focus on reducing risky behaviors such as distraction, fatigue, sudden maneuvers, or speeding.",
  },
  [RESULT_LABELS.HIGH]: {
    title: "High-risk driving profile",
    description:
      "Your answers suggest several behaviors that may increase your probability of being involved in a road incident.",
    recommendation:
      "You should review your driving habits carefully and prioritize safer behavior, especially speed control, attention, and respect for road rules.",
  },
  [RESULT_LABELS.VERY_HIGH]: {
    title: "Very high-risk driving profile",
    description: "Your answers indicate frequent risky driving behaviors.",
    recommendation:
      "Strongly consider changing these habits immediately. Avoid phone use, speeding, aggressive driving, and driving while tired.",
  },
});

const DEV_LOGS_ENABLED = (process.env.NODE_ENV || "development") !== "production";

function logQuiz(event, details = {}) {
  if (DEV_LOGS_ENABLED) {
    console.info("[driver-quiz]", event, details);
  }
}

function clampRiskScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function pickResultLabel(riskScore) {
  if (riskScore <= 25) return RESULT_LABELS.LOW;
  if (riskScore <= 50) return RESULT_LABELS.MODERATE;
  if (riskScore <= 75) return RESULT_LABELS.HIGH;
  return RESULT_LABELS.VERY_HIGH;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ensureUuid(value, label) {
  const stringValue = String(value || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stringValue)
  ) {
    const error = new Error(`Invalid ${label}`);
    error.status = 400;
    throw error;
  }
  return stringValue;
}

async function startDriverQuiz(userId, options = {}) {
  if (!userId) {
    const error = new Error("userId is required");
    error.status = 400;
    throw error;
  }

  const result = await pool.query(
    `
      insert into app.driver_quiz_attempts (
        user_id,
        quiz_version,
        status,
        total_questions,
        metadata
      )
      values ($1, $2, 'in_progress', $3, $4::jsonb)
      returning id, started_at, status, quiz_version, total_questions
    `,
    [
      userId,
      String(options.quizVersion || DEFAULT_QUIZ_VERSION),
      Number.isInteger(options.totalQuestions) ? options.totalQuestions : DEFAULT_TOTAL_QUESTIONS,
      JSON.stringify(options.metadata || {}),
    ],
  );

  const attempt = result.rows[0];
  logQuiz("quiz_started", { userId, attemptId: attempt.id });
  return {
    attemptId: attempt.id,
    startedAt: attempt.started_at,
    status: attempt.status,
    quizVersion: attempt.quiz_version,
    totalQuestions: attempt.total_questions,
  };
}

async function loadAttemptForUser(attemptId, userId, db = pool) {
  const result = await db.query(
    `
      select id, user_id, status, total_questions, answered_questions,
             risk_score, result_label
      from app.driver_quiz_attempts
      where id = $1
      limit 1
    `,
    [attemptId],
  );
  const row = result.rows[0];
  if (!row) {
    const error = new Error("Quiz attempt not found");
    error.status = 404;
    throw error;
  }
  if (row.user_id !== userId) {
    const error = new Error("This quiz attempt does not belong to the current user");
    error.status = 403;
    throw error;
  }
  return row;
}

async function saveDriverQuizResponse(userId, attemptId, response = {}) {
  ensureUuid(attemptId, "attemptId");
  const attempt = await loadAttemptForUser(attemptId, userId);
  if (attempt.status !== "in_progress") {
    const error = new Error("Quiz attempt is not in progress");
    error.status = 409;
    throw error;
  }

  const questionId = String(response.questionId ?? response.question_id ?? "").trim();
  if (!questionId) {
    const error = new Error("questionId is required");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const upsert = await client.query(
      `
        insert into app.driver_quiz_responses (
          attempt_id, user_id, question_id, question_text, question_category,
          selected_option_id, selected_option_text, selected_value,
          risk_points, max_points, answer_snapshot, answered_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
        on conflict (attempt_id, question_id) do update
          set question_text = excluded.question_text,
              question_category = excluded.question_category,
              selected_option_id = excluded.selected_option_id,
              selected_option_text = excluded.selected_option_text,
              selected_value = excluded.selected_value,
              risk_points = excluded.risk_points,
              max_points = excluded.max_points,
              answer_snapshot = excluded.answer_snapshot,
              answered_at = now()
        returning id, (xmax = 0) as is_new
      `,
      [
        attemptId,
        userId,
        questionId,
        response.questionText ?? response.question_text ?? null,
        response.questionCategory ?? response.question_category ?? null,
        response.selectedOptionId ?? response.selected_option_id ?? null,
        response.selectedOptionText ?? response.selected_option_text ?? null,
        response.selectedValue ?? response.selected_value ?? null,
        safeNumber(response.riskPoints ?? response.risk_points, null),
        safeNumber(response.maxPoints ?? response.max_points, null),
        JSON.stringify(response.answerSnapshot || response.answer_snapshot || {}),
      ],
    );

    const countResult = await client.query(
      `select count(*)::int as answered_count from app.driver_quiz_responses where attempt_id = $1`,
      [attemptId],
    );
    const answeredCount = countResult.rows[0]?.answered_count || 0;

    await client.query(
      `update app.driver_quiz_attempts set answered_questions = $2, updated_at = now() where id = $1`,
      [attemptId, answeredCount],
    );

    await client.query("commit");
    logQuiz("response_saved", {
      userId,
      attemptId,
      questionId,
      answeredCount,
      isNew: upsert.rows[0]?.is_new === true,
    });

    return {
      attemptId,
      questionId,
      answeredQuestions: answeredCount,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function aggregateScores(rows) {
  let rawScore = 0;
  let maxScore = 0;
  const categoryRaw = new Map();
  const categoryMax = new Map();

  for (const row of rows) {
    const risk = Number(row.risk_points);
    const max = Number(row.max_points);
    if (Number.isFinite(risk)) rawScore += risk;
    if (Number.isFinite(max) && max > 0) maxScore += max;

    const category = String(row.question_category || "").trim() || "uncategorized";
    if (Number.isFinite(risk)) {
      categoryRaw.set(category, (categoryRaw.get(category) || 0) + risk);
    }
    if (Number.isFinite(max) && max > 0) {
      categoryMax.set(category, (categoryMax.get(category) || 0) + max);
    }
  }

  const categoryScores = {};
  for (const category of categoryRaw.keys()) {
    const raw = categoryRaw.get(category) || 0;
    const max = categoryMax.get(category) || 0;
    const pct = max > 0 ? Math.round((raw / max) * 100) : 0;
    categoryScores[category] = {
      raw,
      max,
      riskScore: Math.max(0, Math.min(100, pct)),
    };
  }

  return { rawScore, maxScore, categoryScores };
}

async function refreshUserDriverQuizProfile(client, userId, attempt) {
  const stats = await client.query(
    `
      select
        count(*) filter (where status = 'completed')::int as completed_count,
        max(risk_score) filter (where status = 'completed') as worst_risk,
        min(risk_score) filter (where status = 'completed') as best_risk,
        avg(risk_score) filter (where status = 'completed')::numeric(5,2) as avg_risk
      from app.driver_quiz_attempts
      where user_id = $1
    `,
    [userId],
  );
  const row = stats.rows[0] || {};

  await client.query(
    `
      insert into app.user_driver_quiz_profile (
        user_id,
        latest_attempt_id,
        latest_risk_score,
        latest_result_label,
        latest_result_title,
        latest_result_description,
        latest_recommendation_description,
        category_scores,
        completed_attempts_count,
        best_risk_score,
        worst_risk_score,
        average_risk_score,
        last_completed_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, now())
      on conflict (user_id) do update
        set latest_attempt_id = excluded.latest_attempt_id,
            latest_risk_score = excluded.latest_risk_score,
            latest_result_label = excluded.latest_result_label,
            latest_result_title = excluded.latest_result_title,
            latest_result_description = excluded.latest_result_description,
            latest_recommendation_description = excluded.latest_recommendation_description,
            category_scores = excluded.category_scores,
            completed_attempts_count = excluded.completed_attempts_count,
            best_risk_score = excluded.best_risk_score,
            worst_risk_score = excluded.worst_risk_score,
            average_risk_score = excluded.average_risk_score,
            last_completed_at = excluded.last_completed_at,
            updated_at = now()
    `,
    [
      userId,
      attempt.id,
      attempt.risk_score,
      attempt.result_label,
      attempt.result_title,
      attempt.result_description,
      attempt.recommendation_description,
      JSON.stringify(attempt.category_scores || {}),
      Number(row.completed_count || 0),
      row.best_risk == null ? null : Number(row.best_risk),
      row.worst_risk == null ? null : Number(row.worst_risk),
      row.avg_risk == null ? null : Number(row.avg_risk),
      attempt.completed_at,
    ],
  );
}

async function completeDriverQuiz(userId, attemptId) {
  ensureUuid(attemptId, "attemptId");
  await loadAttemptForUser(attemptId, userId);

  const client = await pool.connect();
  try {
    await client.query("begin");

    const attemptRow = await client.query(
      `select id, user_id, status, total_questions
         from app.driver_quiz_attempts
         where id = $1
         for update`,
      [attemptId],
    );
    const attempt = attemptRow.rows[0];
    if (!attempt || attempt.user_id !== userId) {
      const error = new Error("Quiz attempt not found");
      error.status = 404;
      throw error;
    }
    if (attempt.status === "completed") {
      const error = new Error("Quiz attempt is already completed");
      error.status = 409;
      throw error;
    }

    const responseRows = await client.query(
      `
        select question_id, question_category, risk_points, max_points
        from app.driver_quiz_responses
        where attempt_id = $1
      `,
      [attemptId],
    );

    if (responseRows.rowCount === 0) {
      const error = new Error("Cannot complete a quiz without responses");
      error.status = 400;
      throw error;
    }

    const { rawScore, maxScore, categoryScores } = aggregateScores(responseRows.rows);
    const riskScore =
      maxScore > 0 ? clampRiskScore((rawScore / maxScore) * 100) : 0;
    const resultLabel = pickResultLabel(riskScore);
    const template = RESULT_TEMPLATES[resultLabel];

    const updated = await client.query(
      `
        update app.driver_quiz_attempts
        set status = 'completed',
            answered_questions = $2,
            raw_score = $3,
            max_score = $4,
            risk_score = $5,
            result_label = $6,
            result_title = $7,
            result_description = $8,
            recommendation_description = $9,
            category_scores = $10::jsonb,
            completed_at = now(),
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        attemptId,
        responseRows.rowCount,
        rawScore,
        maxScore,
        riskScore,
        resultLabel,
        template.title,
        template.description,
        template.recommendation,
        JSON.stringify(categoryScores),
      ],
    );

    const updatedAttempt = updated.rows[0];
    await refreshUserDriverQuizProfile(client, userId, updatedAttempt);
    await client.query("commit");

    logQuiz("quiz_completed", {
      userId,
      attemptId,
      riskScore,
      resultLabel,
      answered: responseRows.rowCount,
    });

    return {
      attemptId,
      status: "completed",
      riskScore,
      resultLabel,
      resultTitle: template.title,
      resultDescription: template.description,
      recommendationDescription: template.recommendation,
      rawScore,
      maxScore,
      categoryScores,
      completedAt: updatedAttempt.completed_at,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getDriverQuizProfile(userId, db = pool) {
  const profile = await db.query(
    `
      select
        p.*,
        a.started_at as latest_started_at
      from app.user_driver_quiz_profile p
      left join app.driver_quiz_attempts a on a.id = p.latest_attempt_id
      where p.user_id = $1
      limit 1
    `,
    [userId],
  );
  if (profile.rowCount === 0) {
    return null;
  }
  const row = profile.rows[0];
  return {
    userId,
    latestAttemptId: row.latest_attempt_id,
    latestRiskScore: row.latest_risk_score == null ? null : Number(row.latest_risk_score),
    latestResultLabel: row.latest_result_label,
    latestResultTitle: row.latest_result_title,
    latestResultDescription: row.latest_result_description,
    latestRecommendationDescription: row.latest_recommendation_description,
    categoryScores: row.category_scores || {},
    completedAttemptsCount: Number(row.completed_attempts_count || 0),
    bestRiskScore: row.best_risk_score == null ? null : Number(row.best_risk_score),
    worstRiskScore: row.worst_risk_score == null ? null : Number(row.worst_risk_score),
    averageRiskScore: row.average_risk_score == null ? null : Number(row.average_risk_score),
    lastCompletedAt: row.last_completed_at,
    latestStartedAt: row.latest_started_at,
    updatedAt: row.updated_at,
  };
}

async function listDriverQuizHistory(userId, { limit = 20, offset = 0 } = {}, db = pool) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const result = await db.query(
    `
      select id, status, risk_score, result_label, result_title,
             total_questions, answered_questions, started_at, completed_at, created_at
      from app.driver_quiz_attempts
      where user_id = $1
      order by coalesce(completed_at, created_at) desc
      limit $2 offset $3
    `,
    [userId, safeLimit + 1, safeOffset],
  );
  const hasMore = result.rows.length > safeLimit;
  const rows = hasMore ? result.rows.slice(0, safeLimit) : result.rows;
  return {
    attempts: rows.map((row) => ({
      id: row.id,
      status: row.status,
      riskScore: row.risk_score == null ? null : Number(row.risk_score),
      resultLabel: row.result_label,
      resultTitle: row.result_title,
      totalQuestions: row.total_questions,
      answeredQuestions: row.answered_questions,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    })),
    pagination: { limit: safeLimit, offset: safeOffset, hasMore },
  };
}

async function getDriverQuizAttempt(userId, attemptId, db = pool) {
  ensureUuid(attemptId, "attemptId");
  const attempt = await db.query(
    `select * from app.driver_quiz_attempts where id = $1 and user_id = $2 limit 1`,
    [attemptId, userId],
  );
  if (attempt.rowCount === 0) return null;
  const responses = await db.query(
    `
      select question_id, question_text, question_category, selected_option_id,
             selected_option_text, selected_value, risk_points, max_points,
             answer_snapshot, answered_at
      from app.driver_quiz_responses
      where attempt_id = $1
      order by answered_at asc
    `,
    [attemptId],
  );
  return {
    attempt: attempt.rows[0],
    responses: responses.rows,
  };
}

function canViewDriverQuizProfile(requestUser, targetUserId) {
  if (!requestUser || !targetUserId) return false;
  const requesterId = requestUser.userId || requestUser.id;
  if (requesterId && String(requesterId) === String(targetUserId)) return true;
  const roles = Array.isArray(requestUser.roles) ? requestUser.roles : [];
  if (roles.includes("admin")) return true;
  const policeRoles = ["police", "police_officer", "police officer"];
  if (roles.some((role) => policeRoles.includes(String(role).toLowerCase()))) return true;
  return false;
}

module.exports = {
  DEFAULT_QUIZ_VERSION,
  DEFAULT_TOTAL_QUESTIONS,
  RESULT_LABELS,
  RESULT_TEMPLATES,
  startDriverQuiz,
  saveDriverQuizResponse,
  completeDriverQuiz,
  getDriverQuizProfile,
  listDriverQuizHistory,
  getDriverQuizAttempt,
  canViewDriverQuizProfile,
  pickResultLabel,
  clampRiskScore,
};
