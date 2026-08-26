import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useLinkedShare, useProjectGrant } from '../../hooks/useProjectGrant'
import { useProjectFinance } from '../../hooks/useProjectFinance'
import { formatProjectAddress } from '../../lib/formatAddress'
import { useLanguage, type TranslationKey } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { getPhotoUrl, type DocType } from '../../services/projectDetailService'
import { choosePhotoSource, pickAndUploadPhotos, reportUpload } from '../../services/photoUpload'
import { COLORS } from '../../lib/theme'

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
    uploadDocument,
    handleOpenPlan,
    handleDeletePlan,
    handleOpenDocument,
    handleDeleteDocument,
    // openPhotoViewer is no longer used here: the Photos tile opens the
    // contact sheet, and the full-screen viewer is entered from a tile on it.
    openPlansViewer,
    openReportsViewer,
    openDocumentsViewer,
    savePhotoCaption,
    handleDeletePhoto,
    currentUserId,
    refreshAll,
  } = useProjectDetail(Number.isFinite(projectId) ? projectId : undefined)

  const { totals: financeTotals } = useProjectFinance(Number.isFinite(projectId) ? projectId : undefined)

  // Another company's job, reached through a grant. Same rule as the web: a
  // grant OUTRANKS our own role here, because being a manager at our company
  // says nothing about theirs.
  const { grant, isGranted } = useProjectGrant(Number.isFinite(projectId) ? projectId : undefined)
  // The other direction: this is OUR job, standing in for one another company
  // shared with us. Their row is folded out of the list, so without a door here
  // the crew has no way to reach the job kit they were actually given.
  const { grant: linkedShare } = useLinkedShare(Number.isFinite(projectId) ? projectId : undefined)

  const [isOwnCompanyManager, setIsOwnCompanyManager] = useState(false)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      setIsOwnCompanyManager(['manager', 'owner'].includes(String(data?.role)))
    })()
  }, [])
  const isManager = isOwnCompanyManager && !isGranted

  // What a subcontractor may actually do here, straight off the grant. Every
  // one of these is enforced by RLS too — this only stops the screen offering
  // a button that would come back refused.
  const canAddPhotos    = !isGranted || !!grant?.can_add_photos
  // On a shared jobsite every stored path needs the OWNER's org on the front,
  // or storage answers "not found" for all of it. See lib/storageUrl.ts.
  const fileOwnerOrg = isGranted ? ((project as any)?.org_id ?? null) : null
  const canCreateReport = !isGranted || !!grant?.can_create_reports
  const canRaiseRfi     = !isGranted || !!grant?.can_create_rfis

  // Open Google Maps directions to the jobsite — prefers precise lat/long, else the
  // address. Errors out when the project has neither.
  function openProjectMap() {
    const lat = (project as any)?.latitude
    const lng = (project as any)?.longitude
    const addr = formatProjectAddress(project)
    let destination: string | null = null
    if (lat != null && lng != null) destination = `${lat},${lng}`
    else if (addr.trim()) destination = addr.trim()
    if (!destination) { Alert.alert(t('mapNoAddressTitle'), t('mapNoAddressMsg')); return }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    Linking.openURL(url).catch(() => Alert.alert(t('mapNoAddressTitle'), t('couldNotOpen')))
  }

  // Photo viewer state — pinch-to-zoom + swipe via react-native-image-viewing.
  const [photoIndex, setPhotoIndex] = useState(0)
  // The gallery opens on a CONTACT SHEET, not on photo one of forty. Swiping
  // through in order is how you look at a holiday album; on a jobsite you are
  // hunting for one specific picture, and you recognise it by sight.
  const [photoGridVisible, setPhotoGridVisible] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [captionEditing, setCaptionEditing] = useState(false)
  const [captionDraft, setCaptionDraft] = useState('')
  const [captionSaving, setCaptionSaving] = useState(false)
  useEffect(() => { setPhotoIndex(selectedPhotoIndex) }, [selectedPhotoIndex])
  useEffect(() => { setCaptionEditing(false) }, [photoIndex])

  // Signing is a round trip, so the gallery resolves its uris once per photo
  // set rather than per render. Unresolved entries stay out — the lightbox
  // would otherwise be handed { uri: '' } and sit spinning.
  //
  // The row travels WITH its url. It used to be two arrays, one filtered and
  // one not, so a single unsignable photo shifted every index after it: the
  // caption you edited and the photo you deleted were the next one along.
  const [gallery, setGallery] = useState<{ uri: string; photo: (typeof photos)[number] }[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(
      photos.map(async p => {
        try {
          const uri = await getPhotoUrl(p, fileOwnerOrg)
          return uri ? { uri, photo: p } : null
        } catch {
          return null
        }
      }),
    )
      .then(rows => { if (alive) setGallery(rows.filter(Boolean) as { uri: string; photo: (typeof photos)[number] }[]) })
      .catch(() => { if (alive) setGallery([]) })
    return () => { alive = false }
  }, [photos, fileOwnerOrg])
  const photoImages = useMemo(() => gallery.map(g => ({ uri: g.uri })), [gallery])

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
        {/* Said at the top, in the crew's face, because the most expensive
            mistake available on this screen is filing work against the wrong
            company's job. */}
        {isGranted && (
          <View
            style={{
              backgroundColor: '#F3E5F5',
              borderColor: '#E1BEE7',
              borderWidth: 1,
              borderRadius: 20,
              padding: 16,
              marginBottom: 14,
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <MaterialCommunityIcons name="handshake-outline" size={24} color="#7B1FA2" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#4A148C', fontWeight: '800', fontSize: 15 }}>
                {`Shared by ${grant?.owner_org_name || 'another company'}`}
              </Text>
              <Text style={{ color: '#6A1B9A', marginTop: 4, lineHeight: 20 }}>
                You are working on their jobsite. Their costs and other projects are not shown here, and your
                hours, pay and expenses are never shown to them.
              </Text>
            </View>
          </View>
        )}

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

          {project.reference_no ? (
            <View style={{ alignSelf: 'flex-start', backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 }}>
              <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 }}>{project.reference_no}</Text>
            </View>
          ) : null}

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            {t('address')}: {formatProjectAddress(project) || t('noAddress')}
          </Text>

          <Text style={{ color: COLORS.text, marginBottom: 6 }}>
            {t('status')}: {project.status || t('noStatus')}
          </Text>

          <Text style={{ color: COLORS.subtext, marginBottom: 14 }}>
            {project.description || t('noDescription')}
          </Text>

          {/* Directions belong with the address, not in a section of their own —
              the address is what you are acting on when you tap it. */}
          <Pressable
            onPress={openProjectMap}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: COLORS.tealSoft,
              borderRadius: 14,
              paddingVertical: 14,
            }}
          >
            <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={COLORS.teal} />
            <Text style={{ color: COLORS.teal, fontWeight: '800', fontSize: 15 }}>{t('openInMaps')}</Text>
          </Pressable>
        </View>

        {/* Job Kit leads: it is the scope everything else on this screen is
            derived from, so it gets the accent and the first slot. */}
        <SectionTitle
          icon="folder-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title={t('documents')}
        />

        {linkedShare && (
          <Pressable
            onPress={() => router.push(`/project/${linkedShare.project_id}`)}
            style={{
              backgroundColor: '#F3E5F5',
              borderColor: '#CE93D8',
              borderWidth: 1,
              borderRadius: 20,
              padding: 16,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <MaterialCommunityIcons name="handshake-outline" size={28} color="#7B1FA2" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#4A148C', fontWeight: '800', fontSize: 16 }}>
                {`Working for ${linkedShare.owner_org_name || 'another company'}`}
              </Text>
              <Text style={{ color: '#6A1B9A', marginTop: 3, lineHeight: 20 }}>
                Their plans, reports and job kits are on their jobsite — tap to open it. Your hours and expenses stay
                on this job.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={26} color="#7B1FA2" />
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="file-pdf-box"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('viewPlans')}
            onPress={openPlansViewer}
          />
          <BigActionCard
            icon="file-document-outline"
            iconBg={COLORS.navySoft}
            iconColor={COLORS.navy}
            title={t('viewDocuments')}
            onPress={openDocumentsViewer}
          />
          {/* Expenses stay in the company that spent the money. On a shared
              job there is nothing here to show and nothing here to add. */}
          {!isGranted && (
            <BigActionCard
              icon="cash-plus"
              iconBg={COLORS.tealSoft}
              iconColor={COLORS.teal}
              title={isManager ? t('expenses') : t('myExpenses')}
              onPress={() => router.push(`/project/${id}/expenses`)}
            />
          )}
        </View>

        <SectionTitle
          icon="toolbox-outline"
          iconBg="#FFF3E0"
          iconColor="#E65100"
          title={t('jobKit')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BigActionCard
            icon="package-variant-closed"
            iconBg="#FFF3E0"
            iconColor="#E65100"
            title={t('projectTasks')}
            onPress={() => router.push(`/project/${id}/job-kit`)}
          />
          {/* The schedule and the inspection log were never widened to
              subcontractors, so on a shared job both open empty. Hidden rather
              than shown broken. */}
          {!isGranted && (
            <BigActionCard
              icon="calendar-month-outline"
              iconBg={COLORS.navySoft}
              iconColor={COLORS.navy}
              title={t('projectSchedule')}
              onPress={() => router.push(`/project/${id}/tasks`)}
            />
          )}
          {!isGranted && (
            <BigActionCard
              icon="clipboard-check-outline"
              iconBg={COLORS.navySoft}
              iconColor={COLORS.navy}
              title={t('inspections')}
              onPress={() => router.push(`/project/${id}/inspections`)}
            />
          )}
        </View>

        <SectionTitle
          icon="clipboard-text-outline"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title={t('reports')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {canRaiseRfi && (
            <BigActionCard
              icon="comment-question-outline"
              iconBg={COLORS.tealSoft}
              iconColor={COLORS.teal}
              title={t('rfisTitle')}
              onPress={() => router.push(`/project/${id}/rfis`)}
            />
          )}
          {canCreateReport && (
            <BigActionCard
              icon="clipboard-plus-outline"
              iconBg={COLORS.navySoft}
              iconColor={COLORS.navy}
              title={t('createReport')}
              onPress={() => router.push(`/project/${id}/new-report`)}
            />
          )}
          <BigActionCard
            icon="clipboard-search-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('viewReports')}
            onPress={openReportsViewer}
          />
        </View>

        {/* Requests and photos are the same errand from the crew's side: both
            are "here is what the job needs / here is what it looks like",
            raised from site. The tile inside is still Material Requests. */}
        <SectionTitle
          icon="package-variant"
          iconBg={COLORS.navySoft}
          iconColor={COLORS.navy}
          title={t('fieldSection')}
        />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* A material request prices against OUR catalogue and gets bought
              by OUR office. On a job we do not own it has nowhere to go, which
              is why the web leaves the tab out too. */}
          {!isGranted && (
            <BigActionCard
              icon="package-variant"
              iconBg={COLORS.tealSoft}
              iconColor={COLORS.teal}
              title={t('matReqTitle')}
              onPress={() => router.push(`/project/${id}/material-requests`)}
            />
          )}
          <BigActionCard
            icon="image-search-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={t('photos')}
            onPress={() => {
              if (photos.length === 0) {
                Alert.alert(t('photos'), 'There are no photos to view yet.')
                return
              }
              setPhotoGridVisible(true)
            }}
          />
          {/* Adding a project photo had no entry point at all — the screen could
              only view what the web had uploaded, which is what Android users
              were reporting as "cannot add photos". */}
          {canAddPhotos && (
          <BigActionCard
            icon="camera-plus-outline"
            iconBg={COLORS.tealSoft}
            iconColor={COLORS.teal}
            title={uploadingPhoto ? t('uploadingDots') : t('uploadPhoto')}
            onPress={() => {
              if (uploadingPhoto) return
              choosePhotoSource(async from => {
                setUploadingPhoto(true)
                const res = await pickAndUploadPhotos(
                  from,
                  { projectId, folder: 'photos' },
                  currentUserId ?? null,
                )
                setUploadingPhoto(false)
                reportUpload(res)
                if (res.ok > 0) await refreshAll()
              })
            }}
          />
          )}
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

            <Pressable
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
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.tealSoft, borderRadius: 12, paddingVertical: 12, marginBottom: 14, opacity: uploading ? 0.5 : 1 }}
            >
              <MaterialCommunityIcons name="file-upload-outline" size={20} color={COLORS.teal} />
              <Text style={{ color: COLORS.teal, fontWeight: '800' }}>{uploading ? t('workingEllipsis') : t('uploadDocument')}</Text>
            </Pressable>

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

      {/* Contact sheet. Three across is the most that stays tappable with a
          glove on, and each tile is square so a portrait and a landscape shot
          sit on the same grid line. */}
      <Modal
        visible={photoGridVisible}
        animationType="slide"
        onRequestClose={() => setPhotoGridVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
              backgroundColor: COLORS.card,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.navy }}>
              {`${t('photos')} (${photos.length})`}
            </Text>
            <Pressable onPress={() => setPhotoGridVisible(false)} hitSlop={12}>
              <Ionicons name="close-circle" size={32} color={COLORS.subtext} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {gallery.map(({ uri, photo }, i) => {
                const size = (Dimensions.get('window').width - 24 - 12) / 3
                return (
                  <Pressable
                    key={photo.id}
                    onPress={() => {
                      setPhotoIndex(i)
                      setPhotosModalVisible(true)
                    }}
                    style={{ width: size, height: size, margin: 2, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.border }}
                  >
                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    {!!photo.caption && (
                      <View
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.55)',
                          paddingHorizontal: 5,
                          paddingVertical: 3,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 10 }}>
                          {photo.caption}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </View>
            {gallery.length < photos.length && (
              <Text style={{ color: COLORS.subtext, textAlign: 'center', paddingVertical: 16 }}>
                {`Loading ${photos.length - gallery.length} more…`}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ImageView
        images={photoImages}
        imageIndex={photoIndex}
        visible={photosModalVisible && gallery.length > 0}
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
                {gallery.length > 0 ? `${imageIndex + 1} / ${gallery.length}` : t('photos')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {(isManager || (currentUserId != null && gallery[imageIndex]?.photo.uploaded_by === currentUserId)) && (
                  <Pressable onPress={() => gallery[imageIndex] && handleDeletePhoto(gallery[imageIndex].photo)}>
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
          const photo = gallery[imageIndex]?.photo
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