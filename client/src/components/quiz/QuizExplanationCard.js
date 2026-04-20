import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../ui/Card';
import { Colors } from '../../theme/colors';

const SECTION_LABELS = {
  summary: 'Summary',
  risk_factors: 'Main risk-increasing factors',
  protective_factors: 'Main protective factors',
  advice: 'Practical advice',
  disclaimer: 'Disclaimer',
};

const SECTION_ALIASES = {
  summary: ['short summary', 'summary'],
  risk_factors: [
    'main risk increasing factors',
    'main risk-increasing factors',
    'risk increasing factors',
    'risk factors',
  ],
  protective_factors: ['main protective factors', 'protective factors'],
  advice: ['practical advice', 'advice'],
  disclaimer: ['brief disclaimer', 'disclaimer'],
};

const EMPTY_SECTIONS = {
  summary: '',
  risk_factors: '',
  protective_factors: '',
  advice: '',
  disclaimer: '',
};

function cleanMarkdown(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function normalizeHeading(value) {
  const normalized = cleanMarkdown(value)
    .replace(/^#+\s*/, '')
    .replace(/^\s*[-+*]\s+/, '')
    .replace(/^\s*\d+[\).:-]\s*/, '')
    .replace(/[:.]\s*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return (
    Object.entries(SECTION_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => alias.replace(/[^a-z0-9]+/g, ' ').trim() === normalized),
    )?.[0] || null
  );
}

function parseExplanationText(text) {
  const sections = { ...EMPTY_SECTIONS };
  const buckets = Object.fromEntries(
    Object.keys(sections).map((key) => [key, []]),
  );
  let activeKey = null;

  cleanMarkdown(text)
    .split('\n')
    .forEach((rawLine) => {
      let line = rawLine.trim();
      if (!line) {
        return;
      }

      const heading = normalizeHeading(line);
      if (heading) {
        activeKey = heading;
        return;
      }

      const inlineMatch = line.match(/^(?:\d+[\).:-]\s*)?([A-Za-z][A-Za-z\-\s]+?)[:\-]\s+(.+)$/);
      if (inlineMatch) {
        const inlineHeading = normalizeHeading(inlineMatch[1]);
        if (inlineHeading) {
          activeKey = inlineHeading;
          line = inlineMatch[2].trim();
        }
      }

      if (activeKey) {
        buckets[activeKey].push(line.replace(/^\s*[-+*]\s+/, '').trim());
      }
    });

  Object.entries(buckets).forEach(([key, value]) => {
    sections[key] = value.join('\n').trim();
  });

  return sections;
}

function normalizeStructured(structured, text) {
  const parsed = parseExplanationText(text);
  const result = { ...EMPTY_SECTIONS, ...parsed };

  if (structured && typeof structured === 'object') {
    Object.keys(result).forEach((key) => {
      const value = structured[key];
      if (Array.isArray(value)) {
        result[key] = value.map((item) => cleanMarkdown(item)).filter(Boolean).join('\n');
      } else if (value != null && String(value).trim()) {
        result[key] = cleanMarkdown(value);
      }
    });
  }

  return result;
}

function removeLeadIn(text) {
  return cleanMarkdown(text)
    .replace(/^the strongest risk-increasing signals are:\s*/i, '')
    .replace(/^the strongest protective signals are:\s*/i, '')
    .replace(/^use this result as a prompt to practice safer habits:\s*/i, '');
}

function toItems(text) {
  const cleaned = removeLeadIn(text);
  if (!cleaned) {
    return [];
  }

  const lineItems = cleaned
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-+*]|\d+[\).])\s+/, '').trim())
    .filter(Boolean);

  if (lineItems.length > 1) {
    return lineItems;
  }

  return cleaned
    .replace(/;\s+/g, '\n')
    .replace(/\.\s+(?=[A-Z])/g, '.\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toParagraphs(text) {
  return cleanMarkdown(text)
    .split(/\n{1,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function formatRiskPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(2)}%` : null;
}

function getStatusText(isStreaming, status) {
  if (isStreaming) {
    return cleanMarkdown(status) || 'Generating explanation...';
  }
  return cleanMarkdown(status) || 'Explanation ready.';
}

function BulletList({ items, emptyText, bulletColor }) {
  if (!items.length) {
    return <Text style={styles.emptyText}>{emptyText}</Text>;
  }

  return items.map((item, index) => (
    <View key={`${item}-${index}`} style={styles.bulletRow}>
      <View style={[styles.bullet, { backgroundColor: bulletColor }]} />
      <Text style={styles.bulletText}>{item}</Text>
    </View>
  ));
}

function AssistantSection({ title, toneStyle, children }) {
  return (
    <View style={[styles.sectionCard, toneStyle]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export default function QuizExplanationCard({
  explanationText,
  structuredExplanation,
  isStreaming = false,
  status,
  fallback,
  riskLabel,
  riskPercent,
  riskTone,
  deterministicAdvice,
}) {
  const sections = useMemo(
    () => normalizeStructured(structuredExplanation, explanationText),
    [structuredExplanation, explanationText],
  );

  const summaryParagraphs = toParagraphs(sections.summary || explanationText);
  const riskItems = toItems(sections.risk_factors);
  const protectiveItems = toItems(sections.protective_factors);
  const adviceItems = toItems(sections.advice || deterministicAdvice);
  const disclaimerParagraphs = toParagraphs(sections.disclaimer);
  const hasContent = Boolean(
    explanationText
    || summaryParagraphs.length
    || riskItems.length
    || protectiveItems.length
    || adviceItems.length
    || disclaimerParagraphs.length
  );

  const riskBadgeText = [riskLabel, formatRiskPercent(riskPercent)].filter(Boolean).join('  ');
  const headerToneColor = riskTone?.color || Colors.primary;
  const headerToneSoft = riskTone?.soft || Colors.violetLight;

  return (
    <Card style={styles.card}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isStreaming ? Colors.secondary : Colors.accent },
            ]}
          />
          <Text style={styles.statusText}>{getStatusText(isStreaming, status)}</Text>
        </View>

        {fallback ? (
          <View style={styles.fallbackPill}>
            <Ionicons name="sparkles-outline" size={12} color={Colors.severityHigh} />
            <Text style={styles.fallbackPillText}>Fallback</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SIARA assistant explanation</Text>
          <Text style={styles.title}>Driving profile result</Text>
        </View>

        {riskBadgeText ? (
          <View
            style={[
              styles.riskBadge,
              {
                backgroundColor: headerToneSoft,
                borderColor: headerToneColor,
              },
            ]}
          >
            <Text style={[styles.riskBadgeText, { color: headerToneColor }]}>
              {riskBadgeText}
            </Text>
          </View>
        ) : null}
      </View>

      {!hasContent ? (
        <View style={styles.loadingWrap}>
          <View style={styles.loadingDot} />
          <View style={styles.loadingDot} />
          <View style={styles.loadingDot} />
        </View>
      ) : (
        <View style={styles.sections}>
          <AssistantSection title={SECTION_LABELS.summary} toneStyle={styles.summarySection}>
            {summaryParagraphs.length ? (
              summaryParagraphs.map((paragraph, index) => (
                <Text key={`summary-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))
            ) : (
              <Text style={styles.emptyText}>Waiting for the summary...</Text>
            )}
          </AssistantSection>

          <View style={styles.twoColumnStack}>
            <AssistantSection title={SECTION_LABELS.risk_factors} toneStyle={styles.riskSection}>
              <BulletList
                items={riskItems}
                bulletColor={Colors.severityCritical}
                emptyText="Risk-increasing factors will appear here as the explanation streams."
              />
            </AssistantSection>

            <AssistantSection
              title={SECTION_LABELS.protective_factors}
              toneStyle={styles.protectiveSection}
            >
              <BulletList
                items={protectiveItems}
                bulletColor={Colors.severityLow}
                emptyText="Protective factors will appear here as the explanation streams."
              />
            </AssistantSection>
          </View>

          <AssistantSection title={SECTION_LABELS.advice} toneStyle={styles.adviceSection}>
            <BulletList
              items={adviceItems}
              bulletColor={Colors.secondary}
              emptyText="Practical advice will appear here as the explanation streams."
            />
          </AssistantSection>

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>{SECTION_LABELS.disclaimer}</Text>
            {(disclaimerParagraphs.length
              ? disclaimerParagraphs
              : ['This explanation is for driving-safety education and does not change the computed score.']
            ).map((paragraph, index) => (
              <Text key={`disclaimer-${index}`} style={styles.disclaimerText}>
                {paragraph}
              </Text>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: Colors.violetBorder,
    backgroundColor: Colors.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusText: {
    flex: 1,
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '700',
  },
  fallbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  fallbackPillText: {
    color: Colors.severityHigh,
    fontSize: 12,
    fontWeight: '800',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  title: {
    color: Colors.heading,
    fontSize: 22,
    fontWeight: '900',
  },
  riskBadge: {
    maxWidth: 150,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.violetBorder,
  },
  sections: {
    gap: 14,
  },
  twoColumnStack: {
    gap: 14,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  summarySection: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.violetBorder,
  },
  riskSection: {
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderColor: 'rgba(239,68,68,0.16)',
  },
  protectiveSection: {
    backgroundColor: 'rgba(34,197,94,0.06)',
    borderColor: 'rgba(34,197,94,0.18)',
  },
  adviceSection: {
    backgroundColor: 'rgba(29,78,216,0.06)',
    borderColor: Colors.blueBorder,
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  sectionContent: {
    gap: 10,
  },
  paragraph: {
    color: Colors.textDark,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    color: Colors.textDark,
    fontSize: 14,
    lineHeight: 21,
  },
  disclaimerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    padding: 16,
    gap: 8,
  },
  disclaimerTitle: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  disclaimerText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
});
