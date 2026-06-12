import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { usePoliceIncidents } from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const FILTERS = ['all', 'pending', 'under_review', 'verified', 'resolved', 'rejected'];

export default function PoliceMyIncidentsScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = React.useState('all');
  const params = React.useMemo(() => ({
    scope: 'my',
    page: 1,
    pageSize: 40,
    status: status === 'all' ? undefined : status,
  }), [status]);
  const incidentsQuery = usePoliceIncidents(params);
  useFocusRefresh(incidentsQuery.refetch);

  const incidents = incidentsQuery.data?.items || [];
  const loading = incidentsQuery.isLoading;
  const error = incidentsQuery.error?.message || '';

  return (
    <PoliceScreenFrame
      title="My Incidents"
      subtitle="Reports created by you or assigned to you"
      loading={loading}
      error={error}
      onRefresh={incidentsQuery.refetch}
      stats={[
        { label: 'Visible', value: incidents.length, tone: Colors.primary },
        { label: 'Resolved', value: incidents.filter((item) => item.status === 'resolved').length, tone: Colors.accent },
      ]}
    >
      <PoliceSectionCard title="Status Filter">
        <Text style={{ color: Colors.subtext, marginBottom: 8 }}>Filter the incidents you are responsible for.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map((filter) => (
            <PoliceChip
              key={filter}
              label={filter.replace(/_/g, ' ')}
              active={status === filter}
              onPress={() => setStatus(filter)}
            />
          ))}
        </View>
      </PoliceSectionCard>

      <PoliceSectionCard title="Incident List">
        {incidents.map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={`${incident.displayId} - ${incident.title}`}
            subtitle={incident.description || 'No description provided.'}
            meta={[incident.locationText, `Status: ${incident.status}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !incidents.length ? <Text style={{ color: Colors.subtext }}>No incidents match the current filter.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
