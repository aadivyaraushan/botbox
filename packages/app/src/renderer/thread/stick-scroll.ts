const RELEASE_PX = 80

export type StickState = {
  stuck: boolean
  showJump: boolean
}

export function initialStickState(): StickState {
  return { stuck: true, showJump: false }
}

/** On scroll: release stick after >80px from bottom; Jump chip when released. */
export function onThreadScroll(distanceFromBottom: number, prev: StickState): StickState {
  if (distanceFromBottom > RELEASE_PX) {
    return { stuck: false, showJump: true }
  }
  if (prev.stuck) {
    return { stuck: true, showJump: false }
  }
  if (distanceFromBottom <= 4) {
    return { stuck: true, showJump: false }
  }
  return prev
}

export function jumpToLatest(): StickState {
  return { stuck: true, showJump: false }
}

export function shouldAutoScroll(stuck: boolean, streaming: boolean): boolean {
  return stuck && streaming
}
