// file-explorer/FileExplorer.tsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { FileManagerComponent, Inject, NavigationPane, DetailsView, Toolbar, BeforeSendEventArgs, UploadListCreateArgs, DeleteEventArgs, RenameEventArgs, BeforeDownloadEventArgs, FolderCreateEventArgs, MoveEventArgs, FileInfo as SyncfusionFileInfo, FileOpenEventArgs, ToolbarClickEventArgs } from '@syncfusion/ej2-react-filemanager';
import { GoogleDocsAdapter, DriveFile } from '@/lib/adapters/DocsAdapter'; // Adjust import path if needed
import './FileExplorer.css';
import JSZip from 'jszip';
import { error } from 'node:console';

// Define the expected structure for Syncfusion's flat data
interface SyncfusionFileData {
    id: string; // Syncfusion's internal ID ('0' for the root Google Drive folder)
    originalID?: string; // The actual Google Drive File ID
    name: string;
    isFile: boolean;
    hasChild: boolean; // Does folder have any children (files or folders)?
    parentId: string | null; // Syncfusion parent ID ('0' or ID of parent folder)
    filterPath: string; // Path string for navigation (e.g., '/', '/TexFlow-docId/', '/TexFlow-docId/SubFolder/')
    type: string; // File extension or 'folder' for folders
    size: number;
    dateCreated: Date; // Placeholder, Drive API might not provide easily
    dateModified: Date; // Placeholder, Drive API might not provide easily
    // Add other properties if needed for display (e.g., imageUrl for thumbnails)
    imageUrl?: string; // For image thumbnails, if needed
    optimistic?: boolean; // Flag for temporary entries added before API confirmation
    [key: string]: any; // Add index signature for Syncfusion compatibility
}

export const FileExplorer: React.FC = () => {
    const [fileData, setFileData] = useState<SyncfusionFileData[]>([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const adapter = useMemo(() => new GoogleDocsAdapter(), []);
    const fileManagerRef = useRef<FileManagerComponent>(null);
    const [rootDriveFolderId, setRootDriveFolderId] = useState<string | null>(null); // The actual Drive ID of the root folder (TexFlow-docId)
    const [initialLoad, setInitialLoad] = useState(true);

    // Helper to convert DriveFile to SyncfusionFileData
    // rootId mapping: The actual Google Drive ID of the root folder maps to Syncfusion's '0'
    const mapDriveFileToSyncfusion = useCallback((file: DriveFile, parentSyncfusionId: string | null, parentFilterPath: string): SyncfusionFileData => {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        const hasChild = isFolder ? true : false;
        // Use ID-based filterPath
        const filterPath = parentFilterPath + file.id + (isFolder ? '/' : '');
        return {
            id: file.id,
            originalID: file.id,
            name: file.name,
            isFile: !isFolder,
            hasChild: hasChild,
            parentId: parentSyncfusionId,
            filterPath: filterPath,
            type: isFolder ? '' : file.mimeType,
            size: 0,
            dateCreated: new Date(),
            dateModified: new Date(),
        };
    }, []);

    // Helper to recursively fetch and flatten all files/folders from Google Drive
    const fetchAndFlattenDriveFiles = useCallback(async (
        adapter: GoogleDocsAdapter,
        rootDriveFolderId: string,
        parentSyncfusionId: string | null = null,
        parentFilterPath: string = '/',
        isRoot = true
    ): Promise<SyncfusionFileData[]> => {
        const children = await adapter.listFilesInFolder(rootDriveFolderId);
        const result: SyncfusionFileData[] = [];
        for (const file of children) {
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            const id = file.id;
            // Use ID-based filterPath
            const filterPath = parentFilterPath + file.id + (isFolder ? '/' : '');
            const entry: SyncfusionFileData = {
                id,
                originalID: file.id,
                name: file.name,
                isFile: !isFolder,
                hasChild: isFolder,
                parentId: parentSyncfusionId ?? '0',
                filterPath,
                type: isFolder ? '' : file.mimeType,
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
            };
            result.push(entry);
            if (isFolder) {
                // Recursively fetch children, passing the current item's ID as the new parentSyncfusionId
                const subChildren = await fetchAndFlattenDriveFiles(adapter, file.id, id, filterPath, false);
                result.push(...subChildren);
            }
        }
        return result;
    }, [adapter]); // Dependencies for fetchAndFlattenDriveFiles

    // Initial Load function (flat data mode)
    const fetchInitialFiles = useCallback(async () => {
        setInitialLoad(true);
        setLoading(true); // Set loading for the whole process
        try {
            const docId = await adapter.getDocumentId();
            if (!docId) throw new Error('No document ID');
            const { folderId } = await adapter.ensureDriveEnvironment(docId);
            setRootDriveFolderId(folderId);
            // Root node for Syncfusion
            const rootSyncfusionData: SyncfusionFileData = {
                id: '0', // Syncfusion root ID
                originalID: folderId, // Actual Drive root folder ID
                name: 'Root',
                isFile: false,
                hasChild: true, // Assume root has children initially
                parentId: null, // Root has no parent
                filterPath: '/',
                type: '',
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
            };
            // Recursively fetch and flatten all files/folders starting from the root Drive folder ID
            const allFiles = await fetchAndFlattenDriveFiles(adapter, folderId, '0', '/'); // Pass '0' as the parentSyncfusionId for top-level items
            console.log('Fetched files file explorer:', allFiles);
            setFileData([rootSyncfusionData, ...allFiles]);
        } catch (error) {
            console.error('[FileExplorer] Error during initial load:', error);
            alert('Failed to load Google Drive files: ' + (error instanceof Error ? error.message : error));
            setFileData([]); // Clear data on error
        } finally {
            setInitialLoad(false);
            setLoading(false);
        }
    }, [adapter, fetchAndFlattenDriveFiles]); // Depend on adapter and fetchAndFlattenDriveFiles


    // Function to fetch contents of a specific folder and update state (for refresh)
    const fetchFolderContentsAndRefresh = useCallback(async (syncfusionFolderId: string) => {
        setLoading(true);
        try {
            let driveFolderIdToRefresh: string | null = null;
            let parentFilterPath = '/';

            if (syncfusionFolderId === '0') {
                 // If refreshing the root ('0'), use the rootDriveFolderId
                 driveFolderIdToRefresh = rootDriveFolderId;
                 parentFilterPath = '/';
            } else {
                // Find the Drive ID and filterPath of the folder to refresh from the state
                const folderToRefresh = fileData.find(f => f.id === syncfusionFolderId && !f.isFile);
                if (!folderToRefresh || !folderToRefresh.originalID) {
                    console.warn(`Could not refresh folder: Item with Syncfusion ID ${syncfusionFolderId} not found or missing originalID.`);
                    return;
                }
                driveFolderIdToRefresh = folderToRefresh.originalID;
                parentFilterPath = folderToRefresh.filterPath;
            }

             if (!driveFolderIdToRefresh) {
                 console.error(`Cannot refresh folder ${syncfusionFolderId}: rootDriveFolderId is null.`);
                 return;
             }

            console.log(`[fetchFolderContentsAndRefresh] Fetching children for Syncfusion ID: ${syncfusionFolderId}, Drive ID: ${driveFolderIdToRefresh}`);
            const childrenDriveFiles = await adapter.listFilesInFolder(driveFolderIdToRefresh);
            console.log(`[fetchFolderContentsAndRefresh] Fetched ${childrenDriveFiles.length} children.`);


            // Map DriveFiles to SyncfusionFileData, linking them to the parent Syncfusion ID
            const childrenSyncfusionData: SyncfusionFileData[] = childrenDriveFiles.map(file =>
                 mapDriveFileToSyncfusion(file, syncfusionFolderId, parentFilterPath)
            );

            setFileData(prev => {
                // Remove existing children of the folder being refreshed from the state.
                // IMPORTANT: Also remove any optimistic entries that might exist for this parent
                const dataWithoutOldChildren = prev.filter(item =>
                     item.parentId !== syncfusionFolderId && // Remove existing children of the folder being refreshed
                     !(item.id && item.id.startsWith('temp-upload-') && item.parentId === syncfusionFolderId) // Remove optimistic uploads for this parent
                     // Keep the parent folder itself
                     && item.id !== syncfusionFolderId
                );

                // Add the parent folder back if it was removed by the filter above (it shouldn't be, but safety)
                 const parentFolder = prev.find(item => item.id === syncfusionFolderId);
                 // Add the parent folder, then the new children
                 const newData = parentFolder ? [...dataWithoutOldChildren, parentFolder, ...childrenSyncfusionData] : [...dataWithoutOldChildren, ...childrenSyncfusionData];


                // Update hasChild status for the parent folder itself based on fetched children
                const parentFolderIndex = newData.findIndex(item => item.id === syncfusionFolderId);
                 if (parentFolderIndex > -1) {
                     // Mutate directly within the updater function
                     newData[parentFolderIndex].hasChild = childrenSyncfusionData.length > 0;
                     console.log(`[fetchFolderContentsAndRefresh] Updated parent ${syncfusionFolderId} hasChild: ${newData[parentFolderIndex].hasChild}`);
                 } else {
                      console.warn(`[fetchFolderContentsAndRefresh] Parent folder ${syncfusionFolderId} not found in newData after filtering.`);
                 }

                 // Ensure uniqueness by filtering out potential duplicates if any exist (optional but safe)
                 const uniqueData = Array.from(new Map(newData.map(item => [item.id, item])).values());


                console.log('[fetchFolderContentsAndRefresh] State updated for parent:', syncfusionFolderId, 'New total items:', uniqueData.length);
                return uniqueData; // Return the updated data
            });

             // Telling Syncfusion to refresh the current view might help UI consistency
             // This is sometimes needed in flat data mode after external state changes.
             // fileManagerRef.current?.refreshFiles(); // This method is for the component's internal state, setFileData should handle it.
             // A manual refresh triggered by the user will call fetchInitialFiles().

        } catch (error) {
            console.error(`[FileExplorer] Error refreshing folder ${syncfusionFolderId}:`, error);
            alert('Failed to refresh folder contents: ' + (error instanceof Error ? error.message : error));
        } finally {
            setLoading(false);
        }
    }, [adapter, fileData, rootDriveFolderId, mapDriveFileToSyncfusion]); // Dependencies for useCallback


    useEffect(() => {
        fetchInitialFiles();
    }, [fetchInitialFiles]); // Depend on fetchInitialFiles

    // --- Syncfusion Event Handlers ---

    // Handles file upload initiated via File Manager toolbar/drag-drop
    const handleUploadListCreate = async (args: UploadListCreateArgs): Promise<void> => {
        console.log('[handleUploadListCreate] args:', args);

        // Use args.fileInfo.rawFile for Syncfusion FileManager uploadListCreate event
        const file = (args as any).fileInfo?.rawFile as File | undefined;
        if (!file) {
            console.warn('[handleUploadListCreate] No file to upload.');
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }

        // Cancel Syncfusion's default upload handling since we're using a custom adapter
        (args as any).cancel = true;

        let docId;
        try {
            docId = await adapter.getDocumentId();
            console.log('[handleUploadListCreate] docId:', docId);
        } catch (e) {
            console.error('[handleUploadListCreate] Failed to get docId:', e);
            alert('Upload failed: Document ID not found.');
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }
        if (!docId) {
            alert('Upload failed: Document ID not found.');
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }

        // Determine parentFolderDriveId and parentSyncfusionId based on the current File Manager path
        let parentFolderDriveId = rootDriveFolderId; // Default to root Drive ID
        let parentSyncfusionId: string | null = '0'; // Default to root Syncfusion ID '0'
        let parentFilterPath = '/'; // Also get parent filter path for optimistic update

        const fileManager = fileManagerRef.current;
        if (fileManager) {
            const currentPath = fileManager.path; // Syncfusion's current path
            console.log('[handleUploadListCreate] fileManager.path:', currentPath);

            // Find the folder in our state that matches the current path
            const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);

            if (parentFolderInView) {
                parentFolderDriveId = parentFolderInView.originalID || rootDriveFolderId; // Fallback to root Drive ID
                parentSyncfusionId = parentFolderInView.id;
                parentFilterPath = parentFolderInView.filterPath;
            } else if (currentPath === '/') {
                // If the path is '/', it's the root
                parentFolderDriveId = rootDriveFolderId;
                parentSyncfusionId = '0';
                parentFilterPath = '/';
            } else {
                console.warn('[handleUploadListCreate] Could not find parent folder in state for path:', currentPath, 'Defaulting to root.');
                parentFolderDriveId = rootDriveFolderId;
                parentSyncfusionId = '0';
                parentFilterPath = '/';
            }
            console.log('[handleUploadListCreate] Determined parentFolderDriveId:', parentFolderDriveId, 'parentSyncfusionId:', parentSyncfusionId);
        } else {
            console.warn('[handleUploadListCreate] fileManagerRef not current, defaulting upload parent to root.');
            parentFolderDriveId = rootDriveFolderId;
            parentSyncfusionId = '0';
            parentFilterPath = '/';
        }

        if (!parentFolderDriveId) {
            alert('Upload failed: Could not determine parent folder Drive ID.');
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }
        if (parentSyncfusionId === null) {
            console.error('[handleUploadListCreate] Could not determine parent Syncfusion ID.');
            alert('Upload failed: Internal error determining parent folder.');
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';
            return;
        }

        let tempId: string | null = null;
        try {
            // Optimistically add the item to the fileData BEFORE starting the upload
            // Use a temporary ID that won't conflict with real Drive IDs
            tempId = 'temp-upload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const optimisticEntry: SyncfusionFileData = {
                id: tempId,
                name: file.name,
                isFile: true,
                hasChild: false,
                parentId: parentSyncfusionId,
                // Use ID-based filterPath
                filterPath: parentFilterPath + tempId,
                type: file.type || 'application/octet-stream',
                size: file.size,
                dateCreated: new Date(),
                dateModified: new Date(),
                originalID: tempId,
                optimistic: true,
            };
            console.log('[handleUploadListCreate] Adding optimistic entry:', optimisticEntry);

            setFileData(prev => {
                const newData = [...prev, optimisticEntry];
                // Ensure parent folder's hasChild is true if a child is added
                const parentFolder = newData.find(item => item.id === parentSyncfusionId);
                if (parentFolder && !parentFolder.hasChild) {
                    parentFolder.hasChild = true; // Mutate directly within the update function is okay here
                }
                return newData;
            });

            // Note: Updating Syncfusion's internal upload list UI status/progress requires
            // interacting with args.fileInfo or the fileManager.uploadObj instance,
            // which is more complex in a React state-managed scenario.
            // For now, we focus on getting the file correctly added to the file list after upload.

            console.log('[handleUploadListCreate] Starting upload for file:', file.name, 'to parent Drive ID:', parentFolderDriveId);
            // Call the upload method in the adapter. Use uploadFileInChunks for robustness.
            const uploadedFile = await adapter.uploadFileInChunks(docId, file, parentFolderDriveId);
            console.log('[handleUploadListCreate] Upload successful:', uploadedFile);

            // --- Post-Upload Success ---
            // Instead of manually mapping and replacing the optimistic entry,
            // re-fetch the contents of the parent folder. This ensures Syncfusion
            // gets the latest list of children from Drive with correct IDs and properties,
            // including the newly uploaded file. It also implicitly removes the optimistic entry
            // because fetchFolderContentsAndRefresh filters out items with parentId == parentSyncfusionId
            // before adding the newly fetched children.
            console.log(`[handleUploadListCreate] Refreshing parent folder with Syncfusion ID: ${parentSyncfusionId}`);
            await fetchFolderContentsAndRefresh(parentSyncfusionId);


            // After refresh, the item should appear correctly.
            // Manually marking the item in Syncfusion's upload list as complete might still be needed
            // for the upload progress UI to look right. This is complex with state management.

        } catch (err) {
            console.error('[handleUploadListCreate] Upload failed:', err, 'tempId:', tempId);
            alert('Upload failed: ' + (err instanceof Error ? err.message : err));

            // --- Post-Upload Failure ---
            // Remove the optimistic entry from state on failure
            // Ensure tempId was assigned before trying to filter
            if (tempId) {
                 setFileData(prev => prev.filter(item => item.id !== tempId)); // Filter out optimistic entry
            }

            // Manually update Syncfusion UI status if possible (more complex, conceptual)
            if ((args as any).fileInfo) (args as any).fileInfo.status = 'Failed';

            // You might also need to manually remove the failed item from Syncfusion's upload list UI.
            // This is complex and depends on how Syncfusion exposes this functionality.

        }
    };


    // Handles delete operation
    const handleBeforeDelete = async (args: DeleteEventArgs): Promise<void> => {
        console.log('beforeDelete args:', args);
        args.cancel = true; // Prevent default action

        // Access the file objects from args.data, which should have the ID
        const itemsToDeleteSyncfusion = (args.itemData || []) as { id: string, [key: string]: any }[]; // Assume items in data have an 'id'
        console.log('beforeDelete items (Syncfusion):', itemsToDeleteSyncfusion);

        if (itemsToDeleteSyncfusion.length === 0) return;

        // Find corresponding items in our state using the ID from Syncfusion's data
        const itemsToDelete = itemsToDeleteSyncfusion.map(syncItem => {
            const stateItem = fileData.find(f => f.id === syncItem.id);
            return stateItem;
        }).filter((item): item is SyncfusionFileData => item !== null && item !== undefined && !!item.originalID); // Ensure item exists, is not null/undefined, and has originalID

        if (itemsToDelete.length === 0) {
            console.warn("Delete operation: No matching items found in state with original ID.");
            // Still proceed if no items found in state? Or alert? Alerting might be better.
             alert("Delete operation failed: Could not find items in state or missing original IDs.");
            return;
        }

        const idsToDelete = itemsToDelete.map(item => item.id);
         // Collect parent IDs to potentially refresh them later
        const parentSyncfusionIdsToRefresh = new Set(itemsToDelete.map(item => item.parentId).filter((id): id is string => id !== null));


        const prevFileData = fileData; // Store current state for rollback

        // Optimistically remove from state
        setFileData(prev => {
            const newData = prev.filter(f => !idsToDelete.includes(f.id));

            // Update hasChild for parent folders if needed (check against the *new* data)
             parentSyncfusionIdsToRefresh.forEach(parentId => {
                 const parentFolder = newData.find(item => item.id === parentId);
                 if (parentFolder) {
                      const parentHasOtherChildren = newData.some(item => item.parentId === parentFolder.id);
                      if (!parentHasOtherChildren && parentFolder.hasChild) {
                          parentFolder.hasChild = false; // Mutate directly within the update function
                      }
                 }
             });

            return newData;
        });


        try {
            for (const item of itemsToDelete) { // Iterate over items found in state
                if (item.originalID) { // originalID is guaranteed by the filter above
                    await adapter.deleteFileOrFolder(item.originalID);
                    console.log('Deleted item successfully in Drive:', item.name);
                }
            }
            // After successful deletion in Drive, refresh the parent folder(s)
            // This is crucial for flat data to re-evaluate parent/child relationships and hasChild
            for (const parentId of parentSyncfusionIdsToRefresh) {
                 await fetchFolderContentsAndRefresh(parentId);
            }
             // If root items were deleted, refresh the root
            const deletedRootItems = itemsToDelete.filter(item => item.parentId === '0');
            if (deletedRootItems.length > 0) {
                await fetchFolderContentsAndRefresh('0');
            }


        } catch (err) {
            console.error('Delete failed:', err);
            alert('Delete failed: ' + (err instanceof Error ? err.message : err));
            // Revert state on error
            setFileData(prevFileData);
        } finally {
             // No specific loading indicator for delete in this implementation,
             // but you could set/unset a loading state if desired.
             fileManagerRef.current?.refreshLayout(); // Might help UI consistency
        }
    };

    // Handles rename operation
    const handleBeforeRename = async (args: RenameEventArgs): Promise<void> => {
        console.log('beforeRename args:', args);
        args.cancel = true; // Prevent default action

        // Access the file object from args.data
        const itemToRenameSyncfusion = (args.itemData as { id: string, [key: string]: any }[])?.[0];
        const newName = args.newName;

        if (!itemToRenameSyncfusion || !newName) {
            alert('Rename failed: Invalid item or new name.');
            return;
        }

        // Find the corresponding item in our state to get originalID and full data
        const itemToRename = fileData.find(f => f.id === itemToRenameSyncfusion.id);

        if (!itemToRename || !itemToRename.originalID) {
            alert('Rename failed: Could not find item in state or missing original ID.');
            return;
        }

        const oldName = itemToRename.name;
        const parentSyncfusionId = itemToRename.parentId; // Get parent ID for potential refresh


        // Optimistically update state
        const prevFileData = fileData; // Store current state for rollback

        setFileData(prev => {
            const updatedData = prev.map(f => {
                if (f.id === itemToRename.id) {
                    // Update the renamed item itself
                    // Note: FilterPath update is tricky with flat data and name changes.
                    // Relying on refresh after API call to fix paths is safer.
                    return { ...f, name: newName };
                }
                return f;
            });
            return updatedData;
        });

        try {
            await adapter.renameFileOrFolder(itemToRename.originalID, newName);
            console.log('Renamed item successfully in Drive:', oldName, 'to', newName);

            // After successful rename in Drive, refresh the parent folder
            // This is necessary to get the correct filterPath for the renamed item and its descendants
             if (parentSyncfusionId) {
                 await fetchFolderContentsAndRefresh(parentSyncfusionId);
             } else if (itemToRename.id === '0') { // If renaming the root (less common but possible)
                 await fetchFolderContentsAndRefresh('0');
             }


        } catch (err) {
            console.error('Rename failed:', err);
            alert('Rename failed: ' + (err instanceof Error ? err.message : err));
            // Revert state on error
            setFileData(prevFileData);
        } finally {
             fileManagerRef.current?.refreshLayout(); // Might help UI consistency
        }
    };

    // Handles download operation
    const handleBeforeDownload = async (args: BeforeDownloadEventArgs): Promise<void> => {
        console.log('beforeDownload args:', args);
        args.cancel = true; // Prevent default action

        // Access file objects from args.data
        const itemsToDownloadSyncfusion = (args.data || []) as { id: string, [key: string]: any }[];

        if (itemsToDownloadSyncfusion.length === 0) return;

        // Get full data including originalID from state
        const itemsToDownload = itemsToDownloadSyncfusion.map(syncItem => {
            const stateItem = fileData.find(f => f.id === syncItem.id);
            return stateItem;
        }).filter((item): item is SyncfusionFileData => item !== null && item !== undefined && !!item.originalID); // Ensure item exists, is not null/undefined, and has originalID

        if (itemsToDownload.length === 0) {
            alert('No downloadable items found (missing original ID or not found in state).');
            return;
        }


        setLoading(true);
        try {
            // If multiple items or a folder is selected, download as a zip
            if (itemsToDownload.length > 1 || itemsToDownload.some((item: SyncfusionFileData) => !item.isFile)) {
                // Collect all files (recursively for folders)
                const filesToZip: DriveFile[] = [];

                // Define a simpler type for items passed recursively
                type CollectableItem = { id: string; name: string; isFile: boolean; type: string; originalID?: string };

                const collectFiles = async (items: CollectableItem[]) => {
                    for (const item of items) {
                        const originalID = item.originalID; // Use originalID passed in

                        if (originalID) {
                            if (item.isFile) {
                                // For files, just add the original Drive ID and name
                                filesToZip.push({ id: originalID, name: item.name, mimeType: item.type });
                            } else {
                                // For folders, fetch children and recurse
                                try {
                                    const children = await adapter.listFilesInFolder(originalID);
                                    // Map DriveFile children to CollectableItem structure
                                    const childItems: CollectableItem[] = children.map(child => ({
                                        id: child.id,
                                        originalID: child.id,
                                        name: child.name,
                                        isFile: child.mimeType !== 'application/vnd.google-apps.folder',
                                        type: child.mimeType,
                                    }));
                                    await collectFiles(childItems);
                                } catch (err) {
                                    console.error(`Failed to list children for folder ${item.name} (${item.id}) during zip collection:`, err);
                                    // Continue with other items
                                }
                            }
                        } else {
                            console.warn('Skipping item without originalID during zip collection:', item);
                        }
                    }
                };

                // Initial call with items from state (which have originalID)
                await collectFiles(itemsToDownload);

                if (filesToZip.length === 0) {
                    alert('No downloadable files found.');
                    setLoading(false); // Ensure loading is turned off
                    return;
                }

                const zip = new JSZip();
                const promises = filesToZip.map(async (file) => {
                    try {
                        // Download the file content
                        const blob = await adapter.downloadFile(file.id);
                        // Add to zip using its name (handle potential name conflicts in zip if needed)
                        zip.file(file.name, blob);
                        console.log('Added to zip:', file.name);
                    } catch (err) {
                        console.error('Failed to add file to zip:', file.name, err);
                        // Decide whether to fail the whole zip or skip the file. Skipping for now.
                    }
                });

                await Promise.all(promises); // Wait for all files to be added

                 if (Object.keys(zip.files).length === 0) {
                     alert('Failed to add any files to the zip.');
                     return;
                 }

                // Generate and trigger download
                zip.generateAsync({ type: 'blob' })
                    .then(zipBlob => {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(zipBlob);
                        // Suggest a default download name
                        let downloadName = 'download';
                        if (itemsToDownload.length === 1) {
                            downloadName = itemsToDownload[0].name;
                        } else if (itemsToDownload.length > 1) {
                            downloadName = `selected_items`;
                        }
                         if (itemsToDownload.some(item => !item.isFile)) { // If any folder was included
                             downloadName = `folder_contents`;
                         }
                        link.download = downloadName + '.zip';

                        document.body.appendChild(link);
                        link.click();
                        setTimeout(() => {
                            document.body.removeChild(link);
                            URL.revokeObjectURL(link.href);
                        }, 100);
                    })
                    .catch(err => {
                        console.error('Failed to generate zip:', err);
                        alert('Failed to create zip file.');
                    });

            } else {
                // Single file download
                const item = itemsToDownload[0];
                if (item.originalID) { // originalID is guaranteed by the filter above
                    await adapter.downloadFileAndSave(item.originalID, item.name, item.type);
                    console.log('Downloaded single file:', item.name);
                } else {
                    console.warn('Cannot download item without originalID:', item);
                }
            }
        } catch (err) {
            console.error('Download operation failed:', err);
            alert('Download failed: ' + (err instanceof Error ? err.message : err));
        } finally {
            setLoading(false);
        }
    };

    // Handles folder creation
    const handleBeforeFolderCreate = async (args: FolderCreateEventArgs): Promise<void> => {
        console.log('beforeFolderCreate args:', args);
        args.cancel = true; // Prevent default action

        // Syncfusion might pass the name in args.name or args.data.name depending on version/context
        const folderName = (args as any).folderName || (args as any).name || (args as any).data?.name;
        if (!folderName) {
            alert('Create folder failed: Folder name is empty.');
            return;
        }

        // Determine parent folder Drive ID and Syncfusion ID from the current path
        let parentFolderDriveId: string | null = rootDriveFolderId; // Default to root Drive ID
        let parentSyncfusionId: string | null = '0'; // Default to root Syncfusion ID '0'
        let parentFilterPath = '/';

        const fileManager = fileManagerRef.current;
        if (fileManager) {
            const currentPath = fileManager.path;
            console.log('[handleBeforeFolderCreate] currentPath:', currentPath);
            if (currentPath !== '/') {
                // Try to find parent in state using filterPath
                const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);
                console.log('[handleBeforeFolderCreate] Found parent folder in state:', parentFolderInView);
                if (parentFolderInView && parentFolderInView.originalID) {
                    parentFolderDriveId = parentFolderInView.originalID;
                    parentSyncfusionId = parentFolderInView.id;
                    parentFilterPath = parentFolderInView.filterPath;
                } else {
                    console.warn('[handleBeforeFolderCreate] Could not find parent folder data in state for path:', currentPath, 'Defaulting to root.');
                    // If parent not found in state for the current path (shouldn't happen with correct data loading),
                    // default to creating in the root folder.
                     parentFolderDriveId = rootDriveFolderId;
                     parentSyncfusionId = '0';
                     parentFilterPath = '/';
                     // Optionally, alert the user or throw an error if defaulting is not desired.
                     // alert('Create folder failed: Could not determine parent folder details.');
                     // return;
                }
            } else {
                 // Path is '/', parent is the root
                 parentFolderDriveId = rootDriveFolderId;
                 parentSyncfusionId = '0';
                 parentFilterPath = '/';
            }
        } else {
             console.warn('[handleBeforeFolderCreate] fileManagerRef not current, defaulting parent to root.');
            // If fileManagerRef is not current, default to creating in the root folder
             parentFolderDriveId = rootDriveFolderId;
             parentSyncfusionId = '0';
             parentFilterPath = '/';
             // Optionally, alert the user if file manager isn't ready.
             // alert('Create folder failed: File manager not initialized.');
             // return;
        }

        if (!parentFolderDriveId || parentSyncfusionId === null) {
            alert('Create folder failed: Invalid parent folder information (Drive ID or Syncfusion ID missing).');
            return;
        }

        let tempId: string | null = null;
        try {
            // Optimistically add the folder to the state
            tempId = 'temp-folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const optimisticEntry: SyncfusionFileData = {
                id: tempId,
                originalID: tempId,
                name: folderName,
                isFile: false,
                hasChild: false, // New folder has no children initially
                parentId: parentSyncfusionId,
                // Use ID-based filterPath
                filterPath: parentFilterPath + tempId + '/',
                type: '', // Folder type is empty in flat data
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
                optimistic: true,
            };
            setFileData(prev => {
                const newData = [...prev, optimisticEntry];
                // Ensure parent folder's hasChild is true
                const parentFolder = newData.find(item => item.id === parentSyncfusionId);
                if (parentFolder && !parentFolder.hasChild) {
                    parentFolder.hasChild = true; // Mutate directly
                }
                return newData;
            });

            console.log('[handleBeforeFolderCreate] Creating folder:', folderName, 'in parent Drive ID:', parentFolderDriveId);
            const newFolderDriveId = await adapter.createFolder(folderName, parentFolderDriveId);
            console.log('Created folder successfully in Drive:', folderName, 'with Drive ID:', newFolderDriveId);

            // --- Post-Creation Success ---
            // Refresh the parent folder view to show the newly created folder
            console.log(`[handleBeforeFolderCreate] Refreshing parent folder with Syncfusion ID: ${parentSyncfusionId}`);
            await fetchFolderContentsAndRefresh(parentSyncfusionId);

            // The refresh will handle replacing the optimistic entry with the real one from Drive's list.

        } catch (err) {
            console.error('Create folder failed:', err);
            alert('Create folder failed: ' + (err instanceof Error ? err.message : err));

            // --- Post-Creation Failure ---
            // Remove the optimistic entry on failure
            if (tempId) {
                setFileData(prev => prev.filter(item => item.id !== tempId));
            }
             // Revert parent hasChild if this was the only child
             setFileData(prev => {
                 const newData = [...prev];
                 const parentFolder = newData.find(item => item.id === parentSyncfusionId);
                  if (parentFolder) {
                      const parentStillHasChildren = newData.some(item => item.parentId === parentFolder.id && item.id !== tempId);
                       if (!parentStillHasChildren && parentFolder.hasChild) {
                           parentFolder.hasChild = false;
                       }
                  }
                  return newData;
             });

        } finally {
             fileManagerRef.current?.refreshLayout(); // Might help UI consistency
        }
    };


    // Handles cut and copy/paste operations
    const handleBeforeMove = async (args: MoveEventArgs): Promise<void> => {
        console.log('beforeMove args:', args);
        args.cancel = true; // Prevent default action

        // Access file objects from args.data and targetData
        const itemsToMoveOrCopySyncfusion = (args.itemData || []) as { id: string, [key: string]: any }[];
        // FIX: targetData is a single object, not an array
        const targetFolderSyncfusion = args.targetData as { id: string, [key: string]: any } | undefined;
        const isCopy = args.isCopy;

        if (itemsToMoveOrCopySyncfusion.length === 0 || !targetFolderSyncfusion) {
            alert(`${isCopy ? 'Copy' : 'Move'} failed: Invalid items or target folder.`);
            return;
        }

        // Get full data from state for items and target
        const itemsToMoveOrCopy = itemsToMoveOrCopySyncfusion.map(syncItem => {
            const stateItem = fileData.find(f => f.id === syncItem.id);
            return stateItem;
        }).filter((item): item is SyncfusionFileData => item !== null && item !== undefined && !!item.originalID); // Ensure item exists, is not null/undefined, and has originalID

        const targetFolder = fileData.find(f => f.id === targetFolderSyncfusion.id);

        if (itemsToMoveOrCopy.length === 0 || !targetFolder || !targetFolder.originalID) {
            alert(`${isCopy ? 'Copy' : 'Move'} failed: Could not find items/target in state or missing original ID.`);
            return;
        }

        const targetFolderDriveId = targetFolder.originalID;
        const targetFolderSyncfusionId = targetFolder.id;
        // Need the original parent Syncfusion ID(s) for refresh after move
        const originalParentSyncfusionIds = new Set(itemsToMoveOrCopy.map(item => item.parentId).filter((id): id is string => id !== null));


        setLoading(true);
        const prevFileData = fileData; // Store current state for rollback

        // No optimistic state update BEFORE API calls for moves/copies in this revised approach.
        // The state will be updated by refreshing relevant folders AFTER the API calls succeed.

        try {
           for (const item of itemsToMoveOrCopy) {
               if (!item.originalID) continue; // Should be filtered out already

               if (isCopy) {
                   // --- Copy Operation ---
                    // Note: Your adapter.copyFileOrFolder only copies files.
                    // Recursive folder copy is not implemented in the adapter.
                    if (item.isFile) {
                         await adapter.copyFileOrFolder(item.originalID, item.name, targetFolderDriveId);
                         console.log('Copied file successfully in Drive:', item.name);
                    } else {
                         console.warn(`Skipping folder copy for "${item.name}": Folder copy not implemented in adapter.`);
                         // Decide how to handle skipped items - alert or throw? Throwing stops the operation.
                         throw new Error(`Copy failed for "${item.name}": Copying folders is not supported yet.`);
                    }

               } else {
                   // --- Move Operation (Cut + Paste) ---
                    // Find the original parent folder in state to get its Drive ID for the move API call
                    // Use prevFileData to find the state *before* the operation started
                    const originalParentInState = prevFileData.find(f => f.id === item.parentId);
                    const originalParentDriveId = originalParentInState?.originalID;

                   if (!originalParentDriveId) {
                       console.error('Move failed: Could not determine original parent Drive ID for item:', item);
                       // Instead of alerting here for each item, throw and catch outside loop
                        throw new Error(`Move failed for ${item.name}: Could not find original parent.`);
                   }

                    // Prevent moving a folder into itself or its own descendant
                    if (!item.isFile && targetFolder.filterPath.startsWith(item.filterPath)) {
                        console.error('Move failed: Cannot move a folder into itself or a descendant.');
                        throw new Error(`Cannot move folder "${item.name}" into itself or a descendant.`);
                    }

                   await adapter.moveFileOrFolder(item.originalID, targetFolderDriveId, originalParentDriveId);
                   console.log('Moved item successfully in Drive:', item.name);
               }
           }

           // --- Post-Move/Copy Success ---
           // Refresh the target folder view to show the newly moved/copied items
           console.log(`[handleBeforeMove] Refreshing target folder with Syncfusion ID: ${targetFolderSyncfusionId}`);
           await fetchFolderContentsAndRefresh(targetFolderSyncfusionId);

           // If it was a move, also refresh the original parent folders to reflect removal
           if (!isCopy) {
                for (const oldParentId of originalParentSyncfusionIds) {
                     if (oldParentId === targetFolderSyncfusionId) {
                         // If moving within the same folder, no need to refresh the old parent
                         continue;
                     }
                    console.log(`[handleBeforeMove] Refreshing original parent folder with Syncfusion ID: ${oldParentId}`);
                    // This refresh will remove the moved items from the old parent's children list in the state
                    await fetchFolderContentsAndRefresh(oldParentId);
                }
           }


       } catch (err) {
           console.error(`${isCopy ? 'Copy' : 'Move'} failed:`, err);
            // Avoid alerting if it was the unimplemented copy
            if (!(isCopy && (err as Error).message === `Copy failed for "${itemsToMoveOrCopy[0]?.name}": Copying folders is not supported yet.`)) {
                 alert(`${isCopy ? 'Copy' : 'Move'} failed: ` + (err instanceof Error ? err.message : err));
            }
           // Revert state on error. This is a simple rollback to the state before the operation started.
           setFileData(prevFileData);
       } finally {
           setLoading(false);
           // This might help Syncfusion's UI recognize the state change and update its view.
           fileManagerRef.current?.refreshLayout();
       }
    };


    // --- Toolbar and Context Menu Handler ---
    const handleToolbarClick = (args: ToolbarClickEventArgs) => { // Use specific type
        console.log('toolbarClick args:', args);
        const fileManager = fileManagerRef.current;
        if (!fileManager || !args.item || !args.item.id) {
            return;
        }

        const itemId = args.item.id;

        if (itemId.endsWith('_upload')) {
            // Trigger the hidden file input click for custom upload handling
            // Note: This approach bypasses Syncfusion's built-in upload list UI.
            // handleUploadListCreate is triggered by standard drag/drop or toolbar click
            // when default upload is *not* cancelled.
            // Keeping this as an alternative trigger if needed, but relying on handleUploadListCreate
            // and cancelling default is better for integrating with Syncfusion's upload features.
            // For now, remove the manual file input click here and let Syncfusion handle triggering handleUploadListCreate.
            // args.cancel = true; // Let Syncfusion's upload process trigger handleUploadListCreate
            // if (fileInputRef.current) {
            //     fileInputRef.current.click();
            // }
        } else if (itemId.endsWith('_refresh')) {
            console.log('Refresh clicked');
            args.cancel = true; // Prevent default refresh (we handle it)
            // Refresh the current folder view by triggering a read for the current path
            // File manager will internally call beforeSend 'read' which we handle to fetch data.
            // Alternatively, you could call fetchInitialFiles() for a full tree refresh.
             fileManager.refreshFiles(); // This should trigger beforeSend 'read' for the current path
            // If you want a full refresh including the navigation pane structure:
            // fetchInitialFiles();
        }
        // Syncfusion handles Cut, Copy, Paste, Delete, Rename, Download, NewFolder actions
        // internally based on the presence of these items in the toolbar/context menu
        // and will trigger the corresponding before events (beforeDelete, beforeRename, etc.)
        // which we have implemented above.
        // So, no need to manually call adapter methods here for these standard actions.

    };

     // Handle beforeSend event to fetch children for a folder when navigating into it
    const handleBeforeSend = async (args: BeforeSendEventArgs): Promise<void> => {
        console.log('[beforeSend] args:', args);
        // This event is triggered by Syncfusion when it needs data,
        // e.g., on initial load, navigating into a folder ('read' action).

        // In flat data mode with a pre-loaded tree, Syncfusion usually doesn't need
        // to call the adapter for 'read' of children if the data is already in `fileSystemData`.
        // However, if you only load a partial tree initially and want to load children on demand,
        // you would handle the 'read' action here.

        // Given your `fetchInitialFiles` loads the full tree recursively,
        // you might not need a complex handler for 'read' here unless you
        // are implementing lazy loading.

        // If `fetchInitialFiles` loads the full tree, Syncfusion should be able
        // to derive the structure and children relationships from `fileData` internally.
        // The `fetchFolderContentsAndRefresh` is used for *refreshing* after modifications,
        // not for initial loading/navigation into already loaded folders.

        // However, if you *only* load the root and its direct children in `fetchInitialFiles`,
        // then you WOULD need to handle `args.action === 'read'` here to fetch children
        // of the folder specified in `args.ajaxSettings.data`.

        // Based on your `fetchAndFlattenDriveFiles`, you are loading the full tree.
        // So, this beforeSend 'read' handler might not be necessary for basic navigation,
        // but it's crucial if you switch to lazy loading or need to augment data.

        // If you were doing lazy loading, a simplified handler might look like:
        /*
        if (args.action === 'read') {
            const data = JSON.parse(args.ajaxSettings.data).data[0]; // Get the folder item Syncfusion wants children for
            const syncfusionFolderId = data ? data.id : null;

            if (syncfusionFolderId && syncfusionFolderId !== '0' && !fileData.some(item => item.parentId === syncfusionFolderId)) {
                 // Folder exists, is not root, and we haven't loaded its children yet
                 try {
                     const folderToRead = fileData.find(f => f.id === syncfusionFolderId && !f.isFile);
                     if (folderToRead && folderToRead.originalID) {
                         console.log(`[beforeSend:read] Lazily fetching children for ${folderToRead.name}`);
                         const children = await adapter.listFilesInFolder(folderToRead.originalID);
                         const childrenSyncfusionData = children.map(file =>
                             mapDriveFileToSyncfusion(file, syncfusionFolderId, folderToRead.filterPath)
                         );

                         // Add fetched children to state
                         setFileData(prev => [...prev, ...childrenSyncfusionData]);

                         // Optionally, tell Syncfusion the read is complete?
                         // This part is tricky with async operations and Syncfusion's internal model binding in flat data.
                         // Letting Syncfusion handle the state change via prop update might be enough.
                     }
                 } catch (error) {
                     console.error(`[beforeSend:read] Failed to load children for folder ${syncfusionFolderId}:`, error);
                      // How to signal error back to Syncfusion in beforeSend? Might need custom provider.
                 }
            }
            // In flat data, args.cancel = true might be needed if you fully handle the data fetching
            // and don't want Syncfusion trying to use its default mechanisms.
            // args.cancel = true;
        }
        */

         // If you find Syncfusion is making 'read' calls you don't expect with the full tree loaded,
         // you might need to examine the args.ajaxSettings.data structure and potentially cancel the call
         // if the data is already present in your `fileData`.
    };


    // Optional: Hook into file open event if you need custom action on opening a file
    const handleFileOpen = async (args: FileOpenEventArgs) => { // Use specific type
        console.log('fileOpen args:', args);
        // Access the file object from args.fileDetails
        const itemSyncfusion = args.fileDetails as { id: string, [key: string]: any } | undefined;
        if (!itemSyncfusion) return;

        // Find item in state for full details
        const item = fileData.find(f => f.id === itemSyncfusion.id);

        if (item && item.isFile && item.originalID) {
            // Example: Open Google Docs/Sheets/Slides in a new tab
            const googleAppMimeTypes: { [key: string]: string } = {
                'application/vnd.google-apps.document': 'document/d',
                'application/vnd.google-apps.spreadsheet': 'spreadsheets/d',
                'application/vnd.google-apps.presentation': 'presentation/d',
                'application/vnd.google-apps.drawing': 'drawings/d',
                'application/vnd.google-apps.script': 'script/d',
            };
            const urlPart = googleAppMimeTypes[item.type];
            if (urlPart) {
                args.cancel = true; // Prevent Syncfusion trying to open it internally
                const docId = item.originalID;
                window.open(`https://docs.google.com/${urlPart}/${docId}/edit`, '_blank');
            } else {
                 // For non-Google Docs files, you could trigger a download or preview
                 console.log(`[fileOpen] Attempting to open non-Google file: ${item.name}`);
                 // You could call your download logic here or open a preview modal
                 // await adapter.downloadFileAndSave(item.originalID, item.name, item.type); // Example: auto-download on open
                 // Or display an alert:
                 // alert(`Cannot open file type "${item.type}". Downloading instead.`);
                 // await adapter.downloadFileAndSave(item.originalID, item.name, item.type);
            }
        } else if (item && !item.isFile) {
             // If it's a folder, Syncfusion's default behavior is to navigate,
             // which should trigger a state update or a 'read' beforeSend call if doing lazy loading.
             // With full tree loaded, Syncfusion navigates internally based on fileSystemData.
             console.log(`[fileOpen] Navigating into folder: ${item.name}`);
             // No need to cancel unless you want to override folder navigation.
        } else {
             console.warn('[fileOpen] Item not found in state or not a valid item to open:', item);
        }
    };


    // Use the existing hidden input for file selection triggered by the custom upload button click
    // Note: This doesn't use Syncfusion's built-in upload component capabilities (like progress bar)
    // It just selects files and calls our handler. The handleUploadListCreate above is a better place
    // to integrate with Syncfusion's upload component fully.
    // If you use the standard 'Upload' toolbar item, handleUploadListCreate is triggered.
    // The handleFileChange logic seems redundant if using the standard 'Upload' toolbar item.
    // Let's keep handleUploadListCreate for the actual upload logic and remove this manual input handler.
    /*
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        // This logic is better placed within handleUploadListCreate
        // ... logic to get parent folder and call adapter.uploadFile ...
         if (fileInputRef.current) fileInputRef.current.value = ''; // Clear input
    };
    */


    // Map Syncfusion context menu items to toolbarClick for consistency if needed, or handle context menu events separately
    // Syncfusion's contextMenuSettings handles standard actions by triggering corresponding `before` events.
    // For custom context menu items, you'd use `contextMenuItemClick`.

     // Use useMemo to ensure fileSystemData is only updated when fileData changes
     const syncfusionFileSystemData = useMemo(() => fileData as { [key: string]: Object }[], [fileData]);


    return (
        <div className="file-explorer-container" style={{ width: '100%', height: '100vh' }}>
            {/* Hidden file input - useful if you have a custom upload button not tied to Syncfusion's toolbar */}
            {/* If using Syncfusion's 'Upload' toolbar item, handleUploadListCreate is triggered */}
            {/* <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange} // If using custom input
                multiple // Allow multiple file selection if needed
            /> */}

            {initialLoad ? (
                <div className="p-4 text-gray-500 loading-indicator">Loading Google Drive...</div>
            ) : (
                (() => {
                    console.log('[FileExplorer] rendering FileManagerComponent with fileData:', fileData.length, 'items');
                     if (fileData.length === 0 && !initialLoad) {
                         return <div className="p-4 text-gray-500">No files found or failed to load.</div>;
                     }
                    return (
                        <FileManagerComponent
                            ref={fileManagerRef}
                            height={'100%'}
                            id="google_drive_file_manager_flat"
                            fileSystemData={syncfusionFileSystemData} // Use the memoized data
                            view="Details"
                            allowDragAndDrop={true}
                            contextMenuSettings={{
                                file: ['Cut', 'Copy', '|', 'Delete', 'Download', 'Rename', '|', 'Details'],
                                folder: ['Open', '|', 'Cut', 'Copy', 'Paste', '|', 'Delete', 'Rename', '|', 'Details'],
                                layout: ['SortBy', 'View', 'Refresh', '|', 'Paste', '|', 'NewFolder', '|', 'Details', '|', 'SelectAll'],
                                visible: true
                            }}
                            navigationPaneSettings={{ visible: true }}
                            uploadListCreate={handleUploadListCreate}
                            beforeDelete={handleBeforeDelete}
                            beforeRename={handleBeforeRename}
                            beforeDownload={handleBeforeDownload}
                            beforeFolderCreate={handleBeforeFolderCreate}
                            beforeMove={handleBeforeMove}
                            fileOpen={handleFileOpen}
                            toolbarClick={handleToolbarClick}
                            // Add beforeSend if implementing lazy loading or need custom request handling
                            // beforeSend={handleBeforeSend}
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
            {/* Optional loading indicator overlay */}
            {loading && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000,
                    pointerEvents: 'none', // Allows interaction with File Manager behind the overlay
                }}>
                    Loading...
                </div>
            )}
        </div>
    );
};