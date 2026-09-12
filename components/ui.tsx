// The phone's shared components. (2026-09-12, phase 1 of the design)
//
// Native counterparts of components/ui.js on the web, built on lib/theme
// (COLORS, TOUCH, TYPE, SPACING, RADIUS), which the screens already use.
// Twelve parts that cover every screen in the agreed design: Button, Card,
// Field, Badge, ListRow, Sheet, Segmented, EmptyState, InboxRow, MoneyTile,
// WaitingRow, plus Tile and SectionTitle, the two pieces the project screen
// and the hubs each redeclared for themselves.
//
//   import { Button, Card, Tile } from '../components/ui'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { COLORS, RADIUS, SPACING, TOUCH, TYPE } from '../lib/theme'

// ── Button ────────────────────────────────────────────────────────────────
type Tone = 'primary' | 'ghost' | 'danger' | 'accent'
const TONES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  primary: { bg: COLORS.navy, fg: COLORS.white },
  accent:  { bg: COLORS.teal, fg: COLORS.white },
  ghost:   { bg: COLORS.card, fg: COLORS.navy, border: COLORS.border },
  danger:  { bg: COLORS.redSoft, fg: COLORS.red },
}
export function Button({ tone = 'primary', label, onPress, disabled, busy, small, style }: {
  tone?: Tone; label: string; onPress: () => void; disabled?: boolean; busy?: boolean; small?: boolean; style?: ViewStyle
}) {
  const t = TONES[tone]
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={{
        backgroundColor: t.bg, borderColor: t.border ?? t.bg, borderWidth: 1,
        borderRadius: small ? 10 : RADIUS.md,
        paddingVertical: small ? 8 : TOUCH.pillPaddingV, paddingHorizontal: small ? 14 : TOUCH.pillPaddingH,
        minHeight: small ? 36 : TOUCH.minHeight, alignItems: 'center', justifyContent: 'center',
        opacity: disabled || busy ? 0.55 : 1, ...(style || {}),
      }}
    >
      <Text style={{ color: t.fg, fontWeight: '800', fontSize: small ? 13 : 16 }}>{busy ? '…' : label}</Text>
    </Pressable>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ title, subtitle, accent, children, style }: {
  title?: string; subtitle?: string; accent?: string; children?: ReactNode; style?: ViewStyle
}) {
  return (
    <View style={{
      backgroundColor: COLORS.card, borderRadius: RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.md,
      borderWidth: 1, borderColor: COLORS.border, ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : {}), ...(style || {}),
    }}>
      {title ? <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 17 }}>{title}</Text> : null}
      {subtitle ? <Text style={{ color: COLORS.subtext, fontSize: TYPE.caption, marginTop: 2 }}>{subtitle}</Text> : null}
      {children ? <View style={{ marginTop: title || subtitle ? SPACING.md : 0 }}>{children}</View> : null}
    </View>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────
export function Field({ label, hint, required, multiline, containerStyle, ...input }: Omit<TextInputProps, 'style'> & {
  label?: string; hint?: string; required?: boolean; containerStyle?: ViewStyle
}) {
  return (
    <View style={{ marginBottom: SPACING.lg, ...(containerStyle || {}) }}>
      {label ? <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 6, fontSize: 14 }}>{label}{required ? ' *' : ''}</Text> : null}
      <TextInput
        multiline={multiline}
        placeholderTextColor={COLORS.muted}
        style={{
          backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg,
          paddingHorizontal: 14, paddingVertical: 12, minHeight: multiline ? 100 : TOUCH.minHeight,
          textAlignVertical: multiline ? 'top' : 'center', color: COLORS.text, fontSize: TYPE.body,
        }}
        {...input}
      />
      {hint ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 5, lineHeight: 16 }}>{hint}</Text> : null}
    </View>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────
type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'shared' | 'navy'
const BADGES: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: COLORS.greenSoft, fg: '#166534' }, warn: { bg: COLORS.amberSoft, fg: COLORS.amber },
  danger: { bg: COLORS.redSoft, fg: '#B91C1C' }, info: { bg: COLORS.blueSoft, fg: COLORS.blue },
  neutral: { bg: '#E5E7EB', fg: '#374151' }, shared: { bg: '#F3E5F5', fg: '#4A148C' }, navy: { bg: COLORS.navySoft, fg: COLORS.navy },
}
export function Badge({ tone = 'neutral', label }: { tone?: BadgeTone; label: string }) {
  const b = BADGES[tone]
  return (
    <View style={{ backgroundColor: b.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: b.fg, fontWeight: '800', fontSize: 11 }}>{label}</Text>
    </View>
  )
}

// ── ListRow ───────────────────────────────────────────────────────────────
export function ListRow({ title, meta, body, badges, right, onPress }: {
  title: string; meta?: string; body?: string; badges?: ReactNode; right?: ReactNode; onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 16, flexShrink: 1 }}>{title}</Text>
          {badges}
        </View>
        {meta ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 3 }}>{meta}</Text> : null}
        {body ? <Text style={{ color: COLORS.text, marginTop: 6, lineHeight: 20 }}>{body}</Text> : null}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.muted} /> : null)}
    </Pressable>
  )
}

// ── Sheet ─────────────────────────────────────────────────────────────────
// A bottom sheet with a title and a close affordance; the phone's modal.
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xxxl, borderTopRightRadius: RADIUS.xxxl, maxHeight: '88%', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}>
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 12 }} />
          {title ? <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 20, marginBottom: 12 }}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ── Segmented ─────────────────────────────────────────────────────────────
export function Segmented<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: COLORS.navySoft, borderRadius: RADIUS.md, padding: 4, marginBottom: SPACING.lg }}>
      {items.map(it => {
        const on = it.key === value
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: on ? COLORS.card : 'transparent', alignItems: 'center' }}>
            <Text style={{ color: on ? COLORS.navy : COLORS.subtext, fontWeight: '800', fontSize: 14 }}>{it.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'inbox-outline', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 30 }}>
      <MaterialCommunityIcons name={icon as any} size={48} color={COLORS.border} />
      <Text style={{ color: COLORS.subtext, marginTop: 10, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: COLORS.muted, marginTop: 4, textAlign: 'center', fontSize: 13 }}>{hint}</Text> : null}
    </View>
  )
}

// ── InboxRow ──────────────────────────────────────────────────────────────
export function InboxRow({ unread, kind, title, meta, onPress }: { unread: boolean; kind?: string; title: string; meta?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: unread ? COLORS.card : 'transparent' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: unread ? COLORS.teal : 'transparent' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: unread ? COLORS.text : COLORS.subtext, fontWeight: unread ? '800' : '500', fontSize: 15 }}>
          {kind ? <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800' }}>{kind.toUpperCase()}  </Text> : null}{title}
        </Text>
        {meta ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 1 }}>{meta}</Text> : null}
      </View>
    </Pressable>
  )
}

// ── MoneyTile ─────────────────────────────────────────────────────────────
export function MoneyTile({ label, value, sub, tone, onPress }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'danger'; onPress?: () => void }) {
  const c = tone === 'danger' ? COLORS.red : tone === 'warn' ? COLORS.amber : tone === 'ok' ? COLORS.green : COLORS.navy
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: c, fontSize: 22, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {sub ? <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  )
}

// ── WaitingRow ────────────────────────────────────────────────────────────
export function WaitingRow({ title, job, age, tone = 'warn', onPress }: { title: string; job?: string; age?: string; tone?: 'ok' | 'warn' | 'danger'; onPress?: () => void }) {
  const stripe = tone === 'danger' ? COLORS.red : tone === 'ok' ? COLORS.green : COLORS.amber
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: stripe, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.card }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        {(job || age) ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 1 }}>{[job, age].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.muted} />
    </Pressable>
  )
}

// ── Tile ──────────────────────────────────────────────────────────────────
// The big tappable square the project screen and the hubs use for actions.
// One place, so a plumber's Home and a manager's hub agree on what a tile is.
export function Tile({ icon, iconBg, iconColor, title, subtitle, onPress, disabled = false }: {
  icon: string; iconBg?: string; iconColor?: string; title: string; subtitle?: string; onPress: () => void; disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1, backgroundColor: disabled ? COLORS.disabledSoft : COLORS.card, borderRadius: 22,
        paddingVertical: 22, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: COLORS.border,
      }}
    >
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: disabled ? COLORS.disabled : (iconBg ?? COLORS.tealSoft), justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
        <MaterialCommunityIcons name={icon as any} size={32} color={disabled ? COLORS.white : (iconColor ?? COLORS.teal)} />
      </View>
      <Text style={{ color: disabled ? COLORS.white : COLORS.navy, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Text style={{ color: disabled ? COLORS.white : COLORS.subtext, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
    </Pressable>
  )
}

// ── SectionTitle ──────────────────────────────────────────────────────────
export function SectionTitle({ icon, iconBg, iconColor, title }: { icon: string; iconBg?: string; iconColor?: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginTop: 20 }}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: iconBg ?? COLORS.navySoft, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
        <MaterialCommunityIcons name={icon as any} size={24} color={iconColor ?? COLORS.navy} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>{title}</Text>
    </View>
  )
}
