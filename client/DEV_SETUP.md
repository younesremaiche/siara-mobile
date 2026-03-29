# Mobile Dev Setup

For Android push notification testing, use the LAN backend and a development build.

## Local LAN backend

- PC/backend URL: `http://127.0.0.1:5000`
- Health check: [http://127.0.0.1:5000/health](http://192.168.1.13:5000/health)
- The phone must be on the same Wi-Fi as the PC.
- Do not use `localhost` or `127.0.0.1` from the phone.

Set local env in `client/.env.development`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:5000
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

## Correct workflow for push testing

1. Start the backend so it is reachable at `http://127.0.0.1:5000`.
2. Build/install the development client on Android:
   `npm run android`
3. Start Metro for the dev client:
   `npm run start:dev-client`
4. Open the SIARA development build on the physical Android device.
5. Log in, grant notification permission, and verify the app logs the Expo push token.

## Notes

- In-app inbox notifications still use the normal `/api/notifications` and socket flow.
- Phone push registration uses `POST /api/push/mobile/register`.
- Logout unregisters the current token with `DELETE /api/push/mobile/unregister`.
- If push token registration fails, check the LAN health endpoint first.
- If the app logs `missing_project_id`, set `EXPO_PUBLIC_EAS_PROJECT_ID`, rebuild the development client, and retry. Expo push tokens will not register without that project id.
