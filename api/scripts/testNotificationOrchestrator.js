// Smoke-test runner for the notification orchestrator.
//
// Usage:
//   node scripts/testNotificationOrchestrator.js                 # offline summary
//   node scripts/testNotificationOrchestrator.js --user <uuid>   # also dispatch live tests to that user
//
// Each case prints PASS/SKIP/FAIL plus the orchestrator's returned reason so
// you can see whether a missing notification was actually suppressed for the
// right reason (user_pref_disabled, no_active_mobile_device, etc.).
//
// This is a smoke runner, not a full integration test. It calls the orchestrator
// in --user mode and inspects the returned reason fields; it does not actually
// create reports, assignments, or backup requests in the DB.

const pool = require("../db");
const {
  NOTIFICATION_CATEGORIES,
  ALL_CATEGORIES,
  EVENT_TYPES,
  dispatchNotificationToAllPlatforms,
  ensureCategoryPreference,
  fetchAllCategoryPreferences,
  upsertUserLastKnownLocation,
} = require("../services/notificationOrchestrator");

function parseArgs(argv) {
  const args = { userId: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--user" && argv[i + 1]) {
      args.userId = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function logCase(name, result) {
  const status = result?.ok ? "PASS" : (result?.reason ? "SKIP" : "FAIL");
  console.log(`[${status}] ${name}${result?.reason ? `  (${result.reason})` : ""}`);
}

async function runOfflineChecks() {
  console.log("--- Offline checks (no DB writes) ---");

  // 1. EVENT_TYPES coverage: every event_type the orchestrator emits has a category.
  const expected = [
    "INCIDENT_NEARBY_5KM",
    "POLICE_INCIDENT_ASSIGNED",
    "POLICE_INCIDENT_VERIFIED",
    "POLICE_INCIDENT_REJECTED",
    "POLICE_INCIDENT_RESOLVED",
    "POLICE_INCIDENT_STATUS_CHANGED",
    "POLICE_WORK_ZONE_INCIDENT",
    "POLICE_BACKUP_REQUESTED",
  ];
  for (const eventType of expected) {
    const meta = EVENT_TYPES[eventType];
    if (!meta || !meta.category) {
      console.log(`[FAIL] event-type ${eventType} missing or has no category`);
    } else {
      console.log(`[PASS] event-type ${eventType} -> ${meta.category}`);
    }
  }

  // 2. Categories list matches spec.
  const expectedCategories = [
    "incident_nearby",
    "user_alert_match",
    "police_assignment",
    "police_status_update",
    "police_work_zone_incident",
    "police_backup",
    "operational_alert",
    "system",
  ];
  const missing = expectedCategories.filter((c) => !ALL_CATEGORIES.includes(c));
  if (missing.length === 0) {
    console.log(`[PASS] all 8 spec categories present`);
  } else {
    console.log(`[FAIL] missing categories: ${missing.join(", ")}`);
  }
}

async function runUserCases(userId) {
  console.log(`\n--- Live cases against user ${userId} ---`);

  // Ensure category prefs exist so we can flip them deterministically.
  await Promise.all(ALL_CATEGORIES.map((c) => ensureCategoryPreference(userId, c)));
  const beforePrefs = await fetchAllCategoryPreferences(userId);
  console.log(`Loaded ${Object.keys(beforePrefs).length} category preference rows`);

  // Test 1: forced INCIDENT_NEARBY_5KM should fan out, with dedupeKey set so
  // a second call within the dedupe window returns duplicate_suppressed.
  const sharedDedupe = `__orchestrator_test_nearby:${Date.now()}`;
  const first = await dispatchNotificationToAllPlatforms({
    userId,
    eventType: "INCIDENT_NEARBY_5KM",
    title: "Orchestrator smoke test — nearby",
    body: "If you see this, the orchestrator successfully fanned out an INCIDENT_NEARBY_5KM event to you.",
    data: { test: true },
    force: true,
    dedupeKey: sharedDedupe,
  });
  logCase("INCIDENT_NEARBY_5KM (forced)", first);

  const second = await dispatchNotificationToAllPlatforms({
    userId,
    eventType: "INCIDENT_NEARBY_5KM",
    title: "Should be suppressed",
    body: "Duplicate dedupeKey within window.",
    dedupeKey: sharedDedupe,
  });
  logCase("INCIDENT_NEARBY_5KM duplicate dedupe", second);
  if (second?.reason !== "duplicate_suppressed") {
    console.log("  WARN: expected duplicate_suppressed, got:", second?.reason);
  }

  // Test 2: POLICE_INCIDENT_ASSIGNED through dispatchNotificationToAllPlatforms.
  const assigned = await dispatchNotificationToAllPlatforms({
    userId,
    eventType: "POLICE_INCIDENT_ASSIGNED",
    title: "Orchestrator smoke test — assigned",
    body: "Test police_assignment notification.",
    data: { test: true, assignmentId: "__test_assignment" },
    force: true,
  });
  logCase("POLICE_INCIDENT_ASSIGNED", assigned);

  // Test 3: low-priority POLICE_INCIDENT_STATUS_CHANGED with no force —
  // should respect important_only / push_mode settings.
  const statusChange = await dispatchNotificationToAllPlatforms({
    userId,
    eventType: "POLICE_INCIDENT_STATUS_CHANGED",
    title: "Orchestrator smoke test — status changed",
    body: "Test police_status_update notification.",
    data: { test: true, oldStatus: "under_review", newStatus: "verified" },
  });
  logCase("POLICE_INCIDENT_STATUS_CHANGED", statusChange);

  // Test 4: upsertUserLastKnownLocation round-trip.
  await upsertUserLastKnownLocation({
    userId,
    lat: 36.7538,
    lng: 3.0588,
    accuracyMeters: 25,
    source: "orchestrator_test",
  });
  const loc = await pool.query(
    `select ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
       from app.user_last_known_location where user_id = $1::uuid`,
    [userId],
  );
  if (loc.rows[0] && Math.abs(Number(loc.rows[0].lat) - 36.7538) < 1e-4) {
    console.log("[PASS] upsertUserLastKnownLocation persisted lat/lng round-trip");
  } else {
    console.log("[FAIL] upsertUserLastKnownLocation round-trip mismatch", loc.rows[0]);
  }

  // Test 5: delivery_log rows were written for the live cases above.
  const deliveryRows = await pool.query(
    `select channel, status, error_message
       from app.notification_delivery_log
      where user_id = $1::uuid
        and attempted_at >= now() - interval '5 minutes'
      order by attempted_at desc
      limit 20`,
    [userId],
  );
  if (deliveryRows.rowCount > 0) {
    console.log(`[PASS] notification_delivery_log captured ${deliveryRows.rowCount} attempt(s) in the last 5 min:`);
    for (const row of deliveryRows.rows) {
      console.log(`       - ${row.channel}: ${row.status}${row.error_message ? ` (${row.error_message})` : ""}`);
    }
  } else {
    console.log("[FAIL] no delivery_log rows were written for the test cases");
  }
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    await runOfflineChecks();
    if (args.userId) {
      await runUserCases(args.userId);
    } else {
      console.log("\nNo --user <uuid> supplied — skipping live dispatch cases.");
      console.log("Run again with --user <userId> to exercise the full pipeline.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[orchestrator-test] failed", {
    message: error.message,
    code: error.code || null,
  });
  process.exitCode = 1;
});
