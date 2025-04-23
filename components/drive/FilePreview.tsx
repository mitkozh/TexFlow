import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface FilePreviewProps {
  file: {
    id: string;
    name: string;
    mimeType: string;
  } | null;
  adapter: any;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, adapter }) => {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    setContent(null);
    setError(null);
    setLoading(true);
    // Clean up previous blob URL before fetching new content
    setBlobUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    adapter.fetchFileContent(file.id, file.mimeType)
      .then((result: any) => {
        if (file.mimeType.startsWith('image/')) {
          const url = URL.createObjectURL(result);
          setBlobUrl(url);
        } else if (typeof result === 'string') {
          setContent(result);
        } else if (file.mimeType === 'application/pdf') {
          const url = URL.createObjectURL(result);
          setBlobUrl(url);
        } else {
          setContent('Preview not supported for this file type.');
        }
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
    // Clean up blob URL on unmount
    return () => {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line
  }, [file?.id]);

  if (!file) return <Card className="flex-1 flex items-center justify-center text-gray-400">No file selected.</Card>;
  if (loading) return <Card className="flex-1 flex items-center justify-center text-gray-500">Loading preview...</Card>;
  if (error) return <Card className="flex-1 flex items-center justify-center text-red-600">{error}</Card>;

  if (blobUrl && file.mimeType.startsWith('image/')) {
    return (
      <Card className="flex-1 flex items-center justify-center">
        <img src={blobUrl} alt={file.name} className="max-h-[80vh] max-w-full rounded shadow" />
      </Card>
    );
  }
  if (blobUrl && file.mimeType === 'application/pdf') {
    return (
      <Card className="flex-1 flex items-center justify-center">
        <iframe src={blobUrl} title={file.name} className="w-full h-[80vh] rounded shadow" />
      </Card>
    );
  }
  if (content) {
    return (
      <Card className="flex-1 p-4 overflow-auto whitespace-pre-wrap bg-background">
        <div className="font-mono text-sm text-gray-800">{content}</div>
      </Card>
    );
  }
  return <Card className="flex-1 flex items-center justify-center text-gray-400">No preview available.</Card>;
};
