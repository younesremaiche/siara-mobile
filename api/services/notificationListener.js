const pool = require("../db");
const {
  emitNotificationCreatedToUser,
  hasActiveNotificationSubscriber,
} = require("./notificationSocket");
const { markNotificationAsSent } = require("./notificationsService");
const { evaluateAndSendPushForNotification } = require("./pushService");

const LISTEN_CHANNEL = "siara_notification_created";
const NOTIFICATION_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NOTIFICATION_DEBUG === "true";

let listenerClient = null;
let reconnectTimer = null;
let isStarting = false;

function normalizeNotificationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return {
    ...payload,
    userId: payload.userId || payload.user_id || null,
    reportId: payload.reportId || payload.report_id || null,
    operationalAlertId:
      payload.operationalAlertId || payload.operational_alert_id || null,
    createdAt: payload.createdAt || payload.created_at || null,
    eventType: payload.eventType || payload.event_type || null,
  };
}

function scheduleReconnect() {
  listenerClient = null;

  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startNotificationListener().catch((error) => {
      console.error("[notifications] listener_reconnect_failed", {
        message: error.message,
      });
    });
  }, 5000);
}

async function handlePgNotification(message) {
  if (message.channel !== LISTEN_CHANNEL || !message.payload) {
    return;
  }

  let payload;
  try {
    payload = normalizeNotificationPayload(JSON.parse(message.payload));
  } catch (error) {
    console.error("[notifications] invalid_notify_payload", {
      message: error.message,
      payload: message.payload,
    });
    return;
  }

  if (!payload?.id || !payload?.userId) {
    return;
  }

  if (NOTIFICATION_DEBUG_ENABLED) {
    console.info("[notifications] notify_received", {
      channel: message.channel,
      notificationId: payload.id,
      userId: payload.userId,
      reportId: payload.reportId,
      eventType: payload.eventType,
    });
  }

  evaluateAndSendPushForNotification(payload, pool).catch((error) => {
    console.error("[push] evaluate_failed", {
      message: error.message,
      notificationId: payload.id,
      userId: payload.userId,
    });
  });

  if (!hasActiveNotificationSubscriber(payload.userId)) {
    if (NOTIFICATION_DEBUG_ENABLED) {
      console.info("[notifications] user_offline", {
        notificationId: payload.id,
        userId: payload.userId,
        status: payload.status,
      });
    }
    return;
  }

  let deliveredPayload = payload;
  try {
    const updatedNotification = await markNotificationAsSent(payload.id, pool);
    if (updatedNotification) {
      deliveredPayload = {
        ...payload,
        status: updatedNotification.status,
        sentAt: updatedNotification.sentAt,
      };
    }
  } catch (error) {
    console.error("[notifications] mark_sent_failed", {
      message: error.message,
      notificationId: payload.id,
    });
  }

  if (NOTIFICATION_DEBUG_ENABLED) {
    console.info("[notifications] emit_live", {
      notificationId: payload.id,
      userId: payload.userId,
      status: deliveredPayload.status,
    });
  }
  emitNotificationCreatedToUser(payload.userId, deliveredPayload);
}

async function createListenerClient() {
  const client = pool.createDedicatedClient();

  client.on("notification", (message) => {
    handlePgNotification(message).catch((error) => {
      console.error("[notifications] listener_message_failed", {
        message: error.message,
      });
    });
  });

  client.on("error", (error) => {
    console.error("[notifications] listener_error", {
      message: error.message,
    });
    scheduleReconnect();
  });

  client.on("end", () => {
    console.warn("[notifications] listener_ended");
    scheduleReconnect();
  });

  await client.connect();
  await client.query(`LISTEN ${LISTEN_CHANNEL}`);

  console.info("[notifications] listener_ready", {
    channel: LISTEN_CHANNEL,
  });

  return client;
}

async function startNotificationListener() {
  if (listenerClient || isStarting) {
    return listenerClient;
  }

  isStarting = true;
  try {
    listenerClient = await createListenerClient();
    return listenerClient;
  } finally {
    isStarting = false;
  }
}

module.exports = {
  startNotificationListener,
};
