import React, { useEffect, useState, useRef, Suspense } from 'react';
import * as PDFJS from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { PDFJSWrapper } from '@/lib/pdf/PDFJSWrapper';
import { usePdfViewerZoom } from '@/lib/hooks/usePdfViewerZoom';
import { usePdfCompilation } from '@/lib/hooks/usePdfCompilation';
import { PdfToolbar } from './PdfToolbar';

PDFJS.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  pdfUrl?: string | null;
  onPageChange?: (page: number) => void;
  onRecompile?: () => void;
  compiling?: boolean;
  error?: string | null;
  mainFileContent?: string;
  fetchContent?: () => Promise<string>;
  extraFiles?: Record<string, string | Uint8Array<ArrayBufferLike>>;
  message?: string | null;
  disableRecompile?: boolean;
}

const PdfJsViewer: React.FC<PdfViewerProps> = (props) => {
  const {
    pdfUrl: externalPdfUrl,
    onPageChange: externalOnPageChange,
    onRecompile: externalOnRecompile,
    compiling: externalCompiling,
    error: externalError,
    mainFileContent,
    fetchContent,
    extraFiles,
    message,
    disableRecompile,
  } = props;

  const pdfCompilation = usePdfCompilation({ mainFileContent, fetchContent, extraFiles, disableRecompile });
  const pdfUrl = mainFileContent ? pdfCompilation.pdfUrl : externalPdfUrl ?? null;
  const compiling = mainFileContent ? pdfCompilation.compiling : externalCompiling ?? false;
  const compileError = mainFileContent
    ? (pdfCompilation.compileError ? (typeof pdfCompilation.compileError === 'string' ? pdfCompilation.compileError : pdfCompilation.compileError.message) : null)
    : externalError ?? null;
  const recompileFn = mainFileContent ? pdfCompilation.recompile : externalOnRecompile;

  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfWrapper, setPdfWrapper] = useState<PDFJSWrapper | null>(null);
  const [scale, setScale] = useState<number | string>(1);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const previousPdfUrl = useRef<string | null>(null);

  const handleScaleChange = (newScale: number | string) => {
    setScale(newScale);
    if (!pdfWrapper) return;
    if (typeof newScale === 'string' && ['auto', 'page-fit', 'page-width', 'page-height'].includes(newScale)) {
      pdfWrapper.viewer.currentScaleValue = newScale;
    } else {
      const numericScale = typeof newScale === 'string' ? parseFloat(newScale) : newScale;
      if (!isNaN(numericScale)) {
        pdfWrapper.viewer.currentScale = numericScale;
      }
    }
  };

  usePdfViewerZoom(pdfWrapper, (newScale) => handleScaleChange(parseFloat(newScale)));

  useEffect(() => {
    if (!containerRef.current) return;
    const wrapper = new PDFJSWrapper(containerRef.current);
    setPdfWrapper(wrapper);
    return () => {
      wrapper.viewer.cleanup();
      setPdfWrapper(null);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (previousPdfUrl.current !== pdfUrl) {
      setNumPages(0);
      setCurrentPage(1);
      previousPdfUrl.current = pdfUrl;
    }
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfWrapper || !pdfUrl) return;
    let isMounted = true;
    const loadingTask = pdfWrapper.loadDocument(pdfUrl);
    loadingTask.then((pdfDocument) => {
      if (isMounted && pdfDocument) {
        setNumPages(pdfDocument.numPages);
        pdfWrapper.viewer.currentPageNumber = 1;
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
      loadingTask.then((pdf) => pdf?.destroy());
    };
  }, [pdfWrapper, pdfUrl]);

  useEffect(() => {
    if (!pdfWrapper) return;
    const handlers = {
      pagesInit: () => {
        if (typeof scale === 'string' && ['auto', 'page-fit', 'page-width', 'page-height'].includes(scale)) {
          pdfWrapper.viewer.currentScaleValue = scale;
        } else {
          const numericScale = typeof scale === 'string' ? parseFloat(scale) : scale;
          if (!isNaN(numericScale)) {
            pdfWrapper.viewer.currentScale = numericScale;
          }
        }
      },
      pageChange: () => {
        if (pdfWrapper?.currentPosition) {
          const newPage = pdfWrapper.currentPosition.page + 1;
          setCurrentPage(newPage);
          externalOnPageChange?.(newPage);
        }
      },
      scroll: () => {
        requestAnimationFrame(() => {
          if (pdfWrapper) {
            const newPage = pdfWrapper.viewer.currentPageNumber;
            setCurrentPage(newPage);
            externalOnPageChange?.(newPage);
          }
        });
      },
      textLayerRendered: () => {
        containerRef.current?.querySelectorAll('.textLayer').forEach(textLayer => {
          if (textLayer instanceof HTMLElement) {
            textLayer.dataset.listeningForDoubleClick = 'true';
          }
        });
      }
    };
    pdfWrapper.eventBus.on('pagesinit', handlers.pagesInit);
    pdfWrapper.eventBus.on('pagechange', handlers.pageChange);
    pdfWrapper.eventBus.on('textlayerrendered', handlers.textLayerRendered);
    pdfWrapper.viewer.container.addEventListener('scroll', handlers.scroll);
    return () => {
      pdfWrapper.eventBus.off('pagesinit', handlers.pagesInit);
      pdfWrapper.eventBus.off('pagechange', handlers.pageChange);
      pdfWrapper.eventBus.off('textlayerrendered', handlers.textLayerRendered);
      pdfWrapper.viewer.container.removeEventListener('scroll', handlers.scroll);
    };
  }, [pdfWrapper, externalOnPageChange, scale]);

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

  const handlePageChange = (newPage: number) => {
    if (pdfWrapper && newPage >= 1 && newPage <= numPages) {
      pdfWrapper.viewer.currentPageNumber = newPage;
    }
  };

  const renderContent = () => {
    if (message) {
      return (
        <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: "rgb(249, 251, 253)" }}>
          <div className="text-gray-600">{message}</div>
        </div>
      );
    }
    if (compileError) {
      return (
        <div className="flex-1 flex items-center justify-center bg-red-50 text-red-700 p-4 rounded-md">
          Error: {compileError}
        </div>
      );
    }
    if (!pdfUrl) {
      return (
        <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: "rgb(249, 251, 253)" }}>
          <div className="text-gray-600">
            {compiling ? 'Compiling document...' : 'No PDF available'}
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 relative overflow-hidden border" style={{ backgroundColor: "rgb(249, 251, 253)" }}>
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
    );
  };

  return (
    <div className="flex flex-col w-full h-full">
      <PdfToolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        onScaleChange={handleScaleChange}
        onPageChange={handlePageChange}
        onRecompile={recompileFn || (() => {})}
        compiling={!!compiling || !!disableRecompile}
      />
      {renderContent()}
    </div>
  );
};

const PdfViewer: React.FC<PdfViewerProps> = props => {
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-gray-600">Loading PDF Viewer...</div>}>
      <PdfJsViewer {...props} />
    </Suspense>
  );
};

export default PdfViewer;