const { Server } = require("socket.io");

const {
  resolveAuthenticatedUser,
} = require("../contollers/verifytoken");
const {
  markAllNotificationsAsRead,
  markNotificationAsDelivered,
  markNotificationAsRead,
} = require("./notificationsService");

let io = null;
const NOTIFICATION_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NOTIFICATION_DEBUG === "true";

function getUserRoom(userId) {
  return `user:${userId}`;
}

function emitAck(callback, payload) {  
  if (typeof callback === "function") {
    callback(payload);
  }
}

function hasActiveNotificationSubscriber(userId) {
  if (!io || !userId) {
    return false;
  }

  const room = io.sockets.adapter.rooms.get(getUserRoom(userId));
  return Boolean(room && room.size > 0);
}

function emitNotificationCreatedToUser(userId, notification) {
  if (!io || !userId || !notification) {
    return;
  }

  io.to(getUserRoom(userId)).emit("notification:created", notification);
}

function broadcastNotificationUpdated(userId, notification) {
  if (!io || !userId || !notification) {
    return;
  }

  io.to(getUserRoom(userId)).emit("notification:updated", notification);
}

function broadcastNotificationsReadAll(userId, payload) {
  if (!io || !userId || !payload) {
    return;
  }

  io.to(getUserRoom(userId)).emit("notification:allRead", payload);
}

function initializeNotificationSocketServer(server, options = {}) {
  if (io) {
    return io;
  }

  io = new Server(server, options);

  io.use(async (socket, next) => {
    try {
      socket.data.user = await resolveAuthenticatedUser(socket.handshake);
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.user?.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    if (NOTIFICATION_DEBUG_ENABLED) {
      console.info("[notifications] socket_connected", {
        socketId: socket.id,
        userId,
      });
    }

    socket.join(getUserRoom(userId));
    socket.emit("notification:subscribed", { room: getUserRoom(userId) });

    socket.on("notification:subscribe", (_payload, callback) => {
      socket.join(getUserRoom(userId));
      if (NOTIFICATION_DEBUG_ENABLED) {
        console.info("[notifications] socket_subscribed", {
          socketId: socket.id,
          userId,
          room: getUserRoom(userId),
        });
      }
      emitAck(callback, { ok: true, room: getUserRoom(userId) });
    });

    socket.on("notification:delivered", async (payload, callback) => {
      try {
        const notification = await markNotificationAsDelivered(userId, payload?.notificationId);
        if (!notification) {
          emitAck(callback, { ok: false, message: "Notification not found" });
          return;
        }

        if (NOTIFICATION_DEBUG_ENABLED) {
          console.info("[notifications] delivery_acknowledged", {
            socketId: socket.id,
            userId,
            notificationId: payload?.notificationId,
            status: notification.status,
          });
        }
        broadcastNotificationUpdated(userId, notification);
        emitAck(callback, { ok: true, notification });
      } catch (error) {
        emitAck(callback, { ok: false, message: error.message });
      }
    });

    socket.on("notification:read", async (payload, callback) => {
      try {
        const notification = await markNotificationAsRead(userId, payload?.notificationId);
        if (!notification) {
          emitAck(callback, { ok: false, message: "Notification not found" });
          return;
        }

        if (NOTIFICATION_DEBUG_ENABLED) {
          console.info("[notifications] marked_read_via_socket", {
            socketId: socket.id,
            userId,
            notificationId: payload?.notificationId,
          });
        }
        broadcastNotificationUpdated(userId, notification);
        emitAck(callback, { ok: true, notification });
      } catch (error) {
        emitAck(callback, { ok: false, message: error.message });
      }
    });

    socket.on("notification:readAll", async (_payload, callback) => {
      try {
        const result = await markAllNotificationsAsRead(userId);
        const broadcastPayload = {
          ids: result.ids,
          readAt: result.readAt,
        };

        if (NOTIFICATION_DEBUG_ENABLED) {
          console.info("[notifications] marked_all_read_via_socket", {
            socketId: socket.id,
            userId,
            updatedCount: result.updatedCount,
          });
        }
        broadcastNotificationsReadAll(userId, broadcastPayload);
        emitAck(callback, { ok: true, ...result });
      } catch (error) {
        emitAck(callback, { ok: false, message: error.message });
      }
    });

    socket.on("disconnect", (reason) => {
      if (NOTIFICATION_DEBUG_ENABLED) {
        console.info("[notifications] socket_disconnected", {
          socketId: socket.id,
          userId,
          reason,
        });
      }
    });
  });

  return io;
}

module.exports = {
  broadcastNotificationUpdated,
  broadcastNotificationsReadAll,
  emitNotificationCreatedToUser,
  getNotificationSocketServer: () => io,
  getUserRoom,
  hasActiveNotificationSubscriber,
  initializeNotificationSocketServer,
};
