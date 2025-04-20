import React from "react";
import { Card } from "@/components/ui/card.tsx";
import { useTranslation } from "react-i18next";
import { useDocumentContent } from '@/lib/hooks/useDocumentContent';
import { GoogleDocsAdapter } from '@/lib/adapters/DocsAdapter';
import PdfViewer from '@/components/pdf/PdfViewer';

const adapter = new GoogleDocsAdapter();

export function Home() {
  const { content, error: contentError, loading, refetch } = useDocumentContent(adapter);

  if (contentError) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <p>Content Error: {contentError}</p>
      </div>
    );
  }

  // Only show loading if content is not yet available
  if (loading && !content) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading document content...</div>
      </div>
    );
  }

  // Pass content and refetch to PdfViewer, let it handle compilation, recompilation, and loading
  return (
    <PdfViewer
      mainFileContent={content}
      fetchContent={refetch}
    />
  );
}
