import { useCallback, useEffect, useRef } from 'react';
import { PDFJSWrapper } from '@/lib/pdf/PDFJSWrapper';

const MAX_SCALE_FACTOR = 1.2;
const SCALE_FACTOR_DIVISOR = 20;

export function usePdfViewerZoom(
  pdfJsWrapper: PDFJSWrapper | null,
  setScale: (scale: string) => void
) {
  const isZoomingRef = useRef(false);
  const isScrollingRef = useRef(false);
  const isScrollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performZoom = useCallback(
    (event: WheelEvent, pdfJsWrapper: PDFJSWrapper) => {
      const scrollMagnitude = Math.abs(event.deltaY);
      const scaleFactorMagnitude = Math.min(
        1 + scrollMagnitude / SCALE_FACTOR_DIVISOR,
        MAX_SCALE_FACTOR
      );
      const previousScale = pdfJsWrapper.viewer.currentScale;
      const scaleChangeDirection = Math.sign(event.deltaY);

      const approximateScaleFactor =
        scaleChangeDirection < 0 ? scaleFactorMagnitude : 1 / scaleFactorMagnitude;

      const newScale = Math.round(previousScale * approximateScaleFactor * 100) / 100;
      const exactScaleFactor = newScale / previousScale;

      pdfJsWrapper.viewer.currentScale = newScale;
      setScale(`${newScale}`);

      const containerRect = pdfJsWrapper.viewer.container.getBoundingClientRect();
      const currentMouseX = event.clientX - containerRect.left;
      const currentMouseY = event.clientY - containerRect.top;

      pdfJsWrapper.viewer.update();

      pdfJsWrapper.viewer.container.scrollBy({
        left: currentMouseX * exactScaleFactor - currentMouseX,
        top: currentMouseY * exactScaleFactor - currentMouseY,
        behavior: 'instant',
      });
    },
    [setScale]
  );

  useEffect(() => {
    if (pdfJsWrapper) {
      const wheelListener = (event: WheelEvent) => {
        console.log("wheelListener triggered", event.type);
        if ((event.metaKey || event.ctrlKey) && !isScrollingRef.current) {
          event.preventDefault();

          if (!isZoomingRef.current) {
            isZoomingRef.current = true;
            performZoom(event, pdfJsWrapper);
            setTimeout(() => {
              isZoomingRef.current = false;
            }, 5);
          }
        } else {
          isScrollingRef.current = true;
          if (isScrollingTimeoutRef.current) {
            clearTimeout(isScrollingTimeoutRef.current);
          }
          isScrollingTimeoutRef.current = setTimeout(() => {
            isScrollingRef.current = false;
          }, 100);
        }
      };

      pdfJsWrapper.viewer.container.addEventListener('wheel', wheelListener, {
        passive: false,
      });

      return () => {
        pdfJsWrapper.viewer.container.removeEventListener('wheel', wheelListener);
      };
    }
  }, [pdfJsWrapper, setScale, performZoom]);
}