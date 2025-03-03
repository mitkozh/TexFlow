import PdfViewer from '@/components/pdf/PdfViewer';
import { GoogleDocsAdapter } from '@/lib/adapters/DocsAdapter';
import { useCompile } from '@/lib/hooks/useCompile';
import { useDocumentContent } from '@/lib/hooks/useDocumentContent';
import { useEngine } from '@/lib/hooks/useEngine';
import { useEffect, useState } from 'react';
const adapter = new GoogleDocsAdapter();

function Home() {
  const { content, error: contentError, loading, refetch } = useDocumentContent(adapter);
  const { engine, error: engineError } = useEngine('pdftex');
  const { compile, value: compileResult, error: compileError, loading: compiling } = useCompile();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hasCompiled, setHasCompiled] = useState(false);

  // Automatically compile only once (on initial mount) when both content and engine are available.
  useEffect(() => {
    if (content && engine && !hasCompiled) {
      compile(content, 'main.tex', undefined, engine);
      setHasCompiled(true);
    }
  }, [content, engine, hasCompiled, compile]);

  // When a new compile result arrives, update the pdfUrl so that PdfViewer displays the updated PDF.
  // App.tsx
  useEffect(() => {
    if (compileResult?.pdf) {
      const url = URL.createObjectURL(
        new Blob([compileResult.pdf.buffer instanceof ArrayBuffer ? compileResult.pdf.buffer : new Uint8Array(compileResult.pdf.buffer)], { type: 'application/pdf' })
      );
      setPdfUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return url;
      });
    }
  }, [compileResult]);

  // App.tsx
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Manual compile handler: triggered when the user clicks the "Recompile" button.
  // App.tsx
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

  //   return (
  //     pdfUrl ? (
  //       <PdfViewer
  //         pdfUrl={pdfUrl}
  //         onPageChange={(page) => console.log('Current page:', page)}
  //         onRecompile={handleManualCompile} // Pass the manual compile trigger
  //         compiling={compiling}             // Pass the current compile status
  //       />
  //     ) : (
  //       <div className="flex items-center justify-center h-full text-gray-600">
  //         {compiling ? 'Compiling document...' : 'No PDF available'}
  //       </div>
  //     )
  //   );
  // }

  return <></>
}
export default Home;