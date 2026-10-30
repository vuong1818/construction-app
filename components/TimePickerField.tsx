import DateTimePicker from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import { useLanguage } from '../lib/i18n'
import { COLORS } from '../lib/theme'

// Sister of DatePickerField: a wall-clock time as 'HH:mm' (24h), no date.
// The two are kept separate on purpose - a manager fixing a forgotten
// clock-out changes the time far more often than the day, and a combined
// datetime spinner makes the common case the fiddly one.

function toHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseHm(s: string | null | undefined): Date {
  const d = new Date()
  d.setSeconds(0, 0)
  if (s && /^\d{2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number)
    d.setHours(h, m, 0, 0)
  }
  return d
}

function formatDisplay(s: string): string {
  if (!s) return ''
  return parseHm(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function TimePickerField({
  value,
  onChange,
  placeholder,
  allowClear = false,
}: {
  value: string
  onChange: (hm: string) => void
  placeholder?: string
  allowClear?: boolean
}) {
  const { t } = useLanguage()
  const [show, setShow] = useState(false)

  const handleNative = (_event: any, selected?: Date) => {
    if (Platform.OS !== 'ios') setShow(false)
    if (selected) onChange(toHm(selected))
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
          {value ? formatDisplay(value) : placeholder || '--:--'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {allowClear && value ? (
            <Pressable onPress={(e) => { e.stopPropagation?.(); onChange('') }} hitSlop={8}>
              <Text style={{ color: COLORS.subtext, fontSize: 18, fontWeight: '700' }}>×</Text>
            </Pressable>
          ) : null}
          <Text style={{ fontSize: 18 }}>🕒</Text>
        </View>
      </Pressable>

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={parseHm(value)}
          mode="time"
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
                value={parseHm(value)}
                mode="time"
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

export default TimePickerField
