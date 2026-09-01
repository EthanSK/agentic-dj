export const BLOCKED_MEDIA_KEY_ACTIONS = ['play', 'pause'] as const;
export const EMBEDDED_PLAYER_ALLOW =
  "autoplay; encrypted-media; mediasession 'none'";

type BlockedMediaKeyAction = (typeof BLOCKED_MEDIA_KEY_ACTIONS)[number];

type MediaSessionTarget = {
  setActionHandler: (
    action: BlockedMediaKeyAction,
    handler: (() => void) | null,
  ) => void;
};

export type MediaKeyShield = {
  blockedActions: BlockedMediaKeyAction[];
  release: () => void;
};

/**
 * Keeps the browser from routing the Mac play/pause key to this page.
 * On-page audio controls continue to work because only Media Session actions
 * are intercepted.
 */
export function blockHardwareMediaKeys(
  mediaSession: MediaSessionTarget | null | undefined,
): MediaKeyShield {
  if (!mediaSession) {
    return { blockedActions: [], release: () => undefined };
  }

  const registered: BlockedMediaKeyAction[] = [];
  const ignore = () => undefined;

  for (const action of BLOCKED_MEDIA_KEY_ACTIONS) {
    try {
      mediaSession.setActionHandler(action, ignore);
      registered.push(action);
    } catch {
      // Browsers can expose Media Session while omitting individual actions.
    }
  }

  return {
    blockedActions: registered,
    release: () => {
      for (const action of registered) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // Cleanup should never prevent the page from unmounting.
        }
      }
    },
  };
}
