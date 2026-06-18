import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, {
  PoliceChip,
  PoliceEmptyState,
  PoliceIncidentCard,
  PoliceSectionCard,
} from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { usePoliceIncidents } from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const FILTERS = ['all', 'pending', 'under_review', 'verified', 'resolved'];
const OPEN_STATUSES = new Set(['pending', 'under_review', 'verified', 'dispatched']);

export default function PoliceAssignedIncidentsScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = React.useState('all');

  // scope: 'assigned' is an officer-scoped server view — incidents the officer
  // is the current assignee of (or holds an active assignment row for). Unlike
  // 'my' it deliberately omits incidents the officer merely reported.
  const params = React.useMemo(() => ({
    scope: 'assigned',
    page: 1,
    pageSize: 50,
    status: status === 'all' ? undefined : status,
  }), [status]);

  const incidentsQuery = usePoliceIncidents(params);
  useFocusRefresh(incidentsQuery.refetch);

  const incidents = incidentsQuery.data?.items || [];
  const loading = incidentsQuery.isLoading;
  const error = incidentsQuery.error?.message || '';

  const openCount = incidents.filter((item) => OPEN_STATUSES.has(String(item.status || '').toLowerCase())).length;
  const resolvedCount = incidents.filter((item) => String(item.status || '').toLowerCase() === 'resolved').length;

  return (
    <PoliceScreenFrame
      title="Assigned to Me"
      subtitle="Incidents a supervisor assigned to you for action"
      loading={loading}
      error={error}
      onRefresh={incidentsQuery.refetch}
      stats={[
        { label: 'Assigned', value: incidents.length, tone: Colors.primary, icon: 'briefcase-outline' },
        { label: 'Open', value: openCount, tone: Colors.secondary, icon: 'flash-outline' },
        { label: 'Resolved', value: resolvedCount, tone: Colors.accent, icon: 'checkmark-done-outline' },
      ]}
    >
      <PoliceSectionCard title="Status Filter" icon="filter-outline">
        <Text style={{ color: Colors.subtext, marginBottom: 8 }}>
          Showing incidents currently assigned to you.
        </Text>
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

      <PoliceSectionCard
        title="Assigned Incidents"
        icon="briefcase-outline"
        count={incidents.length}
      >
        {!loading && incidents.length === 0 ? (
          <PoliceEmptyState
            icon="checkmark-circle-outline"
            title="Nothing assigned to you"
            body="When a supervisor assigns you an incident, it will appear here."
          />
        ) : (
          incidents.map((incident) => (
            <PoliceIncidentCard
              key={incident.id}
              displayId={incident.displayId}
              title={incident.title}
              severity={incident.severity}
              status={incident.status}
              locationText={incident.locationText}
              description={incident.description}
              timeAgo={incident.timeAgo}
              onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              onPrimaryAction={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              primaryActionLabel="Open"
            />
          ))
        )}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
