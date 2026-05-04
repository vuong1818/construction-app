import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import ImageView from 'react-native-image-viewing'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProjectDetail } from '../../hooks/useProjectDetail'
import { useProjectFinance } from '../../hooks/useProjectFinance'
import { formatProjectAddress } from '../../lib/formatAddress'
import { useLanguage, type TranslationKey } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { getPhotoUrl, type DocType } from '../../services/projectDetailService'

const DOC_TYPE_LABEL_KEYS: Record<DocType, TranslationKey> = {
  submittal:    'docTypeSubmittal',
  change_order: 'docTypeChangeOrder',
  requirements: 'docTypeRequirements',
  admin:        'docTypeAdmin',
  other:        'docTypeOther',
}

const DOC_TYPE_BADGE: Record<DocType, { bg: string; color: string }> = {
  submittal:    { bg: '#E3F2FD', color: '#1565C0' },
  change_order: { bg: '#FFF3E0', color: '#E65100' },
  requirements: { bg: '#F3E5F5', color: '#6A1B9A' },
  admin:        { bg: '#FFE0E0', color: '#B71C1C' },
  other:        { bg: '#F4F7FA', color: '#555555' },
}

const PLAN_TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  architectural: { bg: '#E3F2FD', color: '#1565C0', label: 'Architectural' },
  civil:         { bg: '#E0F2F1', color: '#00695C', label: 'Civil' },
  structural:    { bg: '#FCE4EC', color: '#AD1457', label: 'Structural' },
  electrical:    { bg: '#FFF8E1', color: '#F57F17', label: 'Electrical' },
  mechanical:    { bg: '#EDE7F6', color: '#4527A0', label: 'Mechanical' },
  plumbing:      { bg: '#E1F5FE', color: '#0277BD', label: 'Plumbing' },
  redline:       { bg: '#FFEBEE', color: '#C62828', label: 'Redline' },
  landscape:     { bg: '#E8F5E9', color: '#2E7D32', label: 'Landscape' },
  other:         { bg: '#F4F7FA', color: '#555555', label: 'Other' },
  mep:           { bg: '#EDE7F6', color: '#4527A0', label: 'MEP' },
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

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function FinanceRow({ label, value, tint, bold = false }: { label: string; value: number; tint: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: bold ? '700' : '500' }}>{label}</Text>
      <Text style={{ color: tint, fontSize: 14, fontWeight: bold ? '900' : '700' }}>{fmtMoney(value)}</Text>
    </View>
  )
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const projectId = Number(id)
  const { t } = useLanguage()

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
    uploadDocument,
    handleOpenPlan,
    handleDeletePlan,
    handleOpenDocument,
    handleDeleteDocument,
    openPhotoViewer,
    openPlansViewer,
    openReportsViewer,
    openDocumentsViewer,
    savePhotoCaption,
    handleDeletePhoto,
    currentUserId,
  } = useProjectDetail(Number.isFinite(projectId) ? projectId : undefined)

  const { totals: financeTotals } = useProjectFinance(Number.isFinite(projectId) ? projectId : undefined)

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

  // Photo viewer state — pinch-to-zoom + swipe via react-native-image-viewing.
  const [photoIndex, setPhotoIndex] = useState(0)
  const [captionEditing, setCaptionEditing] = useState(false)
  const [captionDraft, setCaptionDraft] = useState('')
  const [captionSaving, setCaptionSaving] = useState(false)
  useEffect(() => { setPhotoIndex(selectedPhotoIndex) }, [selectedPhotoIndex])
  useEffect(() => { setCaptionEditing(false) }, [photoIndex])

  const photoImages = useMemo(
    () => photos.map(p => ({ uri: getPhotoUrl(p) })),
    [photos]
  )

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
        <Text style={{ marginTop: 12, color: COLORS.text }}>{t('loadingProject')}</Text>
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
        <Text style={{ color: COLORS.red, marginBottom: 12, fontWeight: '700' }}>{t('error')}</Text>
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
        <Text style={{ color: COLORS.text }}>{t('projectNotFound')}</Text>
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
                <Text style={{ color: COLORS.teal, fontWeight: '800', fontSize: 13 }}>{t('edit')}</Text>
              </Pressable>
            )}
          </View>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            {t('address')}: {formatProjectAddress(project) || t('noAddress')}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            {t('status')}: {project.status || t('noStatus')}
          </Text>

          <Text style={{ color: COLORS.subtext }}>
            {project.description || t('noDescription')}
          </Text>
        </View>

        <SectionTitle
          icon="format-list-checks"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('tasks')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="clipboard-list-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={isManager ? t('openTasks') : t('myTasks')}
            onPress={() => router.push(`/project/${id}/tasks`)}
          />
          <BigActionCard
            icon="calendar-month-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={t('projectSchedule')}
            onPress={() => router.push(`/project/${id}/schedule`)}
          />
        </View>

        <SectionTitle
          icon="file-pdf-box"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title={t('plans')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="file-eye-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('viewPlans')}
            onPress={openPlansViewer}
          />
        </View>

        <SectionTitle
          icon="folder-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title={t('documents')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="file-document-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('viewDocuments')}
            onPress={openDocumentsViewer}
          />
          <BigActionCard
            icon="file-upload-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={uploading ? t('workingEllipsis') : t('uploadDocument')}
            onPress={() => {
              const buttons: any[] = [
                { text: t('docTypeSubmittal'),    onPress: () => uploadDocument('submittal') },
                { text: t('docTypeChangeOrder'),  onPress: () => uploadDocument('change_order') },
                { text: t('docTypeRequirements'), onPress: () => uploadDocument('requirements') },
              ]
              if (isManager) {
                buttons.push({ text: t('docTypeAdmin'), onPress: () => uploadDocument('admin') })
              }
              buttons.push({ text: t('docTypeOther'), onPress: () => uploadDocument('other') })
              buttons.push({ text: t('cancel'), style: 'cancel' })
              Alert.alert(t('documentType'), t('documentTypePrompt'), buttons)
            }}
            disabled={uploading}
          />
        </View>

        <SectionTitle
          icon="image-multiple-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('photos')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="image-plus"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={uploading ? t('workingEllipsis') : t('uploadPhoto')}
            onPress={pickPhotoFromLibrary}
            disabled={uploading}
          />
          <BigActionCard
            icon="camera-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={uploading ? t('workingEllipsis') : t('takePhoto')}
            onPress={takePhotoWithCamera}
            disabled={uploading}
          />
          <BigActionCard
            icon="image-search-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('viewPhoto')}
            onPress={openPhotoViewer}
          />
        </View>

        <SectionTitle
          icon="receipt-text-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('expenses')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="cash-plus"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={isManager ? `${t('view')} / ${t('add')} ${t('expenses')}` : t('myExpenses')}
            onPress={() => router.push(`/project/${id}/expenses`)}
          />
        </View>

        <SectionTitle
          icon="clipboard-text-outline"
          iconBg={COLORS.tealSoft}
          iconColor={COLORS.teal}
          title={t('dailyReport')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="clipboard-plus-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('createReport')}
            onPress={() => router.push(`/project/${id}/new-report`)}
          />
          <BigActionCard
            icon="clipboard-search-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={t('viewReports')}
            onPress={openReportsViewer}
          />
        </View>

        {isManager && (
          <>
            <SectionTitle
              icon="cash-multiple"
              iconBg={COLORS.tealSoft}
              iconColor={COLORS.teal}
              title={t('finance')}
            />
            <View
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 22,
                padding: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <FinanceRow label={t('contract')}      value={financeTotals.contract}      tint="#1565C0" />
              <FinanceRow label={t('changeOrders')}  value={financeTotals.changeOrders}  tint="#E65100" />
              <FinanceRow label={t('totalContract')} value={financeTotals.totalContract} tint="#2E7D32" bold />
              <FinanceRow label={t('expenses')}      value={financeTotals.expenses}      tint="#C62828" />
              {financeTotals.accountsReceivable > 0 && (
                <FinanceRow label={t('accountsReceivable')} value={financeTotals.accountsReceivable} tint="#E65100" />
              )}
              {financeTotals.accountsPayable > 0 && (
                <FinanceRow label={t('accountsPayable')} value={financeTotals.accountsPayable} tint="#C62828" />
              )}
              <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
              <FinanceRow label={t('net')} value={financeTotals.net} tint={financeTotals.net >= 0 ? '#2E7D32' : '#C62828'} bold />
              {financeTotals.payAppCount > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: COLORS.subtext, fontSize: 13, fontWeight: '700' }}>
                      {t('payAppsBilled', { count: financeTotals.payAppCount })}
                    </Text>
                    <Text style={{ color: '#1565C0', fontSize: 14, fontWeight: '900' }}>{fmtMoney(financeTotals.billedToDate)}</Text>
                  </View>
                </>
              )}
              <Text style={{ color: COLORS.subtext, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                {t('financeNote')}
              </Text>
            </View>
          </>
        )}
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
              {t('viewPlans')}
            </Text>

            <ScrollView>
              {plans.map((plan) => {
                const badge = plan.plan_type ? PLAN_TYPE_BADGE[plan.plan_type] : null
                return (
                  <View
                    key={plan.id}
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
                    <MaterialCommunityIcons name="file-pdf-box" size={22} color={COLORS.navy} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '700' }} numberOfLines={1}>
                        {plan.original_name || plan.file_name}
                      </Text>
                      {badge && (
                        <View style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 }}>
                          <Text style={{ color: badge.color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                            {badge.label.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Pressable
                      onPress={() => {
                        setPlansModalVisible(false)
                        handleOpenPlan(plan)
                      }}
                      style={{ backgroundColor: COLORS.tealSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ color: COLORS.teal, fontWeight: '800', fontSize: 12 }}>{t('view')}</Text>
                    </Pressable>
                    {isManager && (
                      <Pressable
                        onPress={() => handleDeletePlan(plan)}
                        style={{ backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                      >
                        <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12 }}>{t('delete')}</Text>
                      </Pressable>
                    )}
                  </View>
                )
              })}
            </ScrollView>

            <Pressable
              onPress={() => setPlansModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t('close')}</Text>
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
              {t('documents')}
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
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700' }} numberOfLines={1}>
                      {doc.original_name || doc.file_name}
                    </Text>
                    {doc.doc_type && DOC_TYPE_LABEL_KEYS[doc.doc_type as DocType] && (
                      <View style={{
                        alignSelf: 'flex-start',
                        marginTop: 4,
                        backgroundColor: DOC_TYPE_BADGE[doc.doc_type as DocType].bg,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 100,
                      }}>
                        <Text style={{ color: DOC_TYPE_BADGE[doc.doc_type as DocType].color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
                          {t(DOC_TYPE_LABEL_KEYS[doc.doc_type as DocType]).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      setDocumentsModalVisible(false)
                      handleOpenDocument(doc)
                    }}
                    style={{ backgroundColor: COLORS.tealSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                  >
                    <Text style={{ color: COLORS.teal, fontWeight: '800', fontSize: 12 }}>View</Text>
                  </Pressable>
                  {isManager && (
                    <Pressable
                      onPress={() => handleDeleteDocument(doc)}
                      style={{ backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12 }}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setDocumentsModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t('close')}</Text>
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
              {t('viewReports')}
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
                    {t('preparedBy')}: {report.created_by_name || t('unknown')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setReportsModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 14 }}
            >
              <Text style={{ color: COLORS.subtext, fontWeight: '700' }}>{t('close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ImageView
        images={photoImages}
        imageIndex={photoIndex}
        visible={photosModalVisible && photos.length > 0}
        onRequestClose={() => setPhotosModalVisible(false)}
        onImageIndexChange={setPhotoIndex}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        HeaderComponent={({ imageIndex }) => (
          <SafeAreaView edges={['top']} style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                {photos.length > 0 ? `${imageIndex + 1} / ${photos.length}` : t('photos')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {(isManager || (currentUserId != null && photos[imageIndex]?.uploaded_by === currentUserId)) && (
                  <Pressable onPress={() => photos[imageIndex] && handleDeletePhoto(photos[imageIndex])}>
                    <Ionicons name="trash-outline" size={26} color="#FFFFFF" />
                  </Pressable>
                )}
                <Pressable onPress={() => setPhotosModalVisible(false)}>
                  <Ionicons name="close-circle" size={30} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        )}
        FooterComponent={({ imageIndex }) => {
          const photo = photos[imageIndex]
          if (!photo) return null
          const canEdit = isManager || (currentUserId != null && photo.uploaded_by === currentUserId)
          return (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 16}
            >
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                {captionEditing && canEdit ? (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
                    <TextInput
                      autoFocus
                      multiline
                      value={captionDraft}
                      onChangeText={setCaptionDraft}
                      placeholder={t('addPhotoNotePlaceholder')}
                      placeholderTextColor="#aaa"
                      style={{ color: '#FFFFFF', fontSize: 14, minHeight: 50 }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable
                        disabled={captionSaving}
                        onPress={async () => {
                          setCaptionSaving(true)
                          try {
                            await savePhotoCaption(photo.id, captionDraft)
                            setCaptionEditing(false)
                          } finally { setCaptionSaving(false) }
                        }}
                        style={{ backgroundColor: '#19B6D2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{captionSaving ? t('saving') : t('save')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCaptionEditing(false)}
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      if (!canEdit) return
                      setCaptionDraft(photo.caption || '')
                      setCaptionEditing(true)
                    }}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: 10,
                      flexDirection: 'row',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <MaterialCommunityIcons name="note-text-outline" size={18} color="#FFFFFF" />
                    <Text style={{ color: photo.caption ? '#FFFFFF' : '#aaa', fontSize: 14, flex: 1 }}>
                      {photo.caption || (canEdit ? t('addPhotoNote') : t('noPhotoNote'))}
                    </Text>
                    {canEdit && <Text style={{ color: '#19B6D2', fontWeight: '700', fontSize: 12 }}>{photo.caption ? t('edit') : t('add')}</Text>}
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
            </KeyboardAvoidingView>
          )
        }}
      />
    </SafeAreaView>
  )
}