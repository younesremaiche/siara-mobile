const pool = require("../db");

const NOTIFICATION_SELECT_SQL = `
  select
    n.id,
    n.user_id,
    n.report_id,
    n.operational_alert_id,
    n.channel,
    n.status,
    n.priority,
    n.created_at,
    n.sent_at,
    n.delivered_at,
    n.read_at,
    n.event_type,
    n.title,
    n.body,
    n.data
  from app.notifications n
`;

function mapNotificationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    reportId: row.report_id,
    operationalAlertId: row.operational_alert_id,
    channel: row.channel,
    status: row.status,
    priority: Number(row.priority ?? 2),
    createdAt: row.created_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    data: row.data || {},
    read: Boolean(row.read_at),
  };
}

async function fetchNotificationsForUser(
  userId,
  { limit = 20, offset = 0 } = {},
  db = pool,
) {
  const result = await db.query(
    `
      ${NOTIFICATION_SELECT_SQL}
      where n.user_id = $1
      order by n.created_at desc, n.id desc
      limit $2
      offset $3
    `,
    [userId, limit, offset],
  );

  return result.rows.map(mapNotificationRow);
}

async function fetchUnreadNotificationCount(userId, db = pool) {
  const result = await db.query(
    `
      select count(*)::int as unread_count
      from app.notifications
      where user_id = $1
        and read_at is null
    `,
    [userId],
  );

  return Number(result.rows[0]?.unread_count || 0);
}

async function markNotificationAsSent(notificationId, db = pool) {
  const result = await db.query(
    `
      with updated as (
        update app.notifications n
        set
          status = case when n.status = 'pending' then 'sent' else n.status end,
          sent_at = coalesce(n.sent_at, now())
        where n.id = $1
        returning n.*
      )
      select *
      from updated
      limit 1
    `,
    [notificationId],
  );

  return mapNotificationRow(result.rows[0] || null);
}

async function markNotificationAsDelivered(userId, notificationId, db = pool) {
  const result = await db.query(
    `
      with updated as (
        update app.notifications n
        set
          status = case when n.read_at is not null then 'read' else 'delivered' end,
          sent_at = coalesce(n.sent_at, now()),
          delivered_at = coalesce(n.delivered_at, now())
        where n.id = $1
          and n.user_id = $2
        returning n.*
      )
      select *
      from updated
      union all
      select n.*
      from app.notifications n
      where n.id = $1
        and n.user_id = $2
        and not exists (select 1 from updated)
      limit 1
    `,
    [notificationId, userId],
  );

  return mapNotificationRow(result.rows[0] || null);
}

async function markNotificationAsRead(userId, notificationId, db = pool) {
  const result = await db.query(
    `
      with updated as (
        update app.notifications n
        set
          status = 'read',
          sent_at = coalesce(n.sent_at, now()),
          delivered_at = coalesce(n.delivered_at, now()),
          read_at = coalesce(n.read_at, now())
        where n.id = $1
          and n.user_id = $2
        returning n.*
      )
      select *
      from updated
      union all
      select n.*
      from app.notifications n
      where n.id = $1
        and n.user_id = $2
        and not exists (select 1 from updated)
      limit 1
    `,
    [notificationId, userId],
  );

  return mapNotificationRow(result.rows[0] || null);
}

async function markAllNotificationsAsRead(userId, db = pool) {
  const result = await db.query(
    `
      with updated as (
        update app.notifications n
        set
          status = 'read',
          sent_at = coalesce(n.sent_at, now()),
          delivered_at = coalesce(n.delivered_at, now()),
          read_at = coalesce(n.read_at, now())
        where n.user_id = $1
          and n.read_at is null
        returning n.id, n.read_at
      )
      select
        coalesce(array_agg(updated.id), '{}'::uuid[]) as notification_ids,
        max(updated.read_at) as read_at,
        count(*)::int as updated_count
      from updated
    `,
    [userId],
  );

  return {
    ids: result.rows[0]?.notification_ids || [],
    readAt: result.rows[0]?.read_at || null,
    updatedCount: Number(result.rows[0]?.updated_count || 0),
  };
}

module.exports = {
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  mapNotificationRow,
  markAllNotificationsAsRead,
  markNotificationAsDelivered,
  markNotificationAsRead,
  markNotificationAsSent,
};
