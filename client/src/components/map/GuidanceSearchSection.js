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

export default function GuidanceSearchSection({
  destinationQuery = '',
  destinationResults = [],
  destinationSearchState = 'idle',
  destinationSearchError = '',
  guidedRouteError = '',
  selectedDestination,
  onDestinationQueryChange,
  onDestinationFocus,
  onSelectDestination,
  onClearDestination,
}) {
  const showEmptyState =
    destinationQuery.trim().length >= 2 &&
    destinationSearchState === 'success' &&
    destinationResults.length === 0;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Destination</Text>
        {selectedDestination ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {selectedDestination.full_name || selectedDestination.name}
          </Text>
        ) : (
          <Text style={styles.subtitle}>Search and select where you want to go.</Text>
        )}
      </View>

      <View style={styles.searchCard}>
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
          {destinationSearchState === 'loading' ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.searchSpinner} />
          ) : null}
          {destinationQuery.length > 0 ? (
            <TouchableOpacity onPress={onClearDestination} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={Colors.grey} />
            </TouchableOpacity>
          ) : null}
        </View>

        {destinationResults.length > 0 ? (
          <ScrollView
            style={styles.resultsScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
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
        ) : null}

        {showEmptyState ? <Text style={styles.helperText}>No destinations matched your search.</Text> : null}
      </View>

      {destinationSearchError ? <Text style={styles.errorText}>{destinationSearchError}</Text> : null}
      {guidedRouteError ? <Text style={styles.errorText}>{guidedRouteError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.heading,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  searchCard: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
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
    height: 38,
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 0,
  },
  searchSpinner: {
    marginLeft: 6,
  },
  clearBtn: {
    marginLeft: 6,
  },
  resultsScroll: {
    maxHeight: 180,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
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
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.subtext,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
  },
});
