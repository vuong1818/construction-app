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
import { useLanguage } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

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

import type { TranslationKey } from '../../lib/locales/en'

const LICENSE_TYPES = [
  'Electrical',
  'Mechanical',
  'Plumbing',
  'Building',
  'General Contractor',
  'HVAC',
  'Other',
] as const

const LICENSE_TYPE_KEY: Record<typeof LICENSE_TYPES[number], TranslationKey> = {
  'Electrical':         'ltElectrical',
  'Mechanical':         'ltMechanical',
  'Plumbing':           'ltPlumbing',
  'Building':           'ltBuilding',
  'General Contractor': 'ltGeneralContractor',
  'HVAC':               'ltHvac',
  'Other':              'ltOther',
}

type License = {
  id: number
  license_number: string
  license_type: string
  expiration_date: string | null
  notes: string | null
}

type NewLicense = {
  license_number: string
  license_type: string
  expiration_date: string
  notes: string
}

const EMPTY_LICENSE: NewLicense = {
  license_number: '',
  license_type: 'Electrical',
  expiration_date: '',
  notes: '',
}

function licenseExpiryStatus(dateStr: string | null) {
  if (!dateStr) return null
  const exp = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000)
  if (days < 0)  return { kind: 'expired'  as const, days: -days, color: '#C62828', bg: '#FFEBEE' }
  if (days < 60) return { kind: 'expiring' as const, days,        color: '#E65100', bg: '#FFF3E0' }
  return null
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
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [userRole, setUserRole] = useState('')
  const [settingsId, setSettingsId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [licenses, setLicenses] = useState<License[]>([])
  const [newLicense, setNewLicense] = useState<NewLicense>(EMPTY_LICENSE)
  const [savingLicense, setSavingLicense] = useState(false)

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

      await loadLicenses()
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToLoadCompanySettings'))
    } finally {
      setLoading(false)
    }
  }

  async function loadLicenses() {
    const { data, error } = await supabase
      .from('company_licenses')
      .select('id, license_number, license_type, expiration_date, notes')
      .order('expiration_date', { ascending: true, nullsFirst: false })
    if (error) {
      setErrorMessage(error.message)
      return
    }
    setLicenses((data as License[]) || [])
  }

  async function addLicense() {
    if (!newLicense.license_number.trim()) {
      Alert.alert(t('requiredTitle'), t('licenseNumberRequired'))
      return
    }
    setSavingLicense(true)
    const { error } = await supabase.from('company_licenses').insert({
      license_number:  newLicense.license_number.trim(),
      license_type:    newLicense.license_type,
      expiration_date: newLicense.expiration_date.trim() || null,
      notes:           newLicense.notes.trim() || null,
    })
    setSavingLicense(false)
    if (error) {
      Alert.alert(t('error'), error.message)
      return
    }
    setNewLicense(EMPTY_LICENSE)
    await loadLicenses()
  }

  function deleteLicense(lic: License) {
    Alert.alert(t('deleteLicenseTitle'), t('deleteLicenseConfirm', { number: lic.license_number }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('company_licenses').delete().eq('id', lic.id)
          if (error) { Alert.alert(t('error'), error.message); return }
          await loadLicenses()
        },
      },
    ])
  }

  function pickLicenseType() {
    Alert.alert(t('licenseTypeTitle'), undefined,
      [
        ...LICENSE_TYPES.map(lt => ({ text: t(LICENSE_TYPE_KEY[lt]), onPress: () => setNewLicense(prev => ({ ...prev, license_type: lt })) })),
        { text: t('cancel'), style: 'cancel' as const },
      ]
    )
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
      Alert.alert(t('missingInformation'), t('companyNameRequired'))
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
          Alert.alert(t('updateError'), error.message)
          return
        }
      } else {
        const { data, error } = await supabase
          .from('company_settings')
          .insert(payload)
          .select('id')
          .single()

        if (error) {
          Alert.alert(t('saveError'), error.message)
          return
        }

        setSettingsId(data.id)
      }

      Alert.alert(t('success'), t('companySettingsUpdated'))
      await loadScreen()
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('couldNotSaveCompanySettings'))
    } finally {
      setSaving(false)
    }
  }

  async function handlePickLogo() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(t('permissionNeededTitle'), t('pleaseAllowPhotosAccess'))
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
        Alert.alert(t('logoError'), updateError.message)
        return
      }

      if (oldLogoPath) {
        await supabase.storage.from('company-logos').remove([oldLogoPath])
      }

      setField('logo_url', uploaded.publicUrl)
      Alert.alert(t('success'), t('companyLogoUpdated'))
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('couldNotUploadLogo'))
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
          Alert.alert(t('deleteError'), error.message)
          return
        }
      }

      if (oldLogoPath) {
        await supabase.storage.from('company-logos').remove([oldLogoPath])
      }

      setField('logo_url', '')
      Alert.alert(t('success'), t('logoRemoved'))
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('couldNotRemoveLogo'))
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
          {t('loadingCompanySettings')}
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
          {t('noPermissionCompany')}
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
            {t('companyTitle')}
          </Text>

          <Text style={{ color: '#D9F6FB', lineHeight: 22 }}>
            {t('companyIntro')}
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
            {t('companyInformation')}
          </Text>

          <Field
            label={t('companyNameField')}
            value={form.company_name}
            onChangeText={(text) => setField('company_name', text)}
            placeholder={t('companyNamePh')}
          />

          <Field
            label={t('streetAddress')}
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
          />

          <Field
            label={t('einField')}
            value={form.ein_number}
            onChangeText={(text) => setField('ein_number', text)}
            placeholder={t('einPh')}
          />

          <Field
            label={t('salesTaxIdField')}
            value={form.sales_tax_id}
            onChangeText={(text) => setField('sales_tax_id', text)}
            placeholder={t('salesTaxIdPh')}
          />

          <Field
            label={t('companyEmailField')}
            value={form.company_email}
            onChangeText={(text) => setField('company_email', text)}
            placeholder={t('companyEmailPh')}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Licenses */}
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
          <Text style={{ color: COLORS.navy, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>
            {t('licensesCount', { count: licenses.length })}
          </Text>
          <Text style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 14 }}>
            {t('licensesHint')}
          </Text>

          {licenses.map(lic => {
            const status = licenseExpiryStatus(lic.expiration_date)
            const statusLabel = status
              ? (status.kind === 'expired'
                  ? t('expiredAgo', { days: status.days })
                  : t('expiresInDays', { days: status.days }))
              : ''
            const typeKey = LICENSE_TYPE_KEY[lic.license_type as typeof LICENSE_TYPES[number]]
            const typeLabel = typeKey ? t(typeKey) : lic.license_type
            return (
              <View key={lic.id} style={{ borderTopWidth: 1, borderColor: COLORS.border, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 14 }}>{lic.license_number}</Text>
                    <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                      <Text style={{ color: COLORS.subtext, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>{typeLabel.toUpperCase()}</Text>
                    </View>
                    {status && (
                      <View style={{ backgroundColor: status.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                        <Text style={{ color: status.color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>{statusLabel.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 4 }}>
                    {lic.expiration_date
                      ? t('expiresOn', { date: new Date(lic.expiration_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })
                      : t('noExpirationSet')}
                    {lic.notes ? ` · ${lic.notes}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => deleteLicense(lic)}
                  style={{ backgroundColor: COLORS.redSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: COLORS.red, fontWeight: '800', fontSize: 12 }}>{t('delete')}</Text>
                </Pressable>
              </View>
            )
          })}

          <View style={{ marginTop: licenses.length > 0 ? 14 : 0, paddingTop: licenses.length > 0 ? 14 : 0, borderTopWidth: licenses.length > 0 ? 1 : 0, borderColor: COLORS.border, gap: 10 }}>
            <Field
              label={t('licenseNumberField')}
              value={newLicense.license_number}
              onChangeText={(text) => setNewLicense(prev => ({ ...prev, license_number: text }))}
              placeholder={t('licenseNumberPh')}
            />
            <View>
              <Text style={{ color: COLORS.navy, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('licenseTypeLabel')}</Text>
              <Pressable onPress={pickLicenseType} style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.white }}>
                <Text style={{ color: COLORS.text, fontWeight: '700' }}>{t(LICENSE_TYPE_KEY[newLicense.license_type as typeof LICENSE_TYPES[number]] ?? 'ltOther')}</Text>
              </Pressable>
            </View>
            <Field
              label={t('expirationDateField')}
              value={newLicense.expiration_date}
              onChangeText={(text) => setNewLicense(prev => ({ ...prev, expiration_date: text }))}
              placeholder={t('expirationDatePh')}
            />
            <Field
              label={t('notesField')}
              value={newLicense.notes}
              onChangeText={(text) => setNewLicense(prev => ({ ...prev, notes: text }))}
              placeholder={t('notesPh')}
            />
            <Pressable
              onPress={addLicense}
              disabled={savingLicense || !newLicense.license_number.trim()}
              style={{ backgroundColor: !newLicense.license_number.trim() ? COLORS.muted : COLORS.teal, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
            >
              <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '800' }}>
                {savingLicense ? t('addingEllipsis') : t('addLicenseBtn')}
              </Text>
            </Pressable>
          </View>
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
            {t('companyLogo')}
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
              <Text style={{ color: COLORS.subtext }}>{t('noLogoUploaded')}</Text>
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
                {uploadingLogo ? t('uploadingLogo') : form.logo_url ? t('changeLogo') : t('addLogo')}
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
                {t('deleteLogo')}
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
                {saving ? t('saving') : t('saveCompanySettings')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}