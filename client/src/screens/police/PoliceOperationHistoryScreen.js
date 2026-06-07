import React from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { usePoliceOperationHistory } from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const FILTERS = ['all', 'verify_incident', 'reject_incident', 'assign_self', 'request_backup', 'update_status', 'field_note'];

export default function PoliceOperationHistoryScreen() {
  const navigation = useNavigation();
  const [actionType, setActionType] = React.useState('all');

  const params = React.useMemo(() => ({
    page: 1,
    pageSize: 40,
    actionType: actionType === 'all' ? undefined : actionType,
  }), [actionType]);

  // On the shared cache: an action taken in IncidentDetail invalidates police.*
  // and this audit trail refreshes instead of lagging behind.
  const historyQuery = usePoliceOperationHistory(params);
  const historyItems = historyQuery.data?.items ?? [];
  const loading = historyQuery.isLoading;
  const error = historyQuery.error?.message || '';
  useFocusRefresh(historyQuery.refetch);

  return (
    <PoliceScreenFrame
      title="Operation History"
      subtitle="Audit trail of police actions"
      loading={loading}
      error={error}
      onRefresh={historyQuery.refetch}
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
