const pool = require("../db");

function parseArgs(argv) {
  const args = {
    alertId: null,
    userId: null,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--alert-id" && argv[index + 1]) {
      args.alertId = argv[index + 1];
      index += 1;
    } else if (value === "--user" && argv[index + 1]) {
      args.userId = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

// --user mode: dump the notification-related state for one user so we can
// answer "why didn't user X get a push?" without grepping logs. Prints the
// account-wide prefs, per-category prefs, registered devices, last known
// location, the 10 most recent notifications, and the 20 most recent
// delivery_log rows.
async function runUserDiagnostic(client, userId) {
  const exists = await client.query(
    `select id, email from auth.users where id = $1::uuid limit 1`,
    [userId],
  );
  if (!exists.rows[0]) {
    throw new Error(`User ${userId} not found.`);
  }

  const [account, categories, web, mobile, location, notifications, delivery] = await Promise.all([
    client.query(`select * from app.user_notification_preferences where user_id = $1::uuid`, [userId]),
    client.query(
      `select category, in_app_enabled, mobile_push_enabled, web_push_enabled, email_enabled, important_only
         from app.user_notification_category_preferences where user_id = $1::uuid order by category`,
      [userId],
    ),
    client.query(
      `select id, endpoint, user_agent, is_active, created_at, last_used_at
         from app.push_subscriptions where user_id = $1::uuid order by created_at desc`,
      [userId],
    ),
    client.query(
      `select id, platform, provider, device_name, is_active, created_at, last_used_at
         from app.mobile_push_devices where user_id = $1::uuid order by created_at desc`,
      [userId],
    ),
    client.query(
      `select ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
              accuracy_m, source, captured_at
         from app.user_last_known_location where user_id = $1::uuid`,
      [userId],
    ),
    client.query(
      `select id, event_type, status, priority, title, created_at, sent_at, read_at
         from app.notifications where user_id = $1::uuid
         order by created_at desc limit 10`,
      [userId],
    ),
    client.query(
      `select notification_id, channel, platform, status, error_message, attempted_at, delivered_at
         from app.notification_delivery_log where user_id = $1::uuid
         order by attempted_at desc limit 20`,
      [userId],
    ),
  ]);

  return {
    user: exists.rows[0],
    accountPreferences: account.rows[0] || null,
    categoryPreferences: categories.rows,
    devices: { web: web.rows, mobile: mobile.rows },
    lastKnownLocation: location.rows[0] || null,
    recentNotifications: notifications.rows,
    recentDeliveryAttempts: delivery.rows,
  };
}

async function fetchSampleAlert(client, alertId = null) {
  const params = [];
  let whereClause = `
      where ar.status = 'active'
        and ar.delivery_app = true
        and az.id is not null
    `;

  if (alertId) {
    params.push(alertId);
    whereClause += ` and ar.id = $${params.length}`;
  }

  const result = await client.query(
    `
      select
        ar.id as alert_id,
        ar.user_id,
        ar.name,
        ar.frequency_type,
        az.id as zone_id,
        az.zone_type,
        az.display_name,
        az.radius_m,
        ST_Y(az.center::geometry) as zone_center_lat,
        ST_X(az.center::geometry) as zone_center_lng,
        aa.id as admin_area_id,
        aa.name as admin_area_name,
        aa.level as admin_area_level,
        ST_Y(COALESCE(aa.centroid::geometry, ST_Centroid(aa.geom))) as admin_center_lat,
        ST_X(COALESCE(aa.centroid::geometry, ST_Centroid(aa.geom))) as admin_center_lng
      from app.alert_rules ar
      left join app.alert_zones az
        on az.alert_id = ar.id
      left join gis.admin_areas aa
        on aa.id = az.admin_area_id
      ${whereClause}
      order by ar.created_at desc
      limit 1
    `,
    params,
  );

  return result.rows[0] || null;
}

function buildScenarioRows(sampleAlert) {
  const lat = Number(sampleAlert.admin_center_lat ?? sampleAlert.zone_center_lat);
  const lng = Number(sampleAlert.admin_center_lng ?? sampleAlert.zone_center_lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Sample alert does not have a usable center point for diagnostics.");
  }

  const zoneLabel =
    sampleAlert.display_name
    || sampleAlert.admin_area_name
    || sampleAlert.name
    || "Diagnostic zone";

  return [
    {
      label: "self_report",
      reportedBy: sampleAlert.user_id,
      lat,
      lng,
      locationLabel: zoneLabel,
    },
    {
      label: "anonymous_report",
      reportedBy: null,
      lat,
      lng,
      locationLabel: zoneLabel,
    },
  ];
}

async function runScenario(client, alertId, userId, scenario) {
  await client.query("BEGIN");

  try {
    const before = await client.query(
      `
        select
          (select count(*)::int from app.alert_trigger_log where alert_id = $1) as trigger_count,
          (select count(*)::int from app.notifications where user_id = $2) as notification_count
      `,
      [alertId, userId],
    );

    const insertResult = await client.query(
      `
        insert into app.accident_reports (
          reported_by,
          incident_type,
          title,
          description,
          status,
          severity_hint,
          incident_location,
          location_label,
          occurred_at
        )
        values (
          $1,
          'accident',
          $2,
          'Notification diagnostic report',
          'pending',
          3,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
          $5,
          now()
        )
        returning id
      `,
      [
        scenario.reportedBy,
        `diagnostic:${scenario.label}`,
        scenario.lng,
        scenario.lat,
        scenario.locationLabel,
      ],
    );

    const reportId = insertResult.rows[0]?.id;

    const after = await client.query(
      `
        select
          (select count(*)::int from app.alert_trigger_log where alert_id = $1) as trigger_count,
          (select count(*)::int from app.notifications where user_id = $2) as notification_count
      `,
      [alertId, userId],
    );

    const insertedTriggerRows = await client.query(
      `
        select id, alert_id, report_id, matched_at, delivery_status, delivered_app
        from app.alert_trigger_log
        where report_id = $1
        order by id asc
      `,
      [reportId],
    );

    const insertedNotificationRows = await client.query(
      `
        select id, user_id, report_id, status, title, created_at
        from app.notifications
        where report_id = $1
        order by created_at asc, id asc
      `,
      [reportId],
    );

    await client.query("ROLLBACK");

    return {
      scenario: scenario.label,
      reportId,
      before: before.rows[0],
      after: after.rows[0],
      insertedTriggerRows: insertedTriggerRows.rows,
      insertedNotificationRows: insertedNotificationRows.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const client = await pool.connect();

  try {
    const environment = await client.query(`
      select
        current_database() as current_database,
        current_user as current_user,
        now() as checked_at
    `);

    const triggerCheck = await client.query(`
      select
        tg.tgname as trigger_name,
        ns.nspname as schema_name,
        cls.relname as table_name,
        pron.proname as function_name
      from pg_trigger tg
      join pg_class cls on cls.oid = tg.tgrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
      join pg_proc pron on pron.oid = tg.tgfoid
      where not tg.tgisinternal
        and ns.nspname = 'app'
        and cls.relname = 'accident_reports'
      order by tg.tgname asc
    `);

    const functionCheck = await client.query(`
      select proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app'
        and proname = 'create_notifications_from_report'
    `);

    const notificationColumns = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'app'
        and table_name = 'notifications'
        and column_name in ('event_type', 'title', 'body', 'data')
      order by column_name asc
    `);

    if (args.userId) {
      // User-scoped diagnostic — skip the alert-rule scenario sweep and report
      // everything the orchestrator + push pipeline knows about one user.
      const userDiagnostic = await runUserDiagnostic(client, args.userId);
      console.log(JSON.stringify({
        mode: "user",
        environment: environment.rows[0] || {},
        triggerCheck: triggerCheck.rows,
        functionCheck: functionCheck.rows,
        notificationColumns: notificationColumns.rows,
        user: userDiagnostic,
      }, null, 2));
    } else {
      const sampleAlert = await fetchSampleAlert(client, args.alertId);
      if (!sampleAlert) {
        throw new Error("No active alert with a supported zone was found for diagnostics.");
      }

      const scenarios = buildScenarioRows(sampleAlert);
      const scenarioResults = [];

      for (const scenario of scenarios) {
        scenarioResults.push(
          await runScenario(client, sampleAlert.alert_id, sampleAlert.user_id, scenario),
        );
      }

      console.log(JSON.stringify({
        mode: "alert",
        environment: environment.rows[0] || {},
        triggerCheck: triggerCheck.rows,
        functionCheck: functionCheck.rows,
        notificationColumns: notificationColumns.rows,
        sampleAlert,
        scenarioResults,
      }, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[notifications-diagnostic] failed", {
    message: error.message,
    code: error.code || null,
    detail: error.detail || null,
    schema: error.schema || null,
    table: error.table || null,
  });
  process.exitCode = 1;
});
