import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import LoadingButton from '@mui/lab/LoadingButton';
import { Fragment, useCallback, useState } from "react";
import { Grid2 } from "@mui/material";
import JSZip from "jszip";
import hotsyncEvents, { HotsyncEvents } from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";

async function zipFolderRecursively(folderHandle: FileSystemDirectoryHandle, zip: JSZip) {
    for await (const [name, handle] of (folderHandle as any).entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const fileData = await file.arrayBuffer();
            zip.file(name, fileData);
        } else if (handle.kind === 'directory') {
            const folderZip = zip.folder(name);
            if (folderZip) {
                await zipFolderRecursively(handle, folderZip);
            }
        }
    }
}

function getFormattedDateForFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}_${minutes}_${seconds}`;
}

async function clearOPFS(directoryHandle: FileSystemDirectoryHandle) {
    for await (const [name, handle] of (directoryHandle as any).entries()) {
        if (handle.kind === 'file') {
            await directoryHandle.removeEntry(name);
        } else if (handle.kind === 'directory') {
            const subDirectoryHandle = await directoryHandle.getDirectoryHandle(name);
            await clearOPFS(subDirectoryHandle);
            await directoryHandle.removeEntry(name, { recursive: true });
        }
    }
}

async function unzipToOPFS(zipFile: File, rootFolderHandle: FileSystemDirectoryHandle) {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipFile);

    for (const [relativePath, file] of Object.entries(zipContent.files)) {
        if (!file.dir) {
            const fileHandle = await createFileHandleFromPath(rootFolderHandle, relativePath);
            const writable = await fileHandle.createWritable();
            const content = await file.async("arraybuffer");
            await writable.write(content);
            await writable.close();
        } else {
            await createFolderHandleFromPath(rootFolderHandle, relativePath);
        }
    }
}

async function createFileHandleFromPath(rootFolderHandle: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
    const parts = path.split('/');
    const filename = parts.pop() as string;
    let folderHandle = rootFolderHandle;

    for (const part of parts) {
        folderHandle = await folderHandle.getDirectoryHandle(part, { create: true });
    }

    return folderHandle.getFileHandle(filename, { create: true });
}

async function createFolderHandleFromPath(rootFolderHandle: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
    const parts = path.split('/');
    let folderHandle = rootFolderHandle;

    for (const part of parts) {
        if (part == "") {
            continue;
        }
        folderHandle = await folderHandle.getDirectoryHandle(part, { create: true });
    }

    return folderHandle;
}

async function pickZipFile(): Promise<File> {
    const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Zip Files', accept: { 'application/zip': ['.zip'] } }],
        multiple: false,
    });
    return fileHandle.getFile();
}


export function DataMgmtPanel() {
    const theme = useTheme();
    const isWide = useMediaQuery(theme.breakpoints.up("sm"));
    const [processing, setProcessing] = useState(false);

    const handleExportClick = useCallback(async () => {
        setProcessing(true);
        
        const zip = new JSZip();
        const rootFolder = await navigator.storage.getDirectory();

        await zipFolderRecursively(rootFolder, zip);

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Create a download link and trigger it
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        const formattedDate = getFormattedDateForFilename();
        link.download = `pilot-bridge-backup_${formattedDate}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setProcessing(false);
    }, []);

    const handleImportClick = useCallback(async () => {
        const zipFile = await pickZipFile();
        const rootFolder = await navigator.storage.getDirectory();
        setProcessing(true);
        await clearOPFS(rootFolder);
        hotsyncEvents.emit(HotsyncEvents.HotsyncUserChanged);
        prefsStore.set("selectedDevice", '');
        await unzipToOPFS(zipFile, rootFolder);
        hotsyncEvents.emit(HotsyncEvents.HotsyncUserChanged);
        setProcessing(false);
    }, []);

    return (
        <Grid2 container spacing={1} p={2} justifyContent="center">
            <Grid2 size={{ xs: 12 }} />
            <Fragment key="0">
                <Grid2
                    size={{ xs: 7 }}
                >
                    <LoadingButton
                        onClick={handleExportClick}
                        loading={processing}
                        loadingIndicator="Processing…"
                        variant="contained"
                        fullWidth
                    >
                        Create data backup
                    </LoadingButton>
                </Grid2>
                {isWide && <Grid2 size={{ xs: 12 }} />}
            </Fragment>
            <Fragment key="1">
                <Grid2
                    size={{ xs: 7 }}
                >
                    <LoadingButton
                        onClick={handleImportClick}
                        loading={processing}
                        loadingIndicator="Processing…"
                        variant="contained"
                        fullWidth
                    >
                        Erase everything and import data backup
                    </LoadingButton>
                </Grid2>
                {isWide && <Grid2 size={{ xs: 12 }} />}
            </Fragment>
        </Grid2>
    );
}