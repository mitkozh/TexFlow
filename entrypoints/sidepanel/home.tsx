import React from "react";
import { useDocumentContent } from '@/lib/hooks/useDocumentContent';
import { GoogleDocsAdapter } from '@/lib/adapters/DocsAdapter';
import PdfViewer from '@/components/pdf/PdfViewer';
import { useDrive } from '@/lib/contexts/DriveContext';

const adapter = new GoogleDocsAdapter();

export function Home() {
  const { content, error: contentError, loading: contentLoading, refetch } = useDocumentContent(adapter);
  const {
    fileData,
    loading: driveLoading,
    error: driveError,
    filesWithContent,
    filesWithContentLoading,
  } = useDrive();

  let viewerMessage: string | null = null;
  if (contentError) {
    viewerMessage = `Content Error: ${contentError}`;
  } else if (driveError) {
    viewerMessage = `Drive Error: ${driveError}`;
  } else if (contentLoading && !content) {
    viewerMessage = 'Loading document content...';
  } else if (filesWithContentLoading && Object.keys(filesWithContent).length === 0) {
    viewerMessage = 'Loading Drive files...';
  }


  return (
    <PdfViewer
      mainFileContent={content}
      fetchContent={refetch}
      extraFiles={
        Object.keys(filesWithContent).length > 0
          ? Object.fromEntries(
              Object.entries(filesWithContent).map(([k, v]) => [k, v.content])
            )
          : undefined
      }
      message={viewerMessage}
      disableRecompile={filesWithContentLoading}
    />
  );
}
