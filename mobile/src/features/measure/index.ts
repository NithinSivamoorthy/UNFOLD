import { createElement, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Calibration, MeasurementPanelProps } from '../../integrations/types';
import { C, R } from '../../ui/theme';

type Axis = 'x' | 'y' | 'z';

const AXES: { key: Axis; label: string; dimension: string }[] = [
  { key: 'x', label: 'Width', dimension: 'X' },
  { key: 'y', label: 'Height', dimension: 'Y' },
  { key: 'z', label: 'Depth', dimension: 'Z' },
];

/** Calibrates GLB model-unit extents against one dimension the user knows. */
export function MeasurementPanel({ model, calibration, onCalibrated }: MeasurementPanelProps) {
  const [axis, setAxis] = useState<Axis>('x');
  const [knownCm, setKnownCm] = useState('');
  const [message, setMessage] = useState('');
  const extents = model.modelExtents;
  const hasExtents = !!extents && [extents.x, extents.y, extents.z].every((v) => Number.isFinite(v) && v >= 0) &&
    [extents?.x, extents?.y, extents?.z].some((v) => Number.isFinite(v) && v > 0);
  const calibrationMethod = calibration?.method;
  const estimatedDimensions = useMemo(() => {
    if (!hasExtents || !calibration || !Number.isFinite(calibration.cmPerModelUnit) || calibration.cmPerModelUnit <= 0) return null;
    return {
      x: extents.x * calibration.cmPerModelUnit,
      y: extents.y * calibration.cmPerModelUnit,
      z: extents.z * calibration.cmPerModelUnit,
    };
  }, [calibration, extents, hasExtents]);

  function calibrate() {
    const realDimension = Number(knownCm);
    const modelDimension = extents?.[axis];
    if (!hasExtents || !modelDimension || modelDimension <= 0 || !Number.isFinite(realDimension) || realDimension <= 0) {
      setMessage('Enter a real-world length greater than 0 cm.');
      return;
    }
    const next: Calibration = {
      cmPerModelUnit: realDimension / modelDimension,
      method: `Known length: ${format(realDimension)} cm along ${axis.toUpperCase()}`,
    };
    onCalibrated(next);
    setMessage('Calibration saved. All estimates use this uniform scale.');
  }

  const dimensionCards = AXES.map(({ key, label, dimension }) =>
    createElement(
      View,
      { key, style: styles.dimensionCard },
      createElement(Text, { style: styles.dimensionLabel }, `${label} · ${dimension}`),
      createElement(Text, { style: styles.rawValue }, hasExtents ? `${format(extents[key])} model units` : 'Unavailable'),
      createElement(Text, { style: styles.estimateLabel }, 'Calibrated estimate'),
      createElement(Text, { style: [styles.estimateValue, !estimatedDimensions && styles.dimmed] },
        estimatedDimensions ? `${formatCm(estimatedDimensions[key])} cm` : 'Not calibrated')
    )
  );

  const axisButtons = AXES.map(({ key, label }) =>
    createElement(
      Pressable,
      {
        key,
        accessibilityRole: 'button',
        accessibilityState: { selected: axis === key },
        onPress: () => { setAxis(key); setMessage(''); },
        style: [styles.axisButton, axis === key && styles.axisButtonActive],
      },
      createElement(Text, { style: [styles.axisButtonText, axis === key && styles.axisButtonTextActive] }, label)
    )
  );

  return createElement(
    ScrollView,
    { style: styles.root, contentContainerStyle: styles.content, keyboardShouldPersistTaps: 'handled' },
    createElement(Text, { style: styles.eyebrow }, 'MEASUREMENTS'),
    createElement(Text, { style: styles.title }, model.name),
    createElement(Text, { style: styles.intro }, 'Use one known real-world dimension to estimate the model’s width, height, and depth.'),
    hasExtents
      ? createElement(View, { style: styles.grid }, dimensionCards)
      : createElement(
          View,
          { style: styles.notice },
          createElement(Text, { style: styles.noticeTitle }, 'Model dimensions are not available yet'),
          createElement(Text, { style: styles.noticeBody }, 'Open the model in the 3D viewer first so it can report its bounding-box extents. No centimetre estimates will be shown until the model is calibrated.')
        ),
    createElement(
      View,
      { style: styles.form },
      createElement(Text, { style: styles.formTitle }, 'Calibrate with a known length'),
      createElement(Text, { style: styles.formHint }, 'Measure the model along one axis, then enter that real length in centimetres.'),
      createElement(Text, { style: styles.fieldLabel }, 'Axis of known length'),
      createElement(View, { style: styles.axisRow }, axisButtons),
      createElement(Text, { style: styles.fieldLabel }, 'Real-world length'),
      createElement(
        View,
        { style: styles.inputRow },
        createElement(TextInput, {
          value: knownCm,
          onChangeText: (value) => { setKnownCm(value.replace(',', '.')); setMessage(''); },
          keyboardType: 'decimal-pad',
          placeholder: 'e.g. 15',
          placeholderTextColor: C.textTertiary,
          accessibilityLabel: 'Known real-world dimension in centimetres',
          style: styles.input,
          editable: hasExtents,
        }),
        createElement(Text, { style: styles.unit }, 'cm')
      ),
      createElement(
        Pressable,
        {
          accessibilityRole: 'button',
          accessibilityState: { disabled: !hasExtents },
          disabled: !hasExtents,
          onPress: calibrate,
          style: [styles.calibrateButton, !hasExtents && styles.disabledButton],
        },
        createElement(Text, { style: styles.calibrateText }, 'Apply calibration')
      ),
      message ? createElement(Text, { style: styles.message }, message) : null,
      calibrationMethod ? createElement(Text, { style: styles.method }, `Current calibration: ${calibrationMethod}`) : null
    )
  );
}

function format(value: number) {
  return Number(value.toPrecision(5)).toString();
}

function formatCm(value: number) {
  return Number(value.toFixed(2)).toString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 32, gap: 12 },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: C.text, fontSize: 26, fontWeight: '700' },
  intro: { color: C.textSecondary, fontSize: 15, lineHeight: 21, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dimensionCard: { flexGrow: 1, flexBasis: '30%', minWidth: 135, padding: 14, borderRadius: R.md, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong },
  dimensionLabel: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  rawValue: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 9 },
  estimateLabel: { color: C.textTertiary, fontSize: 11, marginTop: 13 },
  estimateValue: { color: C.accent, fontSize: 20, fontWeight: '700', marginTop: 3 },
  dimmed: { color: C.textTertiary, fontSize: 14 },
  notice: { padding: 16, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.hairlineStrong, gap: 7 },
  noticeTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  noticeBody: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  form: { padding: 16, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineStrong, gap: 11, marginTop: 2 },
  formTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  formHint: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  fieldLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  axisRow: { flexDirection: 'row', gap: 8 },
  axisButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: R.pill, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.elevated },
  axisButtonActive: { borderColor: C.accent, backgroundColor: C.accentGlow },
  axisButtonText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  axisButtonTextActive: { color: C.accent },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: R.md, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.elevated, paddingHorizontal: 13 },
  input: { flex: 1, minHeight: 48, color: C.text, fontSize: 16 },
  unit: { color: C.textSecondary, fontSize: 14, marginLeft: 10 },
  calibrateButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: R.pill, backgroundColor: C.accent, marginTop: 3 },
  disabledButton: { opacity: 0.4 },
  calibrateText: { color: '#04201C', fontSize: 15, fontWeight: '700' },
  message: { color: C.accent, fontSize: 13, lineHeight: 18 },
  method: { color: C.textTertiary, fontSize: 12, lineHeight: 17 },
});
