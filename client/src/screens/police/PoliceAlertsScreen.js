import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { useMarkPoliceAlertReadMutation, usePoliceAlerts } from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

export default function PoliceAlertsScreen() {
  const alertsQuery = usePoliceAlerts({ page: 1, pageSize: 40 });
  const markRead = useMarkPoliceAlertReadMutation();

  const alerts = alertsQuery.data?.items ?? [];
  const unreadCount = alertsQuery.data?.unreadCount ?? 0;
  const loading = alertsQuery.isLoading;
  const error = alertsQuery.error?.message || markRead.error?.message || '';

  useFocusRefresh(alertsQuery.refetch);

  // Route mark-read through the mutation so police.all + police.dashboard are
  // invalidated and the dashboard "Unread" stat / alert badge stay in sync.
  const handleRead = (alertId) => {
    markRead.mutate(alertId);
  };

  return (
    <PoliceScreenFrame
      title="Alert Center"
      subtitle="Supervisor and operational alerts sent to you"
      loading={loading}
      error={error}
      onRefresh={alertsQuery.refetch}
      stats={[
        { label: 'Total', value: alerts.length, tone: Colors.primary },
        { label: 'Unread', value: unreadCount, tone: Colors.secondary },
        { label: 'Priority', value: alerts.filter((item) => ['high', 'critical'].includes(item.severity)).length, tone: Colors.severityHigh },
      ]}
    >
      <PoliceSectionCard title="Incoming Alerts">
        {alerts.map((alert) => (
          <PoliceListItem
            key={alert.id}
            title={alert.title}
            subtitle={alert.description}
            meta={[`Severity: ${alert.severity}`, `Status: ${alert.status}`, alert.createdAtLabel]}
            right={(
              <TouchableOpacity
                onPress={() => handleRead(alert.id)}
                disabled={alert.read || markRead.isPending}
                activeOpacity={0.85}
              >
                <Text style={{ color: alert.read ? Colors.subtext : Colors.primary, fontWeight: '800' }}>
                  {alert.read ? 'Read' : 'Mark read'}
                </Text>
              </TouchableOpacity>
            )}
          />
        ))}
        {!loading && !alerts.length ? <Text style={{ color: Colors.subtext }}>No police alerts are waiting right now.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
