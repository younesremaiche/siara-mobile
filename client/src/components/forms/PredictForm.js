import React, { useState } from 'react';
import { View } from 'react-native';
import Input from '../ui/Input';
import Button from '../ui/Button';

export default function PredictForm({ onSubmit }) {
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');

  function handleSubmit() {
    if (onSubmit) onSubmit({ location, date });
  }

  return (
    <View>
      <Input
        label="Location"
        value={location}
        onChangeText={setLocation}
        placeholder="City, state or coordinates"
      />
      <Input
        label="Date (optional)"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      <Button onPress={handleSubmit}>Run prediction</Button>
    </View>
  );
}
