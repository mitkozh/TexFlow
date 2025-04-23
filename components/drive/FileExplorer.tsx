// file-explorer/FileExplorer.tsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { FileManagerComponent, Inject, NavigationPane, DetailsView, Toolbar, BeforeSendEventArgs, UploadListCreateArgs, DeleteEventArgs, RenameEventArgs, BeforeDownloadEventArgs, FolderCreateEventArgs, MoveEventArgs, FileInfo as SyncfusionFileInfo, FileOpenEventArgs, ToolbarClickEventArgs } from '@syncfusion/ej2-react-filemanager';
import { GoogleDocsAdapter, DriveFile } from '@/lib/adapters/DocsAdapter'; // Adjust import path if needed
import './FileExplorer.css';
import JSZip from 'jszip';

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
    const mapDriveFileToSyncfusion = (file: DriveFile, parentSyncfusionId: string | null, filterPath: string, isRoot = false): SyncfusionFileData => {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        // Note: We'll optimistically set hasChild for folders to true initially,
        // or check for children during read operation. Checking during map is inefficient.
        // A more accurate check could be done during initial load or beforeSend.
        // For simplicity in this mapping, we'll assume folders might have children.
        // A more robust solution would involve checking for children during the fetch process.
        const hasChild = isFolder ? true : false; // Optimistic assumption or requires child check

        return {
            // Use the actual Drive ID for non-root items, and '0' for the mapped root
            id: isRoot ? '0' : file.id,
            originalID: file.id, // Store the original Drive ID
            name: isRoot ? 'Root' : file.name, // Give a name to the root node
            isFile: !isFolder,
            hasChild: hasChild,
            // Parent ID is the Syncfusion ID of the parent
            parentId: parentSyncfusionId,
            filterPath: filterPath,
            type: isFolder ? '' : file.mimeType, // Syncfusion uses '' for folder type in flat data
            size: 0, // Google Drive API doesn't always provide size easily without extra calls or fields
            dateCreated: new Date(), // Placeholders
            dateModified: new Date(), // Placeholders
            // imageUrl: file.thumbnailLink // Uncomment if you fetch thumbnailLink
        };
    };

    // Helper to recursively fetch and flatten all files/folders from Google Drive
    const fetchAndFlattenDriveFiles = async (
        adapter: GoogleDocsAdapter,
        rootDriveFolderId: string,
        parentSyncfusionId: string | null = null,
        parentFilterPath: string = '/',
        isRoot = true
    ): Promise<SyncfusionFileData[]> => {
        // Fetch children of the current folder
        const children = await adapter.listFilesInFolder(rootDriveFolderId);
        const result: SyncfusionFileData[] = [];
        for (const file of children) {
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            const id = file.id;
            const filterPath = parentFilterPath + file.name + (isFolder ? '/' : '');
            const entry: SyncfusionFileData = {
                id,
                originalID: file.id,
                name: file.name,
                isFile: !isFolder,
                hasChild: isFolder, // Optimistic, or you can check children if needed
                parentId: parentSyncfusionId ?? '0',
                filterPath,
                type: isFolder ? '' : file.mimeType,
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
            };
            result.push(entry);
            if (isFolder) {
                // Recursively fetch children
                const subChildren = await fetchAndFlattenDriveFiles(adapter, file.id, id, filterPath, false);
                result.push(...subChildren);
            }
        }
        return result;
    };

    // Initial Load function (flat data mode)
    const fetchInitialFiles = useCallback(async () => {
        setInitialLoad(true);
        try {
            const docId = await adapter.getDocumentId();
            if (!docId) throw new Error('No document ID');
            const { folderId } = await adapter.ensureDriveEnvironment(docId);
            setRootDriveFolderId(folderId);
            // Root node for Syncfusion
            const rootSyncfusionData: SyncfusionFileData = {
                id: '0',
                originalID: folderId,
                name: 'Root',
                isFile: false,
                hasChild: true, // Assume root has children
                parentId: null,
                filterPath: '/',
                type: '',
                size: 0,
                dateCreated: new Date(),
                dateModified: new Date(),
            };
            // Recursively fetch and flatten all files/folders
            const allFiles = await fetchAndFlattenDriveFiles(adapter, folderId, '0', '/');
            setFileData([rootSyncfusionData, ...allFiles]);
        } catch (error) {
            console.error('[FileExplorer] Error during initial load:', error);
            alert('Failed to load Google Drive files: ' + (error instanceof Error ? error.message : error));
            setFileData([]);
        } finally {
            setInitialLoad(false);
        }
    }, [adapter]);

    useEffect(() => {
        fetchInitialFiles();
    }, [fetchInitialFiles]); // Depend on fetchInitialFiles

    // --- Syncfusion Event Handlers ---

    // Handles file upload initiated via File Manager toolbar/drag-drop
    const handleUploadListCreate = async (args: UploadListCreateArgs): Promise<void> => {
        // args.cancel = true; // Do NOT cancel here, let the default upload process start
        // args.cancel will only prevent the file dialog, not the actual upload list item creation
        // We handle the upload logic in handleFileChange triggered by our hidden input click,
        // OR we can integrate the adapter call directly here and manage the progress via Syncfusion upload events.
        // Let's stick to the hidden input for now as it's already implemented.
        console.log('uploadListCreate args:', args);
        // The files are in args.filesData[0].rawFile for single file upload, or args.filesData for multiple
        // However, the Syncfusion upload process manages chunks, status, etc.
        // Integrating directly with adapter.uploadFileInChunks here is better.

        // Assuming args.files contains the raw file data based on Syncfusion patterns
        // Use type assertion if the exact type isn't automatically inferred or imported correctly
        const filesToUpload = (args as any).files?.map((fileInfo: SyncfusionFileInfo) => fileInfo.rawFile) as File[] | undefined;
        if (!filesToUpload || filesToUpload.length === 0) return;

        const file = filesToUpload[0]; // Assuming single file upload for simplicity
        const uploadArgs = (args as any).files?.[0] as SyncfusionFileInfo | undefined; // Syncfusion file info for updating progress

        if (!uploadArgs) {
            console.error("Upload failed: Could not get upload arguments.");
            return; // Exit if uploadArgs is undefined
        }

        const docId = await adapter.getDocumentId();
        if (!docId) {
             alert('Upload failed: Document ID not found.');
             uploadArgs.status = 'Failed'; // Update Syncfusion UI status
             return;
        }

        let parentFolderDriveId = rootDriveFolderId;
        const fileManager = fileManagerRef.current;
        if (fileManager) {
            // Determine the parent folder ID from the current path
            const currentPath = fileManager.path; // Syncfusion's current path
            const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);
             parentFolderDriveId = parentFolderInView?.originalID || rootDriveFolderId;
        }

        if (!parentFolderDriveId) {
            alert('Upload failed: Could not determine parent folder.');
             uploadArgs.status = 'Failed'; // Update Syncfusion UI status
            return;
        }

        let tempId: string | null = null; // Declare outside try
        try {
            // Optimistically add the item to the fileData
            tempId = 'temp-upload-' + Date.now();
             const isFolder = file.type === ''; // Mime type will be empty for folders dropped/uploaded? Unlikely for standard file upload.
             const optimisticEntry: SyncfusionFileData = {
                 id: tempId,
                 name: file.name,
                 isFile: true, // Always true for file uploads
                 hasChild: false,
                 parentId: parentFolderDriveId === rootDriveFolderId ? '0' : parentFolderDriveId, // Map Drive ID to Syncfusion parent ID
                 filterPath: (fileManager?.path || '/') + file.name,
                 type: file.type || 'application/octet-stream',
                 size: file.size,
                 dateCreated: new Date(),
                 dateModified: new Date(),
                 originalID: tempId, // Use temp ID for originalID too initially
             };
             setFileData(prev => {
                 // Add the optimistic entry
                 const newData = [...prev, optimisticEntry];
                 // Ensure parent folder's hasChild is true
                 const parentFolder = newData.find(item => item.id === optimisticEntry.parentId);
                 if (parentFolder && !parentFolder.hasChild) {
                     parentFolder.hasChild = true; // Mutating directly within the update function is okay here
                 }
                 return newData;
             });

            console.log('Starting upload for file:', file.name, 'to parent:', parentFolderDriveId);
            const uploadedFile = await adapter.uploadFile(docId, file, parentFolderDriveId);
            console.log('Upload successful:', uploadedFile);

            // Update the optimistic entry with the real data
            setFileData(prev => prev.map(item => item.id === tempId ? {
                ...item,
                id: uploadedFile.id,
                originalID: uploadedFile.id,
                name: uploadedFile.name,
                type: uploadedFile.mimeType,
                size: 0, // DriveFile might not have size, default to 0
                optimistic: false, // Remove optimistic flag
                 // Note: filterPath might need adjustment if name changed during upload, but less likely for simple files
            } : item));
            // Update Syncfusion UI status (might need direct DOM manipulation or using fileManager instance methods)
            // Example (conceptual - may not work directly):
            // const uploadItem = fileManager.uploadObj.getFilesData().find(item => item.rawFile === file);
            // if (uploadItem) uploadItem.status = 'Completed';

        } catch (err) {
            console.error('Upload failed:', err);
             alert('Upload failed: ' + (err instanceof Error ? err.message : err));
             // Remove the optimistic entry on failure
             if (tempId) { // Check if tempId was assigned
                 setFileData(prev => prev.filter(item => item.id !== tempId));
             }
            // Update Syncfusion UI status (conceptual)
            // const uploadItem = fileManager.uploadObj.getFilesData().find(item => item.rawFile === file);
            // if (uploadItem) uploadItem.status = 'Failed';
        }
    };


    // Handles delete operation
    const handleBeforeDelete = async (args: DeleteEventArgs): Promise<void> => {
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
            console.warn("Delete operation: No matching items found in state.");
            return;
        }

        const idsToDelete = itemsToDelete.map(item => item.id);
        const prevFileData = fileData; // Store current state for rollback
        setFileData(prev => {
             const newData = prev.filter(f => !idsToDelete.includes(f.id));
             // Check and update hasChild for parent folders if needed
             itemsToDelete.forEach(deletedItem => { // deletedItem is SyncfusionFileData here
                 if (deletedItem.parentId) {
                     const parentFolder = newData.find(item => item.id === deletedItem.parentId);
                     if (parentFolder && parentFolder.hasChild) {
                         // Check if the parent still has children after deletion
                         const parentHasOtherChildren = newData.some(item => item.parentId === parentFolder.id);
                         if (!parentHasOtherChildren) {
                             parentFolder.hasChild = false; // Mutate directly
                         }
                     }
                 }
             });
             return newData;
        });


        try {
            for (const item of itemsToDelete) { // Iterate over items found in state
                 if (item.originalID) { // originalID is guaranteed by the filter above
                     await adapter.deleteFileOrFolder(item.originalID);
                     console.log('Deleted item:', item.name);
                 }
            }
            // No need to refetch if optimistic update was successful

        } catch (err) {
            console.error('Delete failed:', err);
            alert('Delete failed: ' + (err instanceof Error ? err.message : err));
            // Revert state on error
            setFileData(prevFileData);
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
        const oldFilterPath = itemToRename.filterPath;
        // Calculate parent path carefully
        const parentFilterPath = oldFilterPath.substring(0, oldFilterPath.lastIndexOf('/', oldFilterPath.length - (itemToRename.isFile ? 1 : 2)) + 1);
        const newFilterPath = parentFilterPath + newName + (itemToRename.isFile ? '' : '/');

        // Optimistically update state
        const prevFileData = fileData; // Store current state for rollback
        setFileData(prev => prev.map(f => {
            if (f.id === itemToRename.id) {
                // Update the renamed item itself
                return { ...f, name: newName, filterPath: newFilterPath };
            } else if (!itemToRename.isFile && f.filterPath.startsWith(oldFilterPath)) {
                // Update descendants of the renamed folder
                const relativePath = f.filterPath.substring(oldFilterPath.length);
                return { ...f, filterPath: newFilterPath + relativePath };
            }
            return f;
        }));

/*         try {
            await adapter.renameFileOrFolder(itemToRename.originalID, newName);
            console.log('Renamed item:', oldName, 'to', newName);
            // State update handles path changes optimistically
        } catch (err) {
            console.error('Rename failed:', err);
            alert('Rename failed: ' + (err instanceof Error ? err.message : err));
            // Revert state on error
            setFileData(prevFileData);
        } */
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
                                }
                           } else {
                                console.warn('Skipping download for item without originalID:', item);
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
                         // Add to zip using its name
                         zip.file(file.name, blob);
                         console.log('Added to zip:', file.name);
                     } catch (err) {
                         console.error('Failed to add file to zip:', file.name, err);
                         // Decide whether to fail the whole zip or skip the file
                     }
                 });

                 await Promise.all(promises); // Wait for all files to be added

                 // Generate and trigger download
                 zip.generateAsync({ type: 'blob' })
                     .then(zipBlob => {
                         const link = document.createElement('a');
                         link.href = URL.createObjectURL(zipBlob);
                         link.download = (itemsToDownload.length === 1 ? itemsToDownload[0].name : 'download') + '.zip';
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
        const folderName = (args as any).name || (args as any).data?.name;
        if (!folderName) {
             alert('Create folder failed: Folder name is empty.');
             return;
        }

        // Determine parent folder Drive ID from the current path
        let parentFolderDriveId: string | null = rootDriveFolderId; // Default to root
        let parentSyncfusionId: string | null = '0';
        let parentFilterPath = '/';

        const fileManager = fileManagerRef.current;
        if (fileManager) {
             const currentPath = fileManager.path;
             if (currentPath !== '/') {
                  // Find parent in state using filterPath
                  const parentFolderInView = fileData.find(f => f.filterPath === currentPath && !f.isFile);
                  if (parentFolderInView && parentFolderInView.originalID) { // Ensure originalID exists
                      parentFolderDriveId = parentFolderInView.originalID;
                      parentSyncfusionId = parentFolderInView.id;
                      parentFilterPath = parentFolderInView.filterPath;
                  } else {
                       console.warn('Could not find parent folder data in state for path:', currentPath);
                       alert('Create folder failed: Could not determine parent folder details.');
                       return;
                  }
             }
        } else {
             alert('Create folder failed: File manager not initialized.');
             return;
        }

         if (!parentFolderDriveId) { // Check if parentFolderDriveId is null (shouldn't be if rootDriveFolderId is set)
             alert('Create folder failed: Invalid parent folder information (Drive ID missing).');
             return;
         }

        let tempId: string | null = null; // Declare outside try
        try {
            // Optimistically add the new folder to the state
            tempId = 'temp-folder-' + Date.now();
             const optimisticEntry: SyncfusionFileData = {
                 id: tempId,
                 originalID: tempId, // Use temp ID for originalID too initially
                 name: folderName,
                 isFile: false,
                 hasChild: false, // New folders have no children initially
                 parentId: parentSyncfusionId,
                 filterPath: parentFilterPath + folderName + '/',
                 type: '', // Folder type
                 size: 0,
                 dateCreated: new Date(), // Placeholders
                 dateModified: new Date(), // Placeholders
             };

             setFileData(prev => {
                 // Add the optimistic entry
                 const newData = [...prev, optimisticEntry];
                 // Ensure parent folder's hasChild is true
                 const parentFolder = newData.find(item => item.id === parentSyncfusionId);
                 if (parentFolder && !parentFolder.hasChild) {
                     parentFolder.hasChild = true; // Mutating directly
                 }
                 return newData;
             });


            const newFolderDriveId = await adapter.createFolder(folderName, parentFolderDriveId);
            console.log('Created folder:', folderName, 'with Drive ID:', newFolderDriveId);

            // Update the optimistic entry with the real Drive ID
            setFileData(prev => prev.map(item => item.id === tempId ? {
                ...item,
                id: newFolderDriveId,
                originalID: newFolderDriveId,
                optimistic: false, // Remove optimistic flag
            } : item));

        } catch (err) {
            console.error('Create folder failed:', err);
            alert('Create folder failed: ' + (err instanceof Error ? err.message : err));
            // Remove the optimistic entry on failure
            if (tempId) { // Check if tempId was assigned
                setFileData(prev => prev.filter(item => item.id !== tempId));
            }
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
        const targetFolderFilterPath = targetFolder.filterPath;

         setLoading(true);
         const prevFileData = fileData; // Store current state for rollback

        try {
            for (const item of itemsToMoveOrCopy) {
                if (!item.originalID) { // Should be filtered out already
                    continue;
                }

                if (isCopy) {
                    // --- Copy Operation ---
                    const copyItemRecursively = async (itemToCopy: SyncfusionFileData, destParentDriveId: string, destParentSyncfusionId: string, destParentFilterPath: string) => {
                        if (itemToCopy.isFile) {
                            // Copy file using adapter
                            const copiedFile = await adapter.copyFileOrFolder(itemToCopy.originalID!, itemToCopy.name, destParentDriveId);
                            // Add to state
                            setFileData(prev => {
                                const newEntry: SyncfusionFileData = {
                                    id: copiedFile.id,
                                    originalID: copiedFile.id,
                                    name: copiedFile.name,
                                    isFile: true,
                                    hasChild: false,
                                    parentId: destParentSyncfusionId,
                                    filterPath: destParentFilterPath + copiedFile.name,
                                    type: copiedFile.mimeType,
                                    size: 0,
                                    dateCreated: new Date(),
                                    dateModified: new Date(),
                                };
                                // Ensure parent hasChild is true
                                const newData = [...prev, newEntry];
                                const parentFolder = newData.find(item => item.id === destParentSyncfusionId);
                                if (parentFolder && !parentFolder.hasChild) parentFolder.hasChild = true;
                                return newData;
                            });
                        } else {
                            // Copy folder: create new folder, then recursively copy contents
                            const newFolderDriveId = await adapter.createFolder(itemToCopy.name, destParentDriveId);
                            // Add new folder to state
                            setFileData(prev => {
                                const newEntry: SyncfusionFileData = {
                                    id: newFolderDriveId,
                                    originalID: newFolderDriveId,
                                    name: itemToCopy.name,
                                    isFile: false,
                                    hasChild: false, // will update if children are added
                                    parentId: destParentSyncfusionId,
                                    filterPath: destParentFilterPath + itemToCopy.name + '/',
                                    type: '',
                                    size: 0,
                                    dateCreated: new Date(),
                                    dateModified: new Date(),
                                };
                                // Ensure parent hasChild is true
                                const newData = [...prev, newEntry];
                                const parentFolder = newData.find(item => item.id === destParentSyncfusionId);
                                if (parentFolder && !parentFolder.hasChild) parentFolder.hasChild = true;
                                return newData;
                            });
                            // Recursively copy children
                            const children = fileData.filter(f => f.parentId === itemToCopy.id);
                            for (const child of children) {
                                await copyItemRecursively(child, newFolderDriveId, newFolderDriveId, destParentFilterPath + itemToCopy.name + '/');
                            }
                        }
                    };
                    for (const item of itemsToMoveOrCopy) {
                        await copyItemRecursively(item, targetFolderDriveId, targetFolderSyncfusionId, targetFolderFilterPath);
                    }
                } else {
                    // --- Move Operation (Cut + Paste) ---
                    console.log('Moving item:', item.name, 'from parentId:', item.parentId, 'to targetId:', targetFolderSyncfusionId);

                    // Find the original parent folder in state to get its Drive ID
                    const originalParentInState = fileData.find(f => f.id === item.parentId);
                    const originalParentDriveId = originalParentInState?.originalID;

                    if (!originalParentDriveId) {
                         console.error('Move failed: Could not determine original parent Drive ID for item:', item);
                         alert(`Move failed for ${item.name}: Could not find original parent.`);
                         throw new Error(`Move failed for ${item.name}: Could not find original parent.`);
                    }

                    // Prevent moving a folder into itself or its own descendant
                    if (!item.isFile && targetFolder.filterPath.startsWith(item.filterPath)) {
                         console.error('Move failed: Cannot move a folder into itself or a descendant.');
                         alert(`Cannot move folder "${item.name}" into itself or a descendant.`);
                         throw new Error('Invalid move operation: target is descendant.');
                    }

                    await adapter.moveFileOrFolder(item.originalID, targetFolderDriveId, originalParentDriveId);
                    console.log('Moved item successfully in Drive:', item.name);

                    // Update item in state to reflect new parent and path
                    // If moving a folder, update paths of all descendants as well
                    setFileData(prev => {
                         const movedItemId = item.id;
                         const oldFilterPathPrefix = item.filterPath;
                         const newFilterPathPrefix = targetFolderFilterPath + item.name + (item.isFile ? '' : '/');

                         const updatedData = prev.map(f => {
                             if (f.id === movedItemId) {
                                 // Update the moved item itself
                                 return {
                                     ...f,
                                     parentId: targetFolderSyncfusionId,
                                     filterPath: newFilterPathPrefix,
                                 };
                             } else if (!item.isFile && f.filterPath.startsWith(oldFilterPathPrefix)) {
                                 // Update descendants of the moved folder
                                 const relativePath = f.filterPath.substring(oldFilterPathPrefix.length);
                                 return {
                                     ...f,
                                     filterPath: newFilterPathPrefix + relativePath,
                                 };
                             }
                             return f; // Keep other items unchanged
                         });

                         // Update hasChild for old parent
                         const oldParent = updatedData.find(p => p.id === item.parentId);
                         if (oldParent) {
                             const oldParentStillHasChildren = updatedData.some(f => f.parentId === oldParent.id && f.id !== movedItemId);
                             if (!oldParentStillHasChildren && oldParent.hasChild) {
                                 oldParent.hasChild = false;
                             }
                         }

                         // Update hasChild for new parent
                         const newParent = updatedData.find(p => p.id === targetFolderSyncfusionId);
                         if (newParent && !newParent.hasChild) {
                             newParent.hasChild = true;
                         }

                         return updatedData;
                    });
                }
            }
            // Refresh might be needed after move/copy
            // fetchInitialFiles(); // Or refresh specific folders if possible

        } catch (err) {
            console.error(`${isCopy ? 'Copy' : 'Move'} failed:`, err);
            // Avoid alerting if it was the unimplemented copy
            if (!(isCopy && (err as Error).message === "Copy not implemented")) {
                 alert(`${isCopy ? 'Copy' : 'Move'} failed: ` + (err instanceof Error ? err.message : err));
            }
            // Revert state on error
            setFileData(prevFileData); // Simple rollback, may not fully revert complex folder copies/moves
        } finally {
             setLoading(false);
             // Refresh layout might help Syncfusion UI consistency
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
            args.cancel = true; // Prevent default Syncfusion upload UI
            if (fileInputRef.current) {
                fileInputRef.current.click();
            }
        } else if (itemId.endsWith('_refresh')) {
            console.log('Refresh clicked');
            args.cancel = true; // Prevent default refresh (we handle it)
            // Refresh the current folder view by triggering a read for the current path
            fileManager.refreshFiles();
            // If you want to refresh the entire tree including root, call fetchInitialFiles()
            fetchInitialFiles(); // Use this if you want a full refresh
        }
         // Syncfusion handles Cut, Copy, Paste, Delete, Rename, Download, NewFolder actions
         // internally based on the presence of these items in the toolbar/context menu
         // and will trigger the corresponding before events (beforeDelete, beforeRename, etc.)
         // which we have implemented above.
         // So, no need to manually call adapter methods here for these standard actions.

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
            };
            const urlPart = googleAppMimeTypes[item.type];
            if (urlPart) {
                 args.cancel = true; // Prevent Syncfusion trying to open it internally
                 const docId = item.originalID;
                 window.open(`https://docs.google.com/${urlPart}/${docId}/edit`, '_blank');
             }
             // Potentially handle other file types (e.g., PDFs, images) by downloading or previewing
        }
        // For folders, fileOpen will lead to beforeSend 'read' which we handle
    };


    // Use the existing hidden input for file selection triggered by the custom upload button click
    // Note: This doesn't use Syncfusion's built-in upload component capabilities (like progress bar)
    // It just selects files and calls our handler. The handleUploadListCreate above is a better place
    // to integrate with Syncfusion's upload component fully.
    // If you use the standard 'Upload' toolbar item, handleUploadListCreate is triggered.
    // The handleFileChange logic seems redundant if using the standard 'Upload' toolbar item.
    // Let's keep handleUploadListCreate for the actual upload logic and remove this.
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

    return (
        <div style={{ width: '100%', height: '100vh' }}>
            {/* Hidden file input - useful if you have a custom upload button not tied to Syncfusion's toolbar */}
            {/* If using Syncfusion's 'Upload' toolbar item, handleUploadListCreate is triggered */}
            {/* <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange} // Remove if using handleUploadListCreate
            /> */}

            {initialLoad ? (
                <div className="p-4 text-gray-500">Loading Google Drive...</div>
            ) : (
                (() => {
                    console.log('[FileExplorer] rendering FileManagerComponent with fileData:', fileData);
                    return (
                        <FileManagerComponent
                            ref={fileManagerRef}
                            height={'100%'}
                            id="google_drive_file_manager_flat"
                            fileSystemData={fileData as { [key: string]: Object }[]}
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
                 }}>
                     Loading...
                 </div>
             )}
        </div>
    );
};

// Helper to get file extension from mime type or name if needed for display
// function getFileTypeFromMime(mimeType: string, fileName: string): string {
//     if (mimeType === 'application/vnd.google-apps.folder') return ''; // Syncfusion uses '' for folder type
//     // Basic mapping, you might need a more comprehensive ozne
//     if (mimeType === 'text/plain') return 'txt';
//     if (mimeType === 'image/jpeg') return 'jpg';
//     if (mimeType === 'image/png') return 'png';
//     // For Google Docs files, use the exported type extension or a custom icon type
//     if (mimeType.startsWith('application/vnd.google-apps')) {
//          if (mimeType === 'application/vnd.google-apps.document') return 'gdoc'; // Custom type for icon
//          if (mimeType === 'application/vnd.goocangle-apps.spreadsheet') return 'gsheet'; // Custom type
//          // ... other Google types
//          return 'gfile'; // Generic Google file type
//     }
//     // Fallback to extension from name
//     const parts = fileName.split('.');
//     if (parts.length > 1) {
//         return parts[parts.length - 1].toLowerCase();
//     }
//     return 'file'; // Default generic type
// }