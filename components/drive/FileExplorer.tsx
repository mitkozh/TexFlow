import React, { useEffect, useState, useRef, useMemo } from 'react';
import { FileManagerComponent, Inject, NavigationPane, DetailsView, Toolbar, UploadListCreateArgs, DeleteEventArgs, RenameEventArgs, BeforeDownloadEventArgs, FolderCreateEventArgs, MoveEventArgs, FileOpenEventArgs, ToolbarClickEventArgs } from '@syncfusion/ej2-react-filemanager';
import './FileExplorer.css';
import JSZip from 'jszip';
import { useDrive, SyncfusionFileData } from '@/lib/contexts/DriveContext';
import { DriveFile } from '@/lib/adapters/DocsAdapter';
import { FileManager, MenuClickEventArgs, MenuOpenEventArgs } from '@syncfusion/ej2-filemanager';

FileManager.Inject(Toolbar, NavigationPane, DetailsView);

export interface FileExplorerHandle {
    refreshLayout: () => void;
}

export const FileExplorer = React.forwardRef<FileExplorerHandle>((props, ref) => {
    const { 
        fileData, 
        loading, 
        rootDriveFolderId,
        refreshFileData,
        uploadFile,
        createFolder,
        deleteFileOrFolder,
        renameFileOrFolder,
        moveFileOrFolder,
        copyFileOrFolder,
        downloadFileOrFolder
    } = useDrive();
    
    const fileManagerRef = useRef<FileManagerComponent>(null);

    React.useImperativeHandle(ref, () => ({
        refreshLayout: () => {
            fileManagerRef.current?.refreshLayout();
        }
    }), []);

    const handleUploadListCreate = async (args: UploadListCreateArgs): Promise<void> => {
        const file = (args as any).fileInfo?.rawFile as File | undefined;
        if (!file) {
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }
        (args as any).cancel = true;
        let parentSyncfusionId: string = '0';
        const fileManager = fileManagerRef.current;
        if (fileManager) {
            const currentPath = fileManager.path;
            const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);
            if (parentFolderInView) {
                parentSyncfusionId = parentFolderInView.id;
            } else if (currentPath === '/') {
                parentSyncfusionId = '0';
            } else {
                parentSyncfusionId = '0';
            }
        } else {
            parentSyncfusionId = '0';
        }
        try {
            await uploadFile(file, parentSyncfusionId);
        } catch (err) {
            alert('Upload failed: ' + (err instanceof Error ? err.message : err));
        }
    };

    const handleBeforeDelete = async (args: DeleteEventArgs): Promise<void> => {
        args.cancel = true;
        const itemsToDeleteSyncfusion = (args.itemData || []) as { id: string, [key: string]: any }[];
        if (itemsToDeleteSyncfusion.length === 0) return;
        try {
            for (const item of itemsToDeleteSyncfusion) {
                await deleteFileOrFolder(item.id);
            }
        } catch (err) {
            alert('Delete failed: ' + (err instanceof Error ? err.message : err));
        } finally {
            fileManagerRef.current?.refreshLayout();
        }
    };

    const handleBeforeRename = async (args: RenameEventArgs): Promise<void> => {
        args.cancel = true;
        const itemToRenameSyncfusion = (args.itemData as { id: string, [key: string]: any }[])?.[0];
        const newName = args.newName;
        if (!itemToRenameSyncfusion || !newName) {
            alert('Rename failed: Invalid item or new name.');
            return;
        }
        try {
            await renameFileOrFolder(itemToRenameSyncfusion.id, newName);
        } catch (err) {
            alert('Rename failed: ' + (err instanceof Error ? err.message : err));
        } finally {
            fileManagerRef.current?.refreshLayout();
        }
    };

    const handleBeforeDownload = async (args: BeforeDownloadEventArgs): Promise<void> => {
        args.cancel = true;
        const itemsToDownloadSyncfusion = (args.data || []) as { id: string, [key: string]: any }[];
        if (itemsToDownloadSyncfusion.length === 0) return;
        try {
            if (itemsToDownloadSyncfusion.length > 1 || itemsToDownloadSyncfusion.some(item => {
                const stateItem = fileData.find(f => f.id === item.id);
                return stateItem && !stateItem.isFile;
            })) {
                const filesToZip: DriveFile[] = [];
                type CollectableItem = { id: string; name: string; isFile: boolean; type: string; originalID?: string };
                const collectFiles = async (items: CollectableItem[]) => {
                    for (const item of items) {
                        const originalID = item.originalID;
                        const stateItem = fileData.find(f => f.id === item.id);
                        if (stateItem && stateItem.originalID) {
                            if (stateItem.isFile) {
                                filesToZip.push({ id: stateItem.originalID, name: stateItem.name, mimeType: stateItem.type });
                            } else {
                                const childItems = fileData
                                    .filter(f => f.parentId === stateItem.id)
                                    .map(child => ({
                                        id: child.id,
                                        originalID: child.originalID,
                                        name: child.name,
                                        isFile: child.isFile,
                                        type: child.type,
                                    }));
                                await collectFiles(childItems);
                            }
                        }
                    }
                };
                const collectableItems: CollectableItem[] = itemsToDownloadSyncfusion.map(item => {
                    const stateItem = fileData.find(f => f.id === item.id);
                    return {
                        id: item.id,
                        name: stateItem?.name || '',
                        isFile: stateItem?.isFile || false,
                        type: stateItem?.type || '',
                        originalID: stateItem?.originalID
                    };
                });
                await collectFiles(collectableItems);
                if (filesToZip.length === 0) {
                    alert('No downloadable files found.');
                    return;
                }
                const zip = new JSZip();
                for (const file of filesToZip) {
                    try {
                        const stateItem = fileData.find(f => f.originalID === file.id);
                        if (stateItem) {
                            await downloadFileOrFolder(stateItem.id);
                        }
                    } catch (err) {
                        // Continue with other files if one fails
                    }
                }
            } else {
                await downloadFileOrFolder(itemsToDownloadSyncfusion[0].id);
            }
        } catch (err) {
            alert('Download failed: ' + (err instanceof Error ? err.message : err));
        }
    };

    const handleBeforeFolderCreate = async (args: FolderCreateEventArgs): Promise<void> => {
        args.cancel = true;
        const folderName = (args as any).folderName || (args as any).name || (args as any).data?.name;
        if (!folderName) {
            alert('Create folder failed: Folder name is empty.');
            return;
        }
        let parentSyncfusionId: string = '0';
        const fileManager = fileManagerRef.current;
        if (fileManager) {
            const currentPath = fileManager.path;
            if (currentPath !== '/') {
                const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);
                if (parentFolderInView) {
                    parentSyncfusionId = parentFolderInView.id;
                }
            }
        }
        try {
            await createFolder(folderName, parentSyncfusionId);
        } catch (err) {
            alert('Create folder failed: ' + (err instanceof Error ? err.message : err));
        } finally {
            fileManagerRef.current?.refreshLayout();
        }
    };

    const handleBeforeMove = async (args: MoveEventArgs): Promise<void> => {
        args.cancel = true;
        const itemsToMoveOrCopySyncfusion = (args.itemData || []) as { id: string, [key: string]: any }[];
        const targetFolderSyncfusion = args.targetData as { id: string, [key: string]: any } | undefined;
        const isCopy = args.isCopy;
        if (itemsToMoveOrCopySyncfusion.length === 0 || !targetFolderSyncfusion) {
            alert(`${isCopy ? 'Copy' : 'Move'} failed: Invalid items or target folder.`);
            return;
        }
        try {
            for (const item of itemsToMoveOrCopySyncfusion) {
                if (isCopy) {
                    await copyFileOrFolder(item.id, targetFolderSyncfusion.id);
                } else {
                    await moveFileOrFolder(item.id, targetFolderSyncfusion.id);
                }
            }
        } catch (err) {
            alert(`${isCopy ? 'Copy' : 'Move'} failed: ` + (err instanceof Error ? err.message : err));
        } finally {
            fileManagerRef.current?.refreshLayout();
        }
    };

    const handleToolbarClick = (args: ToolbarClickEventArgs) => {
        const fileManager = fileManagerRef.current;
        if (!fileManager || !args.item || !args.item.id) {
            return;
        }
        const itemId = args.item.id;
        if (itemId.endsWith('_refresh')) {
            args.cancel = true;
            refreshFileData();
        }
    };

    const handleFileOpen = async (args: FileOpenEventArgs) => {
        const itemSyncfusion = args.fileDetails as { id: string, [key: string]: any } | undefined;
        if (!itemSyncfusion) return;
        const item = fileData.find(f => f.id === itemSyncfusion.id);
        if (item && item.isFile && item.originalID) {
            const googleAppMimeTypes: { [key: string]: string } = {
                'application/vnd.google-apps.document': 'document/d',
                'application/vnd.google-apps.spreadsheet': 'spreadsheets/d',
                'application/vnd.google-apps.presentation': 'presentation/d',
                'application/vnd.google-apps.drawing': 'drawings/d',
                'application/vnd.google-apps.script': 'script/d',
            };
            const urlPart = googleAppMimeTypes[item.type];
            if (urlPart) {
                args.cancel = true;
                const docId = item.originalID;
                window.open(`https://docs.google.com/${urlPart}/${docId}/edit`, '_blank');
            }
        }
    };

    const handleMenuOpen = (args: any) => {
        for (let i = 0; i < args.items.length; i++) {
            if (args.items[i].text === 'Copy Path') {
                args.items[i].iconCss = 'e-icons e-fe-copy';
            }
        }
    };

    const handleMenuClick = (args: any) => {
        if (args.item && args.item.text === 'Copy Path') {
            const selected = args.fileDetails || args.folderDetails;
            let item = null;
            if (selected && selected.length > 0) {
                item = fileData.find(f => f.id === selected[0].id);
            }
            if (item) {
                const relPath = item.namePath;
                navigator.clipboard.writeText(relPath);
            }
        }
    };

    const syncfusionFileSystemData = useMemo(() => {
        return fileData.map(item => ({ ...item } as SyncfusionFileData & { [key: string]: any }));
    }, [fileData]);

    return (
        <div className="file-explorer-container" style={{ width: '100%', height: '100vh' }}>
            {loading && fileData.length === 0 ? (
                <div className="p-4 text-gray-500 loading-indicator">Loading Google Drive...</div>
            ) : (
                (() => {
                    if (fileData.length === 0 && !loading) {
                        return <div className="p-4 text-gray-500">No files found or failed to load.</div>;
                    }
                    return (
                        <FileManagerComponent
                            ref={fileManagerRef}
                            height={'100%'}
                            id="google_drive_file_manager_flat"
                            fileSystemData={syncfusionFileSystemData}
                            view="Details"
                            allowDragAndDrop={true}
                            contextMenuSettings={{
                                file: [
                                    'Copy Path',
                                    'Cut', 'Copy', '|', 'Delete', 'Download', 'Rename'
                                ],
                                folder: [
                                    'Copy Path',
                                    'Open', '|', 'Cut', 'Copy', 'Paste', '|', 'Delete', 'Rename',
                                ],
                                layout: [
                                    'SortBy', 'View', 'Refresh', '|', 'Paste', '|', 'NewFolder', '|', 'SelectAll'
                                ],
                                visible: true
                            }}
                            menuOpen={handleMenuOpen}
                            menuClick={handleMenuClick}
                            navigationPaneSettings={{ visible: true }}
                            uploadListCreate={handleUploadListCreate}
                            beforeDelete={handleBeforeDelete}
                            beforeRename={handleBeforeRename}
                            beforeDownload={handleBeforeDownload}
                            beforeFolderCreate={handleBeforeFolderCreate}
                            beforeMove={handleBeforeMove}
                            fileOpen={handleFileOpen}
                            toolbarClick={handleToolbarClick}
                            toolbarSettings={{
                                visible: true,
                                items: [
                                    'NewFolder',
                                    'Upload',
                                    'SortBy',
                                    'Cut',
                                    'Copy',
                                    'Paste',
                                    'Delete',
                                    'Refresh',
                                    'Download',
                                    'Rename',
                                    'Selection',
                                    'View',
                                    'Details',
                                ]
                            }}
                        >
                            <Inject services={[NavigationPane, DetailsView, Toolbar]} />
                        </FileManagerComponent>
                    );
                })()
            )}
            {loading && fileData.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000,
                    pointerEvents: 'none',
                }}>
                    Loading...
                </div>
            )}
        </div>
    );
});