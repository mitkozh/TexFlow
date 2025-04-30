import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';
import {ThemeProvider} from "@/components/theme-provider.tsx";
import {i18nConfig} from "@/components/i18nConfig.ts";
import initTranslations from "@/components/i18n.ts";
import { AuthProvider } from "@/lib/contexts/AuthContext";

initTranslations(i18nConfig.defaultLocale,["common","sidepanel"])

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <ThemeProvider>
                <App/>
            </ThemeProvider>
        </AuthProvider>
    </React.StrictMode>,
);
