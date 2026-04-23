import { decode as atob } from 'base-64'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
  red: '#EF4444',
  redSoft: '#FEF2F2',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
  muted: '#94A3B8',
}

type CompanySettings = {
  id: number
  company_name: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  ein_number: string | null
  sales_tax_id: string | null
  logo_url: string | null
  company_email: string | null
}

type FormState = {
  company_name: string
  street: string
  city: string
  state: string
  zip: string
  ein_number: string
  sales_tax_id: string
  logo_url: string
  company_email: string
}

const EMPTY_FORM: FormState = {
  company_name: '',
  street: '',
  city: '',
  state: 'TX',
  zip: '',
  ein_number: '',
  sales_tax_id: '',
  logo_url: '',
  company_email: '',
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: COLORS.navy,
          fontWeight: '700',
          marginBottom: 8,
        }}
      >
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.subtext}
        autoCapitalize={autoCapitalize ?? 'words'}
        keyboardType={keyboardType ?? 'default'}
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

function extractStoragePathFromPublicUrl(publicUrl: string) {
  try {
    const marker = '/storage/v1/object/public/company-logos/'
    const index = publicUrl.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(publicUrl.slice(index + marker.length))
  } catch {
    return null
  }
}

async function uploadImageToCompanyLogos(uri: string, mimeType: string, fileName: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)
  const safeFileName = fileName.replace(/[^\w.-]/g, '_')
  const filePath = `company-logo-${Date.now()}-${safeFileName}`

  const { error } = await supabase.storage
    .from('company-logos')
    .upload(filePath, byteArray, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage.from('company-logos').getPublicUrl(filePath)

  return {
    filePath,
    publicUrl: data.publicUrl,
  }
}

export default function CompanyScreen() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')
  const [settingsId, setSettingsId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    loadScreen()
  }, [])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

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
        .from('company_settings')
        .select('id, company_name, street, city, state, zip, ein_number, sales_tax_id, logo_url, company_email')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (data) {
        setSettingsId(data.id)
        setForm({
          company_name: data.company_name || '',
          street: data.street || '',
          city: data.city || '',
          state: data.state || 'TX',
          zip: data.zip || '',
          ein_number: data.ein_number || '',
          sales_tax_id: data.sales_tax_id || '',
          logo_url: data.logo_url || '',
          company_email: data.company_email || '',
        })
      } else {
        setSettingsId(null)
        setForm(EMPTY_FORM)
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load company settings.')
    } finally {
      setLoading(false)
    }
  }

  async function ensureSettingsRow() {
    if (settingsId) return settingsId

    const { data, error } = await supabase
      .from('company_settings')
      .insert({
        company_name: form.company_name.trim() || null,
        street: form.street.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || 'TX',
        zip: form.zip.trim() || null,
        ein_number: form.ein_number.trim() || null,
        sales_tax_id: form.sales_tax_id.trim() || null,
        logo_url: form.logo_url.trim() || null,
        company_email: form.company_email.trim() || null,
      })
      .select('id')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    setSettingsId(data.id)
    return data.id
  }

  async function handleSave() {
    if (!form.company_name.trim()) {
      Alert.alert('Missing Information', 'Company name is required.')
      return
    }

    try {
      setSaving(true)

      const payload = {
        company_name: form.company_name.trim(),
        street: form.street.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || 'TX',
        zip: form.zip.trim() || null,
        ein_number: form.ein_number.trim() || null,
        sales_tax_id: form.sales_tax_id.trim() || null,
        logo_url: form.logo_url.trim() || null,
        company_email: form.company_email.trim() || null,
      }

      if (settingsId) {
        const { error } = await supabase
          .from('company_settings')
          .update(payload)
          .eq('id', settingsId)

        if (error) {
          Alert.alert('Update Error', error.message)
          return
        }
      } else {
        const { data, error } = await supabase
          .from('company_settings')
          .insert(payload)
          .select('id')
          .single()

        if (error) {
          Alert.alert('Save Error', error.message)
          return
        }

        setSettingsId(data.id)
      }

      Alert.alert('Success', 'Company settings updated.')
      await loadScreen()
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not save company settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePickLogo() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow access to photos.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      })

      if (result.canceled || !result.assets?.length) return

      setUploadingLogo(true)

      const asset = result.assets[0]
      const originalName = asset.fileName || `company-logo-${Date.now()}.jpg`
      const mimeType = asset.mimeType || 'image/jpeg'

      const oldLogoPath = form.logo_url ? extractStoragePathFromPublicUrl(form.logo_url) : null

      const uploaded = await uploadImageToCompanyLogos(
        asset.uri,
        mimeType,
        originalName
      )

      const rowId = await ensureSettingsRow()

      const { error: updateError } = await supabase
        .from('company_settings')
        .update({
          logo_url: uploaded.publicUrl,
        })
        .eq('id', rowId)

      if (updateError) {
        await supabase.storage.from('company-logos').remove([uploaded.filePath])
        Alert.alert('Logo Error', updateError.message)
        return
      }

      if (oldLogoPath) {
        await supabase.storage.from('company-logos').remove([oldLogoPath])
      }

      setField('logo_url', uploaded.publicUrl)
      Alert.alert('Success', 'Company logo updated.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not upload logo.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleDeleteLogo() {
    try {
      setSaving(true)

      const oldLogoPath = form.logo_url ? extractStoragePathFromPublicUrl(form.logo_url) : null

      if (settingsId) {
        const { error } = await supabase
          .from('company_settings')
          .update({ logo_url: null })
          .eq('id', settingsId)

        if (error) {
          Alert.alert('Delete Error', error.message)
          return
        }
      }

      if (oldLogoPath) {
        await supabase.storage.from('company-logos').remove([oldLogoPath])
      }

      setField('logo_url', '')
      Alert.alert('Success', 'Logo removed.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not remove logo.')
    } finally {
      setSaving(false)
    }
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
        <Text style={{ marginTop: 12, color: COLORS.text }}>
          Loading company settings...
        </Text>
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
          You do not have permission to view company settings.
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
            Company
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            Set up company information and manage the company logo.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            padding: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 18,
          }}
        >
          <Text
            style={{
              color: COLORS.navy,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 14,
            }}
          >
            Company Information
          </Text>

          <Field
            label="Company Name"
            value={form.company_name}
            onChangeText={(text) => setField('company_name', text)}
            placeholder="Company name"
          />

          <Field
            label="Street Address"
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
          />

          <Field
            label="EIN Number"
            value={form.ein_number}
            onChangeText={(text) => setField('ein_number', text)}
            placeholder="EIN number"
          />

          <Field
            label="Sales Tax ID"
            value={form.sales_tax_id}
            onChangeText={(text) => setField('sales_tax_id', text)}
            placeholder="Sales tax ID"
          />

          <Field
            label="Company Email"
            value={form.company_email}
            onChangeText={(text) => setField('company_email', text)}
            placeholder="company@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            padding: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 18,
          }}
        >
          <Text
            style={{
              color: COLORS.navy,
              fontSize: 20,
              fontWeight: '800',
              marginBottom: 14,
            }}
          >
            Company Logo
          </Text>

          {form.logo_url ? (
            <View
              style={{
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Image
                source={{ uri: form.logo_url }}
                style={{
                  width: 160,
                  height: 160,
                  resizeMode: 'contain',
                  backgroundColor: COLORS.white,
                  borderRadius: 18,
                }}
              />
            </View>
          ) : (
            <View
              style={{
                height: 160,
                borderRadius: 18,
                backgroundColor: COLORS.tealSoft,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ color: COLORS.subtext }}>No logo uploaded</Text>
            </View>
          )}

          <View style={{ gap: 12 }}>
            <Pressable
              onPress={handlePickLogo}
              disabled={uploadingLogo}
              style={{
                backgroundColor: uploadingLogo ? COLORS.muted : COLORS.teal,
                borderRadius: 18,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>
                {uploadingLogo ? 'Uploading Logo...' : form.logo_url ? 'Change Logo' : 'Add Logo'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDeleteLogo}
              disabled={saving || !form.logo_url}
              style={{
                backgroundColor: !form.logo_url ? '#F1F5F9' : COLORS.redSoft,
                borderRadius: 18,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: !form.logo_url ? COLORS.subtext : COLORS.red,
                  fontSize: 16,
                  fontWeight: '800',
                }}
              >
                Delete Logo
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: saving ? COLORS.muted : COLORS.navy,
                borderRadius: 18,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '800' }}>
                {saving ? 'Saving...' : 'Save Company Settings'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}