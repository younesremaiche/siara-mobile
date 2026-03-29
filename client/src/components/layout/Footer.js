import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

export default function Footer() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Ionicons name="shield-checkmark" size={22} color={Colors.btnPrimary} />
        <Text style={styles.logo}>SIARA</Text>
      </View>
      <Text style={styles.tagline}>
        Smart Incident Analysis & Road Safety for Algeria
      </Text>

      <View style={styles.links}>
        <TouchableOpacity onPress={() => navigation.navigate('About')}>
          <Text style={styles.link}>About</Text>
        </TouchableOpacity>
        <Text style={styles.dot}>.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Services')}>
          <Text style={styles.link}>Services</Text>
        </TouchableOpacity>
        <Text style={styles.dot}>.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Contact')}>
          <Text style={styles.link}>Contact</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.socials}>
        {['logo-facebook', 'logo-twitter', 'logo-linkedin', 'logo-instagram'].map((icon) => (
          <TouchableOpacity key={icon} style={styles.socialBtn}>
            <Ionicons name={icon} size={18} color={Colors.btnPrimary} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.copy}>2025 SIARA. All rights reserved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  logo: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.heading,
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 12,
    color: Colors.subtext,
    textAlign: 'center',
    marginBottom: 14,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  link: {
    fontSize: 13,
    color: Colors.btnPrimary,
    fontWeight: '500',
  },
  dot: {
    color: Colors.greyLight,
    fontSize: 16,
  },
  socials: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  socialBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: {
    fontSize: 11,
    color: Colors.greyLight,
  },
});
