import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

function resolveSocketBaseUrl() {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch (_error) {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
}

export function connectNotificationSocket(accessToken, handlers = {}) {
  if (!accessToken) return null;

  const socket = io(resolveSocketBaseUrl(), {
    transports: ['websocket'],
    autoConnect: true,
    auth: { token: accessToken },
  });

  socket.on('connect', () => {
    socket.emit('notification:subscribe');
    handlers.onConnect?.(socket);
  });
  socket.on('connect_error', (error) => handlers.onError?.(error));
  socket.on('notification:created', (payload) => handlers.onCreated?.(payload, socket));
  socket.on('notification:updated', (payload) => handlers.onUpdated?.(payload, socket));
  socket.on('notification:allRead', (payload) => handlers.onAllRead?.(payload, socket));

  return socket;
}

export function disconnectNotificationSocket(socket) {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
}
