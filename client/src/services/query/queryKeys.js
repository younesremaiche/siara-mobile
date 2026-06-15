export const queryKeys = {
  reports: {
    all: ['reports'],
    list: (params = {}) => ['reports', 'list', params],
    mine: (userId, params = {}) => ['reports', 'mine', userId || 'anonymous', params],
    detail: (reportId) => ['reports', 'detail', String(reportId || '')],
    comments: (reportId) => ['reports', 'comments', String(reportId || '')],
  },
  police: {
    all: ['police'],
    me: ['police', 'me'],
    dashboard: ['police', 'dashboard'],
    incidents: (params = {}) => ['police', 'incidents', params],
    incident: (incidentId) => ['police', 'incident', String(incidentId || '')],
    alerts: (params = {}) => ['police', 'alerts', params],
    history: (params = {}) => ['police', 'history', params],
    workZoneOptions: (wilayaId = null) => ['police', 'work-zone-options', wilayaId || 'all'],
  },
  supervisor: {
    all: ['supervisor'],
    dashboard: (params = {}) => ['supervisor', 'dashboard', params],
    analytics: (params = {}) => ['supervisor', 'analytics', params],
    officers: (params = {}) => ['supervisor', 'officers', params],
    incidents: (params = {}) => ['supervisor', 'incidents', params],
    assignableOfficers: (incidentId) => ['supervisor', 'assignable-officers', String(incidentId || '')],
    globalMap: ['supervisor', 'global-map'],
  },
  admin: {
    all: ['admin'],
  },
  notifications: {
    all: ['notifications'],
  },
  dashboard: {
    all: ['dashboard'],
    user: ['dashboard', 'user'],
  },
};
