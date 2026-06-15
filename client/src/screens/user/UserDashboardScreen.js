import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import { useUserDashboard } from '../../features/reports/hooks/useDashboardQuery';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const { width } = Dimensions.get('window');

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

// Map a 0–100 score onto the severity color ramp.
function getBarColor(value) {
  if (value >= 75) return Colors.severityCritical;
  if (value >= 50) return Colors.severityHigh;
  if (value >= 25) return Colors.severityMedium;
  return Colors.severityLow;
}

// Color for a textual severity (alerts come back as high/medium/low).
function severityColor(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical': return Colors.severityCritical;
    case 'high': return Colors.severityHigh;
    case 'medium':
    case 'moderate': return Colors.severityMedium;
    case 'low': return Colors.severityLow;
    default: return Colors.severityMedium;
  }
}

// Best-effort icon for an ML contributing-factor / feature label.
function factorIconFor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('speed')) return 'speedometer-outline';
  if (n.includes('dui') || n.includes('alcohol') || n.includes('impair')) return 'wine-outline';
  if (n.includes('distract') || n.includes('phone')) return 'phone-portrait-outline';
  if (n.includes('weather') || n.includes('rain') || n.includes('precip')
    || n.includes('wind') || n.includes('visib') || n.includes('temp')
    || n.includes('humid') || n.includes('pressure')) return 'rainy-outline';
  if (n.includes('junction') || n.includes('cross') || n.includes('signal')
    || n.includes('stop') || n.includes('rail') || n.includes('infrastructure')
    || n.includes('road')) return 'construct-outline';
  if (n.includes('pattern') || n.includes('season') || n.includes('weekly')
    || n.includes('traffic')) return 'calendar-outline';
  return 'analytics-outline';
}

const FACTOR_PALETTE = [
  Colors.severityCritical,
  Colors.severityHigh,
  Colors.severityMedium,
  Colors.secondary,
  Colors.primary,
];

// "00:00–06:00" -> "00". Falls back to the bucket index when unparseable.
function bucketShortLabel(bucket, index) {
  const match = String(bucket || '').match(/^(\d{2})/);
  if (match) return match[1];
  return String(index * 6).padStart(2, '0');
}

function forecastLevel(value) {
  if (value >= 75) return 'High';
  if (value >= 45) return 'Medium';
  return 'Low';
}

// Sample the dense 48h forecast (points every 4h) down to a readable set.
function sampleForecast(points = []) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const wanted = ['Now', '+12h', '+24h', '+36h', '+48h'];
  const picked = wanted
    .map((label) => points.find((p) => p.label === label))
    .filter(Boolean);
  if (picked.length >= 2) return picked;
  // Fallback: evenly sample up to 5 points.
  const step = Math.max(1, Math.ceil(points.length / 5));
  return points.filter((_, i) => i % step === 0).slice(0, 5);
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function UserDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const dashboardQuery = useUserDashboard();
  useFocusRefresh(dashboardQuery.refetch);

  const dashboard = dashboardQuery.data || {};
  const profile = dashboard.profile || {};
  const currentRisk = dashboard.currentRiskOverview || {};
  const volatility = dashboard.riskVolatilityIndex || {};
  const severity = dashboard.severityPressure || {};
  const distribution = Array.isArray(dashboard.incidentDistribution24h) ? dashboard.incidentDistribution24h : [];
  const factors = Array.isArray(dashboard.topContributingFactors) ? dashboard.topContributingFactors : [];
  const forecast = dashboard.riskForecast48h || {};
  const roads = Array.isArray(dashboard.highRiskRoadRanking) ? dashboard.highRiskRoadRanking : [];
  const alertsSummary = dashboard.activeAlerts || {};
  const exposure = dashboard.exposureIndex || {};
  const systemOverview = dashboard.systemOverview || {};
  const aiInsight = dashboard.aiInsightOfWeek || {};
  const volatileZone = dashboard.mostVolatileZoneToday || null;

  // ----- Risk overview -----
  const riskScore = currentRisk.score == null ? null : Math.round(Number(currentRisk.score));
  const riskColor = riskScore == null ? Colors.greyLight : getBarColor(riskScore);
  const riskFill = riskScore == null ? 0
    : riskScore >= 75 ? 4 : riskScore >= 50 ? 3 : riskScore >= 25 ? 2 : 1;
  const changeVsYesterday = currentRisk.changeVsYesterday;
  const aiConfidence = currentRisk.aiConfidence;
  const activeAlertCount = Number(profile.activeAlerts ?? alertsSummary.items?.length ?? 0);
  const monitoredZones = Number(profile.monitoredZones || 0);

  // ----- Volatility -----
  const volScore = Number(volatility.score || 0);
  const volTrend = Array.isArray(volatility.trend7d) ? volatility.trend7d : [];
  const hasVolTrend = volTrend.some((v) => Number(v) > 0);
  const volColor = getBarColor(volScore);

  // ----- Severity pressure -----
  const severityRows = [
    { label: 'High', value: Number(severity.high || 0), color: Colors.severityHigh },
    { label: 'Medium', value: Number(severity.medium || 0), color: Colors.severityMedium },
    { label: 'Low', value: Number(severity.low || 0), color: Colors.severityLow },
  ];
  const totalIncidents = Number(systemOverview.totalIncidents || 0);

  // ----- 24h distribution -----
  const maxDist = Math.max(1, ...distribution.map((d) => Number(d.incidents || 0)));
  const peakBucket = [...distribution]
    .sort((a, b) => Number(b.incidents || 0) - Number(a.incidents || 0))[0] || null;

  // ----- 48h forecast -----
  const forecastPoints = sampleForecast(forecast.points);

  // ----- Alerts & insight -----
  const alertItems = Array.isArray(alertsSummary.items) ? alertsSummary.items : [];
  const insightItems = Array.isArray(aiInsight.items) ? aiInsight.items : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await dashboardQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [dashboardQuery]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
    >
      <StatusBar barStyle="light-content" />

      {/* ========== HEADER ========== */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Welcome back</Text>
            <Text style={styles.headerTitle}>Personal Intelligence Dashboard</Text>
          </View>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{riskScore || '--'}</Text>
            <Text style={styles.quickStatLabel}>Risk Score</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{activeAlertCount}</Text>
            <Text style={styles.quickStatLabel}>Active Alerts</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{monitoredZones}</Text>
            <Text style={styles.quickStatLabel}>Zones Tracked</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ========== RISK OVERVIEW ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="shield-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Risk Overview</Text>
            </View>
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>Live</Text>
            </View>
          </View>

          {/* Donut-style indicator — quarters fill by risk band */}
          <View style={styles.donutSection}>
            <View style={styles.donutOuter}>
              <View style={styles.donutTrack}>
                {[styles.donutQ1, styles.donutQ2, styles.donutQ3, styles.donutQ4].map((q, i) => (
                  <View
                    key={i}
                    style={[
                      styles.donutFillQuarter,
                      q,
                      { backgroundColor: i < riskFill ? riskColor + (i === riskFill - 1 ? 'FF' : 'CC') : Colors.border },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.donutInner}>
                <Text style={[styles.donutValue, { color: riskColor }]}>{riskScore == null ? '--' : riskScore}</Text>
                <Text style={styles.donutUnit}>/100</Text>
              </View>
            </View>

            <View style={styles.donutInfo}>
              <View style={[styles.riskLevelBadge, { backgroundColor: riskColor + '18' }]}>
                <Ionicons name="alert-circle" size={14} color={riskColor} />
                <Text style={[styles.riskLevelText, { color: riskColor }]}>{currentRisk.label || 'Unavailable'}</Text>
              </View>
              <Text style={styles.donutDesc}>
                Based on recent SIARA model outputs for your watched zones
                {aiConfidence != null ? ` · AI confidence ${aiConfidence}%` : ''}.
              </Text>
              {changeVsYesterday == null ? (
                <View style={styles.donutMeta}>
                  <Ionicons name="remove-outline" size={14} color={Colors.greyLight} />
                  <Text style={styles.donutMetaText}>Awaiting trend data</Text>
                </View>
              ) : (
                <View style={styles.donutMeta}>
                  <Ionicons
                    name={changeVsYesterday > 0 ? 'trending-up' : changeVsYesterday < 0 ? 'trending-down' : 'remove-outline'}
                    size={14}
                    color={changeVsYesterday > 0 ? Colors.severityHigh : changeVsYesterday < 0 ? Colors.severityLow : Colors.grey}
                  />
                  <Text style={styles.donutMetaText}>
                    {changeVsYesterday > 0 ? `+${changeVsYesterday}` : changeVsYesterday} pts vs yesterday
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ========== VOLATILITY INDEX ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="pulse-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>Volatility Index</Text>
            </View>
            <Text style={styles.cardHeaderValue}>
              <Text style={{ color: volColor, fontWeight: '900' }}>{(volScore / 10).toFixed(1)}</Text>
              <Text style={{ color: Colors.subtext, fontSize: 12 }}> /10</Text>
            </Text>
          </View>

          {/* 7-day volatility sparkline */}
          {hasVolTrend ? (
            <View style={styles.sparklineWrap}>
              <View style={styles.sparkline}>
                {volTrend.map((v, i) => {
                  const val = Math.max(0, Math.min(100, Number(v) || 0));
                  return (
                    <View
                      key={i}
                      style={[
                        styles.sparkBar,
                        {
                          height: `${val}%`,
                          backgroundColor: val >= 60 ? Colors.severityHigh + 'CC' : Colors.secondary + '66',
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <View style={styles.sparkLabels}>
                <Text style={styles.sparkLabel}>6d ago</Text>
                <Text style={styles.sparkLabel}>3d ago</Text>
                <Text style={styles.sparkLabel}>Now</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyHint}>Not enough recent risk movement to chart.</Text>
          )}

          <View style={styles.volatilityNote}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.subtext} />
            <Text style={styles.volatilityNoteText}>
              {volatility.label || 'Volatility unavailable'}
              {volatility.change24h != null
                ? ` · ${volatility.change24h > 0 ? '+' : ''}${volatility.change24h} vs prior day`
                : ''}
            </Text>
          </View>

          {volatileZone?.name ? (
            <View style={styles.volatileRow}>
              <Ionicons name="location-outline" size={14} color={Colors.subtext} />
              <Text style={styles.volatileText} numberOfLines={1}>
                Most volatile today: {volatileZone.name}
              </Text>
              {volatileZone.risk != null ? (
                <Text style={[styles.volatileRisk, { color: getBarColor(volatileZone.risk) }]}>
                  {volatileZone.risk}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* ========== SEVERITY PRESSURE ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="bar-chart-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Severity Pressure</Text>
            </View>
          </View>

          {severityRows.map((sp) => (
            <View key={sp.label} style={styles.pressureRow}>
              <View style={styles.pressureLabelWrap}>
                <View style={[styles.pressureDot, { backgroundColor: sp.color }]} />
                <Text style={styles.pressureLabel}>{sp.label}</Text>
              </View>
              <View style={styles.pressureBarOuter}>
                <View
                  style={[
                    styles.pressureBarInner,
                    { width: `${Math.max(0, Math.min(100, sp.value))}%`, backgroundColor: sp.color },
                  ]}
                />
              </View>
              <Text style={[styles.pressurePct, { color: sp.color }]}>{sp.value}%</Text>
            </View>
          ))}

          <View style={styles.pressureTotal}>
            <Text style={styles.pressureTotalLabel}>Share of reports (last 7 days)</Text>
            <Text style={styles.pressureTotalValue}>{totalIncidents.toLocaleString()} total</Text>
          </View>
        </View>
      </View>

      {/* ========== 24H DISTRIBUTION ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="time-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>24h Distribution</Text>
            </View>
          </View>

          <View style={styles.distChart}>
            {distribution.map((d, i) => {
              const count = Number(d.incidents || 0);
              const pct = (count / maxDist) * 100;
              const color = count === 0 ? Colors.border : getBarColor(pct);
              return (
                <View key={i} style={styles.distBarWrap}>
                  <Text style={styles.distCount}>{count}</Text>
                  <View style={styles.distBarOuter}>
                    <View style={[styles.distBar, { height: `${Math.max(2, pct)}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.distLabel}>{bucketShortLabel(d.bucket, i)}h</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.distPeakRow}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={Colors.severityCritical} />
            {peakBucket && Number(peakBucket.incidents || 0) > 0 ? (
              <Text style={styles.distPeakText}>
                Peak window: <Text style={{ fontWeight: '800', color: Colors.severityCritical }}>{peakBucket.bucket}</Text>
                {' '}({peakBucket.incidents} {Number(peakBucket.incidents) === 1 ? 'incident' : 'incidents'})
              </Text>
            ) : (
              <Text style={styles.distPeakText}>No incidents reported in the last 24h.</Text>
            )}
          </View>
        </View>
      </View>

      {/* ========== CONTRIBUTING FACTORS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="pie-chart-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Contributing Factors</Text>
            </View>
          </View>

          {factors.length === 0 ? (
            <Text style={styles.emptyHint}>No model explanations available for your zones yet.</Text>
          ) : (
            factors.map((f, idx) => {
              const color = FACTOR_PALETTE[idx % FACTOR_PALETTE.length];
              const pct = f.impactPct == null ? null : Number(f.impactPct);
              return (
                <View key={f.name || idx} style={styles.factorRow}>
                  <View style={styles.factorIconWrap}>
                    <Ionicons name={factorIconFor(f.name)} size={16} color={color} />
                  </View>
                  <View style={styles.factorContent}>
                    <View style={styles.factorLabelRow}>
                      <Text style={styles.factorLabel} numberOfLines={1}>{f.name}</Text>
                      <Text style={[styles.factorPct, { color }]}>{pct == null ? '—' : `${pct}%`}</Text>
                    </View>
                    <View style={styles.factorBarOuter}>
                      <View
                        style={[styles.factorBarInner, { width: `${pct == null ? 0 : Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* ========== PERSONAL EXPOSURE SCORE ========== */}
      <View style={styles.cardSection}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.exposureCard}
        >
          <View style={styles.exposureDecor1} />
          <View style={styles.exposureDecor2} />

          <View style={styles.exposureHeader}>
            <Ionicons name="person-circle-outline" size={24} color={Colors.white} />
            <Text style={styles.exposureTitle}>Personal Exposure Score</Text>
          </View>

          <View style={styles.exposureBody}>
            <View style={styles.exposureScoreWrap}>
              <Text style={styles.exposureScoreValue}>{exposure.score == null ? '--' : Math.round(Number(exposure.score))}</Text>
              <Text style={styles.exposureScoreUnit}>/100</Text>
            </View>

            <View style={styles.exposureDetails}>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="navigate-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>
                  {Number(exposure.monitoredZones || 0)} {Number(exposure.monitoredZones) === 1 ? 'zone' : 'zones'} monitored
                </Text>
              </View>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="notifications-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>
                  {Number(exposure.activeAlerts || 0)} active {Number(exposure.activeAlerts) === 1 ? 'alert' : 'alerts'}
                </Text>
              </View>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="analytics-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>{exposure.commutePattern || 'Not enough data'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.exposureBar}>
            <View style={styles.exposureBarTrack}>
              <View style={[styles.exposureBarFill, { width: `${Math.max(0, Math.min(100, Number(exposure.score || 0)))}%` }]} />
            </View>
            <View style={styles.exposureBarLabels}>
              <Text style={styles.exposureBarLabel}>Safe</Text>
              <Text style={styles.exposureBarLabel}>Moderate</Text>
              <Text style={styles.exposureBarLabel}>High</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ========== 48H FORECAST ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="cloudy-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>48h Risk Forecast</Text>
            </View>
          </View>

          {forecastPoints.length === 0 ? (
            <Text style={styles.emptyHint}>Forecast unavailable — no recent model outputs.</Text>
          ) : (
            <View style={styles.forecastGrid}>
              {forecastPoints.map((f, i) => {
                const value = Math.max(0, Math.min(100, Number(f.value || 0)));
                const color = getBarColor(value);
                const level = forecastLevel(value);
                return (
                  <View key={f.label || i} style={styles.forecastItem}>
                    <Text style={styles.forecastPeriod}>{f.label}</Text>
                    <View style={styles.forecastBarOuter}>
                      <View
                        style={[
                          styles.forecastBar,
                          { height: `${Math.max(4, value)}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                    <View style={[styles.forecastLevelBadge, { backgroundColor: color + '18' }]}>
                      <Text style={[styles.forecastLevelText, { color }]}>{value}%</Text>
                    </View>
                    <Text style={[styles.forecastLevelLabel, { color }]}>{level}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.forecastNote}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.subtext} />
            <Text style={styles.forecastNoteText}>
              {forecast.note || 'Forecast follows recent SIARA risk outputs across your watched context.'}
            </Text>
          </View>
        </View>
      </View>

      {/* ========== TOP RISK ROADS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="git-branch-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Top Risk Roads</Text>
            </View>
          </View>

          {roads.length === 0 ? (
            <Text style={styles.emptyHint}>No road-level predictions for your zones right now.</Text>
          ) : (
            roads.map((road, i) => {
              const score = Number(road.riskScore || 0);
              const scoreColor = getBarColor(score);
              const change = road.change;
              const trend = change == null ? 'stable' : change > 0 ? 'up' : change < 0 ? 'down' : 'stable';
              return (
                <View
                  key={road.roadSegmentId || i}
                  style={[styles.roadRow, i === roads.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={styles.roadRankBadge}>
                    <Text style={styles.roadRankText}>{road.rank || i + 1}</Text>
                  </View>
                  <View style={styles.roadInfo}>
                    <Text style={styles.roadName} numberOfLines={1}>{road.road}</Text>
                    <View style={styles.roadMeta}>
                      <Ionicons name="trending-up" size={12} color={Colors.greyLight} />
                      <Text style={styles.roadIncidents}>
                        {change == null ? 'New prediction' : `${change > 0 ? '+' : ''}${change} vs previous run`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.roadScoreBadge, { backgroundColor: scoreColor + '14' }]}>
                    <Text style={[styles.roadScoreText, { color: scoreColor }]}>{Math.round(score)}</Text>
                  </View>
                  <Ionicons
                    name={
                      trend === 'up' ? 'trending-up' :
                      trend === 'down' ? 'trending-down' :
                      'remove-outline'
                    }
                    size={18}
                    color={
                      trend === 'up' ? Colors.severityCritical :
                      trend === 'down' ? Colors.severityLow :
                      Colors.grey
                    }
                  />
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* ========== AI INSIGHT OF THE WEEK ========== */}
      {insightItems.length > 0 ? (
        <View style={styles.cardSection}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="sparkles-outline" size={18} color={Colors.primary} />
                <Text style={styles.cardTitle}>{aiInsight.title || 'AI Insight of the Week'}</Text>
              </View>
            </View>
            {insightItems.map((item, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={styles.insightDot} />
                <Text style={styles.insightText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ========== ACTIVE ALERTS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="warning-outline" size={18} color={Colors.severityHigh} />
              <Text style={styles.cardTitle}>Active Alerts</Text>
            </View>
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{alertItems.length}</Text>
            </View>
          </View>

          {alertItems.length === 0 ? (
            <Text style={styles.emptyHint}>No active alerts triggered for your watched zones.</Text>
          ) : (
            alertItems.map((alert, i) => {
              const alertColor = severityColor(alert.severity);
              return (
                <View
                  key={alert.id || i}
                  style={[
                    styles.alertRow,
                    i === alertItems.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={[styles.alertDot, { backgroundColor: alertColor }]} />
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
                    <Text style={styles.alertTime}>
                      {alert.area ? `${alert.area} · ` : ''}{alert.lastTrigger || 'Never'}
                    </Text>
                  </View>
                  <View style={[styles.alertSeverityBadge, { backgroundColor: alertColor + '14' }]}>
                    <Text style={[styles.alertSeverityText, { color: alertColor }]}>
                      {alert.severity}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingBottom: 0,
  },


  /* ---------- Header ---------- */
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 46,
    paddingBottom: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDecor2: {
    position: 'absolute',
    bottom: -10,
    left: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginBottom: 4,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    maxWidth: 260,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  quickStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* ---------- Cards ---------- */
  cardSection: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 18,
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  cardBadge: {
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardBadgeText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  cardHeaderValue: {
    fontSize: 16,
  },

  /* ---------- Risk Overview / Donut ---------- */
  donutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutOuter: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutTrack: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    position: 'absolute',
  },
  donutFillQuarter: {
    position: 'absolute',
    width: 50,
    height: 50,
  },
  donutQ1: { top: 0, right: 0 },
  donutQ2: { top: 0, left: 0 },
  donutQ3: { bottom: 0, left: 0 },
  donutQ4: { bottom: 0, right: 0 },
  donutInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  donutValue: {
    color: Colors.severityMedium,
    fontSize: 26,
    fontWeight: '900',
  },
  donutUnit: {
    color: Colors.greyLight,
    fontSize: 11,
    marginTop: 8,
  },
  donutInfo: {
    flex: 1,
  },
  riskLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  riskLevelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  donutDesc: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  donutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  donutMetaText: {
    color: Colors.subtext,
    fontSize: 11,
  },

  /* ---------- Volatility / Sparkline ---------- */
  sparklineWrap: {
    marginBottom: 12,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 4,
    marginBottom: 6,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 3,
    minHeight: 4,
  },
  sparkLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sparkLabel: {
    color: Colors.greyLight,
    fontSize: 10,
  },
  volatilityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.blueLight,
    padding: 10,
    borderRadius: 10,
  },
  volatilityNoteText: {
    color: Colors.subtext,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  /* ---------- Severity Pressure ---------- */
  pressureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  pressureLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 80,
  },
  pressureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pressureLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  pressureBarOuter: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pressureBarInner: {
    height: 8,
    borderRadius: 4,
  },
  pressurePct: {
    fontSize: 13,
    fontWeight: '800',
    width: 38,
    textAlign: 'right',
  },
  pressureTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  pressureTotalLabel: {
    color: Colors.subtext,
    fontSize: 12,
  },
  pressureTotalValue: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '800',
  },

  /* ---------- 24h Distribution ---------- */
  distChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    marginBottom: 12,
    paddingBottom: 22,
  },
  distBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  distBarOuter: {
    width: 24,
    height: 90,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  distBar: {
    width: '100%',
    borderRadius: 5,
    minHeight: 4,
  },
  distLabel: {
    color: Colors.subtext,
    fontSize: 9,
    marginTop: 6,
  },
  distPeakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.06)',
    padding: 10,
    borderRadius: 10,
  },
  distPeakText: {
    color: Colors.text,
    fontSize: 12,
    flex: 1,
  },

  /* ---------- Factors ---------- */
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  factorIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  factorContent: {
    flex: 1,
  },
  factorLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  factorLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  factorPct: {
    fontSize: 13,
    fontWeight: '800',
  },
  factorBarOuter: {
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorBarInner: {
    height: 6,
    borderRadius: 3,
  },

  /* ---------- Exposure Card ---------- */
  exposureCard: {
    borderRadius: 16,
    padding: 22,
    overflow: 'hidden',
  },
  exposureDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  exposureDecor2: {
    position: 'absolute',
    bottom: -15,
    left: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  exposureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  exposureTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  exposureBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 18,
  },
  exposureScoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  exposureScoreValue: {
    color: Colors.white,
    fontSize: 48,
    fontWeight: '900',
  },
  exposureScoreUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '600',
  },
  exposureDetails: {
    flex: 1,
    gap: 8,
  },
  exposureDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exposureDetailText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  exposureBar: {
    marginTop: 4,
  },
  exposureBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  exposureBarFill: {
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: 4,
  },
  exposureBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exposureBarLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },

  /* ---------- 48h Forecast ---------- */
  forecastGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  forecastItem: {
    alignItems: 'center',
    flex: 1,
  },
  forecastPeriod: {
    color: Colors.subtext,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  forecastBarOuter: {
    width: 32,
    height: 80,
    backgroundColor: Colors.bg,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  forecastBar: {
    width: '100%',
    borderRadius: 8,
    minHeight: 4,
  },
  forecastLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  forecastLevelText: {
    fontSize: 12,
    fontWeight: '800',
  },
  forecastLevelLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  forecastNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.blueLight,
    padding: 10,
    borderRadius: 10,
  },
  forecastNoteText: {
    color: Colors.subtext,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  /* ---------- Top Risk Roads ---------- */
  roadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  roadRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadRankText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  roadInfo: {
    flex: 1,
  },
  roadName: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 3,
  },
  roadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadWilaya: {
    color: Colors.subtext,
    fontSize: 11,
  },
  roadMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.greyLight,
  },
  roadIncidents: {
    color: Colors.subtext,
    fontSize: 11,
  },
  roadScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  roadScoreText: {
    fontSize: 14,
    fontWeight: '900',
  },

  /* ---------- Active Alerts ---------- */
  alertCountBadge: {
    backgroundColor: Colors.severityCritical,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCountText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
  },
  alertTime: {
    color: Colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  alertSeverityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  alertSeverityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 14,
  },
  viewAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  /* ---------- Shared empty hint ---------- */
  emptyHint: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    paddingVertical: 10,
    textAlign: 'center',
  },

  /* ---------- Distribution count label ---------- */
  distCount: {
    color: Colors.subtext,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },

  /* ---------- Most volatile zone row ---------- */
  volatileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  volatileText: {
    flex: 1,
    color: Colors.subtext,
    fontSize: 12,
  },
  volatileRisk: {
    fontSize: 14,
    fontWeight: '900',
  },

  /* ---------- AI Insight ---------- */
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  insightText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
