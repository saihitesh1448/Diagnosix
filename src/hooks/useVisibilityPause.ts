import { useEffect } from 'react';

export function useVisibilityPause(isActiveRef: React.MutableRefObject<boolean>) {
  useEffect(() => {
    const handleVisibility = () => {
      isActiveRef.current = !document.hidden;
    };
    const handleRect = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        isActiveRef.current =
          rect.width > 0 &&
          rect.height > 0 &&
          !(rect.bottom < 0 ||
            rect.right < 0 ||
            rect.top > window.innerHeight ||
            rect.left > window.innerWidth);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('resize', handleRect);
    window.addEventListener('scroll', handleRect, { passive: true });
    handleRect();
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleRect);
      window.removeEventListener('scroll', handleRect);
    };
  }, [isActiveRef]);
}
