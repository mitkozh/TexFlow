import { removeAuthToken } from '@/lib/utils/auth';

/**
 * Universal Google Drive/Docs API fetch helper for Chrome/extension background and content scripts.
 * @param getToken - async function to get OAuth token
 * @param input - fetch input
 * @param init - fetch init
 * @param opts - options (responseType)
 */
export async function fetchDrive<T = any>(
    getToken: () => Promise<string>,
    input: RequestInfo,
    init: RequestInit = {},
    opts: { responseType?: 'json' | 'blob' } = {}
): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(input, { ...init, headers });
    console.log(res)
    if (res.status === 401) {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new Event('forceSignOut'));
        } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ messageType: 'forceSignOut' });
        }
        throw new Error('Unauthorized. Please sign in again.');
    }
    if (!res.ok) {
        let errMsg = await res.text();
        try { errMsg = JSON.parse(errMsg).error?.message || errMsg; } catch { }
        throw new Error(errMsg);
    }
    if (res.status === 204) return undefined as any;
    if (opts.responseType === 'blob') return (await res.blob()) as any;
    return (await res.json()) as T;
}
