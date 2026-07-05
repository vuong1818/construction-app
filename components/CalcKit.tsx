// Shared UI primitives for the Smart Tools calculators (electrical, and reusable
// by other trades). Extracted from smart-tools/electrical.tsx so every calculator
// — existing and new — renders with one consistent look.

import { MaterialCommunityIcons } from '@expo/vector-icons'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../lib/i18n'
import { COLORS } from '../lib/theme'

export const inp = {
  backgroundColor: COLORS.inputBg,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  color: COLORS.text,
  marginBottom: 12,
}

export const lbl = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: COLORS.navy,
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
}

export function CalcModal({ visible, title, subtitle, onClose, children }: {
  visible: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 14,
          backgroundColor: COLORS.navy, borderBottomWidth: 1, borderBottomColor: '#0a2550',
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            {subtitle ? <Text style={{ color: '#9DD8E8', fontSize: 12, marginTop: 1 }}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="close" size={22} color={COLORS.white} />
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

export function ResultCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: color ? color + '18' : COLORS.greenSoft,
      borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: color ? color + '40' : '#86EFAC',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: color || COLORS.navy, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 12, color: COLORS.subtext, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  )
}

export function SelectRow({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={lbl}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {options.map(opt => (
            <Pressable key={opt} onPress={() => onChange(opt)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: value === opt ? COLORS.navy : COLORS.card,
                borderWidth: 1, borderColor: value === opt ? COLORS.navy : COLORS.border,
              }}>
              <Text style={{ color: value === opt ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** Horizontal chip picker with smaller chips — for long size lists. */
export function ChipPicker({ label, options, value, onChange }: {
  label?: string; options: string[]; value: string; onChange: (v: string) => void
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={lbl}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {options.map(s => (
            <Pressable key={s} onPress={() => onChange(s)} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
              backgroundColor: value === s ? COLORS.navy : COLORS.card,
              borderWidth: 1, borderColor: value === s ? COLORS.navy : COLORS.border,
            }}>
              <Text style={{ color: value === s ? COLORS.white : COLORS.text, fontWeight: '700', fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

export function NumberField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <>
      <Text style={lbl}>{label}</Text>
      <TextInput style={inp} keyboardType="numeric" value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={COLORS.subtext} />
    </>
  )
}

export function CalcButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const { t } = useLanguage()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: COLORS.navy, borderRadius: 12, padding: 14, alignItems: 'center',
      marginVertical: 8, opacity: pressed ? 0.85 : 1,
    })}>
      <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>{label || t('stcCalculate')}</Text>
    </Pressable>
  )
}

export function InfoBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: COLORS.yellowSoft, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <Text style={{ color: '#7B5800', fontSize: 12, lineHeight: 18 }}>{text}</Text>
    </View>
  )
}

/** Bulleted reference list — for rules-based tools (tap rules, pool bonding). */
export function BulletList({ items }: { items: string[] }) {
  return (
    <View style={{ marginTop: 4 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Text style={{ color: COLORS.teal, fontWeight: '900', marginRight: 8 }}>•</Text>
          <Text style={{ flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 19 }}>{it}</Text>
        </View>
      ))}
    </View>
  )
}
