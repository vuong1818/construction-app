import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  red: '#EF4444',
  redSoft: '#FEF2F2',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

type UserProfile = {
  id: string
  full_name: string | null
  role: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  wage: number | null
}

type UserForm = {
  first_name: string
  last_name: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  zip: string
  wage: string
  role: 'worker' | 'manager'
}

const EMPTY_FORM: UserForm = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  street: '',
  city: '',
  state: 'TX',
  zip: '',
  wage: '',
  role: 'worker',
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.subtext}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        style={{
          backgroundColor: COLORS.white,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: COLORS.text,
        }}
      />
    </View>
  )
}

function RoleSelector({
  value,
  onChange,
}: {
  value: 'worker' | 'manager'
  onChange: (value: 'worker' | 'manager') => void
}) {
  const { t } = useLanguage()
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
        {t('role')}
      </Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={() => onChange('worker')}
          style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: value === 'worker' ? COLORS.navy : COLORS.white,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text
            style={{
              color: value === 'worker' ? COLORS.white : COLORS.text,
              fontWeight: '700',
            }}
          >
            {t('worker')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onChange('manager')}
          style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            backgroundColor: value === 'manager' ? COLORS.navy : COLORS.white,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text
            style={{
              color: value === 'manager' ? COLORS.white : COLORS.text,
              fontWeight: '700',
            }}
          >
            {t('manager')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function UserCard({
  user,
  onEdit,
  onDelete,
}: {
  user: UserProfile
  onEdit: (user: UserProfile) => void
  onDelete: (user: UserProfile) => void
}) {
  const { t } = useLanguage()
  const fullName =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
    user.full_name ||
    t('unnamedUser')

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            style={{
              color: COLORS.navy,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 6,
            }}
          >
            {fullName}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('roleLabel')} {user.role || 'worker'}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('emailLabel')} {user.email || t('emDash')}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('phoneLabel')} {user.phone || t('emDash')}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            {t('addressColon')} {[user.street, user.city, user.state, user.zip].filter(Boolean).join(', ') || t('emDash')}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            {t('wageLabel')} {user.wage !== null && user.wage !== undefined ? t('wagePerHour', { amount: Number(user.wage).toFixed(2) }) : t('emDash')}
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => onEdit(user)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: COLORS.tealSoft,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="pencil-outline" size={22} color={COLORS.teal} />
          </Pressable>

          <Pressable
            onPress={() => onDelete(user)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: COLORS.redSoft,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={COLORS.red} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

export default function WorkersManagerScreen() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')
  const [users, setUsers] = useState<UserProfile[]>([])

  const [modalVisible, setModalVisible] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)

  useEffect(() => {
    loadScreen()
  }, [])

  function setField<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingUserId(null)
  }

  const modalTitle = useMemo(() => {
    return editingUserId ? t('updateUser') : t('updateUser')
  }, [editingUserId, t])

  async function loadScreen() {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        setErrorMessage(t('mustBeSignedIn'))
        return
      }

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (meError) {
        setErrorMessage(meError.message)
        return
      }

      const role = me?.role || 'worker'
      setUserRole(role)

      if (role !== 'manager') {
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, role, first_name, last_name, phone, email, street, city, state, zip, wage'
        )
        .order('created_at', { ascending: true })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setUsers(data || [])
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToLoadUsers'))
    } finally {
      setLoading(false)
    }
  }

  function openEditModal(user: UserProfile) {
    setEditingUserId(user.id)
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      email: user.email || '',
      street: user.street || '',
      city: user.city || '',
      state: user.state || 'TX',
      zip: user.zip || '',
      wage: user.wage !== null && user.wage !== undefined ? String(user.wage) : '',
      role: user.role === 'manager' ? 'manager' : 'worker',
    })
    setModalVisible(true)
  }

  function validateForm() {
    if (!form.first_name.trim()) {
      Alert.alert(t('missingInformation'), t('firstNameRequired'))
      return false
    }

    if (!form.last_name.trim()) {
      Alert.alert(t('missingInformation'), t('lastNameRequired'))
      return false
    }

    if (!form.email.trim()) {
      Alert.alert(t('missingInformation'), t('emailRequired'))
      return false
    }

    if (form.wage.trim() && Number.isNaN(Number(form.wage))) {
      Alert.alert(t('invalidWage'), t('wageMustBeNumber'))
      return false
    }

    return true
  }

  async function handleSaveUser() {
    if (!editingUserId) {
      Alert.alert(t('noUserSelected'), t('pleaseChooseUser'))
      return
    }

    if (!validateForm()) return

    try {
      setSaving(true)

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        street: form.street.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || 'TX',
        zip: form.zip.trim() || null,
        wage: form.wage.trim() ? Number(form.wage) : null,
        role: form.role,
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUserId)

      if (error) {
        Alert.alert(t('updateError'), error.message)
        return
      }

      Alert.alert(t('success'), t('userUpdated'))
      setModalVisible(false)
      resetForm()
      await loadScreen()
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('couldNotUpdateUser'))
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteUser(user: UserProfile) {
    const fullName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      user.full_name ||
      t('thisUser')

    Alert.alert(
      t('deleteUserTitle'),
      t('deleteUserConfirm', { name: fullName }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true)

              const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', user.id)

              if (error) {
                Alert.alert(t('deleteError'), error.message)
                return
              }

              Alert.alert(t('success'), t('profileRowDeleted'))
              await loadScreen()
            } catch (error: any) {
              Alert.alert(t('error'), error?.message || t('couldNotDeleteProfile'))
            } finally {
              setSaving(false)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingUsers')}</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: COLORS.background,
        }}
      >
        <Text style={{ color: COLORS.red, fontWeight: '700', marginBottom: 10 }}>
          {t('error')}
        </Text>

        <Text style={{ color: COLORS.text, textAlign: 'center', marginBottom: 16 }}>
          {errorMessage}
        </Text>

        <Pressable
          onPress={loadScreen}
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>{t('retry')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (userRole !== 'manager') {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: COLORS.background,
        }}
      >
        <Text
          style={{
            color: COLORS.navy,
            fontSize: 24,
            fontWeight: '800',
            marginBottom: 10,
          }}
        >
          {t('managerOnly')}
        </Text>

        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          {t('noPermissionWorkers')}
        </Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.navy,
            borderRadius: 28,
            padding: 22,
            marginBottom: 18,
          }}
        >
          <Text
            style={{
              color: COLORS.white,
              fontSize: 28,
              fontWeight: '800',
              marginBottom: 6,
            }}
          >
            {t('workersTitle')}
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {t('workersIntro')}
          </Text>
        </View>

        <Pressable
          disabled
          style={{
            backgroundColor: '#94A3B8',
            borderRadius: 18,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 16 }}>
            {t('updateWorker')}
          </Text>
        </Pressable>

        {users.length === 0 ? (
          <View
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 20,
            }}
          >
            <Text style={{ color: COLORS.text, textAlign: 'center' }}>
              {t('noSubscribedUsers')}
            </Text>
          </View>
        ) : (
          users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={openEditModal}
              onDelete={handleDeleteUser}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setModalVisible(false)
          resetForm()
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.40)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              maxHeight: '90%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text
                style={{
                  color: COLORS.navy,
                  fontSize: 24,
                  fontWeight: '800',
                  marginBottom: 18,
                }}
              >
                {modalTitle}
              </Text>

              <Field
                label={t('firstNameField')}
                value={form.first_name}
                onChangeText={(text) => setField('first_name', text)}
                placeholder={t('firstNamePh')}
              />

              <Field
                label={t('lastNameField')}
                value={form.last_name}
                onChangeText={(text) => setField('last_name', text)}
                placeholder={t('lastNamePh')}
              />

              <Field
                label={t('phoneNumberField')}
                value={form.phone}
                onChangeText={(text) => setField('phone', text)}
                placeholder={t('phoneNumberPh')}
                keyboardType="phone-pad"
              />

              <Field
                label={t('emailField')}
                value={form.email}
                onChangeText={(text) => setField('email', text)}
                placeholder={t('emailPh')}
                keyboardType="email-address"
              />

              <Field
                label={t('streetField')}
                value={form.street}
                onChangeText={(text) => setField('street', text)}
                placeholder={t('streetAddressPh')}
              />

              <Field
                label={t('cityField')}
                value={form.city}
                onChangeText={(text) => setField('city', text)}
                placeholder={t('cityPh')}
              />

              <Field
                label={t('stateField')}
                value={form.state}
                onChangeText={(text) => setField('state', text)}
                placeholder={t('statePh')}
              />

              <Field
                label={t('zipField')}
                value={form.zip}
                onChangeText={(text) => setField('zip', text)}
                placeholder={t('zipPh')}
                keyboardType="numeric"
              />

              <Field
                label={t('wageField')}
                value={form.wage}
                onChangeText={(text) => setField('wage', text)}
                placeholder={t('wagePh')}
                keyboardType="numeric"
              />

              <RoleSelector
                value={form.role}
                onChange={(value) => setField('role', value)}
              />

              <View style={{ gap: 12, marginTop: 10 }}>
                <Pressable
                  onPress={handleSaveUser}
                  disabled={saving}
                  style={{
                    backgroundColor: saving ? '#94A3B8' : COLORS.navy,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 16,
                      fontWeight: '800',
                    }}
                  >
                    {saving ? t('saving') : t('updateWorker')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setModalVisible(false)
                    resetForm()
                  }}
                  style={{
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.subtext,
                      fontSize: 15,
                      fontWeight: '700',
                    }}
                  >
                    {t('cancel')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}