import { decode as atob } from 'base-64'
import { supabase } from './supabase'

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractBase64(signatureImage: string) {
  const trimmed = signatureImage.trim()
  if (!trimmed) {
    throw new Error('Signature image is empty.')
  }

  if (trimmed.startsWith('data:image')) {
    const commaIndex = trimmed.indexOf(',')
    if (commaIndex === -1) {
      throw new Error('Invalid signature image format.')
    }
    return trimmed.slice(commaIndex + 1)
  }

  return trimmed
}

export async function uploadSignatureImage(params: {
  signatureImage: string
  folder: string
  weekStart: string
  workerName: string
}) {
  const { signatureImage, folder, weekStart, workerName } = params
  const rawBase64 = extractBase64(signatureImage)

  const byteCharacters = atob(rawBase64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)
  const filePath = `${folder}/week-${safeFileName(weekStart)}-${safeFileName(workerName)}.png`

  const { error } = await supabase.storage
    .from('safety-pdfs')
    .upload(filePath, byteArray, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  const { data } = supabase.storage.from('safety-pdfs').getPublicUrl(filePath)

  return {
    publicUrl: data.publicUrl,
    storagePath: filePath,
  }
}