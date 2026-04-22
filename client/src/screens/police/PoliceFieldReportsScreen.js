import React from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceIncidents } from '../../services/policeService';

const FILTERS = ['all', 'pending', 'under_review', 'verified', 'resolved'];

export default function PoliceFieldReportsScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = React.useState('all');
  const [reports, setReports] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadReports = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceIncidents({
        scope: 'field_reports',
        page: 1,
        pageSize: 40,
        status: status === 'all' ? undefined : status,
      });
      setReports(payload.items);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load field reports.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useFocusEffect(
    React.useCallback(() => {
      void loadReports();
    }, [loadReports]),
  );

  return (
    <PoliceScreenFrame
      title="Field Reports"
      subtitle="Citizen and officer reports available for police review"
      loading={loading}
      error={error}
      onRefresh={loadReports}
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
