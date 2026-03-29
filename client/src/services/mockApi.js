// Mock API helpers — sample data for offline / development use

export async function fetchNews() {
  return [
    { id: 1, title: 'New AI model deployed for Algiers risk prediction', summary: 'The SIARA team has deployed an enhanced deep-learning model covering all 58 wilayas with 94% accuracy.', category: 'update', date: '2025-12-10', image: null },
    { id: 2, title: 'Highway A1 safety improvements completed', summary: 'Major road safety infrastructure upgrades on the East-West highway have been completed ahead of schedule.', category: 'infrastructure', date: '2025-12-08', image: null },
    { id: 3, title: 'Winter weather advisory for northern wilayas', summary: 'Heavy rain and reduced visibility expected across Algiers, Tizi-Ouzou, and Béjaïa over the next 48 hours.', category: 'alert', date: '2025-12-07', image: null },
    { id: 4, title: 'Community reporting reaches 10,000 submissions', summary: 'SIARA community members have collectively submitted over 10,000 incident reports, helping train our AI models.', category: 'milestone', date: '2025-12-05', image: null },
  ];
}

export async function fetchPredictions() {
  return [
    { id: 1, zone: 'Alger Centre', danger_percent: 72, danger_level: 'high', timestamp: new Date().toISOString(), factors: ['rain', 'rush hour', 'narrow roads'] },
    { id: 2, zone: 'Bab Ezzouar', danger_percent: 45, danger_level: 'moderate', timestamp: new Date().toISOString(), factors: ['traffic density', 'construction'] },
    { id: 3, zone: 'El Harrach', danger_percent: 58, danger_level: 'moderate', timestamp: new Date().toISOString(), factors: ['poor lighting', 'heavy trucks'] },
    { id: 4, zone: 'Hydra', danger_percent: 18, danger_level: 'low', timestamp: new Date().toISOString(), factors: ['good visibility'] },
    { id: 5, zone: 'Oran Port', danger_percent: 65, danger_level: 'high', timestamp: new Date().toISOString(), factors: ['fog', 'port traffic'] },
  ];
}
