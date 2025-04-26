import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { GoogleDocsAdapter, DriveFile } from '@/lib/adapters/DocsAdapter';

export interface SyncfusionFileData {
    id: string;
    originalID?: string;
    name: string;
    isFile: boolean;
    hasChild: boolean;
    parentId: string | null;
    filterPath: string;
    type: string;
    size: number;
    dateCreated: Date;
    dateModified: Date;
    optimistic?: boolean;
    namePath: string;
}

interface DriveContextProps {
    fileData: SyncfusionFileData[];
    loading: boolean;
    error: string | null;
    rootDriveFolderId: string | null;
    filesWithContent: Record<string, { content: string | Uint8Array, dateModified: number }>;
    filesWithContentLoading: boolean;
    refreshFileData: () => Promise<void>;
    refreshFolder: (syncfusionFolderId: string) => Promise<void>;
    uploadFile: (file: File, parentSyncfusionId: string) => Promise<void>;
    createFolder: (folderName: string, parentSyncfusionId: string) => Promise<void>;
    deleteFileOrFolder: (itemId: string) => Promise<void>;
    renameFileOrFolder: (itemId: string, newName: string) => Promise<void>;
    moveFileOrFolder: (itemId: string, targetFolderId: string) => Promise<void>;
    copyFileOrFolder: (itemId: string, targetFolderId: string, newName?: string) => Promise<void>;
    downloadFileOrFolder: (itemId: string) => Promise<void>;
}

const DriveContext = createContext<DriveContextProps | undefined>(undefined);

export const useDrive = (): DriveContextProps => {
    const context = useContext(DriveContext);
    if (context === undefined) {
        throw new Error('useDrive must be used within a DriveProvider');
    }
    return context;
};

interface DriveProviderProps {
    children: ReactNode;
}

export const DriveProvider: React.FC<DriveProviderProps> = ({ children }) => {
    const [fileData, setFileData] = useState<SyncfusionFileData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rootDriveFolderId, setRootDriveFolderId] = useState<string | null>(null);
    const [docId, setDocId] = useState<string | null>(null);
    const [filesWithContent, setFilesWithContent] = useState<Record<string, { content: string | Uint8Array, dateModified: number }>>({});
    const [filesWithContentLoading, setFilesWithContentLoading] = useState(true);
    const adapter = React.useMemo(() => new GoogleDocsAdapter(), []);

    const mapDriveFileToSyncfusion = useCallback((file: DriveFile, parentSyncfusionId: string | null, parentFilterPath: string, parentNamePath: string): SyncfusionFileData => {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        const filterPath = parentFilterPath + file.id + (isFolder ? '/' : '');
        const namePath = parentNamePath ? `${parentNamePath}/${file.name}` : file.name;
        return {
            id: file.id,
            originalID: file.id,
            name: file.name,
            isFile: !isFolder,
            hasChild: isFolder,
            parentId: parentSyncfusionId,
            filterPath,
            type: isFolder ? '' : file.mimeType,
            size: file.size !== undefined ? Number(file.size) : 0,
            dateCreated: file.createdTime ? new Date(file.createdTime) : new Date(),
            dateModified: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
            namePath,
        };
    }, []);

    const fetchAndFlattenDriveFiles = useCallback(async (
        rootDriveFolderId: string,
        parentSyncfusionId: string | null = null,
        parentFilterPath: string = '/',
        parentNamePath: string = '',
        isRoot = true
    ): Promise<SyncfusionFileData[]> => {
        const children = await adapter.listFilesInFolder(rootDriveFolderId);
        const result: SyncfusionFileData[] = [];
        for (const file of children) {
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            const id = file.id;
            const filterPath = parentFilterPath + file.id + (isFolder ? '/' : '');
            const namePath = parentNamePath ? `${parentNamePath}/${file.name}` : file.name;
            const entry = mapDriveFileToSyncfusion(file, parentSyncfusionId ?? '0', parentFilterPath, parentNamePath);
            result.push(entry);
            if (isFolder) {
                const subChildren = await fetchAndFlattenDriveFiles(file.id, id, filterPath, namePath, false);
                result.push(...subChildren);
            }
        }
        return result;
    }, [adapter, mapDriveFileToSyncfusion]);

    useEffect(() => {
        console.log('Current fileData:', fileData);
    }, [fileData]);

    const refreshFileData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const currentDocId = await adapter.getDocumentId();
            if (!currentDocId) throw new Error('No document ID');
            setDocId(currentDocId);
            const { folderId } = await adapter.ensureDriveEnvironment(currentDocId);
            setRootDriveFolderId(folderId);
            const rootSyncfusionData: SyncfusionFileData = {
                id: '0',
                originalID: folderId,
                name: 'Root',
                isFile: false,
                hasChild: true,
                parentId: null,
                filterPath: '/',
                type: '',
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
                namePath: '',
            };
            const allFiles = await fetchAndFlattenDriveFiles(folderId, '0', '/', '');
            setFileData([rootSyncfusionData, ...allFiles]);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            console.error('Failed to load Google Drive files:', errorMessage);
        } finally {
            setLoading(false);
        }
    }, [adapter, fetchAndFlattenDriveFiles]);

    const refreshFolder = useCallback(async (syncfusionFolderId: string) => {
        setLoading(true);
        setError(null);
        try {
            let driveFolderIdToRefresh: string | null = null;
            let parentFilterPath = '/';
            let parentNamePath = '';
            let parentFolder: SyncfusionFileData | undefined = undefined;
            if (syncfusionFolderId === '0') {
                driveFolderIdToRefresh = rootDriveFolderId;
                parentFilterPath = '/';
                parentNamePath = '';
            } else {
                parentFolder = fileData.find(f => f.id === syncfusionFolderId && !f.isFile);
                if (!parentFolder || !parentFolder.originalID) return;
                driveFolderIdToRefresh = parentFolder.originalID;
                parentFilterPath = parentFolder.filterPath;
                parentNamePath = parentFolder.namePath;
            }
            if (!driveFolderIdToRefresh) return;
            const childrenDriveFiles = await adapter.listFilesInFolder(driveFolderIdToRefresh);
            const childrenSyncfusionData: SyncfusionFileData[] = childrenDriveFiles.map(file =>
                mapDriveFileToSyncfusion(file, syncfusionFolderId, parentFilterPath, parentNamePath)
            );
            setFileData(prev => {
                const dataWithoutOldChildren = prev.filter(item =>
                    item.parentId !== syncfusionFolderId &&
                    !(item.id && item.id.startsWith('temp-upload-') && item.parentId === syncfusionFolderId) &&
                    item.id !== syncfusionFolderId
                );
                const parentFolder = prev.find(item => item.id === syncfusionFolderId);
                const newData = parentFolder ? [...dataWithoutOldChildren, parentFolder, ...childrenSyncfusionData] : [...dataWithoutOldChildren, ...childrenSyncfusionData];
                const parentFolderIndex = newData.findIndex(item => item.id === syncfusionFolderId);
                if (parentFolderIndex > -1) {
                    newData[parentFolderIndex].hasChild = childrenSyncfusionData.length > 0;
                }
                const uniqueData = Array.from(new Map(newData.map(item => [item.id, item])).values());
                return uniqueData;
            });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            console.error('Failed to refresh folder contents:', errorMessage);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, rootDriveFolderId, mapDriveFileToSyncfusion]);

    const uploadFile = useCallback(async (file: File, parentSyncfusionId: string) => {
        if (!docId) throw new Error('Document ID not available');
        setLoading(true);
        setError(null);
        let parentFolderDriveId: string | null = null;
        let parentFilterPath = '/';
        if (parentSyncfusionId === '0') {
            parentFolderDriveId = rootDriveFolderId;
            parentFilterPath = '/';
        } else {
            const parentFolder = fileData.find(f => f.id === parentSyncfusionId);
            if (parentFolder && parentFolder.originalID) {
                parentFolderDriveId = parentFolder.originalID;
                parentFilterPath = parentFolder.filterPath;
            }
        }
        if (!parentFolderDriveId) {
            setError('Failed to determine parent folder ID');
            setLoading(false);
            return;
        }
        const tempId = 'temp-upload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const optimisticEntry: SyncfusionFileData = {
            id: tempId,
            name: file.name,
            isFile: true,
            hasChild: false,
            parentId: parentSyncfusionId,
            filterPath: parentFilterPath + tempId,
            type: file.type || 'application/octet-stream',
            size: file.size,
            dateCreated: new Date(),
            dateModified: new Date(),
            originalID: tempId,
            optimistic: true,
            namePath: (fileData.find(f => f.id === parentSyncfusionId)?.namePath || '') + (fileData.find(f => f.id === parentSyncfusionId)?.namePath ? '/' : '') + file.name,
        };
        setFileData(prev => {
            const newData = [...prev, optimisticEntry];
            const parentFolder = newData.find(item => item.id === parentSyncfusionId);
            if (parentFolder && !parentFolder.hasChild) {
                parentFolder.hasChild = true;
            }
            return newData;
        });
        try {
            await adapter.uploadFileInChunks(docId, file, parentFolderDriveId);
            await refreshFolder(parentSyncfusionId);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setFileData(prev => prev.filter(item => item.id !== tempId));
        } finally {
            setLoading(false);
        }
    }, [adapter, docId, fileData, refreshFolder, rootDriveFolderId]);

    const createFolder = useCallback(async (folderName: string, parentSyncfusionId: string) => {
        setLoading(true);
        setError(null);
        let parentFolderDriveId: string | null = null;
        let parentFilterPath = '/';
        if (parentSyncfusionId === '0') {
            parentFolderDriveId = rootDriveFolderId;
            parentFilterPath = '/';
        } else {
            const parentFolder = fileData.find(f => f.id === parentSyncfusionId);
            if (parentFolder && parentFolder.originalID) {
                parentFolderDriveId = parentFolder.originalID;
                parentFilterPath = parentFolder.filterPath;
            }
        }
        if (!parentFolderDriveId) {
            setError('Failed to determine parent folder ID');
            setLoading(false);
            return;
        }
        const tempId = 'temp-folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const optimisticEntry: SyncfusionFileData = {
            id: tempId,
            originalID: tempId,
            name: folderName,
            isFile: false,
            hasChild: false,
            parentId: parentSyncfusionId,
            filterPath: parentFilterPath + tempId + '/',
            type: '',
            size: 0,
            dateCreated: new Date(),
            dateModified: new Date(),
            optimistic: true,
            namePath: (fileData.find(f => f.id === parentSyncfusionId)?.namePath || '') + (fileData.find(f => f.id === parentSyncfusionId)?.namePath ? '/' : '') + folderName,
        };
        setFileData(prev => {
            const newData = [...prev, optimisticEntry];
            const parentFolder = newData.find(item => item.id === parentSyncfusionId);
            if (parentFolder && !parentFolder.hasChild) {
                parentFolder.hasChild = true;
            }
            return newData;
        });
        try {
            await adapter.createFolder(folderName, parentFolderDriveId);
            await refreshFolder(parentSyncfusionId);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setFileData(prev => prev.filter(item => item.id !== tempId));
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, refreshFolder, rootDriveFolderId]);

    const deleteFileOrFolder = useCallback(async (itemId: string) => {
        setLoading(true);
        setError(null);
        const itemToDelete = fileData.find(f => f.id === itemId);
        if (!itemToDelete || !itemToDelete.originalID) {
            setError('Item not found or missing original ID');
            setLoading(false);
            return;
        }
        const parentId = itemToDelete.parentId;
        const prevFileData = fileData;
        setFileData(prev => {
            const newData = prev.filter(f => f.id !== itemId);
            if (parentId) {
                const parentFolder = newData.find(item => item.id === parentId);
                if (parentFolder) {
                    const parentHasOtherChildren = newData.some(item => item.parentId === parentId);
                    if (!parentHasOtherChildren && parentFolder.hasChild) {
                        parentFolder.hasChild = false;
                    }
                }
            }
            return newData;
        });
        try {
            await adapter.deleteFileOrFolder(itemToDelete.originalID);
            if (parentId) {
                await refreshFolder(parentId);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setFileData(prevFileData);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, refreshFolder]);

    const renameFileOrFolder = useCallback(async (itemId: string, newName: string) => {
        setLoading(true);
        setError(null);
        const itemToRename = fileData.find(f => f.id === itemId);
        if (!itemToRename || !itemToRename.originalID) {
            setError('Item not found or missing original ID');
            setLoading(false);
            return;
        }
        const parentId = itemToRename.parentId;
        const prevFileData = fileData;
        setFileData(prev => prev.map(f => f.id === itemId ? { ...f, name: newName } : f));
        try {
            await adapter.renameFileOrFolder(itemToRename.originalID, newName);
            if (parentId) {
                await refreshFolder(parentId);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setFileData(prevFileData);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, refreshFolder]);

    const moveFileOrFolder = useCallback(async (itemId: string, targetFolderId: string) => {
        setLoading(true);
        setError(null);
        const itemToMove = fileData.find(f => f.id === itemId);
        const targetFolder = fileData.find(f => f.id === targetFolderId);
        if (!itemToMove || !itemToMove.originalID || !targetFolder || !targetFolder.originalID) {
            setError('Item or target folder not found or missing original ID');
            setLoading(false);
            return;
        }
        const sourceParentId = itemToMove.parentId;
        const prevFileData = fileData;
        try {
            if (sourceParentId) {
                const sourceParent = fileData.find(f => f.id === sourceParentId);
                if (sourceParent && sourceParent.originalID) {
                    await adapter.moveFileOrFolder(itemToMove.originalID, targetFolder.originalID, sourceParent.originalID);
                    await refreshFolder(sourceParentId);
                    await refreshFolder(targetFolderId);
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setFileData(prevFileData);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, refreshFolder]);

    const copyFileOrFolder = useCallback(async (itemId: string, targetFolderId: string, newName?: string) => {
        setLoading(true);
        setError(null);
        const itemToCopy = fileData.find(f => f.id === itemId);
        const targetFolder = fileData.find(f => f.id === targetFolderId);
        if (!itemToCopy || !itemToCopy.originalID || !targetFolder || !targetFolder.originalID) {
            setError('Item or target folder not found or missing original ID');
            setLoading(false);
            return;
        }
        try {
            await adapter.copyFileOrFolder(
                itemToCopy.originalID,
                newName || itemToCopy.name,
                targetFolder.originalID
            );
            await refreshFolder(targetFolderId);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, refreshFolder]);

    const downloadFileOrFolder = useCallback(async (itemId: string) => {
        setLoading(true);
        setError(null);
        const itemToDownload = fileData.find(f => f.id === itemId);
        if (!itemToDownload || !itemToDownload.originalID) {
            setError('Item not found or missing original ID');
            setLoading(false);
            return;
        }
        try {
            await adapter.downloadFileAndSave(itemToDownload.originalID, itemToDownload.name, itemToDownload.type);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData]);

    useEffect(() => {
        let cancelled = false;
        async function fetchAllContents() {
            if (fileData.length === 0) return;
            setFilesWithContentLoading(true);
            const fileMap: Record<string, { content: string | Uint8Array, dateModified: number }> = {};
            try {
                for (const file of fileData) {
                    if (file.isFile && file.originalID) {
                        try {
                            const cacheEntry = filesWithContent[file.namePath] as { content: string | Uint8Array, dateModified: number } | undefined;
                            const fileDate = file.dateModified instanceof Date ? file.dateModified.getTime() : new Date(file.dateModified).getTime();
                            if (cacheEntry && cacheEntry.dateModified === fileDate) {
                                fileMap[file.namePath] = cacheEntry;
                                continue;
                            }
                            let content = await adapter.fetchFileContent(file.originalID, file.type);
                            if (typeof content === 'string') {
                                fileMap[file.namePath] = { content, dateModified: fileDate };
                            } else if (content instanceof Blob) {
                                const arrayBuffer = await content.arrayBuffer();
                                fileMap[file.namePath] = { content: new Uint8Array(arrayBuffer), dateModified: fileDate };
                            }
                        } catch (e) {
                            // Ignore errors for individual files
                        }
                    }
                }
                if (!cancelled) {
                    setFilesWithContent(fileMap);
                }
            } finally {
                if (!cancelled) setFilesWithContentLoading(false);
            }
        }
        fetchAllContents();
        return () => { cancelled = true; };
    }, [fileData, adapter]);

    const contextValue: DriveContextProps = {
        fileData,
        loading,
        error,
        rootDriveFolderId,
        filesWithContent,
        filesWithContentLoading,
        refreshFileData,
        refreshFolder,
        uploadFile,
        createFolder,
        deleteFileOrFolder,
        renameFileOrFolder,
        moveFileOrFolder,
        copyFileOrFolder,
        downloadFileOrFolder,
    };

    return (
        <DriveContext.Provider value={contextValue}>
            {children}
        </DriveContext.Provider>
    );
};
