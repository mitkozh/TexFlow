import { MessageType } from "@/entrypoints/types";
import { EditorAdapter } from "./EditorAdapter";


export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    createdTime?: string;
    modifiedTime?: string;
}

export class GoogleDocsAdapter implements EditorAdapter {
   
    async getDocumentId(): Promise<string | null> {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url) {
                console.warn('No URL found in active tab');
                return null;
            }

            // console.log('Tab URL:', tab.url);
            
            // Handle different Google Docs URL patterns
            const patterns = [
                /\/document\/d\/([a-zA-Z0-9_-]+)/,  // Standard pattern
                /\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,  // Full URL pattern
                /\/d\/([a-zA-Z0-9_-]+)/  // Short pattern
            ];

            for (const pattern of patterns) {
                const match = tab.url.match(pattern);
                if (match) {
                    // console.log('Found document ID:', match[1]);
                    return match[1];
                }
            }
            
            console.warn('No document ID found in URL:', tab.url);
            return null;
        } catch (error) {
            console.error('Error getting tab URL:', error);
            return null;
        }
    }

    async fetchContent(): Promise<string> {
        const documentId = await this.getDocumentId();
        if (!documentId) {
            throw new Error('Document ID not found in the active tab URL');
        }

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { messageType: MessageType.fetchDocumentContent, documentId },
                (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        console.log('Fetched content:', response.text);
                        resolve(response.text);
                    }
                }
            );
        });
    }

    async ensureDriveEnvironment(documentId: string): Promise<{ folderId: string }> {
        // Get OAuth token
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });

        // Helper to call Drive API
        const driveFetch = async (url: string, options: any = {}) => {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        };

        // 1. Ensure 'TexFlow' folder exists
        let texflowFolderId = await this.findOrCreateFolder('TexFlow', null, driveFetch);
        // 2. Ensure 'TexFlow-{documentId}' folder exists inside 'TexFlow'
        let envFolderName = `TexFlow-${documentId}`;
        let envFolderId = await this.findOrCreateFolder(envFolderName, texflowFolderId, driveFetch);
        return { folderId: envFolderId };
    }

    private async findOrCreateFolder(name: string, parentId: string | null, driveFetch: (url: string, options?: any) => Promise<any>): Promise<string> {
        // Search for folder
        let q = `name = '${name.replace("'", "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        if (parentId) q += ` and '${parentId}' in parents`;
        let searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        let res = await driveFetch(searchUrl);
        if (res.files && res.files.length > 0) return res.files[0].id;
        // Create folder
        let body = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId ? { parents: [parentId] } : {}),
        };
        let createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return createRes.id;
    }

    async listDriveFiles(documentId: string): Promise<DriveFile[]> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        // Find the environment folder
        const driveFetch = async (url: string, options: any = {}) => {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        };
        let texflowFolderId = await this.findOrCreateFolder('TexFlow', null, driveFetch);
        let envFolderName = `TexFlow-${documentId}`;
        let envFolderId = await this.findOrCreateFolder(envFolderName, texflowFolderId, driveFetch);
        
        let q = `'${envFolderId}' in parents and trashed = false`;
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)`;
        console.log('Listing files with URL:', url);
        let res = await driveFetch(url);
        console.log('Drive files:', JSON.stringify(res, null, 2));
        return res.files || [];
    }

    async listFilesInFolder(folderId: string): Promise<DriveFile[]> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const driveFetch = async (url: string, options: any = {}) => {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        };
        let q = `'${folderId}' in parents and trashed = false`;
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)`;
        let res = await driveFetch(url);
        console.log('Drive files in folder:', JSON.stringify(res, null, 2));
        return res.files || [];
    }

    async uploadFile(documentId: string, file: File, parentFolderId: string): Promise<DriveFile> {
        console.log('[GoogleDocsAdapter.uploadFile] called with', { documentId, file, parentFolderId });
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    console.error('[GoogleDocsAdapter.uploadFile] Failed to get token:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError || 'No token');
                } else {
                    console.log('[GoogleDocsAdapter.uploadFile] Got token');
                    resolve(token);
                }
            });
        });
        const metadata = {
            name: file.name,
            parents: [parentFolderId],
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);
        console.log('[GoogleDocsAdapter.uploadFile] Sending fetch to Google Drive API...');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        console.log('[GoogleDocsAdapter.uploadFile] Fetch response status:', res.status);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('[GoogleDocsAdapter.uploadFile] Upload failed:', errorText);
            throw new Error(errorText);
        }
        const json = await res.json();
        console.log('[GoogleDocsAdapter.uploadFile] Upload succeeded:', json);
        return json;
    }

    async uploadFileInChunks(documentId: string, file: File, parentFolderId: string, chunkSize = 5 * 1024 * 1024): Promise<DriveFile> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        // 1. Start a resumable session
        const metadata = {
            name: file.name,
            parents: [parentFolderId],
        };
        const startRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': file.type || 'application/octet-stream',
                'X-Upload-Content-Length': file.size.toString(),
            },
            body: JSON.stringify(metadata),
        });
        if (!startRes.ok) throw new Error(await startRes.text());
        const uploadUrl = startRes.headers.get('Location');
        if (!uploadUrl) throw new Error('No upload URL returned from Google Drive');

        // 2. Upload the file in chunks
        let offset = 0;
        while (offset < file.size) {
            const chunk = file.slice(offset, offset + chunkSize);
            const chunkEnd = Math.min(offset + chunkSize, file.size) - 1;
            const contentRange = `bytes ${offset}-${chunkEnd}/${file.size}`;
            const res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': file.type || 'application/octet-stream',
                    'Content-Range': contentRange,
                },
                body: chunk,
            });
            if (res.status !== 308 && !res.ok) throw new Error(await res.text());
            offset += chunkSize;
        }
        // 3. Get the uploaded file metadata
        const finalRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Range': `bytes */${file.size}`,
            },
        });
        if (!finalRes.ok) throw new Error(await finalRes.text());
        return finalRes.json();
    }

    // Create a folder in Google Drive (wrapper for use in UI)
    async createFolder(name: string, parentId: string): Promise<string> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const body = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        };
        const res = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.id;
    }

    // Delete a file or folder in Google Drive
    async deleteFileOrFolder(fileId: string): Promise<void> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        console.log(res)
        if (!res.ok && res.status !== 204) throw new Error(await res.text());
    }

    async fetchFileContent(fileId: string, mimeType: string): Promise<Blob | string> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        // For Google Docs, export as text/plain; for others, download raw
        let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        if (mimeType === 'application/vnd.google-apps.document') {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        }
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        if (mimeType.startsWith('image/')) return res.blob();
        if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/vnd.google-apps.document') return res.text();
        return res.blob();
    }

    async renameFile(fileId: string, newName: string): Promise<DriveFile> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: newName }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }

    async downloadFile(fileId: string): Promise<Blob> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        return res.blob();
    }

    // Download and trigger browser save
    async downloadFileAndSave(fileId: string, name: string, mimeType: string): Promise<void> {
        let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        let filename = name;
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        // For Google Docs, export as PDF
        if (mimeType && mimeType.startsWith('application/vnd.google-apps')) {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
            filename += '.pdf';
        }
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }, 100);
    }

    // Rename file or folder
    async renameFileOrFolder(fileId: string, newName: string): Promise<void> {
        await this.renameFile(fileId, newName);
    }

    // Copy a file (not folder) in Google Drive
    async copyFileOrFolder(fileId: string, newName: string, parentId: string): Promise<DriveFile> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        // Only files can be copied via Drive API; for folders, you must create a new folder and recursively copy contents (not implemented here)
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: newName,
                parents: [parentId],
            }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }

    // Move a file or folder in Google Drive
    async moveFileOrFolder(fileId: string, newParentId: string, oldParentId: string): Promise<DriveFile> {
        const token = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) reject(chrome.runtime.lastError || 'No token');
                else resolve(token);
            });
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&fields=id,name,parents`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }
}