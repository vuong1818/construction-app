import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

export default function ChangePassword() {
  const { t } = useLanguage()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (pw.length < 6) { Alert.alert(t('weakPassword'), t('passwordMinLength')); return }
    if (pw !== pw2) { Alert.alert(t('passwordMismatch'), t('passwordsDontMatch')); return }
    try {
      setLoading(true)
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) { Alert.alert(t('error'), error.message); return }
      Alert.alert(t('passwordChanged'), t('passwordChangedMessage'), [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert(t('error'), e?.message || t('somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 14,
  } as const

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 }}>
              {t('changePassword')}
            </Text>
            <Text style={{ color: COLORS.subtext, marginBottom: 20, lineHeight: 20 }}>
              {t('passwordMinLength')}
            </Text>

            <TextInput
              style={inputStyle}
              placeholder={t('newPassword')}
              placeholderTextColor={COLORS.subtext}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={pw}
              onChangeText={setPw}
            />
            <TextInput
              style={inputStyle}
              placeholder={t('confirmNewPassword')}
              placeholderTextColor={COLORS.subtext}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={pw2}
              onChangeText={setPw2}
            />

            <Pressable
              onPress={submit}
              disabled={loading}
              style={{ backgroundColor: loading ? '#94A3B8' : COLORS.green, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 6 }}
            >
              {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>{t('updatePassword')}</Text>}
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ paddingVertical: 16, alignItems: 'center', marginTop: 2 }}>
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t('close')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
