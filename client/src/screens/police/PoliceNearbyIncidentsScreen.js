import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import PoliceScreenFrame, {
  PoliceEmptyState,
  PoliceIncidentCard,
  PoliceSectionCard,
} from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import {
  usePoliceIncidents,
  useSyncPoliceLocationMutation,
} from '../../features/police/hooks/usePoliceQueries';

export default function PoliceNearbyIncidentsScreen() {
  const navigation = useNavigation();
  const params = React.useMemo(() => ({ scope: 'nearby', page: 1, pageSize: 40 }), []);
  const {
    data: nearbyPayload,
    isLoading: loading,
    error: nearbyError,
    refetch: refetchNearby,
  } = usePoliceIncidents(params);
  const { mutate: syncPoliceLocation } = useSyncPoliceLocationMutation();

  useFocusEffect(
    React.useCallback(() => {
      syncPoliceLocation(undefined, {
        onSettled: () => {
          void refetchNearby();
        },
      });
    }, [refetchNearby, syncPoliceLocation]),
  );

  const incidents = nearbyPayload?.items || [];
  const locationRequired = Boolean(nearbyPayload?.locationRequired);
  const error = nearbyError?.message || '';

  const stats = [
    {
      label: 'Nearby',
      value: incidents.length,
      sublabel: 'Within radius',
      tone: Colors.primary,
      icon: 'locate-outline',
    },
    {
      label: 'High',
      value: incidents.filter((i) => ['high', 'critical'].includes(String(i.severity || '').toLowerCase())).length,
      sublabel: 'High severity',
      tone: Colors.severityCritical,
      icon: 'flame-outline',
    },
    {
      label: 'Radius',
      value: '500m',
      sublabel: 'Police default',
      tone: Colors.secondary,
      icon: 'radio-outline',
    },
  ];

  return (
    <PoliceScreenFrame
      title="Nearby Incidents"
      subtitle="Backend results within the 500 meter police radius"
      liveLabel={loading ? 'SYNCING…' : 'LIVE'}
      stats={stats}
      loading={loading}
      error={error}
      onRefresh={refetchNearby}
    >
      {locationRequired ? (
        <View style={styles.locationCard}>
          <View style={styles.locationIcon}>
            <Ionicons name="navigate-circle-outline" size={20} color={Colors.warning} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.locationTitle}>Location required</Text>
            <Text style={styles.locationBody}>
              Allow location access so the API can return incidents within 500 meters.
            </Text>
          </View>
          <TouchableOpacity style={styles.locationCta} onPress={refetchNearby} activeOpacity={0.85}>
            <Text style={styles.locationCtaText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <PoliceSectionCard
        title="Live Radius"
        icon="locate-outline"
        count={incidents.length}
      >
        {incidents.length === 0 && !locationRequired ? (
          <PoliceEmptyState
            icon="map-outline"
            title="No nearby incidents"
            body="No incidents were found within 500 meters of your location."
          />
        ) : (
          incidents.map((incident) => (
            <PoliceIncidentCard
              key={incident.id}
              displayId={incident.displayId}
              title={incident.title}
              severity={incident.severity}
              status={incident.status}
              locationText={`${incident.distanceLabel ? incident.distanceLabel + ' · ' : ''}${incident.locationText || ''}`}
              description={incident.description}
              timeAgo={incident.timeAgo}
              onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              onSecondaryAction={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              secondaryActionLabel="View"
              onPrimaryAction={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id, autoStart: true })}
              primaryActionLabel="Respond"
            />
          ))
        )}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  locationCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(244,162,97,0.08)',
    borderColor: 'rgba(244,162,97,0.3)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  locationIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(244,162,97,0.18)',
  },
  locationTitle: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  locationBody: { color: Colors.text, fontSize: 12, lineHeight: 16 },
  locationCta: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.warning, borderRadius: 10,
  },
  locationCtaText: { color: Colors.white, fontWeight: '800', fontSize: 12 },
});
