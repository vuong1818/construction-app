import { useEffect, useRef } from 'react'
import { Animated, View, type ViewStyle } from 'react-native'
import { COLORS, RADIUS } from '../lib/theme'

// Subtle 1.0 → 0.5 → 1.0 opacity pulse. Cheaper than a shimmer
// gradient and reads as "loading" without being noisy.
function usePulse() {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [v])
  return v
}

type BlockProps = {
  width?: number | string
  height?: number
  radius?: number
  style?: ViewStyle
}

// Single skeleton block — use as the building block for cards/rows.
export function SkeletonBlock({ width = '100%', height = 14, radius = 6, style }: BlockProps) {
  const opacity = usePulse()
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: '#E2E8F0', opacity },
        style,
      ]}
    />
  )
}

// Pre-baked card layouts that match the most common screen shapes.

export function SkeletonTaskCard() {
  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <SkeletonBlock width={70} height={20} radius={100} />
        <SkeletonBlock width={120} height={20} radius={100} />
      </View>
      <SkeletonBlock height={18} width="80%" />
      <SkeletonBlock height={14} width="55%" style={{ marginTop: 8 }} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <SkeletonBlock width={90} height={48} radius={14} />
        <SkeletonBlock width={130} height={48} radius={14} />
      </View>
    </View>
  )
}

export function SkeletonProjectCard() {
  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.xxl, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <SkeletonBlock width={56} height={56} radius={18} />
      <View style={{ flex: 1 }}>
        <SkeletonBlock height={18} width="70%" />
        <SkeletonBlock height={14} width="50%" style={{ marginTop: 8 }} />
        <SkeletonBlock height={14} width="35%" style={{ marginTop: 6 }} />
      </View>
    </View>
  )
}

export function SkeletonTimesheetEntry() {
  return (
    <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <SkeletonBlock height={12} width="40%" />
          <SkeletonBlock height={18} width="75%" style={{ marginTop: 6 }} />
        </View>
        <SkeletonBlock width={64} height={26} radius={100} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SkeletonBlock height={140} radius={14} style={{ flex: 1 }} />
        <SkeletonBlock height={140} radius={14} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

// Generic stack of N pre-baked skeletons.
export function SkeletonList({ count = 3, kind = 'task' }: { count?: number; kind?: 'task' | 'project' | 'timesheet' }) {
  const Comp = kind === 'project' ? SkeletonProjectCard : kind === 'timesheet' ? SkeletonTimesheetEntry : SkeletonTaskCard
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => <Comp key={i} />)}
    </View>
  )
}
