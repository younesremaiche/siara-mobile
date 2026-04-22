import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceAlerts, markPoliceAlertRead } from '../../services/policeService';

export default function PoliceAlertsScreen() {
  const [alerts, setAlerts] = React.useState([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadAlerts = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceAlerts({ page: 1, pageSize: 40 });
      setAlerts(payload.items);
      setUnreadCount(payload.unreadCount);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load police alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadAlerts();
    }, [loadAlerts]),
  );

  const handleRead = async (alertId) => {
    try {
      await markPoliceAlertRead(alertId);
      setAlerts((previous) => previous.map((item) => (item.id === alertId ? { ...item, read: true } : item)));
      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch (readError) {
      setError(readError.message || 'Failed to mark alert as read.');
    }
  };

  return (
    <PoliceScreenFrame
      title="Alert Center"
      subtitle="Supervisor and operational alerts sent to you"
      loading={loading}
      error={error}
      onRefresh={loadAlerts}
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
              <TouchableOpacity onPress={() => handleRead(alert.id)} disabled={alert.read} activeOpacity={0.85}>
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
