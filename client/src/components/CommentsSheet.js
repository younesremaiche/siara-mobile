import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { AuthContext } from '../contexts/AuthContext';
import {
  addReportComment,
  deleteReportComment,
  listReportComments,
} from '../services/reportsService';

function initials(name) {
  return String(name || 'C')
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Bottom-sheet comment thread for a report.
 * Loads on open, supports posting and deleting your own comments, and reports
 * the live count back to the parent card via onCountChange.
 */
export default function CommentsSheet({ visible, reportId, onClose, onCountChange }) {
  const { user } = useContext(AuthContext);
  const currentUserId = user?.id ?? user?.userId ?? null;

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError('');
    try {
      const res = await listReportComments(reportId, { limit: 50 });
      setComments(res.comments);
    } catch (e) {
      setError(e.message || 'Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (visible) {
      setDraft('');
      load();
    }
  }, [visible, load]);

  async function post() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const created = await addReportComment(reportId, body);
      if (created) {
        setComments((prev) => [created, ...prev]);
        onCountChange?.(1);
        setDraft('');
      }
    } catch (e) {
      setError(e.message || 'Could not post comment.');
    } finally {
      setPosting(false);
    }
  }

  async function remove(comment) {
    const prev = comments;
    setComments((list) => list.filter((c) => c.id !== comment.id)); // optimistic
    onCountChange?.(-1);
    try {
      await deleteReportComment(reportId, comment.id);
    } catch (e) {
      setComments(prev); // revert
      onCountChange?.(1);
      setError(e.message || 'Could not delete comment.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.overlay}
      >
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Comments</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={Colors.heading} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={comments.length === 0 ? s.emptyWrap : s.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={(
                <View style={s.center}>
                  <Ionicons name="chatbubbles-outline" size={32} color={Colors.greyLight} />
                  <Text style={s.emptyText}>No comments yet. Be the first.</Text>
                </View>
              )}
              renderItem={({ item }) => {
                const mine = currentUserId && String(item.author?.id) === String(currentUserId);
                return (
                  <View style={s.row}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{initials(item.author?.name)}</Text>
                    </View>
                    <View style={s.bubble}>
                      <View style={s.bubbleHead}>
                        <Text style={s.author} numberOfLines={1}>{item.author?.name || 'Citizen'}</Text>
                        {mine ? <Text style={s.youTag}>You</Text> : null}
                        <Text style={s.time}>{item.relativeTime}</Text>
                      </View>
                      <Text style={s.body}>{item.body}</Text>
                    </View>
                    {mine ? (
                      <TouchableOpacity style={s.delBtn} onPress={() => remove(item)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={15} color={Colors.error} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              }}
            />
          )}

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.composer}>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColor={Colors.greyLight}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!draft.trim() || posting) && s.sendBtnOff]}
              onPress={post}
              disabled={!draft.trim() || posting}
              activeOpacity={0.85}
            >
              {posting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="send" size={17} color={draft.trim() ? Colors.white : Colors.greyLight} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '55%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginTop: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '800', color: Colors.heading },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: Colors.subtext, fontSize: 13 },
  listContent: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.violetLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  bubble: { flex: 1, backgroundColor: Colors.bg, borderRadius: 14, padding: 11, gap: 4 },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  author: { color: Colors.heading, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  youTag: {
    fontSize: 9, fontWeight: '800', color: Colors.primary,
    backgroundColor: Colors.violetLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  time: { color: Colors.greyLight, fontSize: 11, marginLeft: 'auto' },
  body: { color: Colors.text, fontSize: 13, lineHeight: 19 },
  delBtn: { padding: 4, marginTop: 4 },
  error: { color: Colors.error, fontSize: 12, paddingHorizontal: 18, paddingBottom: 6 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, maxHeight: 110, minHeight: 44,
    backgroundColor: Colors.bg, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11,
    color: Colors.heading, fontSize: 14,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
});
