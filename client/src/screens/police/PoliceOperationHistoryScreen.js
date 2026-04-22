import React from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceOperationHistory } from '../../services/policeService';

const FILTERS = ['all', 'verify_incident', 'reject_incident', 'assign_self', 'request_backup', 'update_status', 'field_note'];

export default function PoliceOperationHistoryScreen() {
  const navigation = useNavigation();
  const [actionType, setActionType] = React.useState('all');
  const [historyItems, setHistoryItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceOperationHistory({
        page: 1,
        pageSize: 40,
        actionType: actionType === 'all' ? undefined : actionType,
      });
      setHistoryItems(payload.items);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load operation history.');
    } finally {
      setLoading(false);
    }
  }, [actionType]);

  useFocusEffect(
    React.useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  return (
    <PoliceScreenFrame
      title="Operation History"
      subtitle="Audit trail of police actions"
      loading={loading}
      error={error}
      onRefresh={loadHistory}
      stats={[
        { label: 'Visible', value: historyItems.length, tone: Colors.primary },
      ]}
    >
      <PoliceSectionCard title="Action Filter">
        {FILTERS.map((filter) => (
          <PoliceChip
            key={filter}
            label={filter.replace(/_/g, ' ')}
            active={actionType === filter}
            onPress={() => setActionType(filter)}
          />
        ))}
      </PoliceSectionCard>

      <PoliceSectionCard title="History">
        {historyItems.map((item) => (
          <PoliceListItem
            key={item.id}
            title={item.actionType.replace(/_/g, ' ')}
            subtitle={item.note || 'Police action recorded'}
            meta={[item.createdAtLabel, item.reportId ? `Incident: ${item.reportId}` : null]}
            onPress={item.reportId ? () => navigation.navigate('PoliceIncidentDetail', { incidentId: item.reportId }) : undefined}
          />
        ))}
        {!loading && !historyItems.length ? <Text style={{ color: Colors.subtext }}>No operation history matches the current filter.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
