Folder: services
Purpose: Mobile API integration helpers and domain service modules.

Police module notes:

- `policeService.js` is the shared mobile integration layer for `/api/police/*`.
- The mobile police navigator uses the same backend contract as web for officer profile, work-zone setup, nearby incidents, alerts, incident actions, and operation history.
- Nearby incident refreshes send device location updates before querying the 500 meter police radius endpoint.
