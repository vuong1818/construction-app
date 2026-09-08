import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import * as Updates from 'expo-updates'
import { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCompanyLogo } from '../hooks/useCompanyLogo'
import { WEB_BASE } from '../lib/config'
import { useLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

// The native build number comes from expo-application (a native module). It's
// required defensively so a build that doesn't include the native module yet
// (e.g. an OTA to an older binary) falls back to null instead of crashing.
let NATIVE_BUILD: string | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NATIVE_BUILD = require('expo-application').nativeBuildVersion ?? null
} catch {
  NATIVE_BUILD = null
}

// Shown on the login screen so support can tell which version/build/OTA a user is on.
function buildInfo(): string {
  const v = Constants.expoConfig?.version ?? '1.0.0'
  let channel = ''
  let upd = 'base'
  try {
    channel = (Updates.channel as string) || ''
    upd = Updates.updateId ? Updates.updateId.slice(0, 8) : 'base'
  } catch { /* dev / Expo Go */ }
  return [`v${v}`, NATIVE_BUILD ? `build ${NATIVE_BUILD}` : '', channel, upd].filter(Boolean).join(' · ')
}

export default function SignInScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()
  const { t } = useLanguage()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // There is no sign-up here on purpose. An account only means something once
  // it belongs to a company: every row this app reads and writes is scoped to
  // an org_id that the invitation carries. A self-served account arrives with
  // no company, so it could not clock in, see a job, or file a report — it
  // could only fail. Accounts are created by the company that will employ the
  // person, and the invitation email is what brings them here.
  //
  // This opens the help page, deliberately, and not the site's front page.
  // Subscriptions are sold there, and App Review treats a button pointing at a
  // purchase page as steering away from in-app purchase. Somebody who needs an
  // account needs to know how to get one, which is what /help tells them.
  function explainInviteOnly() {
    Alert.alert(
      t('needAnAccountTitle'),
      t('needAnAccountBody'),
      [
        { text: t('visitWebsite'), onPress: () => Linking.openURL('https://siteofficeiq.com/help') },
        { text: t('ok'), style: 'cancel' },
      ],
    )
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
        // Anybody can install this app now — the iOS link is a public TestFlight
        // invite and the Android APK is a public download — so "sign in failed"
        // is just as likely to mean "this email was never added to a company" as
        // "wrong password". Supabase deliberately will not say which, so the
        // message has to cover both without implying the account exists.
        const credentials = /invalid login credentials/i.test(error.message || '')
        if (credentials) {
          Alert.alert(
            'Cannot sign in',
            'Check your password.\n\n' +
            'If you have never been invited: this app signs you in against your ' +
            "company's crew list. Ask whoever runs SiteOfficeIQ at your company to " +
            'add you under Crew → Workers, and you will get an email invitation.\n\n' +
            'Bringing your own company? Start an account at siteofficeiq.com.',
          )
        } else {
          Alert.alert(t('loginError'), error.message)
        }
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
            'Customer accounts sign in on the web at app.siteofficeiq.com. The mobile app is for field crews.',
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

  async function handleForgotPassword() {
    const emailToReset = email.trim().toLowerCase()
    if (!emailToReset) {
      Alert.alert(t('enterEmailFirst'), t('enterEmailForReset'))
      return
    }
    try {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
        redirectTo: `${WEB_BASE}/reset-password`,
      })
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
                        : require('../assets/images/siteofficeiq-logo.png')
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
                  {t('login')}
                </Text>

                <Text
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    textAlign: 'center',
                  }}
                >
                  {t('signInToContinue')}
                </Text>

                <Text style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 11, marginTop: 8 }}>
                  {buildInfo()}
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

                <Pressable
                  onPress={handleLogin}
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
                    {loading ? t('signingIn') : t('login')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={explainInviteOnly}
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
                    {t('needAnAccountTitle')}
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