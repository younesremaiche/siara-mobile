import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../theme/colors';
import { getPoliceMe, getPoliceWorkZoneOptions, updatePoliceWorkZone } from '../../services/policeService';

const H1 = '#0D1B2A';
const H2 = '#1A3251';
const H3 = '#1E4976';

/* ── Picker modal ──────────────────────────────────────────────────── */
function PickerModal({ visible, title, items, selectedId, onSelect, onClose, loading }) {
  const [search, setSearch] = React.useState('');
  const insets = useSafeAreaInsets();

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  React.useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { paddingBottom: insets.bottom + 10 }]}>
          {/* Handle */}
          <View style={m.handle} />

          {/* Header */}
          <View style={m.sheetHeader}>
            <Text style={m.sheetTitle}>{title}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={16} color={Colors.heading} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={m.searchWrap}>
            <Ionicons name="search-outline" size={14} color={Colors.subtext} />
            <TextInput
              style={m.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor={Colors.subtext}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={15} color={Colors.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={m.loading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={m.loadingText}>Loading...</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={i => String(i.id)}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={m.empty}>No results for "{search}"</Text>
              }
              renderItem={({ item }) => {
                const active = String(item.id) === selectedId;
                return (
                  <TouchableOpacity
                    style={[m.row, active && m.rowActive]}
                    onPress={() => { onSelect(String(item.id)); onClose(); }}
                    activeOpacity={0.82}
                  >
                    <Text style={[m.rowText, active && m.rowTextActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ── Compact selector button ───────────────────────────────────────── */
function SelectorBtn({ label, value, placeholder, onPress, disabled, accent }) {
  return (
    <TouchableOpacity
      style={[s.selectorBtn, disabled && s.selectorBtnDisabled, value && { borderColor: (accent || Colors.primary) + '55' }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <View style={[s.selectorIcon, { backgroundColor: (accent || Colors.primary) + '14' }]}>
        <Ionicons name="location-outline" size={15} color={disabled ? Colors.border : (accent || Colors.primary)} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.selectorLabel}>{label}</Text>
        <Text style={[s.selectorValue, !value && s.selectorPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={16} color={disabled ? Colors.border : Colors.subtext} />
    </TouchableOpacity>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════════════ */
export default function PoliceWorkZoneScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [me, setMe]               = React.useState(null);
  const [wilayas, setWilayas]     = React.useState([]);
  const [communes, setCommunes]   = React.useState([]);
  const [wilayaId, setWilayaId]   = React.useState('');
  const [communeId, setCommuneId] = React.useState('');
  const [loading, setLoading]     = React.useState(true);
  const [saving, setSaving]       = React.useState(false);
  const [communeLoading, setCommuneLoading] = React.useState(false);
  const [error, setError]         = React.useState('');
  const [success, setSuccess]     = React.useState(false);
  const [showWilaya, setShowWilaya]   = React.useState(false);
  const [showCommune, setShowCommune] = React.useState(false);

  const loadOptions = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mePayload, optionsPayload] = await Promise.all([
        getPoliceMe(),
        getPoliceWorkZoneOptions(null),
      ]);
      const resolvedWilayaId = String(optionsPayload.selectedWilayaId || mePayload.workZone?.wilaya?.id || '');
      setMe(mePayload);
      setWilayas(optionsPayload.wilayas);
      setCommunes(optionsPayload.communes);
      setWilayaId(resolvedWilayaId);
      setCommuneId(String(optionsPayload.selectedCommuneId || mePayload.workZone?.commune?.id || ''));
    } catch (e) {
      setError(e.message || 'Failed to load options.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { void loadOptions(); }, [loadOptions]));

  const handleWilayaSelect = async (value) => {
    setWilayaId(value);
    setCommuneId('');
    setCommuneLoading(true);
    try {
      const opts = await getPoliceWorkZoneOptions(value);
      setCommunes(opts.communes);
    } catch (e) {
      setError(e.message);
    } finally {
      setCommuneLoading(false);
    }
  };

  const handleSave = async () => {
    if (!wilayaId || !communeId) {
      setError('Select both Wilaya and Commune before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updatePoliceWorkZone({ wilayaId: Number(wilayaId), communeId: Number(communeId) });
      const refreshed = await getPoliceMe();
      setMe(refreshed);
      setSuccess(true);
      setTimeout(() => {
        if (!refreshed.requiresZoneSelection) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'PoliceTabs', state: { routes: [{ name: 'PoliceDashboard' }] } }],
          });
        }
      }, 900);
    } catch (e) {
      setError(e.message || 'Failed to save work zone.');
    } finally {
      setSaving(false);
    }
  };

  const selectedWilaya  = wilayas.find(w => String(w.id) === wilayaId);
  const selectedCommune = communes.find(c => String(c.id) === communeId);
  const canSave = !!wilayaId && !!communeId;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={H1} translucent={false} />

      {/* ── Header ── */}
      <LinearGradient
        colors={[H1, H2, H3]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.hDecor1} /><View style={s.hDecor2} />
        <View style={s.hRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.hTitle}>Work Zone</Text>
            <Text style={s.hSub}>Set your active patrol area</Text>
          </View>
          <View style={s.hIcon}>
            <Ionicons name="map" size={22} color="rgba(147,197,253,0.45)" />
          </View>
        </View>

        {/* Active zone pill */}
        {me?.workZone?.wilaya?.name ? (
          <View style={s.activePill}>
            <View style={s.activeDot} />
            <Text style={s.activePillText}>
              {me.workZone.wilaya.name}
              {me.workZone.commune?.name ? ` · ${me.workZone.commune.name}` : ''}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      {/* ── Body ── */}
      <View style={s.body}>

        {/* Error */}
        {error ? (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
            <Text style={s.errorText} numberOfLines={2}>{error}</Text>
            <TouchableOpacity onPress={() => setError('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Success */}
        {success ? (
          <View style={s.successBanner}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
            <Text style={s.successText}>Zone saved — redirecting...</Text>
          </View>
        ) : null}

        {/* Selectors card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Select Your Zone</Text>
          <Text style={s.cardSub}>Tap each field to choose from the list</Text>

          <View style={s.divider} />

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={s.loadingText}>Loading zones...</Text>
            </View>
          ) : (
            <View style={s.selectors}>
              <SelectorBtn
                label="Wilaya"
                value={selectedWilaya?.name}
                placeholder="Select province..."
                onPress={() => setShowWilaya(true)}
                accent={Colors.primary}
              />

              <View style={s.arrowRow}>
                <View style={s.arrowLine} />
                <Ionicons name="chevron-down" size={14} color={Colors.border} />
                <View style={s.arrowLine} />
              </View>

              <SelectorBtn
                label="Commune"
                value={selectedCommune?.name}
                placeholder={wilayaId ? 'Select commune...' : 'Select a wilaya first'}
                onPress={() => setShowCommune(true)}
                disabled={!wilayaId || communeLoading}
                accent={Colors.secondary}
              />
            </View>
          )}
        </View>

        {/* Zone preview */}
        {canSave ? (
          <View style={s.previewCard}>
            <View style={s.previewLeft}>
              <View style={[s.previewDot, { backgroundColor: Colors.primary }]} />
              <View style={s.previewTextWrap}>
                <Text style={s.previewLabel}>WILAYA</Text>
                <Text style={s.previewValue}>{selectedWilaya?.name}</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward" size={14} color={Colors.border} />
            <View style={s.previewLeft}>
              <View style={[s.previewDot, { backgroundColor: Colors.secondary }]} />
              <View style={s.previewTextWrap}>
                <Text style={s.previewLabel}>COMMUNE</Text>
                <Text style={s.previewValue}>{selectedCommune?.name}</Text>
              </View>
            </View>
            <View style={s.readyPill}>
              <View style={s.readyDot} />
              <Text style={s.readyText}>READY</Text>
            </View>
          </View>
        ) : null}

        {/* Save button */}
        <TouchableOpacity
          style={[s.saveBtn, !canSave && s.saveBtnOff]}
          onPress={handleSave}
          activeOpacity={0.88}
          disabled={saving || !canSave}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={18} color={canSave ? Colors.white : Colors.subtext} />
          )}
          <Text style={[s.saveBtnText, !canSave && s.saveBtnTextOff]}>
            {saving ? 'Saving...' : canSave ? 'Confirm Work Zone' : 'Select wilaya & commune'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Modals ── */}
      <PickerModal
        visible={showWilaya}
        title="Wilaya"
        items={wilayas}
        selectedId={wilayaId}
        onSelect={handleWilayaSelect}
        onClose={() => setShowWilaya(false)}
      />
      <PickerModal
        visible={showCommune}
        title="Commune"
        items={communes}
        selectedId={communeId}
        onSelect={setCommuneId}
        onClose={() => setShowCommune(false)}
        loading={communeLoading}
      />
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  /* header */
  header: { paddingHorizontal: 20, paddingBottom: 20, gap: 14, overflow: 'hidden' },
  hDecor1: {
    position: 'absolute', top: -50, right: -50,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  hDecor2: {
    position: 'absolute', bottom: -30, left: -40,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(96,165,250,0.05)',
  },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
  hTitle: { color: '#F1F5F9', fontSize: 20, fontWeight: '800' },
  hSub:   { color: 'rgba(241,245,249,0.46)', fontSize: 11, marginTop: 2 },
  hIcon: { opacity: 0.7 },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  activePillText: { color: '#22C55E', fontSize: 11, fontWeight: '700' },

  /* body */
  body: { flex: 1, padding: 18, gap: 14 },

  /* banners */
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)',
    borderRadius: 14, padding: 12,
  },
  errorText: { flex: 1, color: Colors.error, fontSize: 13 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(34,197,94,0.07)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: 14, padding: 12,
  },
  successText: { color: Colors.success, fontSize: 13, fontWeight: '700' },

  /* selector card */
  card: {
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.borderLight, padding: 18, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  cardTitle: { color: Colors.heading, fontSize: 15, fontWeight: '800' },
  cardSub: { color: Colors.subtext, fontSize: 12, marginTop: -6 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: -18 },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  loadingText: { color: Colors.subtext, fontSize: 13 },
  selectors: { gap: 0 },

  /* selector button */
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, padding: 14,
    backgroundColor: Colors.bg,
  },
  selectorBtnDisabled: { opacity: 0.5 },
  selectorIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  selectorLabel: { color: Colors.subtext, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  selectorValue: { color: Colors.heading, fontSize: 14, fontWeight: '700', marginTop: 2 },
  selectorPlaceholder: { color: Colors.subtext, fontWeight: '400', fontSize: 13 },

  /* arrow between selectors */
  arrowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingLeft: 32,
  },
  arrowLine: { flex: 1, height: 1, backgroundColor: Colors.border },

  /* zone preview */
  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.violetBorder,
    padding: 14,
  },
  previewLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewTextWrap: { flex: 1 },
  previewLabel: { color: Colors.subtext, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  previewValue: { color: Colors.heading, fontSize: 13, fontWeight: '800', marginTop: 1 },
  readyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  readyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.success },
  readyText: { color: Colors.success, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  /* save button */
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 15,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 4,
  },
  saveBtnOff: {
    backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
    shadowOpacity: 0,
  },
  saveBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  saveBtnTextOff: { color: Colors.subtext },
});

/* ── Modal styles ──────────────────────────────────────────────────── */
const m = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingHorizontal: 18, paddingTop: 12, gap: 14,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: Colors.heading, fontSize: 16, fontWeight: '800' },
  closeBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: Colors.bg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: Colors.heading, fontSize: 13, padding: 0 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  loadingText: { color: Colors.subtext, fontSize: 13 },
  empty: { color: Colors.subtext, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  rowActive: { backgroundColor: Colors.violetLight, borderRadius: 10, paddingHorizontal: 10, borderBottomWidth: 0, marginBottom: 2 },
  rowText: { flex: 1, color: Colors.text, fontSize: 14 },
  rowTextActive: { color: Colors.primary, fontWeight: '800' },
});
