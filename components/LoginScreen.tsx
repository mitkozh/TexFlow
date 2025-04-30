import React from 'react';
import { Button } from '@/components/ui/button';

interface LoginScreenProps {
    onSignIn?: () => Promise<void>;
    error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSignIn, error: externalError }) => {
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    const handleSignIn = async () => {
        if (!onSignIn) return;
        setLoading(true);
        setError(null);
        try {
            await onSignIn();
        } catch (e: any) {
            setError(e?.toString() || 'Sign in failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen w-full bg-background">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full">
                <h2 className="text-2xl font-bold mb-4 text-center">Sign in to continue</h2>
                <Button onClick={handleSignIn} disabled={loading} className="w-full">
                    {loading ? 'Signing in...' : 'Sign in with Google'}
                </Button>
                {(error || externalError) && <div className="text-red-500 mt-4 text-center">{error || externalError}</div>}
            </div>
        </div>
    );
};
