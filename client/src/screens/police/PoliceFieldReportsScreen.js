import React from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { usePoliceIncidents } from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const FILTERS = ['all', 'pending', 'under_review', 'verified', 'resolved'];

export default function PoliceFieldReportsScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = React.useState('all');
  const params = React.useMemo(() => ({
    scope: 'field_reports',
    page: 1,
    pageSize: 40,
    status: status === 'all' ? undefined : status,
  }), [status]);
  const reportsQuery = usePoliceIncidents(params);
  useFocusRefresh(reportsQuery.refetch);

  const reports = reportsQuery.data?.items || [];
  const loading = reportsQuery.isLoading;
  const error = reportsQuery.error?.message || '';

  return (
    <PoliceScreenFrame
      title="Field Reports"
      subtitle="Citizen and officer reports available for police review"
      loading={loading}
      error={error}
      onRefresh={reportsQuery.refetch}
      stats={[
        { label: 'Reports', value: reports.length, tone: Colors.primary },
        { label: 'Pending', value: reports.filter((item) => item.status === 'pending').length, tone: Colors.secondary },
      ]}
    >
      <PoliceSectionCard title="Status Filter">
        {FILTERS.map((filter) => (
          <PoliceChip
            key={filter}
            label={filter.replace(/_/g, ' ')}
            active={status === filter}
            onPress={() => setStatus(filter)}
          />
        ))}
      </PoliceSectionCard>

      <PoliceSectionCard title="Report Feed">
        {reports.map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={`${incident.displayId} · ${incident.title}`}
            subtitle={incident.description || 'No description provided.'}
            meta={[incident.locationText, `Source: ${incident.sourceChannel || 'citizen'}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !reports.length ? <Text style={{ color: Colors.subtext }}>No field reports match the current filter.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
