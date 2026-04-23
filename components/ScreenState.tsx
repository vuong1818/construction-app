import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from 'react-native'
import { COLORS, RADIUS } from '../lib/theme'

type LoadingStateProps = {
  message?: string
}

export function LoadingState({
  message = 'Loading...',
}: LoadingStateProps) {
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
      <Text style={{ marginTop: 12, color: COLORS.text }}>{message}</Text>
    </SafeAreaView>
  )
}

type ErrorStateProps = {
  title?: string
  message: string
  retryLabel?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Error',
  message,
  retryLabel = 'Retry',
  onRetry,
}: ErrorStateProps) {
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
      <Text
        style={{
          color: COLORS.red,
          fontWeight: '700',
          marginBottom: 10,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: COLORS.text,
          textAlign: 'center',
          marginBottom: onRetry ? 16 : 0,
        }}
      >
        {message}
      </Text>

      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            backgroundColor: COLORS.navy,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: RADIUS.md,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>
            {retryLabel}
          </Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  )
}

type EmptyStateProps = {
  title?: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      style={{
        paddingVertical: 24,
        paddingHorizontal: 16,
        alignItems: 'center',
      }}
    >
      {title ? (
        <Text
          style={{
            color: COLORS.navy,
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
      ) : null}

      <Text
        style={{
          color: COLORS.subtext,
          textAlign: 'center',
          marginBottom: actionLabel && onAction ? 16 : 0,
        }}
      >
        {message}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={{
            backgroundColor: COLORS.navy,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: RADIUS.md,
          }}
        >
          <Text style={{ color: COLORS.white, fontWeight: '700' }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}