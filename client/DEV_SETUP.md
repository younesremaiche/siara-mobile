# Mobile Dev Setup

For Android push notification testing, use the hosted SIARA backend and a development build.

## Hosted backend

- API URL: `https://siara-api.onrender.com`
- Reachability check: `https://siara-api.onrender.com/api/auth/session`
- Do not use localhost, `127.0.0.1`, a LAN IP, `10.0.2.2`, PostgreSQL/Aiven,
  or a direct ML-service URL from the mobile app.

Set local env in `client/.env.development`:

```bash
EXPO_PUBLIC_API_URL=https://siara-api.onrender.com
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

## Correct workflow for push testing

1. Build/install the development client on Android:
   `npm run android`
2. Start Metro for the dev client:
   `npm run start:dev-client`
3. Open the SIARA development build on the physical Android device.
4. Log in, grant notification permission, and verify the app logs the Expo push token.

## Notes

- In-app inbox notifications still use the normal `/api/notifications` and socket flow.
- Phone push registration uses `POST /api/push/mobile/register`.
- Logout unregisters the current token with `DELETE /api/push/mobile/unregister`.
- If push token registration fails, check the hosted health endpoint first.
- If the app logs `missing_project_id`, set `EXPO_PUBLIC_EAS_PROJECT_ID`, rebuild the development client, and retry. Expo push tokens will not register without that project id.
