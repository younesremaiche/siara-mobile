const RISK_DEADLINE_MS_DEFAULT = Number(process.env.RISK_DEADLINE_MS || 20000);
const ML_DEADLINE_FLOOR_MS = Number(process.env.ML_DEADLINE_FLOOR_MS || 5000);

function createDeadline(totalMs) {
  const total = Number.isFinite(totalMs) && totalMs > 0 ? totalMs : RISK_DEADLINE_MS_DEFAULT;
  const startedAt = Date.now();
  const expiresAt = startedAt + total;
  return {
    startedAt,
    expiresAt,
    totalMs: total,
    remaining() { 
      return Math.max(0, expiresAt - Date.now());
    },
    expired() {
      return Date.now() >= expiresAt;
    },
  };
}

function axiosTimeoutFor(deadline, defaultMs, { floor = 500, ceil = null } = {}) {
  const baseMs = Number.isFinite(defaultMs) && defaultMs > 0 ? defaultMs : 0;
  if (!deadline) {
    return baseMs;
  }
  const remaining = deadline.remaining();
  if (remaining <= 0) {
    return floor;
  }
  const cap = ceil != null ? Math.min(baseMs || ceil, ceil) : baseMs;
  const upper = cap > 0 ? cap : remaining;
  return Math.max(floor, Math.min(upper, remaining));
}

function flaskTimeoutFor(deadline, defaultMs) {
  const baseMs = Number.isFinite(defaultMs) && defaultMs > 0 ? defaultMs : 0;
  if (!deadline) {
    return baseMs;
  }
  const remaining = deadline.remaining();
  if (remaining <= 0) {
    return Math.min(baseMs || ML_DEADLINE_FLOOR_MS, ML_DEADLINE_FLOOR_MS);
  }
  return Math.min(baseMs || remaining, Math.max(ML_DEADLINE_FLOOR_MS, remaining));
}

function isDeadlineExpired(deadline) {
  return Boolean(deadline && deadline.expired());
}

function makeDeadlineError(label) {
  const err = new Error(`Deadline exceeded waiting for ${label}`);
  err.code = "DEADLINE_EXCEEDED";
  err.label = label;
  return err;
}

function makeQueueTimeoutError(label) {
  const err = new Error(`Queue wait timed out for ${label}`);
  err.code = "QUEUE_TIMEOUT";
  err.label = label;
  return err;
}

function withDeadline(promise, deadline, label) {
  if (!deadline) return Promise.resolve(promise);
  const remaining = deadline.remaining();
  if (remaining <= 0) {
    return Promise.reject(makeDeadlineError(label));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(makeDeadlineError(label));
    }, remaining);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function withRiskDeadline(handler, totalMs = RISK_DEADLINE_MS_DEFAULT) {
  return (req, res, next) => {
    if (!req.deadline) {
      req.deadline = createDeadline(totalMs);
    }
    return handler(req, res, next);
  };
}

module.exports = {
  RISK_DEADLINE_MS_DEFAULT,
  ML_DEADLINE_FLOOR_MS,
  createDeadline,
  axiosTimeoutFor,
  flaskTimeoutFor,
  isDeadlineExpired,
  makeDeadlineError,
  makeQueueTimeoutError,
  withDeadline,
  withRiskDeadline,
};
