import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { getPoliceMe, getPoliceWorkZoneOptions, updatePoliceWorkZone } from '../../services/policeService';

function SelectList({ title, items, selectedValue, onSelect, disabled = false }) {
  return (
    <View style={styles.selectGroup}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.optionWrap}>
        {items.map((item) => {
          const active = selectedValue === String(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.optionBtn, active && styles.optionBtnActive, disabled && styles.optionBtnDisabled]}
              onPress={() => onSelect(String(item.id))}
              disabled={disabled}
              activeOpacity={0.88}
            >
              <Text style={[styles.optionBtnText, active && styles.optionBtnTextActive]}>{item.name}</Text>
            </TouchableOpacity>
          );
        })}
        {!items.length ? <Text style={styles.emptyText}>No options available.</Text> : null}
      </View>
    </View>
  );
}

export default function PoliceWorkZoneScreen({ navigation }) {
  const [me, setMe] = React.useState(null);
  const [wilayas, setWilayas] = React.useState([]);
  const [communes, setCommunes] = React.useState([]);
  const [wilayaId, setWilayaId] = React.useState('');
  const [communeId, setCommuneId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadOptions = React.useCallback(async (nextWilayaId = null, resetCommune = false) => {
    setLoading(true);
    setError('');

    try {
      const [mePayload, optionsPayload] = await Promise.all([
        getPoliceMe(),
        getPoliceWorkZoneOptions(nextWilayaId),
      ]);

      const resolvedWilayaId = String(nextWilayaId || optionsPayload.selectedWilayaId || mePayload.workZone?.wilaya?.id || '');
      setMe(mePayload);
      setWilayas(optionsPayload.wilayas);
      setCommunes(optionsPayload.communes);
      setWilayaId(resolvedWilayaId);
      setCommuneId(
        resetCommune
          ? ''
          : String(optionsPayload.selectedCommuneId || mePayload.workZone?.commune?.id || ''),
      );
    } catch (requestError) {
      setError(requestError.message || 'Failed to load work-zone options.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadOptions();
    }, [loadOptions]),
  );

  const handleWilayaChange = async (value) => {
    setWilayaId(value);
    setCommuneId('');
    await loadOptions(value, true);
  };

  const handleSave = async () => {
    if (!wilayaId || !communeId) {
      setError('Please choose both Wilaya and Commune.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updatePoliceWorkZone({
        wilayaId: Number(wilayaId),
        communeId: Number(communeId),
      });
      const refreshed = await getPoliceMe();
      setMe(refreshed);
      if (!refreshed.requiresZoneSelection) {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'PoliceTabs',
              state: {
                routes: [{ name: 'PoliceDashboard' }],
              },
            },
          ],
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'Failed to save work zone.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PoliceScreenFrame
      title="Working Zone"
      subtitle="Select your active Wilaya and Commune"
      loading={loading}
      error={error}
      onRefresh={() => loadOptions(wilayaId || null)}
      stats={[
        { label: 'Wilayas', value: wilayas.length, tone: Colors.primary },
        { label: 'Communes', value: communes.length, tone: Colors.secondary },
      ]}
    >
      <PoliceSectionCard title="Zone Selection">
        <SelectList title="Wilaya" items={wilayas} selectedValue={wilayaId} onSelect={handleWilayaChange} />
        <SelectList title="Commune" items={communes} selectedValue={communeId} onSelect={setCommuneId} disabled={!wilayaId} />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.88} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Working Zone'}</Text>
        </TouchableOpacity>
      </PoliceSectionCard>

      <PoliceSectionCard title="Current Assignment">
        <Text style={styles.assignmentText}>Officer: {me?.officer?.name || 'Officer'}</Text>
        <Text style={styles.assignmentText}>Wilaya: {me?.workZone?.wilaya?.name || 'Not selected'}</Text>
        <Text style={styles.assignmentText}>Commune: {me?.workZone?.commune?.name || 'Not selected'}</Text>
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  selectGroup: {
    gap: 10,
  },
  label: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionBtnDisabled: {
    opacity: 0.5,
  },
  optionBtnText: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
  },
  optionBtnTextActive: {
    color: Colors.white,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: Colors.white,
    fontWeight: '800',
  },
  assignmentText: {
    color: Colors.text,
    fontSize: 13,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 12,
  },
});
