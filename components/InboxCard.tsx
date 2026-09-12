// "Notices" — the inbox on the phone. Self-contained so Home and the
// role boards can all drop it in.
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch'
import { t, type Language } from '../lib/i18n'
import { InboxItem, inboxMeta, inboxRoute, loadInbox, markAllInboxRead, markInboxRead, splitInbox } from '../lib/inbox'
import { COLORS } from '../lib/theme'
import { InboxRow, SectionTitle } from './ui'

const KIND_LABEL: Record<string, string> = {
  daily_report: 'Report',
  rfi: 'RFI',
  material_request: 'Request',
  rfi_answered: 'Answered',
  request_handled: 'Handled',
  shift_corrected: 'Shift',
  estimate_accepted: 'Estimate',
  app_update: 'App',
}

export function InboxCard({ language, weekStart, limit = 8 }: { language: Language; weekStart: Date; limit?: number }) {
  const router = useRouter()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await loadInbox())
    } catch {
      // The inbox is a convenience; a failed load just shows the empty state.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefetch('inbox_events', load)
  useRealtimeRefetch('daily_reports', load)
  useRealtimeRefetch('rfis', load)
  useRealtimeRefetch('material_requests', load)

  const { thisWeek, olderUnread, unread } = splitInbox(items, weekStart)
  const olderUnreadRows = items.filter(i => new Date(i.created_at).getTime() < weekStart.getTime() && !i.is_read)
  const rows = showAll ? [...thisWeek, ...olderUnreadRows] : thisWeek.slice(0, limit)

  function open(item: InboxItem) {
    if (!item.is_read) {
      setItems(prev => prev.map(i => (i.kind === item.kind && i.id === item.id ? { ...i, is_read: true } : i)))
      markInboxRead(item.kind, item.id).catch(() => {})
    }
    router.push(inboxRoute(item) as any)
  }

  function readAll() {
    setItems(prev => prev.map(i => ({ ...i, is_read: true })))
    markAllInboxRead().catch(() => {})
  }

  // Nothing at all, ever: stay out of the way rather than show an empty box.
  if (loaded && items.length === 0) return null

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SectionTitle icon="bell-outline" title={t(language, 'notices')} />
          {unread > 0 && (
            <View style={{ backgroundColor: COLORS.teal, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 }}>
              <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 12 }}>{unread}</Text>
            </View>
          )}
        </View>
        {unread > 0 && (
          <Pressable onPress={readAll} hitSlop={8} style={{ marginTop: 6 }}>
            <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{t(language, 'markAllRead')}</Text>
          </Pressable>
        )}
      </View>

      <View style={{ backgroundColor: COLORS.card, borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}>
        {rows.length === 0 ? (
          <Text style={{ color: COLORS.subtext, fontSize: 14, padding: 14 }}>{t(language, 'inboxEmpty')}</Text>
        ) : rows.map(item => (
          <InboxRow
            key={`${item.kind}:${item.id}`}
            unread={!item.is_read}
            kind={KIND_LABEL[item.kind] || item.kind}
            title={item.title}
            meta={inboxMeta(item)}
            onPress={() => open(item)}
          />
        ))}
        {!showAll && (thisWeek.length > limit || olderUnread > 0) && (
          <Pressable onPress={() => setShowAll(true)} style={{ padding: 12 }}>
            <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>
              {olderUnread > 0
                ? t(language, 'unreadFromLastWeek', { n: olderUnread })
                : t(language, 'showAllN', { n: thisWeek.length })}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
