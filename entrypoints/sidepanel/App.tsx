import React, { useEffect, useRef, useState } from 'react';
import './App.module.css';
import '../../assets/main.css';
import Sidebar, { SidebarType } from "@/entrypoints/sidebar.tsx";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Home } from "@/entrypoints/sidepanel/home.tsx";
import { SettingsPage } from "@/entrypoints/sidepanel/settings.tsx";
import { useTheme } from "@/components/theme-provider.tsx";
import { useTranslation } from 'react-i18next';
import { GoogleDocsAdapter } from "@/lib/adapters/DocsAdapter";
import { FileExplorer, FileExplorerHandle } from "@/components/drive/FileExplorer";
import { DriveProvider } from "@/lib/contexts/DriveContext";
import { DriveDataInitializer } from "@/components/drive/DriveDataInitializer";

export default () => {
    const [sidebarType, setSidebarType] = useState<SidebarType>(SidebarType.home);
    const [headTitle, setHeadTitle] = useState("home");
    const [showButton, setShowButton] = useState(false);
    const [showCard, setShowCard] = useState(false);
    const [buttonStyle, setButtonStyle] = useState<any>();
    const [cardStyle, setCardStyle] = useState<any>();
    const cardRef = useRef<HTMLDivElement>(null);
    const { theme, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const adapter = useRef(new GoogleDocsAdapter()).current;
    const fileExplorerRef = useRef<FileExplorerHandle>(null);
    const [documentId, setDocumentId] = useState<string | null>(null);

    useEffect(() => {
        adapter.getDocumentId().then((docId => {
            setDocumentId(docId)
        }));
    }, [adapter]);

    useEffect(() => {
        browser.runtime.onMessage.addListener((message: any) => {
            if (message.messageType === 'changeLocale') {
                i18n.changeLanguage(message.content);
            } else if (message.messageType === 'changeTheme') {
                toggleTheme(message.content);
            } else if (message.messageType === 'tabUrlChanged') {
                adapter.getDocumentId().then((docId) => {
                    setDocumentId(docId);
                    console.log("docId (url changed)", docId);
                });
            }
            return true;
        });
        browser.storage.local.get('i18n').then(data => {
            if (data.i18n && typeof data.i18n === 'string') {
                i18n.changeLanguage(data.i18n);
            }
        });
    }, [adapter, i18n, toggleTheme]);

    useEffect(() => {
        if (sidebarType === SidebarType.drive) {
            setTimeout(() => {
                fileExplorerRef.current?.refreshLayout();
            }, 0);
        }
    }, [sidebarType]);

    useEffect(() => {
        if (documentId) {
            setSidebarType(SidebarType.home);
            setHeadTitle("home");
        }
    }, [documentId]);

    return (
        <div className={theme}>
            <DriveProvider key={documentId} adapter={adapter}>
                <DriveDataInitializer />
                <div className="fixed top-0 right-0 h-screen w-full bg-background z-[1000000000000] rounded-l-xl shadow-2xl">
                    <Sidebar sideNav={(type: SidebarType) => {
                        setSidebarType(type);
                        setHeadTitle(type);
                    }} />
                    <main className="mr-14 grid gap-4 p-2 md:gap-8 h-full">
                        <div style={{ display: sidebarType === SidebarType.home ? 'block' : 'none', height: '100%' }}>
                            {documentId && <Home adapter={adapter} />}
                        </div>
                        <div style={{ display: sidebarType === SidebarType.settings ? 'block' : 'none', height: '100%' }}>
                            <SettingsPage />
                        </div>
                        <div style={{ display: sidebarType === SidebarType.drive ? 'block' : 'none', height: '100%' }} className="flex h-full min-w-0 max-w-full">
                            <div className="flex-1 h-full min-w-0 max-w-full">
                                {documentId && <FileExplorer ref={fileExplorerRef} />}
                            </div>
                        </div>
                    </main>
                </div>
                {showButton &&
                    <Button className="absolute z-[100000]" style={buttonStyle}>send Message</Button>
                }
                <Card ref={cardRef}
                    className={`absolute z-[100000] w-[300px] h-[200px] ${showCard ? 'block' : 'hidden'}`}
                    style={cardStyle}></Card>
            </DriveProvider>
        </div>
    );
};
