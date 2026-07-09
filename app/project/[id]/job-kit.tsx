import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

type Kit = { id: number; name: string; status: string }
type KitItem = {
  id: number
  job_kit_id: number
  name: string
  kind: 'tool' | 'material' | 'consumable'
  unit: string
  qty_needed: number
  qty_packed: number
  checked: boolean
}

const KIND_ORDER: KitItem['kind'][] = ['tool', 'material', 'consumable']
const KIND_ICON: Record<KitItem['kind'], string> = {
  tool: 'wrench-outline',
  material: 'package-variant',
  consumable: 'water-outline',
}

export default function JobKitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [kits, setKits] = useState<Kit[]>([])
  const [items, setItems] = useState<KitItem[]>([])

  const load = useCallback(async () => {
    const { data: k } = await supabase
      .from('job_kits')
      .select('id, name, status')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const kitList = (k as Kit[]) || []
    setKits(kitList)

    if (kitList.length) {
      const { data: li } = await supabase
        .from('job_kit_items')
        .select('id, job_kit_id, name, kind, unit, qty_needed, qty_packed, checked')
        .in('job_kit_id', kitList.map(x => x.id))
        .order('sort_order')
        .order('id')
      setItems((li as KitItem[]) || [])
    } else {
      setItems([])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Crew check-off: tapping toggles "packed" — sets checked + fills packed qty.
  async function toggle(item: KitItem) {
    const nowChecked = !item.checked
    // optimistic
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, checked: nowChecked, qty_packed: nowChecked ? i.qty_needed : 0 }
      : i))
    const { error } = await supabase
      .from('job_kit_items')
      .update({ checked: nowChecked, qty_packed: nowChecked ? item.qty_needed : 0 })
      .eq('id', item.id)
    if (error) load() // revert to server truth on failure
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingJobKit')}</Text>
      </SafeAreaView>
    )
  }

  if (!kits.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
        <MaterialCommunityIcons name="package-variant-closed" size={54} color={COLORS.border} />
        <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 18, marginTop: 12 }}>{t('noJobKitTitle')}</Text>
        <Text style={{ color: COLORS.subtext, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{t('noJobKitMsg')}</Text>
      </SafeAreaView>
    )
  }

  const total = items.length
  const packedCount = items.filter(i => i.checked).length
  const allPacked = total > 0 && packedCount === total

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        {/* Progress header */}
        <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.navy }}>{t('jobKit')}</Text>
          <Text style={{ color: COLORS.subtext, marginTop: 2, marginBottom: 12 }}>{t('jkTapHint')}</Text>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: COLORS.background, overflow: 'hidden' }}>
            <View style={{ width: `${total ? (packedCount / total) * 100 : 0}%`, height: '100%', backgroundColor: allPacked ? '#2E7D32' : COLORS.teal }} />
          </View>
          <Text style={{ marginTop: 8, fontWeight: '800', color: allPacked ? '#2E7D32' : COLORS.navy }}>
            {allPacked ? t('jkAllReady') : `${packedCount} / ${total} ${t('jkPacked')}`}
          </Text>
        </View>

        {kits.map(kit => {
          const kitItems = items.filter(i => i.job_kit_id === kit.id)
          return (
            <View key={kit.id} style={{ marginBottom: 18 }}>
              {kits.length > 1 && (
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.navy, marginBottom: 8 }}>{kit.name}</Text>
              )}
              {KIND_ORDER.map(kind => {
                const group = kitItems.filter(i => i.kind === kind)
                if (!group.length) return null
                const label = kind === 'tool' ? t('jkTools') : kind === 'material' ? t('jkMaterials') : t('jkConsumables')
                return (
                  <View key={kind} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <MaterialCommunityIcons name={KIND_ICON[kind] as any} size={18} color={COLORS.teal} />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                    </View>
                    {group.map(item => (
                      <Pressable
                        key={item.id}
                        onPress={() => toggle(item)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: item.checked ? '#E8F5E9' : COLORS.card,
                          borderRadius: 14, padding: 14, marginBottom: 8,
                          borderWidth: 1, borderColor: item.checked ? '#A5D6A7' : COLORS.border,
                        }}
                      >
                        <MaterialCommunityIcons
                          name={item.checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                          size={28}
                          color={item.checked ? '#2E7D32' : COLORS.border}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', color: COLORS.navy, fontSize: 16, textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.name}</Text>
                          <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 2 }}>{t('jkNeed')} {Number(item.qty_needed).toLocaleString('en-US')} {item.unit}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )
              })}
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}
