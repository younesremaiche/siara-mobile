import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Text as SvgText, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_PADDING_L = 36;
const CHART_WIDTH = SCREEN_WIDTH - 48;
const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING_L - 8;
const CHART_HEIGHT = 140;
const PLOT_TOP = 8;
const PLOT_BOTTOM = CHART_HEIGHT - 22;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function severityFromPercent(p) {
  if (p == null) return 'low';
  if (p < 25) return 'low';
  if (p < 50) return 'moderate';
  if (p < 75) return 'high';
  return 'extreme';
}

function normalizeSeverity(level, dangerPercent) {
  const text = String(level || '').trim().toLowerCase();
  if (['low', 'moderate', 'high', 'extreme'].includes(text)) return text;
  return severityFromPercent(toFiniteNumber(dangerPercent));
}

function severityRank(level) {
  if (level === 'extreme') return 3;
  if (level === 'high') return 2;
  if (level === 'moderate') return 1;
  return 0;
}

function colorForSeverity(level) {
  if (level === 'moderate') return '#f59e0b';
  if (level === 'high' || level === 'extreme') return '#ef4444';
  return '#22c55e';
}

function normalizePoint(item, index) {
  if (!item || typeof item !== 'object') return null;
  const dangerPercent = toFiniteNumber(item.danger_percent);
  if (dangerPercent == null) return null;
  const timeLabel = String(item.time_label || '').trim();
  const fallbackTime = String(item.time_iso || '').slice(11, 16);
  return {
    index,
    time_label: timeLabel || fallbackTime || `h${index}`,
    danger_percent: Math.max(0, Math.min(100, dangerPercent)),
    severity: normalizeSeverity(item.danger_level, dangerPercent),
  };
}

export default function DangerForecastChart({ points, loading = false }) {
  const data = useMemo(() => {
    if (!Array.isArray(points)) return [];
    return points.map((item, i) => normalizePoint(item, i)).filter(Boolean);
  }, [points]);

  const chartSeverity = useMemo(() => {
    if (data.length === 0) return 'low';
    let best = 'low';
    let bestRank = -1;
    for (const point of data) {
      const rank = severityRank(point.severity);
      if (rank > bestRank) {
        best = point.severity;
        bestRank = rank;
      }
    }
    return best;
  }, [data]);

  if (loading && data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>24h Danger Forecast</Text>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Loading forecast...</Text>
        </View>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>24h Danger Forecast</Text>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No forecast data available</Text>
        </View>
      </View>
    );
  }

  const maxVal = 100;
  const stepX = data.length > 1 ? PLOT_WIDTH / (data.length - 1) : PLOT_WIDTH;
  const scaleY = (v) => PLOT_BOTTOM - (v / maxVal) * PLOT_HEIGHT;

  let lineD = '';
  data.forEach((d, i) => {
    const x = CHART_PADDING_L + i * stepX;
    const y = scaleY(d.danger_percent);
    lineD += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  });

  const lastX = CHART_PADDING_L + (data.length - 1) * stepX;
  const firstX = CHART_PADDING_L;
  const areaD = `${lineD} L${lastX},${PLOT_BOTTOM} L${firstX},${PLOT_BOTTOM} Z`;

  const yTicks = [0, 25, 50, 75, 100];
  const labelInterval = Math.max(Math.floor(data.length / 6), 1);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>24h Danger Forecast</Text>
        {loading && <Text style={styles.updatingBadge}>Updating...</Text>}
      </View>

      <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 4}>
        <Defs>
          <LinearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#A78BFA" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#A78BFA" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Grid lines + Y labels */}
        {yTicks.map((tick) => {
          const y = scaleY(tick);
          return (
            <React.Fragment key={`g-${tick}`}>
              <Line
                x1={CHART_PADDING_L - 4}
                y1={y}
                x2={CHART_WIDTH - 4}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="4,4"
                strokeWidth={0.5}
              />
              <SvgText x={CHART_PADDING_L - 8} y={y + 3} fill="#64748B" fontSize={9} textAnchor="end">
                {tick}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Area fill */}
        <Path d={areaD} fill="url(#forecastGrad)" />

        {/* Line */}
        <Path d={lineD} stroke={Colors.btnPrimary} strokeWidth={2.5} fill="none" />

        {/* Dots + X labels */}
        {data.map((d, i) => {
          const x = CHART_PADDING_L + i * stepX;
          const y = scaleY(d.danger_percent);
          return (
            <React.Fragment key={`d-${i}`}>
              <Circle cx={x} cy={y} r={3} fill={colorForSeverity(d.severity)} />
              {i % labelInterval === 0 && (
                <SvgText x={x} y={PLOT_BOTTOM + 14} fill="#64748B" fontSize={9} textAnchor="middle">
                  {d.time_label}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {['low', 'moderate', 'high', 'extreme'].map((level) => (
          <View key={level} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colorForSeverity(level) }]} />
            <Text style={styles.legendLabel}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  updatingBadge: {
    color: Colors.btnPrimary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  loadingBox: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.subtext,
    fontSize: 13,
  },
  emptyBox: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.grey,
    fontSize: 13,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: Colors.subtext,
  },
});
