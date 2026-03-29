const createError = require("http-errors");
const nodemailer = require("nodemailer");

const pool = require("../db");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

let cachedTransport = null;
let cachedTransportMeta = null;
let verifyTransportPromise = null;

function normalizeEnvString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isTruthyEnv(value) {
  return normalizeEnvString(value).toLowerCase() === "true";
}

function getSmtpConfig() {
  return {
    host: normalizeEnvString(process.env.SMTP_HOST),
    port: Number(process.env.SMTP_PORT || 587),
    secure: isTruthyEnv(process.env.SMTP_SECURE),
    user: normalizeEnvString(process.env.SMTP_USER),
    pass: normalizeEnvString(process.env.SMTP_PASS),
  };
}

function hasSmtpConfiguration() {
  const smtp = getSmtpConfig();
  return Boolean(smtp.host && smtp.user && smtp.pass);
}

function shouldUsePreviewTransport() {
  if (isTruthyEnv(process.env.EMAIL_PREVIEW)) {
    return true;
  }

  return !hasSmtpConfiguration();
}

function sanitizeEmailError(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || null,
    command: error?.command || null,
    responseCode: error?.responseCode || null,
    message: error?.message || "Email delivery failed",
  };
}

function getTransport() {
  if (cachedTransport && cachedTransportMeta) {
    return {
      transport: cachedTransport,
      meta: cachedTransportMeta,
    };
  }

  if (!shouldUsePreviewTransport()) {
    const smtp = getSmtpConfig();
    cachedTransport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
    cachedTransportMeta = {
      mode: "smtp",
      provider: normalizeEnvString(process.env.EMAIL_PROVIDER) || "smtp",
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      verified: false,
    };

    return {
      transport: cachedTransport,
      meta: cachedTransportMeta,
    };
  }

  cachedTransport = nodemailer.createTransport({ jsonTransport: true });
  cachedTransportMeta = {
    mode: "preview",
    provider: "jsonTransport",
    host: null,
    port: null,
    secure: false,
    verified: true,
  };

  console.warn("[email] preview_mode_enabled", {
    reason: isTruthyEnv(process.env.EMAIL_PREVIEW)
      ? "EMAIL_PREVIEW=true"
      : "smtp_not_configured",
  });

  return {
    transport: cachedTransport,
    meta: cachedTransportMeta,
  };
}

async function ensureTransportReady(transport, meta) {
  if (!transport || !meta || meta.mode !== "smtp") {
    return;
  }

  if (meta.verified) {
    return;
  }

  if (!verifyTransportPromise) {
    verifyTransportPromise = transport.verify()
      .then(() => {
        meta.verified = true;
        console.info("[email] smtp_ready", {
          provider: meta.provider,
          host: meta.host,
          port: meta.port,
          secure: meta.secure,
        });
      })
      .catch((error) => {
        verifyTransportPromise = null;
        console.error("[email] smtp_verify_failed", sanitizeEmailError(error));
        throw error;
      });
  }

  await verifyTransportPromise;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFromAddress() {
  const fromAddress = normalizeEnvString(process.env.EMAIL_FROM_ADDRESS);
  const fromName = normalizeEnvString(process.env.EMAIL_FROM_NAME) || "SIARA";

  if (fromAddress) {
    return `"${fromName}" <${fromAddress}>`;
  }

  const legacyFromAddress = normalizeEnvString(process.env.EMAIL_FROM);
  if (legacyFromAddress) {
    return legacyFromAddress;
  }

  if (hasSmtpConfiguration()) {
    return `"${fromName}" <${getSmtpConfig().user}>`;
  }

  return `"${fromName}" <preview@siara.local>`;
}

function renderVerifyEmailTemplate(data = {}) {
  const code = escapeHtml(data.code);
  const minutes = Number(data.expiresInMinutes || 10);
  return {
    text: [
      "Verify your SIARA account",
      "",
      `Your verification code is: ${code}`,
      `This code expires in ${minutes} minutes.`,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#6d28d9">Verify your SIARA account</h2>
        <p>Your verification code is:</p>
        <div style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f5f3ff;color:#6d28d9;font-size:28px;font-weight:700;letter-spacing:0.22em">
          ${code}
        </div>
        <p style="margin-top:16px">This code expires in ${minutes} minutes.</p>
        <p style="color:#6b7280">If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  };
}

function renderResetPasswordTemplate(data = {}) {
  const code = escapeHtml(data.code);
  const minutes = Number(data.expiresInMinutes || 10);
  return {
    text: [
      "Reset your SIARA password",
      "",
      `Your reset code is: ${code}`,
      `This code expires in ${minutes} minutes.`,
      "",
      "If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#6d28d9">Reset your SIARA password</h2>
        <p>Your reset code is:</p>
        <div style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f5f3ff;color:#6d28d9;font-size:28px;font-weight:700;letter-spacing:0.22em">
          ${code}
        </div>
        <p style="margin-top:16px">This code expires in ${minutes} minutes.</p>
        <p style="color:#6b7280">If you did not request a password reset, you can ignore this email.</p>
      </div>
    `,
  };
}

function renderWeeklySummaryTemplate(data = {}) {
  const fullName = escapeHtml(data.fullName || "there");
  const topZones = Array.isArray(data.topZones) ? data.topZones : [];
  const dashboardUrl = escapeHtml(data.dashboardUrl || "/dashboard");
  const mapUrl = escapeHtml(data.mapUrl || "/map");
  const topZonesHtml = topZones.length > 0
    ? `<ul style="padding-left:20px;margin:12px 0">${topZones.map((zone) => (
      `<li><strong>${escapeHtml(zone.zoneName)}</strong> - ${Number(zone.triggerCount || 0)} trigger${Number(zone.triggerCount || 0) === 1 ? "" : "s"}</li>`
    )).join("")}</ul>`
    : "<p style=\"color:#6b7280\">No hot zones stood out this week.</p>";

  return {
    text: [
      `Hello ${data.fullName || "there"},`,
      "",
      "Your SIARA weekly safety summary",
      `Incidents in watched zones: ${Number(data.incidentCount || 0)}`,
      `Alert triggers: ${Number(data.triggerCount || 0)}`,
      `Top incident type: ${data.topIncidentType || "No dominant incident type"}`,
      "",
      topZones.length > 0
        ? `Top triggered zones: ${topZones.map((zone) => `${zone.zoneName} (${zone.triggerCount})`).join(", ")}`
        : "Top triggered zones: No standout zones this week.",
      "",
      `Dashboard: ${dashboardUrl}`,
      `Map: ${mapUrl}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#6d28d9">Your SIARA weekly safety summary</h2>
        <p>Hello ${fullName},</p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0">
          <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Watched-zone incidents</div>
            <div style="margin-top:6px;font-size:24px;font-weight:700">${Number(data.incidentCount || 0)}</div>
          </div>
          <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Alert triggers</div>
            <div style="margin-top:6px;font-size:24px;font-weight:700">${Number(data.triggerCount || 0)}</div>
          </div>
          <div style="padding:14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Top incident type</div>
            <div style="margin-top:6px;font-size:18px;font-weight:700">${escapeHtml(data.topIncidentType || "No dominant incident type")}</div>
          </div>
        </div>
        <h3 style="margin:20px 0 8px;color:#0f172a">Top triggered zones</h3>
        ${topZonesHtml}
        <div style="margin-top:24px">
          <a href="${dashboardUrl}" style="display:inline-block;margin-right:12px;padding:10px 16px;border-radius:999px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700">Open dashboard</a>
          <a href="${mapUrl}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#ede9fe;color:#6d28d9;text-decoration:none;font-weight:700">Open map</a>
        </div>
      </div>
    `,
  };
}

function renderTemplate(templateKey, templateData = {}) {
  switch (templateKey) {
    case "verify_email_code":
      return renderVerifyEmailTemplate(templateData);
    case "reset_password_code":
      return renderResetPasswordTemplate(templateData);
    case "weekly_summary":
      return renderWeeklySummaryTemplate(templateData);
    default:
      throw createError(500, `Unsupported email template: ${templateKey}`);
  }
}

async function queueEmailLog({ userId, email, category, templateKey, subject, payload = {} }, db = pool) {
  const result = await db.query(
    `
      insert into app.email_messages (
        user_id,
        email,
        category,
        template_key,
        subject,
        status,
        payload
      )
      values ($1, $2, $3, $4, $5, 'queued', $6::jsonb)
      returning id
    `,
    [userId || null, email, category, templateKey, subject, JSON.stringify(payload)],
  );

  return result.rows[0]?.id || null;
}

async function markEmailSent(messageId, info, db = pool) {
  await db.query(
    `
      update app.email_messages
      set
        status = 'sent',
        provider_message_id = $2,
        sent_at = now(),
        error_message = null
      where id = $1
    `,
    [
      messageId,
      info?.messageId || info?.envelope?.messageId || null,
    ],
  );
}

async function markEmailFailed(messageId, error, db = pool) {
  await db.query(
    `
      update app.email_messages
      set
        status = 'failed',
        error_message = $2
      where id = $1
    `,
    [messageId, error?.message || "Email delivery failed"],
  );
}

async function sendTemplatedEmail({
  userId = null,
  email,
  category,
  templateKey,
  subject,
  templateData = {},
  payload = {},
}, db = pool) {
  if (!email) {
    throw createError(400, "Email address is required");
  }

  const messageId = await queueEmailLog({
    userId,
    email,
    category,
    templateKey,
    subject,
    payload,
  }, db);

  let transportMeta = null;

  try {
    const { transport, meta } = getTransport();
    transportMeta = meta;

    await ensureTransportReady(transport, meta);

    const rendered = renderTemplate(templateKey, templateData);
    const info = await transport.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      text: rendered.text,
      html: rendered.html,
    });

    await markEmailSent(messageId, info, db);

    console.info("[email] sent", {
      email,
      templateKey,
      mode: meta.mode,
      provider: meta.provider,
      providerMessageId: info?.messageId || null,
    });

    if (meta.mode === "preview" && !IS_PRODUCTION) {
      console.info("[email] preview_generated", {
        email,
        templateKey,
        provider: meta.provider,
      });
    }

    return {
      id: messageId,
      status: "sent",
      providerMessageId: info?.messageId || null,
      mode: meta.mode,
    };
  } catch (error) {
    await markEmailFailed(messageId, error, db);

    console.error("[email] send_failed", {
      email,
      templateKey,
      mode: transportMeta?.mode || null,
      provider: transportMeta?.provider || null,
      error: sanitizeEmailError(error),
    });

    throw error;
  }
}

module.exports = {
  getFromAddress,
  sendTemplatedEmail,
};
