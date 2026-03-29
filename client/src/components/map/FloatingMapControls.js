import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { formatPercent } from '../../utils/mapHelpers';

export default function FloatingMapControls({
  displayMode = 'map',
  mapLayer,
  layerOptions = [],
  onSetMapLayer,
  hasActiveFilters,
  onOpenFilters,
  onOpenMapStyle,
  onReportIncident,
  destinationQuery = '',
  destinationResults = [],
  destinationSearchState = 'idle',
  destinationSearchError = '',
  selectedDestination,
  selectedRoute,
  guidanceActive,
  isGuidanceBusy,
  selectedRouteType,
  onDestinationQueryChange,
  onDestinationFocus,
  onSelectDestination,
  onClearDestination,
  onStartGuidance,
  onClearGuidance,
  onOpenInfoMode,
}) {
  const showGuidanceControls = displayMode === 'map';
  const showEmptySearchState =
    destinationQuery.trim().length >= 2 &&
    destinationSearchState === 'success' &&
    destinationResults.length === 0;

  return (
    <>
      <View style={styles.layerBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.layerBarContent}>
          {layerOptions.map((layer) => (
            <TouchableOpacity
              key={layer.key}
              style={[styles.layerChip, mapLayer === layer.key && styles.layerChipActive]}
              onPress={() => onSetMapLayer?.(layer.key)}
            >
              <Ionicons
                name={layer.icon}
                size={14}
                color={mapLayer === layer.key ? Colors.white : Colors.primary}
                style={styles.layerChipIcon}
              />
              <Text style={[styles.layerChipText, mapLayer === layer.key && styles.layerChipTextActive]}>
                {layer.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={onOpenFilters}
        >
          <Ionicons name="funnel" size={16} color={hasActiveFilters ? Colors.white : Colors.primary} />
        </TouchableOpacity>
      </View>

      {showGuidanceControls ? (
        <View style={styles.guidanceCard}>
          {guidanceActive && selectedRoute ? (
            <View style={styles.compactRouteSummary}>
              <View style={styles.compactCopy}>
                <Text style={styles.compactLabel}>{selectedRoute.route_label}</Text>
                <Text style={styles.compactDestination} numberOfLines={1}>
                  {selectedDestination?.name || 'Destination'}
                </Text>
                <Text style={styles.compactMeta}>
                  {formatPercent(selectedRoute.danger_percent)} risk | {selectedRoute.comparisonText}
                </Text>
              </View>
              <View style={styles.compactActions}>
                <TouchableOpacity style={styles.secondaryCompactBtn} onPress={onOpenInfoMode}>
                  <Text style={styles.secondaryCompactBtnText}>Details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryCompactBtn} onPress={onStartGuidance} disabled={isGuidanceBusy}>
                  {isGuidanceBusy ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.primaryCompactBtnText}>Refresh</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={Colors.grey} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search destination"
                  placeholderTextColor={Colors.grey}
                  value={destinationQuery}
                  onChangeText={onDestinationQueryChange}
                  onFocus={onDestinationFocus}
                />
                {destinationQuery.length > 0 ? (
                  <TouchableOpacity onPress={onClearDestination}>
                    <Ionicons name="close-circle" size={18} color={Colors.grey} />
                  </TouchableOpacity>
                ) : null}
                {destinationSearchState === 'loading' ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={styles.searchSpinner} />
                ) : null}
              </View>

              {destinationResults.length > 0 ? (
                <View style={styles.resultsDropdown}>
                  <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
                    {destinationResults.map((result) => (
                      <TouchableOpacity
                        key={result.id}
                        style={styles.resultItem}
                        onPress={() => onSelectDestination?.(result)}
                      >
                        <Ionicons name="location-outline" size={16} color={Colors.primary} style={styles.resultIcon} />
                        <View style={styles.resultCopy}>
                          <Text style={styles.resultName} numberOfLines={1}>{result.name}</Text>
                          <Text style={styles.resultSubtitle} numberOfLines={2}>
                            {result.subtitle || result.full_name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {destinationSearchError ? <Text style={styles.errorText}>{destinationSearchError}</Text> : null}
              {showEmptySearchState ? <Text style={styles.helperText}>No destinations matched your search.</Text> : null}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.primaryAction, (!selectedDestination || isGuidanceBusy) && styles.disabledAction]}
                  onPress={onStartGuidance}
                  disabled={!selectedDestination || isGuidanceBusy}
                >
                  {isGuidanceBusy ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Ionicons name="navigate" size={16} color={Colors.white} />
                  )}
                  <Text style={styles.primaryActionText}>
                    {guidanceActive ? 'Refresh guidance' : 'Start guidance'}
                  </Text>
                </TouchableOpacity>

                {guidanceActive || selectedRouteType ? (
                  <TouchableOpacity style={styles.secondaryAction} onPress={onClearGuidance}>
                    <Ionicons name="close" size={16} color={Colors.error} />
                    <Text style={styles.secondaryActionText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.fabColumn}>
        <TouchableOpacity style={styles.fabBtn} onPress={onOpenMapStyle}>
          <Ionicons name="layers-outline" size={20} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabBtn} onPress={onReportIncident}>
          <Ionicons name="warning-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  layerBar: {
    position: 'absolute',
    top: 58,
    left: 12,
    right: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 30,
  },
  layerBarContent: {
    gap: 8,
    paddingRight: 4,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.14)',
  },
  layerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  layerChipIcon: {
    marginRight: 5,
  },
  layerChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  layerChipTextActive: {
    color: Colors.white,
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  guidanceCard: {
    position: 'absolute',
    top: 112,
    left: 12,
    right: 72,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    zIndex: 30,
  },
  compactRouteSummary: {
    gap: 10,
  },
  compactCopy: {
    gap: 3,
  },
  compactLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compactDestination: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  compactMeta: {
    fontSize: 12,
    color: Colors.subtext,
  },
  compactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryCompactBtn: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.btnPrimary,
  },
  primaryCompactBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryCompactBtn: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryCompactBtnText: {
    color: Colors.heading,
    fontSize: 12,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 0,
  },
  searchSpinner: {
    marginLeft: 6,
  },
  resultsDropdown: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  resultsScroll: {
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  resultIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  resultCopy: {
    flex: 1,
  },
  resultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
    marginBottom: 2,
  },
  resultSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.subtext,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.error,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.subtext,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: Colors.btnPrimary,
  },
  disabledAction: {
    opacity: 0.5,
  },
  primaryActionText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryAction: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  secondaryActionText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '800',
  },
  fabColumn: {
    position: 'absolute',
    top: 56,
    right: 12,
    gap: 10,
    zIndex: 30,
  },
  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
