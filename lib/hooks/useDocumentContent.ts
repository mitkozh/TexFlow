import { useState, useEffect, useCallback } from 'react';
import { EditorAdapter } from '../adapters/EditorAdapter';

export function useDocumentContent(adapter: EditorAdapter) {
    const [content, setContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // useDocumentContent.ts
    const fetchContent = useCallback(async () => {
        setLoading(true);
        try {
            const text = await adapter.fetchContent();
            setContent(text);
            setError(null);
            return text;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch content');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [adapter]);

    useEffect(() => {
        fetchContent();
    }, [fetchContent]);

    return { content, error, loading, refetch: fetchContent };
}
