import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { COLORS } from '../lib/theme'

type BigActionCardProps = {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  onPress: () => void
  disabled?: boolean
}

export function BigActionCard({
  icon,
  iconBg,
  iconColor,
  title,
  onPress,
  disabled = false,
}: BigActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: disabled ? COLORS.disabledSoft : COLORS.card,
        borderRadius: 22,
        paddingVertical: 22,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: iconBg,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={32} color={iconColor} />
      </View>

      <Text
        style={{
          color: COLORS.navy,
          fontWeight: '700',
          textAlign: 'center',
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  )
}