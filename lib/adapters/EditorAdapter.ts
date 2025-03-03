export interface EditorAdapter {
    getDocumentId(): Promise<string | null>;
    fetchContent(): Promise<string>;
}