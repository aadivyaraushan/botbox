export type PeerDirection = 'sent' | 'received'

export type PeerMessagePart = {
  direction: PeerDirection
  peerName: string
  text: string
}

export type PeerMarkerView = {
  title: string
  preview: string | null
}

export const PEER_PREVIEW_MAX = 140

export function truncatePeerText(text: string, max = PEER_PREVIEW_MAX): string {
  if (text.length <= max) return text
  return text.slice(0, max)
}

export function formatPeerMarker(part: PeerMessagePart): PeerMarkerView {
  if (part.direction === 'sent') {
    return {
      title: `Messaged ${part.peerName}`,
      preview: part.text ? truncatePeerText(part.text) : null,
    }
  }
  return {
    title: `Message from ${part.peerName}`,
    preview: part.text || null,
  }
}
