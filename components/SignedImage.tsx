import { Image, ImageProps, View } from 'react-native'
import { useSignedUrl } from '../lib/storageUrl'

// An <Image> whose uri is signed at render time.
//
// `value` takes whatever the row holds — prefer the *_path column and fall back
// to the legacy *_url one:
//
//   <SignedImage bucket="project-photos" value={p.file_path || p.file_url} style={...} />
//
// While the url resolves (one round trip, then cached) it renders `placeholder`
// if given, else an empty View of the same style so the layout does not jump.

type Props = Omit<ImageProps, 'source'> & {
  bucket: string
  value?: string | null
  placeholder?: React.ReactNode
  /** Set when the file belongs to a project another company shared with us. */
  ownerOrg?: string | null
}

export function SignedImage({ bucket, value, placeholder, style, ownerOrg = null, ...rest }: Props) {
  const uri = useSignedUrl(bucket, value, ownerOrg ? { ownerOrg } : undefined)
  if (!uri) return placeholder ?? <View style={style} />
  return <Image source={{ uri }} style={style} {...rest} />
}

export default SignedImage
