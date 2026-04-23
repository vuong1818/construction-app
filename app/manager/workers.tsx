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
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: COLORS.navy, fontWeight: '700', marginBottom: 8 }}>
        Role
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
            Worker
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
            Manager
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
  const fullName =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
    user.full_name ||
    'Unnamed User'

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
            Role: {user.role || 'worker'}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            Email: {user.email || '—'}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            Phone: {user.phone || '—'}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 4 }}>
            Address: {[user.street, user.city, user.state, user.zip].filter(Boolean).join(', ') || '—'}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            Wage: {user.wage !== null && user.wage !== undefined ? `$${Number(user.wage).toFixed(2)}/hr` : '—'}
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
    return editingUserId ? 'Update User' : 'Update User'
  }, [editingUserId])

  async function loadScreen() {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        setErrorMessage('You must be signed in.')
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
      setErrorMessage(error?.message || 'Failed to load users.')
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
      Alert.alert('Missing Information', 'First name is required.')
      return false
    }

    if (!form.last_name.trim()) {
      Alert.alert('Missing Information', 'Last name is required.')
      return false
    }

    if (!form.email.trim()) {
      Alert.alert('Missing Information', 'Email is required.')
      return false
    }

    if (form.wage.trim() && Number.isNaN(Number(form.wage))) {
      Alert.alert('Invalid Wage', 'Wage must be a valid number.')
      return false
    }

    return true
  }

  async function handleSaveUser() {
    if (!editingUserId) {
      Alert.alert('No User Selected', 'Please choose a user to update.')
      return
    }

    if (!validateForm()) return

    try {
      setSaving(true)

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
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
        Alert.alert('Update Error', error.message)
        return
      }

      Alert.alert('Success', 'User updated.')
      setModalVisible(false)
      resetForm()
      await loadScreen()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not update user.')
    } finally {
      setSaving(false)
    }
  }

  function handleDeleteUser(user: UserProfile) {
    const fullName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      user.full_name ||
      'this user'

    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${fullName}'s profile row?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true)

              const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', user.id)

              if (error) {
                Alert.alert('Delete Error', error.message)
                return
              }

              Alert.alert('Success', 'Profile row deleted.')
              await loadScreen()
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Could not delete profile.')
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
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading users...</Text>
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
          Error
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
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>Retry</Text>
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
          Manager Only
        </Text>

        <Text style={{ color: COLORS.text, textAlign: 'center' }}>
          You do not have permission to view subscribed users.
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
            Workers
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            View subscribed users, update user information, change roles, and delete profile rows.
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
            Update Worker
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
              No subscribed users found.
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
                label="First Name"
                value={form.first_name}
                onChangeText={(text) => setField('first_name', text)}
                placeholder="First name"
              />

              <Field
                label="Last Name"
                value={form.last_name}
                onChangeText={(text) => setField('last_name', text)}
                placeholder="Last name"
              />

              <Field
                label="Phone Number"
                value={form.phone}
                onChangeText={(text) => setField('phone', text)}
                placeholder="Phone number"
                keyboardType="phone-pad"
              />

              <Field
                label="Email"
                value={form.email}
                onChangeText={(text) => setField('email', text)}
                placeholder="Email"
                keyboardType="email-address"
              />

              <Field
                label="Street"
                value={form.street}
                onChangeText={(text) => setField('street', text)}
                placeholder="Street address"
              />

              <Field
                label="City"
                value={form.city}
                onChangeText={(text) => setField('city', text)}
                placeholder="City"
              />

              <Field
                label="State"
                value={form.state}
                onChangeText={(text) => setField('state', text)}
                placeholder="TX"
              />

              <Field
                label="Zip"
                value={form.zip}
                onChangeText={(text) => setField('zip', text)}
                placeholder="Zip"
                keyboardType="numeric"
              />

              <Field
                label="Wage"
                value={form.wage}
                onChangeText={(text) => setField('wage', text)}
                placeholder="Hourly wage"
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
                    {saving ? 'Saving...' : 'Update Worker'}
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
                    Cancel
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