import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Picker } from '@react-native-picker/picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import ImageView from 'react-native-image-viewing'
import { SafeAreaView } from 'react-native-safe-area-context'
import DatePickerField from '../../../components/DatePickerField'
import PickerWrap from '../../../components/PickerWrap'
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch'
import { useLanguage } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { COLORS } from '../../../lib/theme'

type ExpenseType = { id: number; value: string; label: string; sort_order: number; deleted_at: string | null }
type Vendor      = { id: number; name: string; deleted_at: string | null }

const RECEIPTS_BUCKET = 'expense-receipts'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Expense = {
  id: number
  project_id: number
  expense_type: string
  // 'company' = paid from company funds; 'reimbursement' = worker paid out
  // of pocket and gets reimbursed via their weekly payroll. Defaults to
  // 'company' on the server, but the form below lets the worker choose.
  expense_kind: 'company' | 'reimbursement'
  amount: number
  expense_date: string
  vendor: string | null
  notes: string | null
  receipt_photo_url: string | null
  receipt_photo_path: string | null
  created_by: string | null
  created_at: string
  // Manager-only columns we read but don't expose in the worker form
  payment_method: string | null
  is_paid: boolean
  paid_date: string | null
  // Set when this expense is a payment against a subcontract (web app's
  // Subcontracts tab tags it). Mobile doesn't write this, only reads.
  subcontract_id: number | null
}

type Project = { id: number; name: string }

function fmtMoney(n: number) {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProjectExpensesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])

  // Form state
  const [editing, setEditing] = useState<Expense | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    expense_type: 'materials',
    expense_kind: 'company' as 'company' | 'reimbursement',
    amount: '',
    expense_date: '',
    vendor: '',
    notes: '',
    receipt_photo_url: null as string | null,
    receipt_photo_path: null as string | null,
  })
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false)
  const [pendingReceipt, setPendingReceipt] = useState<{ uri: string; name: string; mimeType: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Receipt viewer
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId)) {
      setErrorMessage('Invalid project.')
      setLoading(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setErrorMessage('You must be signed in.'); setLoading(false); return }
      setCurrentUserId(session.user.id)

      const [meResult, projectResult, expensesResult, typesResult, vendorsResult] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', session.user.id).single(),
        supabase.from('projects').select('id, name').eq('id', projectId).single(),
        supabase.from('project_expenses')
          .select('id, project_id, expense_type, expense_kind, amount, expense_date, vendor, notes, receipt_photo_url, receipt_photo_path, created_by, created_at, payment_method, is_paid, paid_date, subcontract_id')
          .eq('project_id', projectId)
          .order('expense_date', { ascending: false }),
        supabase.from('expense_types').select('id, value, label, sort_order, deleted_at').eq('scope', 'project').order('sort_order'),
        supabase.from('vendors').select('id, name, deleted_at').order('name'),
      ])

      setExpenseTypes((typesResult.data || []) as ExpenseType[])
      setVendors((vendorsResult.data || []) as Vendor[])

      const manager = meResult.data?.role === 'manager'
      setIsManager(manager)

      if (projectResult.error) { setErrorMessage(projectResult.error.message); setLoading(false); return }
      setProject(projectResult.data as Project)

      // RLS already scopes SELECT to (own OR manager); no extra client filter
      // needed, but be defensive in case the policy changes.
      if (expensesResult.error) { setErrorMessage(expensesResult.error.message); setLoading(false); return }
      const visible = (expensesResult.data || []) as Expense[]
      setExpenses(visible)
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to load expenses.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  useRealtimeRefetch(
    'project_expenses',
    load,
    Number.isFinite(projectId) ? `project_id=eq.${projectId}` : undefined,
    Number.isFinite(projectId),
  )

  function canEdit(e: Expense) {
    return isManager || e.created_by === currentUserId
  }

  // Active types only — soft-deleted entries hide from the picker but
  // existing rows that reference them still display via labelForType().
  const activeTypes  = expenseTypes.filter(t => !t.deleted_at)
  const activeVendors = vendors.filter(v => !v.deleted_at)
  function labelForType(slug: string | null | undefined): string {
    if (!slug) return '—'
    return activeTypes.find(t => t.value === slug)?.label || 'Unknown'
  }

  function openCreate() {
    setForm({
      expense_type: activeTypes[0]?.value || 'other',
      expense_kind: 'company',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      notes: '',
      receipt_photo_url: null,
      receipt_photo_path: null,
    })
    setPendingReceipt(null)
    setCreating(true)
  }

  function openEdit(e: Expense) {
    setForm({
      expense_type: e.expense_type || (activeTypes[0]?.value ?? 'other'),
      expense_kind: e.expense_kind === 'reimbursement' ? 'reimbursement' : 'company',
      amount: e.amount != null ? String(e.amount) : '',
      expense_date: e.expense_date || '',
      vendor: e.vendor || '',
      notes: e.notes || '',
      receipt_photo_url: e.receipt_photo_url,
      receipt_photo_path: e.receipt_photo_path,
    })
    setPendingReceipt(null)
    setEditing(e)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
    setPendingReceipt(null)
  }

  async function pickReceiptFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t('permissionNeeded'), t('allowPhotos'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 })
    if (result.canceled || !result.assets?.length) return
    const a = result.assets[0]
    setPendingReceipt({ uri: a.uri, name: a.fileName || `receipt-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' })
  }
  async function takeReceiptPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t('permissionNeeded'), t('allowCamera'))
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    if (result.canceled || !result.assets?.length) return
    const a = result.assets[0]
    setPendingReceipt({ uri: a.uri, name: a.fileName || `receipt-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' })
  }

  async function uploadReceipt(file: { uri: string; name: string; mimeType: string }) {
    const safeName = file.name.replace(/[^\w.\-]/g, '_')
    const path = `project-${projectId}/${Date.now()}_${safeName}`
    const fileResp = await fetch(file.uri)
    if (!fileResp.ok) throw new Error('Could not read receipt photo.')
    const arrayBuffer = await fileResp.arrayBuffer()
    const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, arrayBuffer, {
      contentType: file.mimeType, upsert: false,
    })
    if (error) throw new Error(error.message)
    const url = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(path).data.publicUrl
    return { url, path }
  }

  async function save() {
    const amt = Number(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert(t('missing'), t('amountPositive'))
      return
    }
    if (form.expense_date && !DATE_RE.test(form.expense_date)) {
      Alert.alert(t('invalidDate'), t('invalidDateFormat'))
      return
    }

    setSaving(true)
    try {
      let receiptUrl  = form.receipt_photo_url
      let receiptPath = form.receipt_photo_path
      if (pendingReceipt) {
        const uploaded = await uploadReceipt(pendingReceipt)
        receiptUrl  = uploaded.url
        receiptPath = uploaded.path
      }

      // If the typed vendor isn't in the active list, add it so it
      // shows up in the dropdown for next time. Best-effort — failure
      // here doesn't block saving the expense itself.
      const typedVendor = form.vendor.trim()
      if (typedVendor && !activeVendors.find(v => v.name.toLowerCase() === typedVendor.toLowerCase())) {
        try {
          await supabase.from('vendors').insert({ name: typedVendor })
        } catch {
          /* ignore — RLS or duplicate is fine */
        }
      }

      if (editing) {
        const { error } = await supabase.from('project_expenses').update({
          expense_type: form.expense_type,
          expense_kind: form.expense_kind,
          amount: amt,
          expense_date: form.expense_date || new Date().toISOString().split('T')[0],
          vendor: form.vendor.trim() || null,
          notes: form.notes.trim() || null,
          receipt_photo_url: receiptUrl,
          receipt_photo_path: receiptPath,
          updated_at: new Date().toISOString(),
        }).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('project_expenses').insert({
          project_id: projectId,
          expense_type: form.expense_type,
          expense_kind: form.expense_kind,
          amount: amt,
          expense_date: form.expense_date || new Date().toISOString().split('T')[0],
          vendor: form.vendor.trim() || null,
          notes: form.notes.trim() || null,
          receipt_photo_url: receiptUrl,
          receipt_photo_path: receiptPath,
          created_by: currentUserId,
        })
        if (error) throw error
      }

      closeForm()
      load()
    } catch (e: any) {
      Alert.alert(t('saveFailed'), e?.message || t('couldNotSaveExpense'))
    } finally {
      setSaving(false)
    }
  }

  // Manager-only delete (mirrors RLS).
  function confirmDelete(e: Expense) {
    Alert.alert(
      t('deleteExpense'),
      t('deleteExpenseConfirm', { type: labelForType(e.expense_type), amount: fmtMoney(e.amount) }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: async () => {
            try {
              if (e.receipt_photo_path) {
                await supabase.storage.from(RECEIPTS_BUCKET).remove([e.receipt_photo_path])
              }
              const { error } = await supabase.from('project_expenses').delete().eq('id', e.id)
              if (error) throw error
              load()
            } catch (err: any) {
              Alert.alert(t('deleteFailed'), err?.message || t('couldNotDeleteExpense'))
            }
          },
        },
      ],
    )
  }

  const formOpen = creating || !!editing
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingExpenses')}</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>{t('error')}</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>{errorMessage}</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.navy} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: COLORS.navy }} numberOfLines={1}>
          {project?.name || 'Project'}
        </Text>
        <Pressable onPress={openCreate} style={{ backgroundColor: COLORS.teal, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="add" size={18} color={COLORS.white} />
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('add')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.subtext, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {isManager ? t('allExpenses') : t('myExpensesTotal')}
          </Text>
          <Text style={{ color: COLORS.amount, fontSize: 24, fontWeight: '900', marginTop: 4 }}>{fmtMoney(total)}</Text>
          <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
            {expenses.length} {expenses.length === 1 ? t('expenseEntry') : t('expenseEntries')}
          </Text>
        </View>

        {expenses.length === 0 ? (
          <View style={{ backgroundColor: COLORS.card, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
            <MaterialCommunityIcons name="receipt-outline" size={42} color={COLORS.subtext} />
            <Text style={{ color: COLORS.subtext, marginTop: 8, textAlign: 'center' }}>
              {t('noExpensesYet')}
            </Text>
          </View>
        ) : (
          expenses.map(e => {
            const editable = canEdit(e)
            return (
              <Pressable
                key={e.id}
                onPress={() => editable && openEdit(e)}
                style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 12, alignItems: 'center' }}
              >
                {e.receipt_photo_url ? (
                  <Pressable onPress={() => setReceiptViewerUrl(e.receipt_photo_url)}>
                    <Image source={{ uri: e.receipt_photo_url }} style={{ width: 56, height: 56, borderRadius: 10 }} />
                  </Pressable>
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: COLORS.navySoft, justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="receipt-outline" size={26} color={COLORS.navy} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>{fmtMoney(e.amount)}</Text>
                    <View style={{ backgroundColor: COLORS.navySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                      <Text style={{ color: COLORS.navy, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                        {labelForType(e.expense_type).toUpperCase()}
                      </Text>
                    </View>
                    {e.expense_kind === 'reimbursement' && (
                      <View style={{ backgroundColor: COLORS.tealSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                        <Text style={{ color: COLORS.teal, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                          REIMBURSE
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                    {fmtDate(e.expense_date)}{e.vendor ? ` · ${e.vendor}` : ''}
                  </Text>
                  {e.notes ? (
                    <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                      {e.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {editable && <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />}
                  {isManager && (
                    <Pressable onPress={() => confirmDelete(e)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                    </Pressable>
                  )}
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>

      <Modal
        visible={formOpen}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' }}
        >
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.text }}>
                  {editing ? t('editExpense') : t('newExpense')}
                </Text>
                <Pressable onPress={closeForm} hitSlop={10} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={COLORS.subtext} />
                </Pressable>
              </View>

              {/* Type */}
              <Text style={styles.lbl}>{t('type')}</Text>
              <PickerWrap
                selectedValue={form.expense_type}
                onValueChange={(v) => setForm(f => ({ ...f, expense_type: String(v ?? '') }))}
              >
                {/* If editing an expense whose type was soft-deleted, surface
                    the slug as a stub item so the picker can show its current
                    value (otherwise the Picker would silently skip it). */}
                {form.expense_type && !activeTypes.find(et => et.value === form.expense_type) && (
                  <Picker.Item key={`__stale_${form.expense_type}`} label={`${t('unknown')} (${form.expense_type})`} value={form.expense_type} />
                )}
                {activeTypes.map(et => (
                  <Picker.Item key={et.value} label={et.label} value={et.value} />
                ))}
              </PickerWrap>

              {/* Who paid? Company = paid with company funds (card / account).
                  Reimbursement = worker paid out of pocket — adds to this
                  week's paycheck. Two big buttons so it's hard to miss. */}
              <Text style={styles.lbl}>Who paid?</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                {([
                  { value: 'company', label: 'Company',       sub: 'Paid with company funds' },
                  { value: 'reimbursement', label: 'Reimburse me', sub: 'Adds to my weekly pay' },
                ] as const).map(opt => {
                  const on = form.expense_kind === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setForm(f => ({ ...f, expense_kind: opt.value }))}
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: on ? COLORS.teal : COLORS.border,
                        backgroundColor: on ? COLORS.tealSoft : COLORS.white,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ color: on ? COLORS.teal : COLORS.text, fontWeight: '800', fontSize: 14 }}>{opt.label}</Text>
                      <Text style={{ color: COLORS.subtext, fontSize: 11, marginTop: 2 }}>{opt.sub}</Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Amount */}
              <Text style={styles.lbl}>{t('amount')}</Text>
              <TextInput
                value={form.amount}
                onChangeText={(v) => setForm(f => ({ ...f, amount: v }))}
                placeholder={t('amountPlaceholder')}
                keyboardType="decimal-pad"
                style={styles.inp}
              />

              {/* Date */}
              <Text style={styles.lbl}>{t('date')}</Text>
              <DatePickerField
                value={form.expense_date}
                onChange={(iso) => setForm(f => ({ ...f, expense_date: iso }))}
              />

              {/* Vendor */}
              <Text style={styles.lbl}>{t('vendor')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={form.vendor}
                  onChangeText={(v) => setForm(f => ({ ...f, vendor: v }))}
                  placeholder={t('vendorPlaceholder')}
                  style={[styles.inp, { flex: 1 }]}
                />
                {activeVendors.length > 0 && (
                  <Pressable
                    onPress={() => setVendorPickerOpen(true)}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.tealSoft, justifyContent: 'center' }}
                  >
                    <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 13 }}>{t('pickVendorAction')}</Text>
                  </Pressable>
                )}
              </View>

              {/* Notes */}
              <Text style={styles.lbl}>{t('notes')}</Text>
              <TextInput
                value={form.notes}
                onChangeText={(v) => setForm(f => ({ ...f, notes: v }))}
                placeholder={t('notesPlaceholder')}
                multiline
                style={[styles.inp, { minHeight: 80, textAlignVertical: 'top' }]}
              />

              {/* Receipt */}
              <Text style={styles.lbl}>{t('receiptPhoto')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <Pressable onPress={takeReceiptPhoto} style={{ flex: 1, backgroundColor: COLORS.tealSoft, borderRadius: 10, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="camera-outline" size={18} color={COLORS.teal} />
                  <Text style={{ color: COLORS.teal, fontWeight: '700' }}>{t('receiptCamera')}</Text>
                </Pressable>
                <Pressable onPress={pickReceiptFromLibrary} style={{ flex: 1, backgroundColor: COLORS.navySoft, borderRadius: 10, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="image-outline" size={18} color={COLORS.navy} />
                  <Text style={{ color: COLORS.navy, fontWeight: '700' }}>{t('receiptLibrary')}</Text>
                </Pressable>
              </View>
              {(pendingReceipt || form.receipt_photo_url) && (
                <View style={{ marginBottom: 16, alignItems: 'center' }}>
                  <Image
                    source={{ uri: pendingReceipt?.uri || form.receipt_photo_url || '' }}
                    style={{ width: '100%', height: 180, borderRadius: 12, resizeMode: 'cover' }}
                  />
                  {pendingReceipt && (
                    <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 6 }}>{t('receiptNew')}</Text>
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  onPress={save}
                  disabled={saving}
                  style={{ flex: 1, backgroundColor: COLORS.navy, borderRadius: 14, padding: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '800' }}>{saving ? t('saving') : (editing ? t('update') : t('add'))}</Text>
                </Pressable>
                <Pressable onPress={closeForm} style={{ flex: 1, backgroundColor: COLORS.background, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Receipt photo viewer with pinch-zoom */}
      <ImageView
        images={receiptViewerUrl ? [{ uri: receiptViewerUrl }] : []}
        imageIndex={0}
        visible={!!receiptViewerUrl}
        onRequestClose={() => setReceiptViewerUrl(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />

      {/* Vendor picker modal */}
      <Modal visible={vendorPickerOpen} transparent animationType="fade" onRequestClose={() => setVendorPickerOpen(false)}>
        <Pressable onPress={() => setVendorPickerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>{t('pickVendor')}</Text>
              <Pressable onPress={() => setVendorPickerOpen(false)}><Ionicons name="close" size={22} color={COLORS.subtext} /></Pressable>
            </View>
            <ScrollView>
              {activeVendors.map(v => (
                <Pressable
                  key={v.id}
                  onPress={() => { setForm(f => ({ ...f, vendor: v.name })); setVendorPickerOpen(false) }}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{v.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setVendorPickerOpen(false)} style={{ marginTop: 12, padding: 12, alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 10 }}>
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = {
  lbl: { color: COLORS.subtext, fontSize: 12, fontWeight: '700' as const, marginBottom: 4, marginTop: 8 },
  inp: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, backgroundColor: COLORS.white, fontSize: 15 },
  pickerWrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.white, marginBottom: 4 },
}
