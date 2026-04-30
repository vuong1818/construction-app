import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,

  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProjectDetail } from '../../hooks/useProjectDetail'
import { formatProjectAddress } from '../../lib/formatAddress'
import { supabase } from '../../lib/supabase'
import type { DocType } from '../../services/projectDetailService'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  submittal: 'Submittal',
  change_order: 'Change Order',
  requirements: 'Requirements',
  other: 'Other',
}

const DOC_TYPE_BADGE: Record<DocType, { bg: string; color: string }> = {
  submittal:    { bg: '#E3F2FD', color: '#1565C0' },
  change_order: { bg: '#FFF3E0', color: '#E65100' },
  requirements: { bg: '#F3E5F5', color: '#6A1B9A' },
  other:        { bg: '#F4F7FA', color: '#555555' },
}

const COLORS = {
  background: '#D6E8FF',
  card: '#FFFFFF',
  navy: '#16356B',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',
  navySoft: '#EAF0F8',
  red: '#EF4444',
  text: '#0F172A',
  subtext: '#64748B',
  border: '#E2E8F0',
  white: '#FFFFFF',
}

function SectionTitle({
  icon,
  iconBg,
  iconColor,
  title,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginTop: 20 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 16,
          backgroundColor: iconBg,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 10,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={24} color={iconColor} />
      </View>

      <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text }}>
        {title}
      </Text>
    </View>
  )
}

function BigActionCard({
  icon,
  iconBg,
  iconColor,
  title,
  onPress,
  disabled = false,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: disabled ? '#CBD5E1' : COLORS.card,
        borderRadius: 22,
        paddingVertical: 22,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: iconBg,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={32} color={iconColor} />
      </View>

      <Text
        style={{
          color: COLORS.navy,
          fontWeight: '700',
          textAlign: 'center',
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  )
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)

  const {
    project,
    photos,
    plans,
    documents,
    reports,
    loading,
    uploading,
    errorMessage,
    plansModalVisible,
    reportsModalVisible,
    photosModalVisible,
    documentsModalVisible,
    selectedPhotoIndex,
    setPlansModalVisible,
    setReportsModalVisible,
    setPhotosModalVisible,
    setDocumentsModalVisible,
    pickPhotoFromLibrary,
    takePhotoWithCamera,
    uploadPlan,
    uploadDocument,
    handleOpenPlan,
    handleOpenDocument,
    handleDeleteDocument,
    openPhotoViewer,
    openPlansViewer,
    openReportsViewer,
    openDocumentsViewer,
    nextPhoto,
    prevPhoto,
    currentPhotoUrl,
  } = useProjectDetail(Number.isFinite(projectId) ? projectId : undefined)

  const [isManager, setIsManager] = useState(false)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      setIsManager(data?.role === 'manager')
    })()
  }, [])

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
        <Text style={{ marginTop: 12, color: COLORS.text }}>Loading project...</Text>
      </SafeAreaView>
    )
  }

  if (errorMessage && !project) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
          padding: 24,
        }}
      >
        <Text style={{ color: COLORS.red, marginBottom: 12, fontWeight: '700' }}>Error</Text>
        <Text style={{ color: COLORS.text, textAlign: 'center' }}>{errorMessage}</Text>
      </SafeAreaView>
    )
  }

  if (!project) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <Text style={{ color: COLORS.text }}>Project not found.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View
          style={{
            backgroundColor: COLORS.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: COLORS.navy }}>
              {project.name}
            </Text>
            {isManager && (
              <Pressable
                onPress={() => router.push(`/project/${id}/edit`)}
                style={{
                  marginLeft: 12,
                  backgroundColor: COLORS.tealSoft,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.teal} />
                <Text style={{ color: COLORS.teal, fontWeight: '800', fontSize: 13 }}>Edit</Text>
              </Pressable>
            )}
          </View>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            Address: {formatProjectAddress(project) || 'No address'}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            Status: {project.status || 'No status'}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            {project.description || 'No description'}
          </Text>
        </View>

        <SectionTitle
          icon="format-list-checks"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title="Tasks"
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="clipboard-list-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title="Open Tasks"
            onPress={() => router.push(`/project/${id}/tasks`)}
          />
        </View>

        <SectionTitle
          icon="file-pdf-box"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title="Plans"
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="file-eye-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title="View Plans"
            onPress={openPlansViewer}
          />
        </View>

        <SectionTitle
          icon="folder-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title="Documents"
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="file-document-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title="View Documents"
            onPress={openDocumentsViewer}
          />
          <BigActionCard
            icon="file-upload-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={uploading ? 'Working...' : 'Upload Document'}
            onPress={() => {
              Alert.alert('Document Type', 'What kind of document is this?', [
                { text: 'Submittal',    onPress: () => uploadDocument('submittal') },
                { text: 'Change Order', onPress: () => uploadDocument('change_order') },
                { text: 'Requirements', onPress: () => uploadDocument('requirements') },
                { text: 'Other',        onPress: () => uploadDocument('other') },
                { text: 'Cancel', style: 'cancel' },
              ])
            }}
            disabled={uploading}
          />
        </View>

        <SectionTitle
          icon="image-multiple-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title="Photos"
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="image-plus"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={uploading ? 'Working...' : 'Upload Photo'}
            onPress={pickPhotoFromLibrary}
            disabled={uploading}
          />
          <BigActionCard
            icon="camera-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={uploading ? 'Working...' : 'Take Photo'}
            onPress={takePhotoWithCamera}
            disabled={uploading}
          />
          <BigActionCard
            icon="image-search-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title="View Photo"
            onPress={openPhotoViewer}
          />
        </View>

        <SectionTitle
          icon="clipboard-text-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title="Daily Report"
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="clipboard-plus-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title="Create Report"
            onPress={() => router.push(`/project/${id}/new-report`)}
          />
          <BigActionCard
            icon="clipboard-search-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title="View Reports"
            onPress={openReportsViewer}
          />
        </View>
      </ScrollView>

      <Modal
        visible={plansModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPlansModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              maxHeight: '70%',
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>
              View Plans
            </Text>

            <ScrollView>
              {plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    setPlansModalVisible(false)
                    handleOpenPlan(plan)
                  }}
                  style={{
                    backgroundColor: COLORS.background,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>
                    {plan.original_name || plan.file_name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setPlansModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={documentsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDocumentsModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              maxHeight: '70%',
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>
              Documents
            </Text>

            <ScrollView>
              {documents.map((doc) => (
                <View
                  key={doc.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: COLORS.background,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    gap: 10,
                  }}
                >
                  <MaterialCommunityIcons name="file-document-outline" size={22} color={COLORS.navy} />
                  <Pressable
                    onPress={() => {
                      setDocumentsModalVisible(false)
                      handleOpenDocument(doc)
                    }}
                    style={{ flex: 1 }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: '700' }} numberOfLines={1}>
                      {doc.original_name || doc.file_name}
                    </Text>
                    {doc.doc_type && DOC_TYPE_LABELS[doc.doc_type as DocType] && (
                      <View style={{
                        alignSelf: 'flex-start',
                        marginTop: 4,
                        backgroundColor: DOC_TYPE_BADGE[doc.doc_type as DocType].bg,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 100,
                      }}>
                        <Text style={{ color: DOC_TYPE_BADGE[doc.doc_type as DocType].color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                          {DOC_TYPE_LABELS[doc.doc_type as DocType].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteDocument(doc)}
                    style={{
                      backgroundColor: '#FEF2F2',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.red} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setDocumentsModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reportsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportsModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              maxHeight: '70%',
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>
              View Reports
            </Text>

            <ScrollView>
              {reports.map((report) => (
                <Pressable
                  key={report.id}
                  onPress={() => {
                    setReportsModalVisible(false)
                    router.push(`/project/${id}/report/${report.id}`)
                  }}
                  style={{
                    backgroundColor: COLORS.background,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '700' }}>
                    {report.report_date}
                  </Text>
                  <Text style={{ color: COLORS.subtext, marginTop: 4 }}>
                    Prepared By: {report.created_by_name || 'Unknown'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setReportsModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={photosModalVisible}
        animationType="slide"
        onRequestClose={() => setPhotosModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
              {photos.length > 0 ? `${selectedPhotoIndex + 1} / ${photos.length}` : 'Photos'}
            </Text>

            <Pressable onPress={() => setPhotosModalVisible(false)}>
              <Ionicons name="close-circle" size={30} color="#FFFFFF" />
            </Pressable>
          </View>

          {photos.length > 0 && currentPhotoUrl ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Image
                source={{ uri: currentPhotoUrl }}
                style={{ width: '100%', height: '75%', resizeMode: 'contain' }}
              />

              <Text
                style={{
                  color: '#FFFFFF',
                  marginTop: 12,
                  paddingHorizontal: 16,
                  textAlign: 'center',
                }}
              >
                {photos[selectedPhotoIndex].original_name || photos[selectedPhotoIndex].file_name}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  width: '100%',
                  paddingHorizontal: 24,
                  marginTop: 20,
                }}
              >
                <Pressable
                  onPress={prevPhoto}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Previous</Text>
                </Pressable>

                <Pressable
                  onPress={nextPhoto}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Next</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}