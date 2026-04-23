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
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useCompanyLogo } from '../hooks/useCompanyLogo'
import { supabase } from '../lib/supabase'

const COLORS = {
  navy: '#16356B',
  white: '#FFFFFF',
  text: '#0F172A',
  border: '#D8E1EC',
  inputBg: 'rgba(255,255,255,0.95)',
  cardBg: 'rgba(255,255,255,0.18)',
  muted: '#94A3B8',
}

type Mode = 'login' | 'signup'

export default function SignInScreen() {
  const router = useRouter()
  const { logoUrl } = useCompanyLogo()

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
      Alert.alert('Missing Information', 'Please enter your email and password.')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        Alert.alert('Login Error', error.message)
        return
      }

      router.replace('/(tabs)')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateUser() {
    if (!firstName.trim()) {
      Alert.alert('Missing Information', 'Please enter first name.')
      return
    }

    if (!lastName.trim()) {
      Alert.alert('Missing Information', 'Please enter last name.')
      return
    }

    if (!email.trim()) {
      Alert.alert('Missing Information', 'Please enter email.')
      return
    }

    if (!password.trim()) {
      Alert.alert('Missing Information', 'Please enter password.')
      return
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Password and confirm password do not match.')
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
        Alert.alert('Create User Error', error.message)
        return
      }

      Alert.alert(
        'User Created',
        'Your account was created successfully. Please go back and log in with your email and password.'
      )

      setMode('login')
      setPassword('')
      setConfirmPassword('')
      setFirstName('')
      setLastName('')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleForgotPassword() {
    Alert.alert('Forgot Password', 'Password reset can be added next.')
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
                  {mode === 'login' ? 'Log In' : 'Create New User'}
                </Text>

                <Text
                  style={{
                    color: 'rgba(255,255,255,0.85)',
                    textAlign: 'center',
                  }}
                >
                  {mode === 'login'
                    ? 'Sign in to continue'
                    : 'New users are created with worker access by default'}
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
                      First Name
                    </Text>

                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="Enter first name"
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
                      Last Name
                    </Text>

                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Enter last name"
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
                  Email as User ID
                </Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
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
                  Password
                </Text>

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
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
                      Confirm Password
                    </Text>

                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm your password"
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
                        Remember me
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleForgotPassword}
                      style={{ marginBottom: 18 }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: '700' }}>
                        Forgot password?
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
                      ? mode === 'login'
                        ? 'Signing In...'
                        : 'Creating User...'
                      : mode === 'login'
                        ? 'Log In'
                        : 'Create New User'}
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
                    {mode === 'login'
                      ? 'Create New User'
                      : 'Back to Log In'}
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