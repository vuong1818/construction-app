import { decode as atob } from 'base-64'
import * as FileSystem from 'expo-file-system/legacy'
import * as Print from 'expo-print'
import { supabase } from './supabase'

type MeetingSigner = {
  signed_name: string | null
  signed_at: string | null
  signature_image?: string | null
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatSignedAt(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function normalizeSignatureImage(signatureImage?: string | null) {
  const trimmed = signatureImage?.trim() || ''
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

export async function generateAndUploadWeeklyMeetingPdf(params: {
  weekStart: string
  workWeekLabel: string
  topic: string
  signers: MeetingSigner[]
}) {
  const { weekStart, workWeekLabel, topic, signers } = params

  const rows =
    signers.length > 0
      ? signers
          .map(
            (item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.signed_name || '—'}</td>
                <td>${formatSignedAt(item.signed_at)}</td>
                <td>
                  ${
                    item.signature_image
                      ? `<img src="${normalizeSignatureImage(item.signature_image)}" style="width:160px;height:60px;object-fit:contain;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;" />`
                      : '—'
                  }
                </td>
              </tr>
            `
          )
          .join('')
      : `
        <tr>
          <td colspan="4">No worker signatures yet.</td>
        </tr>
      `

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
            margin-bottom: 8px;
          }
          h2 {
            color: #16356B;
            margin-top: 24px;
            margin-bottom: 8px;
          }
          .meta {
            margin-bottom: 16px;
            line-height: 1.6;
          }
          .topic-box {
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 14px;
            background: #F8FAFC;
            line-height: 1.6;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th, td {
            border: 1px solid #CBD5E1;
            padding: 10px;
            text-align: left;
            vertical-align: middle;
            font-size: 14px;
          }
          th {
            background: #EAF0F8;
            color: #16356B;
          }
        </style>
      </head>
      <body>
        <h1>Weekly Safety Meeting Sign-In</h1>

        <div class="meta">
          <div><strong>Work Week:</strong> ${workWeekLabel}</div>
          <div><strong>Week Start:</strong> ${weekStart}</div>
        </div>

        <h2>Weekly Safety Topic</h2>
        <div class="topic-box">${topic.replace(/\n/g, '<br/>')}</div>

        <h2>Worker Signatures</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Worker</th>
              <th>Signed At</th>
              <th>Signature</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  })

  const filePath = `weekly-meeting/week-${safeFileName(weekStart)}.pdf`
  return uploadPdfToStorage(uri, filePath)
}