import DateTimePicker from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import { useLanguage } from '../lib/i18n'
import { COLORS } from '../lib/theme'

function toIso(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseIso(s: string | null | undefined): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0)
  }
  return new Date()
}

function formatDisplay(s: string): string {
  if (!s) return ''
  const d = parseIso(s)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function DatePickerField({
  value,
  onChange,
  placeholder,
  allowClear = false,
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  allowClear?: boolean
}) {
  const { t } = useLanguage()
  const [show, setShow] = useState(false)

  const handleNative = (_event: any, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false)
    if (selected) onChange(toIso(selected))
  }

  return (
    <View>
      <Pressable
        onPress={() => setShow(true)}
        style={{
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <Text style={{ color: value ? COLORS.text : COLORS.subtext, fontSize: 15 }}>
          {value ? formatDisplay(value) : placeholder || 'YYYY-MM-DD'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {allowClear && value ? (
            <Pressable onPress={(e) => { e.stopPropagation?.(); onChange('') }} hitSlop={8}>
              <Text style={{ color: COLORS.subtext, fontSize: 18, fontWeight: '700' }}>×</Text>
            </Pressable>
          ) : null}
          <Text style={{ fontSize: 18 }}>📅</Text>
        </View>
      </Pressable>

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={parseIso(value)}
          mode="date"
          display="default"
          onChange={handleNative}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' }}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t('cancel')}</Text>
                <Pressable onPress={() => setShow(false)}>
                  <Text style={{ color: COLORS.navy, fontWeight: '800' }}>{t('confirm')}</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={parseIso(value)}
                mode="date"
                display="spinner"
                onChange={handleNative}
                themeVariant="light"
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

export default DatePickerField
