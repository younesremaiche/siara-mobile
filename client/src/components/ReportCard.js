import React, { useState } from 'react';
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import {
  addReportReaction,
  formatDateTime,
  removeReportReaction,
} from '../services/reportsService';
import PhotoViewer from './ui/PhotoViewer';
import CommentsSheet from './CommentsSheet';

function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 >= 100 ? 1 : 0)}k`;
  return String(v);
}

function severityMeta(severity) {
  if (severity === 'critical') {
    return { color: Colors.severityCritical, label: 'Critical', icon: 'flame' };
  }
  if (severity === 'high') {
    return { color: Colors.severityHigh, label: 'High', icon: 'warning' };
  }
  if (severity === 'medium') {
    return { color: Colors.severityMedium, label: 'Medium', icon: 'alert-circle' };
  }
  return { color: Colors.severityLow, label: 'Low', icon: 'shield-checkmark' };
}

function statusLabel(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function ReportCard({ report, onPress }) {
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex]     = useState(0);
  const [commentsOpen, setCommentsOpen]   = useState(false);

  // Optimistic social state seeded from the report; the feed refetch on focus
  // reconciles with server truth, so we keep these local for instant feedback.
  const [liked, setLiked]         = useState(Boolean(report?.viewerHasLiked));
  const [sawIt, setSawIt]         = useState(Boolean(report?.viewerSawItToo));
  const [likeCount, setLikeCount] = useState(Number(report?.likesCount) || 0);
  const [sawCount, setSawCount]   = useState(Number(report?.sawItTooCount) || 0);
  const [commentCount, setCommentCount] = useState(Number(report?.commentsCount) || 0);
  const [reactBusy, setReactBusy] = useState(false);

  const reportId = report?.id;

  async function toggleReaction(kind) {
    if (!reportId || reactBusy) return;
    const isLike = kind === 'like';
    const wasActive = isLike ? liked : sawIt;
    const setActive = isLike ? setLiked : setSawIt;
    const setCount  = isLike ? setLikeCount : setSawCount;

    // optimistic
    setActive(!wasActive);
    setCount((c) => Math.max(0, c + (wasActive ? -1 : 1)));
    setReactBusy(true);
    try {
      const res = wasActive
        ? await removeReportReaction(reportId, isLike ? 'like' : 'saw_it_too')
        : await addReportReaction(reportId, isLike ? 'like' : 'saw_it_too');
      // sync exact counts from server response
      if (res?.likesCount != null) setLikeCount(Number(res.likesCount));
      if (res?.sawItTooCount != null) setSawCount(Number(res.sawItTooCount));
    } catch (e) {
      // revert on failure
      setActive(wasActive);
      setCount((c) => Math.max(0, c + (wasActive ? 1 : -1)));
    } finally {
      setReactBusy(false);
    }
  }

  async function handleShare() {
    if (!report) return;
    try {
      const where = report.locationLabel ? ` at ${report.locationLabel}` : '';
      await Share.share({
        message: `SIARA report: ${report.title || 'Incident'} — ${String(report.severity || 'low').toUpperCase()} severity${where}.`,
      });
    } catch {}
  }

  const severity = severityMeta(report?.severity);
  const occurredAt = report?.occurredAt || report?.createdAt;
  const previewMedia = Array.isArray(report?.media) ? report.media.slice(0, 3) : [];
  const allMedia     = Array.isArray(report?.media) ? report.media.filter((m) => m?.url) : [];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>{report?.title || 'Untitled report'}</Text>
          <Text style={styles.metaText}>
            {report?.reportedBy?.name || 'Citizen'} · {report?.relativeTime || 'Unknown time'}
          </Text>
        </View>
        <View style={[styles.severityPill, { backgroundColor: `${severity.color}16` }]}>
          <Ionicons name={severity.icon} size={12} color={severity.color} />
          <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>

      {report?.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {report.description}
        </Text>
      ) : null}

      <View style={styles.metaList}>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={Colors.subtext} />
          <Text style={styles.metaValue} numberOfLines={1}>
            {report?.locationLabel || 'Location unavailable'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={Colors.subtext} />
          <Text style={styles.metaValue}>{formatDateTime(occurredAt)}</Text>
        </View>
      </View>

      {previewMedia.length > 0 ? (
        <View style={styles.mediaRow}>
          {previewMedia.map((mediaItem, index) => (
            <TouchableOpacity
              key={mediaItem.id || `${report?.id}-media-${index}`}
              activeOpacity={0.85}
              onPress={() => { setViewerIndex(index); setViewerVisible(true); }}
            >
              <Image source={{ uri: mediaItem.url }} style={styles.mediaThumb} />
              <View style={styles.mediaOverlay}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{statusLabel(report?.status)}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{report?.incidentType || 'other'}</Text>
          </View>
          {report?.distanceKm != null ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{report.distanceKm} km</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Social action bar — like / saw it / comment / share */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.action}
          activeOpacity={0.7}
          onPress={() => toggleReaction('like')}
          disabled={reactBusy}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? Colors.error : Colors.subtext} />
          <Text style={[styles.actionText, liked && { color: Colors.error }]}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          activeOpacity={0.7}
          onPress={() => toggleReaction('saw')}
          disabled={reactBusy}
        >
          <Ionicons name={sawIt ? 'eye' : 'eye-outline'} size={19} color={sawIt ? Colors.secondary : Colors.subtext} />
          <Text style={[styles.actionText, sawIt && { color: Colors.secondary }]}>{formatCount(sawCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} activeOpacity={0.7} onPress={() => setCommentsOpen(true)}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.subtext} />
          <Text style={styles.actionText}>{formatCount(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} activeOpacity={0.7} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color={Colors.subtext} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>

      <PhotoViewer
        visible={viewerVisible}
        images={allMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
      <CommentsSheet
        visible={commentsOpen}
        reportId={reportId}
        onClose={() => setCommentsOpen(false)}
        onCountChange={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  metaText: {
    color: Colors.subtext,
    fontSize: 12,
  },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  metaList: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaValue: {
    flex: 1,
    marginLeft: 8,
    color: Colors.subtext,
    fontSize: 12,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  mediaOverlay: {
    position: 'absolute',
    bottom: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  footerRow: {
    gap: 8,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  actionText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
