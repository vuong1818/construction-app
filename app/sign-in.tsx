import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCompanyLogo } from '../hooks/useCompanyLogo'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

type Mode = 'login' | 'signup'

export default function SignInScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()
  const { t } = useLanguage()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  function resetSignupFields() {
    setFirstName('')
    setLastName('')
    setConfirmPassword('')
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setPassword('')
    if (nextMode === 'login') {
      resetSignupFields()
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('missingInformation'), t('enterEmailPassword'))
      return
    }

    try {
      setLoading(true)

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        Alert.alert(t('loginError'), error.message)
        return
      }

      // Customers (project owners) belong on the web portal, not in the
      // field-worker mobile app. The web app gives them a curated read-only
      // view; here they would just see worker UI that doesn't apply to them.
      // Sign them out immediately and tell them where to go.
      const userId = signInData?.user?.id
      if (userId) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()
        if (prof?.role === 'customer') {
          await supabase.auth.signOut()
          Alert.alert(
            'Use the web portal',
            'Customer accounts sign in on the web at vuongthyanne.com. The mobile app is for field crews.',
          )
          return
        }
      }

      router.replace('/(tabs)')
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateUser() {
    if (!firstName.trim()) {
      Alert.alert(t('missingInformation'), t('enterFirstName'))
      return
    }

    if (!lastName.trim()) {
      Alert.alert(t('missingInformation'), t('enterLastName'))
      return
    }

    if (!email.trim()) {
      Alert.alert(t('missingInformation'), t('enterEmail'))
      return
    }

    if (!password.trim()) {
      Alert.alert(t('missingInformation'), t('enterPassword'))
      return
    }

    if (password.length < 6) {
      Alert.alert(t('weakPassword'), t('passwordMinLength'))
      return
    }

    if (password !== confirmPassword) {
      Alert.alert(t('passwordMismatch'), t('passwordsDontMatch'))
      return
    }

    try {
      setLoading(true)

      const normalizedEmail = email.trim().toLowerCase()

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      })

      if (error) {
        Alert.alert(t('createUserError'), error.message)
        return
      }

      Alert.alert(t('userCreated'), t('accountCreatedMessage'))

      setMode('login')
      setPassword('')
      setConfirmPassword('')
      setFirstName('')
      setLastName('')
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || t('somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    const emailToReset = email.trim().toLowerCase()
    if (!emailToReset) {
      Alert.alert(t('enterEmailFirst'), t('enterEmailForReset'))
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset)
      if (error) throw error
      Alert.alert(t('checkYourEmail') + ' 📬', t('resetLinkSent', { email: emailToReset }))
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('resetLinkFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#16356B', '#19B6D2']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                paddingHorizontal: 24,
                paddingVertical: 24,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: 32,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 16,
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    source={
                      logoUrl
                        ? { uri: logoUrl }
                        : require('../assets/images/company-logo.png')
                    }
                    style={{
                      width: 118,
                      height: 118,
                      resizeMode: 'contain',
                    }}
                  />
                </View>

                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 26,
                    fontWeight: '800',
                    marginBottom: 6,
                  }}
                >
                  {mode === 'login' ? t('login') : t('createNewUser')}
                </Text>

                <Text
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    textAlign: 'center',
                  }}
                >
                  {mode === 'login' ? t('signInToContinue') : t('newUserDefaultRole')}
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: COLORS.cardBg,
                  borderRadius: 28,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.22)',
                }}
              >
                {mode === 'signup' ? (
                  <>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontWeight: '700',
                        marginBottom: 8,
                        fontSize: 14,
                      }}
                    >
                      {t('firstName')}
                    </Text>

                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder={t('firstNamePlaceholder')}
                      placeholderTextColor="#7C8BA1"
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        fontSize: 16,
                        color: COLORS.text,
                        marginBottom: 16,
                        backgroundColor: COLORS.inputBg,
                      }}
                    />

                    <Text
                      style={{
                        color: COLORS.white,
                        fontWeight: '700',
                        marginBottom: 8,
                        fontSize: 14,
                      }}
                    >
                      {t('lastName')}
                    </Text>

                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder={t('lastNamePlaceholder')}
                      placeholderTextColor="#7C8BA1"
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        fontSize: 16,
                        color: COLORS.text,
                        marginBottom: 16,
                        backgroundColor: COLORS.inputBg,
                      }}
                    />
                  </>
                ) : null}

                <Text
                  style={{
                    color: COLORS.white,
                    fontWeight: '700',
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  {t('emailAsUserId')}
                </Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('emailPlaceholder')}
                  placeholderTextColor="#7C8BA1"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 16,
                    color: COLORS.text,
                    marginBottom: 16,
                    backgroundColor: COLORS.inputBg,
                  }}
                />

                <Text
                  style={{
                    color: COLORS.white,
                    fontWeight: '700',
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  {t('password')}
                </Text>

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('passwordPlaceholder')}
                  placeholderTextColor="#7C8BA1"
                  secureTextEntry
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 16,
                    color: COLORS.text,
                    marginBottom: 16,
                    backgroundColor: COLORS.inputBg,
                  }}
                />

                {mode === 'signup' ? (
                  <>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontWeight: '700',
                        marginBottom: 8,
                        fontSize: 14,
                      }}
                    >
                      {t('confirmPassword')}
                    </Text>

                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder={t('confirmPasswordPlaceholder')}
                      placeholderTextColor="#7C8BA1"
                      secureTextEntry
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        fontSize: 16,
                        color: COLORS.text,
                        marginBottom: 16,
                        backgroundColor: COLORS.inputBg,
                      }}
                    />
                  </>
                ) : null}

                {mode === 'login' ? (
                  <>
                    <Pressable
                      onPress={() => setRememberMe(!rememberMe)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          backgroundColor: rememberMe ? COLORS.white : 'transparent',
                          borderWidth: 1.5,
                          borderColor: COLORS.white,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 8,
                        }}
                      >
                        {rememberMe ? (
                          <Ionicons name="checkmark" size={14} color={COLORS.navy} />
                        ) : null}
                      </View>

                      <Text style={{ color: COLORS.white, fontWeight: '600' }}>
                        {t('rememberMe')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleForgotPassword}
                      style={{ marginBottom: 18 }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: '700' }}>
                        {t('forgotPassword')}
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                <Pressable
                  onPress={mode === 'login' ? handleLogin : handleCreateUser}
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? COLORS.muted : COLORS.navy,
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
                    {loading
                      ? mode === 'login' ? t('signingIn') : t('creatingUser')
                      : mode === 'login' ? t('login')     : t('createNewUser')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                  style={{
                    marginTop: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontWeight: '700',
                    }}
                  >
                    {mode === 'login' ? t('createNewUser') : t('backToLogIn')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  )
}