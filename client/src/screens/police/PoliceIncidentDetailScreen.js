import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import {
  addPoliceFieldNote,
  getPoliceIncident,
  rejectPoliceIncident,
  requestPoliceBackup,
  updatePoliceIncidentStatus,
  verifyPoliceIncident,
} from '../../services/policeService';

export default function PoliceIncidentDetailScreen({ route }) {
  const incidentId = route?.params?.incidentId;
  const [detail, setDetail] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadDetail = React.useCallback(async () => {
    if (!incidentId) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = await getPoliceIncident(incidentId);
      setDetail(payload);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load incident details.');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useFocusEffect(
    React.useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const incident = detail?.incident;

  const runAction = async (action) => {
    if (!incident) {
      return;
    }

    try {
      if (action === 'verify') {
        setDetail(await verifyPoliceIncident(incident.id));
      } else if (action === 'reject') {
        setDetail(await rejectPoliceIncident(incident.id));
      } else if (action === 'backup') {
        setDetail(await requestPoliceBackup(incident.id));
      } else if (action === 'resolve') {
        setDetail(await updatePoliceIncidentStatus(incident.id, { status: 'resolved' }));
      } else if (action === 'note') {
        if (!note.trim()) {
          Alert.alert('Field note', 'Please enter a note before saving.');
          return;
        }
        setDetail(await addPoliceFieldNote(incident.id, { note: note.trim() }));
        setNote('');
      }
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Failed to update incident.');
    }
  };

  return (
    <PoliceScreenFrame
      title={incident?.displayId || 'Incident'}
      subtitle={incident?.title || 'Incident detail'}
      loading={loading}
      error={error}
      onRefresh={loadDetail}
      stats={[
        { label: 'Status', value: incident?.status || '-', tone: Colors.primary },
        { label: 'Priority', value: incident?.severity || '-', tone: Colors.severityHigh },
      ]}
    >
      <PoliceSectionCard title="Incident Summary">
        <PoliceListItem
          title={incident?.title || 'Incident'}
          subtitle={incident?.description || 'No description provided.'}
          meta={[
            incident?.locationText,
            incident?.occurredAtLabel,
            `Reporter: ${incident?.reportedBy?.name || 'Unknown'}`,
            `Assigned: ${incident?.assignedOfficer?.name || 'Unassigned'}`,
          ]}
        />
      </PoliceSectionCard>

      <PoliceSectionCard title="Actions">
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primary }]} onPress={() => runAction('verify')} activeOpacity={0.88}>
            <Text style={styles.actionBtnText}>Verify</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.secondary }]} onPress={() => runAction('backup')} activeOpacity={0.88}>
            <Text style={styles.actionBtnText}>Backup</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.btnDanger }]} onPress={() => runAction('reject')} activeOpacity={0.88}>
            <Text style={styles.actionBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.accent }]} onPress={() => runAction('resolve')} activeOpacity={0.88}>
            <Text style={styles.actionBtnText}>Resolve</Text>
          </TouchableOpacity>
        </View>
      </PoliceSectionCard>

      <PoliceSectionCard title="Field Note">
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a field note..."
          placeholderTextColor={Colors.greyLight}
          multiline
          style={styles.noteInput}
        />
        <TouchableOpacity style={styles.noteBtn} onPress={() => runAction('note')} activeOpacity={0.88}>
          <Text style={styles.noteBtnText}>Save Note</Text>
        </TouchableOpacity>
      </PoliceSectionCard>

      <PoliceSectionCard title="Recent History">
        {(detail?.history || []).map((item) => (
          <PoliceListItem
            key={item.id}
            title={item.actionType.replace(/_/g, ' ')}
            subtitle={item.note || 'Police action recorded'}
            meta={[item.createdAtLabel]}
          />
        ))}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    color: Colors.white,
    fontWeight: '800',
  },
  noteInput: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    backgroundColor: Colors.bg,
    color: Colors.heading,
    textAlignVertical: 'top',
  },
  noteBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  noteBtnText: {
    color: Colors.white,
    fontWeight: '800',
  },
});
