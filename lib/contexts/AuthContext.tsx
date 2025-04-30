import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuthToken, getAuthTokenInteractive, removeAuthToken, checkTokenScopes } from '@/lib/utils/auth';
import { LoginScreen } from '@/components/LoginScreen';

const REQUIRED_SCOPES = [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive"
];

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setToken] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [signInError, setSignInError] = useState<string | null>(null);

    useEffect(() => {
        getAuthToken()
            .then((tok) => {
                setToken(tok);
                setIsAuthenticated(true);
            })
            .catch(() => {
                setToken(null);
                setIsAuthenticated(false);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const handleForceSignOut = () => {
            signOut();
        };
        window.addEventListener('forceSignOut', handleForceSignOut);

        // Listen for chrome.runtime messages (for background-triggered sign out)
        let removeChromeListener: (() => void) | undefined;
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            const chromeListener = (message: any) => {
                if (message && message.messageType === 'forceSignOut') {
                    signOut();
                }
            };
            chrome.runtime.onMessage.addListener(chromeListener);
            removeChromeListener = () => chrome.runtime.onMessage.removeListener(chromeListener);
        }

        return () => {
            window.removeEventListener('forceSignOut', handleForceSignOut);
            if (removeChromeListener) removeChromeListener();
        };
    }, [token]);

    const signIn = async () => {
        setSignInError(null);
        try {
            const tok = await getAuthTokenInteractive();
            const hasScopes = await checkTokenScopes(tok, REQUIRED_SCOPES);
            if (!hasScopes) {
                await removeAuthToken(tok);
                setToken(null);
                setIsAuthenticated(false);
                setSignInError('You have not granted all required permissions. Please accept all requested scopes.');
                return;
            }
            setToken(tok);
            setIsAuthenticated(true);
        } catch (e: any) {
            setToken(null);
            setIsAuthenticated(false);
            setSignInError(e?.toString() || 'Sign in failed');
        }
    };

    const signOut = async () => {
        if (token) await removeAuthToken(token);
        setToken(null);
        setIsAuthenticated(false);
    };


    if (loading) return <div>Loading...</div>;
    if (!token) return <LoginScreen onSignIn={signIn} error={signInError} />;

    return (
        <AuthContext.Provider value={{ isAuthenticated, token, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
