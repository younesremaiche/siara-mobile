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
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const CONTACT_INFO = [
  {
    icon: 'mail',
    title: 'Email',
    value: 'support@siara.dz',
    color: Colors.primary,
    bg: Colors.violetLight,
    href: 'mailto:support@siara.dz',
  },
  {
    icon: 'location',
    title: 'Location',
    value: 'Constantine, Algeria',
    color: Colors.secondary,
    bg: Colors.blueLight,
    href: 'https://maps.google.com/?q=Constantine,Algeria',
  },
  {
    icon: 'call',
    title: 'Phone',
    value: '+213 542 866 839',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
    href: 'tel:+213542866839',
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradientFrom} />

      {/* Gradient header — back + title + hero, matching the app's other pages */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Us</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="chatbubbles" size={34} color={Colors.white} />
          </View>
          <Text style={styles.heroTitle}>Get in Touch</Text>
          <Text style={styles.heroSubtitle}>
            We would love to hear from you. Send us a message and we will respond as soon as possible.
          </Text>
        </View>
      </LinearGradient>

      {/* Contact info cards — equal-size, aligned, tappable */}
      <View style={styles.infoRow}>
        {CONTACT_INFO.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.infoCard}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(item.href).catch(() => {})}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={styles.infoTitle}>{item.title}</Text>
            <Text
              style={styles.infoValue}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.value}
            </Text>
          </TouchableOpacity>
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

  /* Gradient header */
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 44,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -25,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
  },

  /* Hero (on the gradient) */
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Contact info — uniform floating cards overlapping the header */
  infoRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: -26,
  },
  infoCard: {
    flex: 1,
    minHeight: 116,
    backgroundColor: Colors.white,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    gap: 7,
  },
  infoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTitle: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    color: Colors.heading,
    fontSize: 12.5,
    fontWeight: '700',
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
