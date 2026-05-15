import { useState, useMemo, useEffect } from "react";
import {
    Box, Typography, List, ListItemButton, ListItemText,
    Collapse, Paper, Divider, Button, Stack
} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";

import { Panel } from "../panel";
import { PalmIcon } from "../components/PalmIcon";
import {
    extractAllTAIBBitmapsFromResource,
    toUint8Array
} from "../utils/taib-extractor";
import { TAIBBitmap } from "../utils/taib-types";

interface PrcExplorerPanelProps {
    database: RawPdbDatabase | RawPrcDatabase | null;
}

interface ResourceRecord {
    entry: {
        type: string;
        resourceId: number;
        localChunkId?: number;
    };
    data: Uint8Array | number[] | ArrayBuffer;
}

export function PrcExplorerPanel({ database: propsDatabase, ...props }: PrcExplorerPanelProps) {
    const [localDatabase, setLocalDatabase] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
    const [selectedRecord, setSelectedRecord] = useState<ResourceRecord | null>(null);

    useEffect(() => {
        if (propsDatabase) {
            setLocalDatabase(propsDatabase);
            setSelectedRecord(null);
            setOpenTypes({});
        }
    }, [propsDatabase]);

    const handleInspectFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files?.[0]) return;

        const file = event.target.files[0];

        if (!file.name.endsWith(".prc") && !file.name.endsWith(".pdb")) {
            alert("Please select a valid Palm .prc or .pdb file");
            return;
        }

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const fileBuffer = Buffer.from(arrayBuffer);
                const header = DatabaseHdrType.from(fileBuffer);
                const parsedDatabase = header.attributes.resDB
                    ? RawPrcDatabase.from(fileBuffer)
                    : RawPdbDatabase.from(fileBuffer);

                setLocalDatabase(parsedDatabase);
                setSelectedRecord(null);
                setOpenTypes({});
            };

            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error parsing upload inside inspector frame:", error);
            alert("Could not load or format this file layout via palm-pdb parsing.");
        }
    };

    const activeDb = localDatabase || propsDatabase;

    const groupedResources = useMemo(() => {
        if (!activeDb?.records) return {};

        const groups: Record<string, ResourceRecord[]> = {};

        for (const rec of activeDb.records as ResourceRecord[]) {
            const type = rec.entry?.type ?? "unknown";
            if (!groups[type]) groups[type] = [];
            groups[type].push(rec);
        }

        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
                acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
                return acc;
            }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

    const selectedBitmaps: TAIBBitmap[] = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tAIB") return [];
        return extractAllTAIBBitmapsFromResource(toUint8Array(selectedRecord.data));
    }, [selectedRecord]);

    const toggleTypeOpen = (type: string) => {
        setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    };

    return (
        <Panel
            title={activeDb ? `${activeDb.header?.name ?? "Database"} - PRC Explorer` : "PRC Explorer"}
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb ? "Exploring loaded data module." : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    <Button variant="outlined" component="label" startIcon={<FileUploadIcon />}>
                        OPEN FILE TO INSPECT
                        <input type="file" hidden onChange={handleInspectFileChange} accept=".prc,.pdb" />
                    </Button>
                </Box>

                {!activeDb ? (
                    <Box p={4} textAlign="center" border="1px dashed #ccc" m={2} borderRadius={1}>
                        <Typography color="textSecondary">No database loaded into explorer view.</Typography>
                    </Box>
                ) : (
                    <Grid2 container spacing={0} sx={{ border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1 }}>
                        <Grid2 size={{ xs: 12, sm: 4 }} sx={{ borderRight: "1px solid #ccc", maxHeight: 500, overflowY: "auto", bgcolor: "#f9f9f9" }}>
                            <List dense component="nav">
                                {Object.entries(groupedResources).map(([type, records]) => {
                                    const isExpanded = !!openTypes[type];
                                    return (
                                        <Box key={type}>
                                            <ListItemButton onClick={() => toggleTypeOpen(type)} sx={{ py: 0.5 }}>
                                                <FolderIcon fontSize="small" sx={{ mr: 1, color: "#e0a910" }} />
                                                <ListItemText
                                                    primary={`${type} (${records.length})`}
                                                    primaryTypographyProps={{ style: { fontFamily: "monospace", fontWeight: 600 } }}
                                                />
                                                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                            </ListItemButton>

                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <List dense component="div" disablePadding sx={{ pl: 3 }}>
                                                    {records.map((rec) => {
                                                        const isSelected = selectedRecord === rec;
                                                        const resIdHex = `0x${rec.entry.resourceId.toString(16).padStart(4, "0")}`;
                                                        return (
                                                            <ListItemButton
                                                                key={`${type}-${rec.entry.resourceId}`}
                                                                selected={isSelected}
                                                                onClick={() => setSelectedRecord(rec)}
                                                                sx={{ py: 0.2 }}
                                                            >
                                                                <InsertDriveFileIcon fontSize="small" sx={{ mr: 1, color: "#757575" }} />
                                                                <ListItemText
                                                                    primary={`${rec.entry.resourceId} (${resIdHex})`}
                                                                    primaryTypographyProps={{ style: { fontFamily: "monospace" } }}
                                                                />
                                                            </ListItemButton>
                                                        );
                                                    })}
                                                </List>
                                            </Collapse>
                                        </Box>
                                    );
                                })}
                            </List>
                        </Grid2>

                        <Grid2 size={{ xs: 12, sm: 8 }} sx={{ p: 2, maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", bgcolor: "#fff" }}>
                            {selectedRecord ? (
                                <Box>
                                    <Typography variant="subtitle2" color="textSecondary" sx={{ fontFamily: "monospace" }}>
                                        Type: <strong>{selectedRecord.entry.type}</strong> | ID: <strong>{selectedRecord.entry.resourceId}</strong>
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ fontFamily: "monospace", mb: 1 }}>
                                        Resource Size: {toUint8Array(selectedRecord.data).length} bytes
                                        {selectedRecord.entry.localChunkId !== undefined && ` | Chunk Offset: 0x${selectedRecord.entry.localChunkId.toString(16).toUpperCase()}`}
                                    </Typography>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box my={2}>
                                        {selectedRecord.entry.type === "tAIB" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>

                                                <Stack spacing={2}>
                                                    {selectedBitmaps.length > 0 ? (
                                                        selectedBitmaps.map((bmp, index) => (
                                                            <Box key={index}>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{ fontFamily: "monospace", mb: 1 }}
                                                                >
                                                                    {bmp.width} x {bmp.height}, {bmp.pixelSize} bpp, {bmp.density} dpi
                                                                </Typography>
                                                                <Box p={2} border="1px dashed #ccc" width="fit-content" borderRadius={1} bgcolor="#f0f0f0">
                                                                    <PalmIcon bitmap={bmp} />
                                                                </Box>
                                                            </Box>
                                                        ))
                                                    ) : (
                                                        <Typography variant="body2" color="textSecondary">
                                                            No decodable bitmap variants found in this resource.
                                                        </Typography>
                                                    )}
                                                </Stack>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Typography variant="caption" display="block" color="textSecondary" sx={{ mb: 0.5 }}>
                                        Hex View:
                                    </Typography>
                                    <Paper variant="outlined" sx={{ p: 1, bgcolor: "#1e1e1e", color: "#39ff14", maxHeight: 200, overflowY: "auto", borderRadius: 1 }}>
                                        <Typography
                                            variant="body2"
                                            component="pre"
                                            sx={{
                                                fontFamily: "'Courier New', Courier, monospace",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-all",
                                                m: 0,
                                                fontSize: "0.85rem"
                                            }}
                                        >
                                            {toUint8Array(selectedRecord.data).length > 0
                                                ? Array.from(toUint8Array(selectedRecord.data))
                                                    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
                                                    .join(" ")
                                                : "EMPTY BUFFER"}
                                        </Typography>
                                    </Paper>
                                </Box>
                            ) : (
                                <Box m="auto" textAlign="center">
                                    <Typography color="textSecondary" variant="body2">
                                        Select an entry inside the directory tree hierarchy to view its contents.
                                    </Typography>
                                </Box>
                            )}
                        </Grid2>
                    </Grid2>
                )}
            </Box>
        </Panel>
    );
}