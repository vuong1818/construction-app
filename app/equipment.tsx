import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Item = { id: number; name: string; category: string | null; tag: string | null }
type Ck = { id: number; equipment_id: number; user_id: string | null; user_name: string | null; checked_out_at: string | null; checked_in_at?: string | null }

export default function Equipment() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [myName, setMyName] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [openCk, setOpenCk] = useState<Ck[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [lastIn, setLastIn] = useState<Map<number, { user_name: string | null; checked_in_at: string | null }>>(new Map())

  const load = useCallback(async () => {
    const [{ data: eq }, { data: ck }] = await Promise.all([
      supabase.from('equipment').select('id, name, category, tag').order('name'),
      supabase.from('equipment_checkouts').select('id, equipment_id, user_id, user_name, checked_out_at').is('checked_in_at', null),
    ])
    setItems((eq as Item[]) || [])
    setOpenCk((ck as Ck[]) || [])

    // Who had it last, and when they brought it back.
    //
    // The point is accountability rather than history: a tool that comes back
    // damaged should not land on whoever picks it up next, and the manager
    // needs to know who had it before that. Ordered newest first, so the first
    // row seen for an equipment id is its most recent return.
    const { data: closed } = await supabase
      .from('equipment_checkouts')
      .select('equipment_id, user_name, checked_in_at')
      .not('checked_in_at', 'is', null)
      .order('checked_in_at', { ascending: false })
      .limit(400)
    const last = new Map<number, { user_name: string | null; checked_in_at: string | null }>()
    ;((closed as any[]) || []).forEach(c => {
      if (!last.has(c.equipment_id)) last.set(c.equipment_id, { user_name: c.user_name, checked_in_at: c.checked_in_at })
    })
    setLastIn(last)
    setLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/sign-in'); return }
      setUid(user.id)
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setMyName(prof?.full_name || null)
      await load()
    })()
  }, [load])

  // Short and local: a crew reading this wants "Tue 3:40 PM", not an ISO string.
  const fmtWhen = (iso: string | null | undefined) => {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  const holderOf = (eid: number) => openCk.find((c) => c.equipment_id === eid) || null

  async function checkOut(item: Item) {
    if (!uid) return
    setBusy(item.id)
    const { error } = await supabase.from('equipment_checkouts').insert({ equipment_id: item.id, user_id: uid, user_name: myName, checked_out_by: uid })
    if (!error) await supabase.from('equipment').update({ status: 'checked_out' }).eq('id', item.id)
    setBusy(null)
    if (error) { Alert.alert(t('error'), error.message); return }
    await load()
  }

  async function returnItem(ck: Ck) {
    if (!uid) return
    setBusy(ck.equipment_id)
    await supabase.from('equipment_checkouts').update({ checked_in_at: new Date().toISOString() }).eq('id', ck.id)
    await supabase.from('equipment').update({ status: 'available' }).eq('id', ck.equipment_id)
    setBusy(null)
    await load()
  }

  const sub = (it: Item) => [it.category, it.tag ? `#${it.tag}` : ''].filter(Boolean).join(' · ')
  const mine = items.filter((it) => { const c = holderOf(it.id); return c && c.user_id === uid })
  const available = items.filter((it) => !holderOf(it.id))
  const others = items.filter((it) => { const c = holderOf(it.id); return c && c.user_id !== uid })

  const card = { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 }
  const sectionTitle = { fontSize: 15, fontWeight: '800' as const, color: COLORS.subtext, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 10, marginBottom: 8 }

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" /></SafeAreaView>

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 10 }}><Ionicons name="chevron-back" size={26} color={COLORS.navy} /></Pressable>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text }}>{t('toolsEquipment')}</Text>
        </View>

        <Text style={sectionTitle}>{t('myEquipment')} ({mine.length})</Text>
        {mine.length === 0 ? (
          <Text style={{ color: COLORS.subtext, marginBottom: 8 }}>{t('nothingCheckedOut')}</Text>
        ) : mine.map((it) => {
          const ck = holderOf(it.id)!
          return (
            <View key={it.id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="construct" size={22} color={COLORS.navy} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{it.name}</Text>
                {sub(it) ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{sub(it)}</Text> : null}
                {fmtWhen(ck.checked_out_at) ? <Text style={{ color: COLORS.subtext, fontSize: 12 }}>Since {fmtWhen(ck.checked_out_at)}</Text> : null}
              </View>
              <Pressable onPress={() => returnItem(ck)} disabled={busy === it.id} style={{ backgroundColor: COLORS.green, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 }}>
                {busy === it.id ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('returnTool')}</Text>}
              </Pressable>
            </View>
          )
        })}

        <Text style={sectionTitle}>{t('availableTools')} ({available.length})</Text>
        {available.length === 0 ? (
          <Text style={{ color: COLORS.subtext, marginBottom: 8 }}>—</Text>
        ) : available.map((it) => (
          <View key={it.id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="cube-outline" size={22} color={COLORS.subtext} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{it.name}</Text>
              {sub(it) ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{sub(it)}</Text> : null}
              {/* Who brought it back, and when. Whoever picks it up next should
                  not inherit the blame for damage that was already there, and
                  the manager needs a name to ask. */}
              {lastIn.get(it.id)?.checked_in_at ? (
                <Text style={{ color: COLORS.subtext, fontSize: 12 }}>
                  Last in: {lastIn.get(it.id)!.user_name || t('worker')} · {fmtWhen(lastIn.get(it.id)!.checked_in_at)}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => checkOut(it)} disabled={busy === it.id} style={{ backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 }}>
              {busy === it.id ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('checkOut')}</Text>}
            </Pressable>
          </View>
        ))}

        {others.length > 0 ? (
          <>
            <Text style={sectionTitle}>{t('inUseByOthers')} ({others.length})</Text>
            {others.map((it) => {
              const ck = holderOf(it.id)!
              return (
                <View key={it.id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.75 }}>
                  <Ionicons name="cube-outline" size={22} color={COLORS.subtext} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{it.name}</Text>
                    <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{ck.user_name || t('worker')}</Text>
                    {fmtWhen(ck.checked_out_at) ? <Text style={{ color: COLORS.subtext, fontSize: 12 }}>Since {fmtWhen(ck.checked_out_at)}</Text> : null}
                  </View>
                </View>
              )
            })}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
