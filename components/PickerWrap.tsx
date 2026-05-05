import { Picker } from '@react-native-picker/picker'
import { Platform, View, type ViewStyle } from 'react-native'
import { COLORS } from '../lib/theme'

export function PickerWrap<T>({
  selectedValue,
  onValueChange,
  children,
  style,
}: {
  selectedValue: T
  onValueChange: (value: T) => void
  children: React.ReactNode
  style?: ViewStyle
}) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          marginBottom: 14,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange as any}
        dropdownIconColor={COLORS.text}
        style={{ color: COLORS.text, backgroundColor: COLORS.card }}
        itemStyle={Platform.OS === 'ios' ? { color: COLORS.text, fontSize: 18 } : undefined}
      >
        {children}
      </Picker>
    </View>
  )
}

export default PickerWrap
