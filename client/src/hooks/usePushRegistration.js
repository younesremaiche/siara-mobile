import { useEffect, useRef, useState } from 'react';
import { registerMobilePushDevice, unregisterMobilePushDevice } from '../services/notificationsService';
import {
  persistStoredPushRegistration,
  registerForPushNotificationsAsync,
} from '../services/mobilePushService';

export default function usePushRegistration({
  isAuthenticated,
  accessToken,
  userId,
  onRegisteredToken,
  onDiagnostics,
} = {}) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const inflightRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !userId) {
      setStatus('idle');
      setError('');
      return undefined;
    }

    if (inflightRef.current) {
      return undefined;
    }

    let cancelled = false;
    setStatus('registering');

    inflightRef.current = (async () => {
      const result = await registerForPushNotificationsAsync({ userId });
      if (cancelled) return;

      onDiagnostics?.((current) => ({
        ...(current || {}),
        permissionGranted: true,
        permissionStatus: result?.permissions?.status || 'granted',
        projectId: result.projectId || null,
        projectIdPresent: Boolean(result.projectId),
        expoPushToken: result.registration.token,
        expoPushTokenPresent: Boolean(result.registration.token),
      }));

      onRegisteredToken?.(result.registration.token);

      if (result.shouldSyncBackend) {
        const staleToken =
          result.cachedRegistration?.token
          && result.cachedRegistration.token !== result.registration.token
          && String(result.cachedRegistration.userId || '') === String(userId)
            ? result.cachedRegistration.token
            : null;

        if (staleToken) {
          await unregisterMobilePushDevice(staleToken, accessToken).catch((unregisterError) => {
            if (__DEV__) {
              console.warn('[push] stale_token_unregister_failed', {
                staleToken,
                message: unregisterError?.message || 'Failed to unregister stale token.',
              });
            }
          });
        }

        if (__DEV__) {
          console.info('[push] backend_mobile_token_register_started', {
            tokenPreview:
              result.registration.token.length > 18
                ? `${result.registration.token.slice(0, 12)}...${result.registration.token.slice(-6)}`
                : result.registration.token,
          });
        }
        const registeredDevice = await registerMobilePushDevice(result.registration);
        await persistStoredPushRegistration({
          userId,
          registration: result.registration,
        });

        if (__DEV__) {
          console.info('[push] backend_mobile_token_register_succeeded', {
            userId,
            tokenStored: Boolean(registeredDevice?.token),
            platform: result.registration.platform,
            staleTokenReplaced: Boolean(staleToken),
          });
        }

        onDiagnostics?.((current) => ({
          ...(current || {}),
          backendTokenRegisterSucceeded: Boolean(registeredDevice?.token),
          backendTokenRegisterFailed: false,
          backendRegisteredUserId: userId,
          backendStoredTokenPreview:
            registeredDevice?.token && registeredDevice.token.length > 18
              ? `${registeredDevice.token.slice(0, 12)}...${registeredDevice.token.slice(-6)}`
              : registeredDevice?.token || null,
        }));

        if (__DEV__) {
          console.info('[push] registration_summary', {
            isDevice: Boolean(result.isDevice),
            permissionGranted: Boolean(result?.permissions?.granted),
            projectIdPresent: Boolean(result.projectId),
            expoPushTokenPresent: Boolean(result.registration?.token),
            backendRegistrationSucceeded: Boolean(registeredDevice?.token),
          });
        }
      } else if (__DEV__) {
        console.info('[push] mobile_registration_skipped', {
          reason: 'cached_registration',
          token: result.registration.token,
        });
        console.info('[push] registration_summary', {
          isDevice: Boolean(result.isDevice),
          permissionGranted: Boolean(result?.permissions?.granted),
          projectIdPresent: Boolean(result.projectId),
          expoPushTokenPresent: Boolean(result.registration?.token),
          backendRegistrationSucceeded: true,
        });
      }

      setError('');
      setStatus(result.shouldSyncBackend ? 'registered' : 'cached');
    })()
      .catch((nextError) => {
        if (cancelled) return;
        onDiagnostics?.((current) => ({
          ...(current || {}),
          permissionGranted:
            typeof nextError?.permissionGranted === 'boolean'
              ? nextError.permissionGranted
              : current?.permissionGranted ?? null,
          permissionStatus: nextError?.permissionStatus || current?.permissionStatus || null,
          projectId: Object.prototype.hasOwnProperty.call(nextError || {}, 'projectId')
            ? nextError.projectId
            : current?.projectId || null,
          projectIdPresent: Object.prototype.hasOwnProperty.call(nextError || {}, 'projectId')
            ? Boolean(nextError.projectId)
            : current?.projectIdPresent ?? false,
          backendTokenRegisterSucceeded: false,
          backendTokenRegisterFailed: true,
          lastError: nextError?.message || 'Push registration failed.',
        }));
        if (__DEV__) {
          console.info('[push] registration_summary', {
            isDevice:
              typeof nextError?.isDevice === 'boolean'
                ? nextError.isDevice
                : true,
            permissionGranted:
              typeof nextError?.permissionGranted === 'boolean'
                ? nextError.permissionGranted
                : false,
            projectIdPresent: Boolean(nextError?.projectId),
            expoPushTokenPresent: false,
            backendRegistrationSucceeded: false,
          });
        }
        setError(nextError.message || 'Push registration failed.');
        setStatus('error');
      })
      .finally(() => {
        inflightRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthenticated, onDiagnostics, onRegisteredToken, userId]);

  return {
    error,
    status,
  };
}
