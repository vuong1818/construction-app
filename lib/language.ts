import AsyncStorage from '@react-native-async-storage/async-storage'
import { Language } from './i18n'

const LANGUAGE_KEY = 'app_language'

export async function getSavedLanguage(): Promise<Language> {
  const value = await AsyncStorage.getItem(LANGUAGE_KEY)
  return value === 'es' ? 'es' : 'en'
}

export async function saveLanguage(language: Language) {
  await AsyncStorage.setItem(LANGUAGE_KEY, language)
}