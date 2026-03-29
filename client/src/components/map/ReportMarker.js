import { getIncidentColor } from '../../utils/mapHelpers';

const TYPE_META = Object.freeze({
  accident: { glyph: '\uD83D\uDE97', label: 'Accident' },
  traffic: { glyph: '\uD83D\uDEA6', label: 'Traffic' },
  danger: { glyph: '\u26A0', label: 'Danger' },
  weather: { glyph: '\uD83C\uDF27', label: 'Weather' },
  roadworks: { glyph: '\uD83D\uDEA7', label: 'Roadworks' },
  other: { glyph: '?', label: 'Other' },
});

export function getReportMarkerAppearance(report) {
  const severity = report?.severity || 'low';
  const incidentType = TYPE_META[report?.incidentType] ? report.incidentType : 'other';
  return {
    color: getIncidentColor(severity),
    glyph: TYPE_META[incidentType].glyph,
    typeLabel: TYPE_META[incidentType].label,
    size: 28,
  };
}

export function buildReportMarker(report) {
  if (!report?.location) return null;

  const appearance = getReportMarkerAppearance(report);

  return {
    ...report,
    lat: report.location.lat,
    lng: report.location.lng,
    title: report.title,
    type: report.incidentType,
    severity: report.severity,
    color: appearance.color,
    radius: appearance.size,
    glyph: appearance.glyph,
    typeLabel: appearance.typeLabel,
    iconSize: [28, 40],
    iconAnchor: [14, 38],
    isReport: true,
  };
}

export default function ReportMarker() {
  return null;
}
