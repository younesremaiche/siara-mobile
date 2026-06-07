import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';

/**
 * DateTimeField — dependency-free date + time picker.
 *
 * Renders a tappable field; opening it shows a bottom sheet with a month/year
 * calendar (tap the title to pick a year, arrows to change month) and a time
 * selector where the user types the exact hour/minute or nudges them with
 * ▲/▼ steppers. Emits an ISO 8601 string via onChange so the backend
 * `occurredAt` contract is unchanged. Future dates are disabled because an
 * incident can only have occurred in the past / now.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (n) => String(n).padStart(2, '0');

function formatDisplay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export default function DateTimeField({ label, value, onChange, error }) {
  const [open, setOpen] = React.useState(false);
  const [pickingYear, setPickingYear] = React.useState(false);

  // Working selection (only committed to onChange on Confirm).
  const [viewYear, setViewYear] = React.useState(0);
  const [viewMonth, setViewMonth] = React.useState(0);
  const [sel, setSel] = React.useState(null); // { y, m, d, h, min }

  const openSheet = () => {
    const base = value && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : new Date();
    setSel({ y: base.getFullYear(), m: base.getMonth(), d: base.getDate(), h: base.getHours(), min: base.getMinutes() });
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setPickingYear(false);
    setOpen(true);
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 90 }, (_, i) => currentYear - i); // last 90 years

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const goMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  // Can't navigate to a month later than the current month.
  const canGoNextMonth = new Date(viewYear, viewMonth, 1) < new Date(currentYear, now.getMonth(), 1);

  const selectDay = (day) => {
    if (day == null) return;
    if (startOfDay(new Date(viewYear, viewMonth, day)) > todayStart) return; // future disabled
    setSel((s) => ({ ...s, y: viewYear, m: viewMonth, d: day }));
  };

  // ── Time editing (type or step) ──
  const onHourText = (t) => {
    const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
    let n = digits === '' ? 0 : parseInt(digits, 10);
    if (n > 23) n = 23;
    setSel((s) => ({ ...s, h: n }));
  };
  const onMinuteText = (t) => {
    const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
    let n = digits === '' ? 0 : parseInt(digits, 10);
    if (n > 59) n = 59;
    setSel((s) => ({ ...s, min: n }));
  };
  const stepHour = (d) => setSel((s) => ({ ...s, h: (s.h + d + 24) % 24 }));
  const stepMinute = (d) => setSel((s) => ({ ...s, min: (s.min + d + 60) % 60 }));

  const confirm = () => {
    if (!sel) { setOpen(false); return; }
    let chosen = new Date(sel.y, sel.m, sel.d, sel.h, sel.min, 0, 0);
    if (chosen.getTime() > Date.now()) chosen = new Date(); // clamp accidental future
    onChange(chosen.toISOString());
    setOpen(false);
  };

  const clear = () => { onChange(''); setOpen(false); };

  const setNow = () => {
    onChange(new Date().toISOString());
    setOpen(false);
  };

  const display = formatDisplay(value);

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[styles.field, error && styles.fieldError]}
        onPress={openSheet}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
        <Text style={[styles.fieldText, !display && styles.fieldPlaceholder]} numberOfLines={1}>
          {display || 'Tap to pick date & time'}
        </Text>
        {display ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={Colors.greyLight} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={18} color={Colors.subtext} />
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayTap} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select date & time</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Colors.heading} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Calendar header */}
              <View style={styles.calHeader}>
                <TouchableOpacity onPress={() => goMonth(-1)} style={styles.navBtn} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={18} color={Colors.heading} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPickingYear((p) => !p)} activeOpacity={0.7} style={styles.monthLabelBtn}>
                  <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
                  <Ionicons name={pickingYear ? 'chevron-up' : 'chevron-down'} size={15} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => goMonth(1)}
                  style={[styles.navBtn, !canGoNextMonth && styles.navBtnDisabled]}
                  disabled={!canGoNextMonth}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-forward" size={18} color={canGoNextMonth ? Colors.heading : Colors.greyLight} />
                </TouchableOpacity>
              </View>

              {pickingYear ? (
                <View style={styles.yearGrid}>
                  {years.map((yr) => {
                    const active = sel?.y === yr;
                    return (
                      <TouchableOpacity
                        key={yr}
                        style={styles.yearCell}
                        onPress={() => { setViewYear(yr); setPickingYear(false); }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.yearText, active && styles.yearTextActive]}>{yr}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <>
                  {/* Weekdays */}
                  <View style={styles.weekRow}>
                    {WEEKDAYS.map((w, i) => (
                      <Text key={`${w}-${i}`} style={styles.weekday}>{w}</Text>
                    ))}
                  </View>
                  {/* Days */}
                  <View style={styles.daysGrid}>
                    {cells.map((day, idx) => {
                      if (day == null) return <View key={`b-${idx}`} style={styles.dayCell} />;
                      const dDate = new Date(viewYear, viewMonth, day);
                      const isFuture = startOfDay(dDate) > todayStart;
                      const isToday = startOfDay(dDate) === todayStart;
                      const isSel = sel && sel.y === viewYear && sel.m === viewMonth && sel.d === day;
                      return (
                        <TouchableOpacity
                          key={`d-${day}`}
                          style={styles.dayCell}
                          onPress={() => selectDay(day)}
                          disabled={isFuture}
                          activeOpacity={0.7}
                        >
                          <View style={[
                            styles.dayInner,
                            isToday && styles.dayToday,
                            isSel && styles.daySelected,
                          ]}>
                            <Text style={[
                              styles.dayText,
                              isFuture && styles.dayTextDisabled,
                              isSel && styles.dayTextSelected,
                            ]}>
                              {day}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Time — type the exact value or use the steppers */}
              <View style={styles.timeBlock}>
                <View style={styles.timeHeaderRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.primary} />
                  <Text style={styles.timeLabel}>Time</Text>
                  <Text style={styles.timeHint}>24-hour</Text>
                </View>

                <View style={styles.timeStepperRow}>
                  {/* Hour */}
                  <View style={styles.stepperCol}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => stepHour(1)} activeOpacity={0.7}>
                      <Ionicons name="chevron-up" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.timeInput}
                      value={sel ? pad2(sel.h) : '00'}
                      onChangeText={onHourText}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      textAlign="center"
                    />
                    <TouchableOpacity style={styles.stepBtn} onPress={() => stepHour(-1)} activeOpacity={0.7}>
                      <Ionicons name="chevron-down" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.stepperCaption}>Hour</Text>
                  </View>

                  <Text style={styles.timeColon}>:</Text>

                  {/* Minute */}
                  <View style={styles.stepperCol}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => stepMinute(1)} activeOpacity={0.7}>
                      <Ionicons name="chevron-up" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.timeInput}
                      value={sel ? pad2(sel.min) : '00'}
                      onChangeText={onMinuteText}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      textAlign="center"
                    />
                    <TouchableOpacity style={styles.stepBtn} onPress={() => stepMinute(-1)} activeOpacity={0.7}>
                      <Ionicons name="chevron-down" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.stepperCaption}>Minute</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Footer actions */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.ghostBtn} onPress={clear} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={setNow} activeOpacity={0.8}>
                <Text style={styles.ghostBtnText}>Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirm} activeOpacity={0.85}>
                <Ionicons name="checkmark" size={16} color={Colors.white} />
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.heading, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, height: 48,
  },
  fieldError: { borderColor: Colors.error },
  fieldText: { flex: 1, color: Colors.heading, fontSize: 14, fontWeight: '600' },
  fieldPlaceholder: { color: Colors.subtext, fontWeight: '400' },
  errorText: { color: Colors.error, fontSize: 12, marginTop: 6 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: Colors.heading, fontSize: 16, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },

  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.4 },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthLabel: { color: Colors.heading, fontSize: 15, fontWeight: '800' },

  weekRow: { flexDirection: 'row', marginTop: 6, marginBottom: 2 },
  weekday: { flex: 1, textAlign: 'center', color: Colors.subtext, fontSize: 11, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: Colors.violetBorder },
  daySelected: { backgroundColor: Colors.primary },
  dayText: { color: Colors.heading, fontSize: 14, fontWeight: '600' },
  dayTextDisabled: { color: Colors.greyLight },
  dayTextSelected: { color: Colors.white, fontWeight: '800' },

  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
  yearCell: { width: `${100 / 4}%`, paddingVertical: 12, alignItems: 'center' },
  yearText: { color: Colors.heading, fontSize: 15, fontWeight: '700' },
  yearTextActive: { color: Colors.primary, fontWeight: '900' },

  timeBlock: { marginTop: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 12 },
  timeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeLabel: { flex: 1, color: Colors.heading, fontSize: 14, fontWeight: '800' },
  timeHint: { color: Colors.subtext, fontSize: 11, fontWeight: '700' },

  timeStepperRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 14, marginTop: 12 },
  stepperCol: { alignItems: 'center' },
  stepBtn: {
    width: 64, height: 32, borderRadius: 10,
    backgroundColor: Colors.violetLight, borderWidth: 1, borderColor: Colors.violetBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  timeInput: {
    width: 64, height: 56, marginVertical: 6,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.bg,
    color: Colors.heading, fontSize: 26, fontWeight: '900',
  },
  stepperCaption: { color: Colors.subtext, fontSize: 11, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  timeColon: { color: Colors.heading, fontSize: 28, fontWeight: '900', marginTop: 44 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  ghostBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  ghostBtnText: { color: Colors.heading, fontSize: 13, fontWeight: '700' },
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary,
  },
  confirmBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
});
