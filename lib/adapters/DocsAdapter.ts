import { MessageType } from "@/entrypoints/types";
import { EditorAdapter } from "./EditorAdapter";

export class GoogleDocsAdapter implements EditorAdapter {
   
    async getDocumentId(): Promise<string | null> {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url) {
                console.warn('No URL found in active tab');
                return null;
            }

            console.log('Tab URL:', tab.url);
            
            // Handle different Google Docs URL patterns
            const patterns = [
                /\/document\/d\/([a-zA-Z0-9_-]+)/,  // Standard pattern
                /\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,  // Full URL pattern
                /\/d\/([a-zA-Z0-9_-]+)/  // Short pattern
            ];

            for (const pattern of patterns) {
                const match = tab.url.match(pattern);
                if (match) {
                    console.log('Found document ID:', match[1]);
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
}