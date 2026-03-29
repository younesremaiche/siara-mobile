import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Colors } from '../../theme/colors';

export default function ContactForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit() {
    if (onSubmit) onSubmit({ name, email, message });
    setName('');
    setEmail('');
    setMessage('');
  }

  return (
    <View>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Your name" />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
        keyboardType="email-address"
      />
      <Text style={styles.label}>Message</Text>
      <TextInput
        style={styles.textarea}
        value={message}
        onChangeText={setMessage}
        placeholder="Your message..."
        placeholderTextColor={Colors.grey}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />
      <View style={{ height: 12 }} />
      <Button onPress={handleSubmit}>Send</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: Colors.accent,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  textarea: {
    backgroundColor: '#F3F4F6',
    color: Colors.textDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 120,
  },
});
