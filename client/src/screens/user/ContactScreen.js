import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const CONTACT_INFO = [
  {
    icon: 'mail',
    title: 'Email',
    value: 'support@siara.dz',
    color: Colors.primary,
    bg: Colors.violetLight,
  },
  {
    icon: 'location',
    title: 'Location',
    value: 'Algiers, Algeria',
    color: Colors.secondary,
    bg: Colors.blueLight,
  },
  {
    icon: 'call',
    title: 'Phone',
    value: '+213 555 0123',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
  },
];

const SOCIAL_LINKS = [
  { icon: 'logo-facebook', label: 'Facebook', color: '#1877F2' },
  { icon: 'logo-twitter', label: 'Twitter', color: '#1DA1F2' },
  { icon: 'logo-linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { icon: 'logo-instagram', label: 'Instagram', color: '#E4405F' },
];

export default function ContactScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!name.trim() || !email.trim() || !message.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields before sending.');
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setName('');
      setEmail('');
      setMessage('');
      setTimeout(() => setSent(false), 3000);
    }, 1200);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="chatbubbles" size={36} color={Colors.white} />
        </View>
        <Text style={styles.heroTitle}>Get in Touch</Text>
        <Text style={styles.heroSubtitle}>
          We would love to hear from you. Send us a message and we will respond as soon as possible.
        </Text>
      </View>

      {/* Contact info cards */}
      <View style={styles.infoRow}>
        {CONTACT_INFO.map((item) => (
          <View key={item.title} style={styles.infoCard}>
            <View style={[styles.infoIconWrap, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={styles.infoTitle}>{item.title}</Text>
            <Text style={styles.infoValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      {/* Contact form */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Send a Message</Text>

        {sent && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
            <Text style={styles.successText}>Message sent successfully!</Text>
          </View>
        )}

        <Input
          label="Your Name"
          value={name}
          onChangeText={setName}
          placeholder="John Doe"
        />
        <Input
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="john@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Message"
          value={message}
          onChangeText={setMessage}
          placeholder="How can we help you?"
          multiline
          numberOfLines={5}
          inputStyle={styles.messageInput}
        />

        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
          activeOpacity={0.8}
        >
          <Ionicons name={sending ? 'hourglass' : 'send'} size={18} color={Colors.white} />
          <Text style={styles.sendBtnText}>
            {sending ? 'Sending...' : 'Send Message'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Social links */}
      <View style={styles.socialSection}>
        <Text style={styles.socialTitle}>Follow Us</Text>
        <View style={styles.socialRow}>
          {SOCIAL_LINKS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={styles.socialBtn}
              activeOpacity={0.7}
            >
              <Ionicons name={s.icon} size={24} color={s.color} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    paddingBottom: 40,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.btnPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTitle: {
    color: Colors.heading,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Contact info */
  infoRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoTitle: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '500',
  },
  infoValue: {
    color: Colors.heading,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* Form */
  formCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  formTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  messageInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.btnPrimary,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,169,88,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,169,88,0.2)',
  },
  successText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Social */
  socialSection: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 20,
  },
  socialTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 14,
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },

  bottomSpacer: {
    height: 20,
  },
});
