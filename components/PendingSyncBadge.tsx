import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { drainQueue, subscribePending } from '../lib/syncQueue'

type Props = {
  // Hide the chip entirely when the queue is empty (default true). Pass
  // false when the surrounding layout reserves space and the badge should
  // render as a benign "all synced" affordance.
  hideWhenEmpty?: boolean
  style?: ViewStyle
}

// Single source of truth for the "X pending sync — tap to retry" chip.
// Subscribes to the offline queue and re-renders on count changes.
export default function PendingSyncBadge({ hideWhenEmpty = true, style }: Props) {
  const [count, setCount] = useState(0)
  useEffect(() => subscribePending(setCount), [])

  if (count === 0 && hideWhenEmpty) return null

  if (count === 0) {
    return (
      <View
        style={[
          {
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#DCFCE7',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
          },
          style,
        ]}
      >
        <Ionicons name="cloud-done-outline" size={14} color="#166534" />
        <Text style={{ color: '#166534', fontWeight: '700', fontSize: 12 }}>All synced</Text>
      </View>
    )
  }

  return (
    <Pressable
      onPress={() => drainQueue().catch(() => {})}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#FBBF24',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
        },
        style,
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={14} color="#78350F" />
      <Text style={{ color: '#78350F', fontWeight: '700', fontSize: 12 }}>
        {count} pending sync — tap to retry
      </Text>
    </Pressable>
  )
}
