import React, {useEffect, useRef, useState} from 'react';
import './App.module.css';
import '../../assets/main.css'
import Sidebar, {SidebarType} from "@/entrypoints/sidebar.tsx";
import {browser} from "wxt/browser";
import ExtMessage, {MessageType} from "@/entrypoints/types.ts";
import {Button} from "@/components/ui/button.tsx";
import {Card} from "@/components/ui/card.tsx";
import {Home} from "@/entrypoints/sidepanel/home.tsx";
import {SettingsPage} from "@/entrypoints/sidepanel/settings.tsx";
import {useTheme} from "@/components/theme-provider.tsx";
import {useTranslation} from 'react-i18next';
import Header from "@/entrypoints/sidepanel/header.tsx";
import { GoogleDocsAdapter, DriveFile } from "@/lib/adapters/DocsAdapter";
import { FileExplorer } from "@/components/drive/FileExplorer";

export default () => {
    const [showButton, setShowButton] = useState(false)
    const [showCard, setShowCard] = useState(false)
    const [sidebarType, setSidebarType] = useState<SidebarType>(SidebarType.home);
    const [headTitle, setHeadTitle] = useState("home")
    const [buttonStyle, setButtonStyle] = useState<any>();
    const [cardStyle, setCardStyle] = useState<any>();
    const cardRef = useRef<HTMLDivElement>(null);
    const {theme, toggleTheme} = useTheme();
    const {t, i18n} = useTranslation();
    const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
    const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
    const [driveLoading, setDriveLoading] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const adapter = useRef(new GoogleDocsAdapter()).current;
    const [docId, setDocId] = useState<string>("");

    useEffect(() => {
        adapter.getDocumentId().then(id => setDocId(id || ""));
    }, [adapter]);

    async function initI18n() {
        let data = await browser.storage.local.get('i18n');
        if (data.i18n) {
            if (typeof data.i18n === 'string') {
                await i18n.changeLanguage(data.i18n);
            }
        }
    }

    useEffect(() => {
        browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
            console.log('sidepanel:')
            console.log(message)
            if (message.messageType == MessageType.changeLocale) {
                i18n.changeLanguage(message.content)
            } else if (message.messageType == MessageType.changeTheme) {
                toggleTheme(message.content)
            }
            return true;
        });

        initI18n();
    }, []);

    // On startup, ensure Drive environment
    useEffect(() => {
        const setupDrive = async () => {
            try {
                const adapter = new GoogleDocsAdapter();
                const docId = await adapter.getDocumentId();
                if (docId) {
                    const { folderId } = await adapter.ensureDriveEnvironment(docId);
                    setDriveFolderId(folderId);
                }
            } catch (e: any) {
                setDriveError(e.message || String(e));
            }
        };
        setupDrive();
    }, []);

    // When sidebarType is SidebarType.drive and folderId is set, list files
    useEffect(() => {
        if (sidebarType === SidebarType.drive && driveFolderId) {
            setDriveLoading(true);
            setDriveError(null);
            const adapter = new GoogleDocsAdapter();
            adapter.getDocumentId().then(docId => {
                if (docId) {
                    adapter.listDriveFiles(docId)
                        .then(setDriveFiles)
                        .then(() => console.log(driveFiles))
                        .catch(e => setDriveError(e.message || String(e)))
                        .finally(() => setDriveLoading(false));
                }
            });
        }
    }, [sidebarType, driveFolderId]);

    return (
        <div className={theme}>
            {<div
                className="fixed top-0 right-0 h-screen w-full bg-background z-[1000000000000] rounded-l-xl shadow-2xl">
                {/* <Header headTitle={headTitle}/> */}
                <Sidebar sideNav={(sidebarType: SidebarType) => {
                    setSidebarType(sidebarType);
                    setHeadTitle(sidebarType);
                }} />
                <main className="mr-14 grid gap-4 p-2 md:gap-8 h-full">
                    {sidebarType === SidebarType.home && <Home/>}
                    {sidebarType === SidebarType.settings && <SettingsPage/>}
                    {sidebarType === SidebarType.drive && driveFolderId && docId && (
                        <div className="flex h-full min-w-0 max-w-full">
                            <div className="flex-1 h-full min-w-0 max-w-full">
                                <FileExplorer
                                />
                            </div>
                        </div>
                    )}
                </main>
            </div>
            }
            {showButton &&
                <Button className="absolute z-[100000]" style={buttonStyle}>send Message</Button>
            }
            {
                <Card ref={cardRef}
                      className={`absolute z-[100000] w-[300px] h-[200px] ${showCard ? 'block' : 'hidden'}`}
                      style={cardStyle}></Card>
            }
        </div>

    )
};
