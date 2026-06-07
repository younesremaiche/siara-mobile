import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Refetch when the screen gains focus.
 *
 * The callback is kept in a ref so the focus effect depends only on `enabled`,
 * never on the callback's identity. This makes the hook safe even when a caller
 * passes an inline/unstable function (e.g. one closing over a React Query result
 * object) — otherwise a new identity every render would re-fire the effect in an
 * infinite refresh loop.
 */
export function useFocusRefresh(refetch, enabled = true) {
  const refetchRef = React.useRef(refetch);
  refetchRef.current = refetch;

  useFocusEffect(
    React.useCallback(() => {
      if (enabled && typeof refetchRef.current === 'function') {
        void refetchRef.current();
      }
    }, [enabled]),
  );
}
