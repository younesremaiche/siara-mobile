import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export default function Loader({ size = 'large', color = Colors.btnPrimary, message }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.bg,
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.subtext,
    fontWeight: '500',
  },
});
