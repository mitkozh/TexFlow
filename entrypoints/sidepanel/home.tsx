import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card.tsx";
import { useTranslation } from "react-i18next";
import { useDocumentContent } from '@/lib/hooks/useDocumentContent';
import { GoogleDocsAdapter } from '@/lib/adapters/DocsAdapter';
import PdfViewer from '@/components/pdf/PdfViewer';

const adapter = new GoogleDocsAdapter();

// Define the expected structure for Drive file data (copied from FileExplorer)
interface DriveFileData {
  id: string;
  originalID?: string;
  name: string;
  isFile: boolean;
  hasChild: boolean;
  parentId: string | null;
  filterPath: string;
  type: string;
  size: number;
  dateCreated: Date;
  dateModified: Date;
  imageUrl?: string;
  optimistic?: boolean;
  [key: string]: any;
}

// Recursively fetch and flatten all files/folders from Google Drive, returning a map of file paths to file contents
async function fetchAndFlattenDriveFilesWithContent(
  adapter: GoogleDocsAdapter,
  folderId: string,
  parentPath = ''
): Promise<Record<string, string | Uint8Array>> {
  const children = await adapter.listFilesInFolder(folderId);
  let fileMap: Record<string, string | Uint8Array> = {};
  for (const file of children) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const relPath = parentPath ? `${parentPath}/${file.name}` : file.name;
    if (isFolder) {
      const subMap = await fetchAndFlattenDriveFilesWithContent(adapter, file.id, relPath);
      Object.assign(fileMap, subMap);
    } else {
      let content = await adapter.fetchFileContent(file.id, file.mimeType);
      if (typeof content === 'string') {
        fileMap[relPath] = content;
      } else if (content instanceof Blob) {
        // Convert Blob to Uint8Array
        const arrayBuffer = await content.arrayBuffer();
        fileMap[relPath] = new Uint8Array(arrayBuffer);
      }
    }
  }
  console.log('Flattened file map:', fileMap);
  return fileMap;
}

export function Home() {
  const { content, error: contentError, loading, refetch } = useDocumentContent(adapter);
  const [extraFiles, setExtraFiles] = useState<Record<string, string | Uint8Array<ArrayBufferLike>> | null>(null);
  const [extraFilesLoading, setExtraFilesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadFiles() {
      setExtraFilesLoading(true);
      try {
        const documentId = await adapter.getDocumentId();
        if (!documentId) throw new Error('No document ID');
        const env = await adapter.ensureDriveEnvironment(documentId);
        const files = await fetchAndFlattenDriveFilesWithContent(adapter, env.folderId);
        if (!cancelled) setExtraFiles(files);
      } catch (e) {
        if (!cancelled) setExtraFiles(null);
      } finally {
        if (!cancelled) setExtraFilesLoading(false);
      }
    }
    loadFiles();
    return () => { cancelled = true; };
  }, []);

  if (contentError) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <p>Content Error: {contentError}</p>
      </div>
    );
  }

  if (loading && !content) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading document content...</div>
      </div>
    );
  }

  if (extraFilesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading Drive files...</div>
      </div>
    );
  }

  return (
    <PdfViewer
      mainFileContent={content}
      fetchContent={refetch}
      extraFiles={extraFiles || undefined}
    />
  );
}
