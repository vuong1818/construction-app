import { decode as atob } from 'base-64'
import * as FileSystem from 'expo-file-system/legacy'
import * as Print from 'expo-print'
import { supabase } from './supabase'

type GenerateManualPdfParams = {
  weekStart: string
  workerName: string
  signedAt: string
  manualTitle: string
  signatureImage: string
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeSignatureImage(signatureImage: string) {
  const trimmed = signatureImage.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:image')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `data:image/png;base64,${trimmed}`
}

async function uploadPdfToStorage(fileUri: string, filePath: string) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }

  const byteArray = new Uint8Array(byteNumbers)

  const { error } = await supabase.storage
    .from('safety-pdfs')
    .upload(filePath, byteArray, {
      contentType: 'application/pdf',
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

export async function generateAndUploadSafetyManualPdf({
  weekStart,
  workerName,
  signedAt,
  manualTitle,
  signatureImage,
}: GenerateManualPdfParams) {
  const formattedDate = new Date(signedAt).toLocaleString()
  const signatureSrc = normalizeSignatureImage(signatureImage)

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 20px; }
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #0F172A;
          }
          h1 {
            color: #16356B;
            margin-bottom: 12px;
          }
          .box {
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 14px;
            background: #F8FAFC;
            margin-bottom: 18px;
            line-height: 1.6;
          }
          .sig-wrap {
            margin-top: 24px;
          }
          .sig-line {
            margin-top: 18px;
            border-top: 1px solid #94A3B8;
            width: 280px;
            padding-top: 6px;
          }
          img.signature {
            width: 280px;
            height: 100px;
            object-fit: contain;
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            background: #FFFFFF;
          }
        </style>
      </head>
      <body>
        <h1>Safety Manual Acknowledgement</h1>

        <div class="box">
          <div><strong>Manual:</strong> ${manualTitle}</div>
          <div><strong>Work Week:</strong> ${weekStart}</div>
          <div><strong>Signed By:</strong> ${workerName}</div>
          <div><strong>Date:</strong> ${formattedDate}</div>
        </div>

        <p>
          I acknowledge that I have read and understand the company safety manual,
          and I agree to follow the company safety requirements for this work week.
        </p>

        <div class="sig-wrap">
          <div><strong>Signature:</strong></div>
          <img class="signature" src="${signatureSrc}" />
          <div class="sig-line">${workerName}</div>
        </div>
      </body>
    </html>
  `

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  })

  const filePath = `manual/week-${safeFileName(weekStart)}-${safeFileName(workerName)}.pdf`
  return uploadPdfToStorage(uri, filePath)
}