import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { supabase } from '../lib/supabase'

// One photo-upload path for the whole app.
//
// Task photos already worked; project photos and report photos had no upload at
// all — the project screen could only VIEW what the web had uploaded, and the
// report screens had no photo code whatsoever. There was even an unused
// "Upload Photo" string sitting in the locale files. Rather than write the
// pick-resize-upload-insert dance a third and fourth time, it lives here.
//
// Everything lands in project_photos, which already carries source_table /
// source_id, so a report photo attaches to its report without a new table.

export type PhotoTarget = {
  projectId: number
  /** Task photos keep using task_id; everything else uses source_table/source_id. */
  taskId?: number | null
  sourceTable?: string | null
  sourceId?: number | null
  /** Folder segment under project-<id>/ — keeps the bucket browsable. */
  folder: string
}

export type UploadResult = { ok: number; failures: string[] }

/**
 * Ask for camera or library, upload every chosen image, and insert a row per
 * photo. Returns counts rather than alerting, so each screen decides how loud
 * to be — except permissions, which are always worth an explanation.
 */
export async function pickAndUploadPhotos(
  from: 'camera' | 'library',
  target: PhotoTarget,
  userId: string | null,
): Promise<UploadResult> {
  let result: ImagePicker.ImagePickerResult

  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera access required', 'Enable camera access for this app in Settings to take photos.')
      return { ok: 0, failures: [] }
    }
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Photo access required', 'Enable photo access for this app in Settings to attach photos.')
      return { ok: 0, failures: [] }
    }
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true,
    })
  }

  if (result.canceled || !result.assets?.length) return { ok: 0, failures: [] }

  let ok = 0
  const failures: string[] = []

  for (const asset of result.assets) {
    try {
      const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase()
      const fileName = `${target.folder}-${Date.now()}-${ok + failures.length}.${ext}`
      const filePath = `project-${target.projectId}/${target.folder}/${fileName}`

      const resp = await fetch(asset.uri)
      if (!resp.ok) throw new Error('Could not read the photo file.')
      const arrayBuffer = await resp.arrayBuffer()

      const { error: upErr } = await supabase.storage
        .from('project-photos')
        .upload(filePath, arrayBuffer, { contentType: asset.mimeType || 'image/jpeg', upsert: false })
      if (upErr) throw new Error(upErr.message)

      const fileUrl = supabase.storage.from('project-photos').getPublicUrl(filePath).data.publicUrl

      const { error: dbErr } = await supabase.from('project_photos').insert({
        project_id: target.projectId,
        task_id: target.taskId ?? null,
        source_table: target.sourceTable ?? null,
        source_id: target.sourceId ?? null,
        source: 'mobile',
        file_path: filePath,
        file_url: fileUrl,
        uploaded_by: userId,
      })
      if (dbErr) {
        // Don't leave an object behind that no row points at.
        await supabase.storage.from('project-photos').remove([filePath]).catch(() => {})
        throw new Error(dbErr.message)
      }
      ok++
    } catch (e: any) {
      failures.push(e?.message || 'Unknown error')
    }
  }

  return { ok, failures }
}

/** Standard "how did it go" alert, so every screen reports the same way. */
export function reportUpload({ ok, failures }: UploadResult, noun = 'photo') {
  if (ok === 0 && failures.length === 0) return
  if (failures.length === 0) {
    Alert.alert('Upload complete', `${ok} ${noun}${ok === 1 ? '' : 's'} added.`)
  } else if (ok > 0) {
    Alert.alert('Partly uploaded', `${ok} added, ${failures.length} failed.\n\n${failures[0]}`)
  } else {
    Alert.alert('Upload failed', failures[0])
  }
}

/**
 * Camera-or-library prompt. Android users kept reporting "can't add photos",
 * and part of that was there being no obvious way in at all — so the entry
 * point is one button that asks.
 */
export function choosePhotoSource(onPick: (from: 'camera' | 'library') => void) {
  Alert.alert('Add photos', 'Take a new photo or choose from your library.', [
    { text: 'Take Photo', onPress: () => onPick('camera') },
    { text: 'Choose from Library', onPress: () => onPick('library') },
    { text: 'Cancel', style: 'cancel' },
  ])
}
