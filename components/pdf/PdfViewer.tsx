import React, { useEffect, useState, useRef, Suspense } from 'react';
import * as PDFJS from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { PDFJSWrapper } from '@/lib/pdf/PDFJSWrapper';
import { usePdfViewerZoom } from '@/lib/hooks/usePdfViewerZoom';
import ZoomDropdown from './ZoomDropdown';

// Set up the worker
PDFJS.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface Props {
  pdfUrl: string;
  onPageChange: (page: number) => void;
  onRecompile: () => void;
  compiling: boolean;
}

const PdfJsViewer: React.FC<Props> = ({
  pdfUrl,
  onPageChange,
  onRecompile,
  compiling,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfWrapper, setPdfWrapper] = useState<PDFJSWrapper | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [numPages, setNumPages] = useState(0);

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
    if (pdfWrapper) {
      pdfWrapper.viewer.currentScale = newScale;
    }
  };

  usePdfViewerZoom(pdfWrapper, (newScale) => handleScaleChange(parseFloat(newScale)));

  
  useEffect(() => {
    if (containerRef.current) {
      const wrapper = new PDFJSWrapper(containerRef.current);
      setPdfWrapper(wrapper);

      return () => {
        wrapper.viewer.cleanup();
      };
    }
  }, []);

  useEffect(() => {
    if (pdfWrapper && pdfUrl) {
      pdfWrapper
        .loadDocument(pdfUrl)
        .then(pdfDocument => {
          if (pdfDocument) {
            setNumPages(pdfDocument.numPages);
          }
        })
        .catch(error => {
          console.error('Failed to load PDF document:', error);
        });
    }
  }, [pdfWrapper, pdfUrl]);

  useEffect(() => {
    if (pdfWrapper) {
      const handlePagesInit = () => {
        pdfWrapper.viewer.currentScale = scale;
      };

      const handlePageChange = () => {
        if (pdfWrapper?.currentPosition)
          onPageChange(pdfWrapper.currentPosition.page + 1);
      };

      // Ensure the text layer listens for double clicks.
      const handleTextLayerRendered = () => {
        const textLayers =
          containerRef.current?.querySelectorAll('.textLayer');
        textLayers?.forEach(textLayer => {
          if (textLayer instanceof HTMLElement) {
            textLayer.dataset.listeningForDoubleClick = 'true';
          }
        });
      };

      pdfWrapper.eventBus.on('pagesinit', handlePagesInit);
      pdfWrapper.eventBus.on('pagechange', handlePageChange);
      pdfWrapper.eventBus.on('textlayerrendered', handleTextLayerRendered);

      return () => {
        pdfWrapper.eventBus.off('pagesinit', handlePagesInit);
        pdfWrapper.eventBus.off('pagechange', handlePageChange);
        pdfWrapper.eventBus.off('textlayerrendered', handleTextLayerRendered);
      };
    }
  }, [pdfWrapper, onPageChange, scale]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      pdfWrapper?.updateOnResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [pdfWrapper]);

  return (
    <div className="flex flex-col w-full h-full bg-gray-100">
      {/* Toolbar - equivalent to .toolbar */}
      <div className="flex items-center justify-between h-10 px-4 py-2 border-b border-gray-200 bg-white">
        <button
          onClick={onRecompile}
          disabled={compiling}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"        >
          {compiling ? 'Compiling...' : 'Recompile'}
        </button>
        
        <div className="text-sm text-gray-700">
          Page:{' '}
          {pdfWrapper?.currentPosition?.page !== undefined
            ? pdfWrapper.currentPosition.page + 1
            : '-'}{' '}
          / {numPages}
        </div>
        
        <ZoomDropdown scale={scale} setScale={handleScaleChange} />
      </div>
      
      {/* PDF Viewer Container - equivalent to .pdf-viewer */}
      <div className="flex-1 relative overflow-hidden">
        {/* Equivalent to .pdfjs-viewer-outer */}
        <div className="overflow-hidden" tabIndex={-1}>
          <div
            className="absolute w-full h-full overflow-y-auto"
            tabIndex={0}
            ref={containerRef}
          >
            <div className="pdfViewer min-h-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PdfViewer: React.FC<Props> = props => {
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-gray-600">Loading PDF Viewer...</div>}>
      <PdfJsViewer {...props} />
    </Suspense>
  );
};

export default PdfViewer;