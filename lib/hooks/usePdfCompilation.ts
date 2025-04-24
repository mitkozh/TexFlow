import { useEffect, useState, useCallback } from 'react';
import { useEngine } from './useEngine';
import { useCompile } from './useCompile';

interface UsePdfCompilationProps {
  mainFileContent: string | undefined;
  fetchContent?: () => Promise<string>;
  mainFileName?: string;
  extraFiles?: Record<string, string | Uint8Array<ArrayBufferLike>>;
}

export function usePdfCompilation({
  mainFileContent,
  fetchContent,
  mainFileName = 'main.tex',
  extraFiles,
}: UsePdfCompilationProps) {
  const { engine, error: engineError } = useEngine('pdftex');
  const { compile, value: compileResult, error: compileError, loading: compiling } = useCompile();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hasCompiled, setHasCompiled] = useState(false);

  // Initial compile
  useEffect(() => {
    if (mainFileContent && engine && !hasCompiled) {
      compile(mainFileContent, mainFileName, extraFiles, engine);
      setHasCompiled(true);
    }
  }, [mainFileContent, engine, hasCompiled, compile, mainFileName, extraFiles]);

  // Update PDF URL when compile result changes
  useEffect(() => {
    if (compiling) {
      // Hide the PDF while compiling to avoid showing stale content
      setPdfUrl(null);
    } else if (compileResult?.pdf) {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(compileResult.pdf)], { type: 'application/pdf' })
      );
      setPdfUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return url;
      });
    }
  }, [compiling, compileResult]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Manual recompile
  const recompile = useCallback(async () => {
    if (engine) {
      let contentToCompile = mainFileContent;
      if (fetchContent) {
        try {
          contentToCompile = await fetchContent();
        } catch (err) {
          return;
        }
      }
      if (contentToCompile) {
        compile(contentToCompile, mainFileName, extraFiles, engine);
      }
    }
  }, [engine, mainFileContent, fetchContent, compile, mainFileName, extraFiles]);

  return {
    pdfUrl,
    compiling,
    compileError,
    engineError,
    recompile,
  };
}
