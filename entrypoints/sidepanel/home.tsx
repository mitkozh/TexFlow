import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card.tsx";
import { useTranslation } from "react-i18next";
import { useDocumentContent } from '@/lib/hooks/useDocumentContent';
import { useEngine } from '@/lib/hooks/useEngine';
import { useCompile } from '@/lib/hooks/useCompile'; 
import { GoogleDocsAdapter } from '@/lib/adapters/DocsAdapter';
import PdfViewer from '@/components/pdf/PdfViewer';

const adapter = new GoogleDocsAdapter();

export function Home() {
  const { content, error: contentError, loading, refetch } = useDocumentContent(adapter);
  const { engine, error: engineError } = useEngine('pdftex');
  const { compile, value: compileResult, error: compileError, loading: compiling } = useCompile();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hasCompiled, setHasCompiled] = useState(false);

  useEffect(() => {
    if (content && engine && !hasCompiled) {
      compile(content, 'main.tex', undefined, engine);
      setHasCompiled(true);
    }
  }, [content, engine, hasCompiled, compile]);

  useEffect(() => {
    if (compileResult?.pdf) {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(compileResult.pdf)], { type: 'application/pdf' })
      );
      setPdfUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return url;
      });
    }
  }, [compileResult]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleManualCompile = async () => {
    if (engine) {
      try {
        const newContent = await refetch(); // Get latest content directly
        compile(newContent, 'main.tex', undefined, engine);
      } catch (err) {
      }
    }
  };

  if (contentError || engineError || compileError) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        {contentError && <p>Content Error: {contentError}</p>}
        {engineError && <p>Engine Error: {engineError.message}</p>}
        {compileError && <p>Compile Error: {compileError.message}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading document content...</div>
      </div>
    );
  }

  return (
    pdfUrl ? (
      <PdfViewer
        pdfUrl={pdfUrl}
        onPageChange={(page) => console.log('Current page:', page)}
        onRecompile={handleManualCompile}
        compiling={compiling}
      />
    ) : (
      <div className="flex items-center justify-center h-full text-gray-600">
        {compiling ? 'Compiling document...' : 'No PDF available'}
      </div>
    )
  );
}
