// src/components/prc-explorer-panel.tsx
import { useState, useMemo, useEffect } from "react";
import {
    Box, Typography, List, ListItemButton, ListItemText,
    Collapse, Paper, Divider, Button
} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import {Database, DatabaseHdrType, RawPdbDatabase, RawPrcDatabase} from "palm-pdb";

import { Panel } from "../panel";
import {PalmIcon} from "../components/PalmIcon.tsx";
import {extractTAIBResource} from "../utils/taib-extractor.ts";

interface PrcExplorerPanelProps {
    database: RawPdbDatabase | RawPrcDatabase | null;
}

interface ResourceRecord {
    entry: {
        type: string;
        resourceId: number;
        localChunkId?: number;
    };
    data: {
        type: string;
        data: number[];
    };
}

export function PrcExplorerPanel({ database: propsDatabase, ...props }: PrcExplorerPanelProps) {
    const [localDatabase, setLocalDatabase] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
    const [selectedRecord, setSelectedRecord] = useState<ResourceRecord | null>(null);

    // Sync with prop database if changed from outside (e.g. clicking an item in the installed list)
    useEffect(() => {
        if (propsDatabase) {
            setLocalDatabase(propsDatabase);
            setSelectedRecord(null);
            setOpenTypes({});
        }
    }, [propsDatabase]);

    // Handle manual inspect-only file upload
    const handleInspectFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];

            if (!file.name.endsWith(".prc") && !file.name.endsWith(".pdb")) {
                alert("Please select a valid Palm .prc or .pdb file");
                return;
            }

            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const arrayBuffer = e.target?.result as ArrayBuffer;

                    // 1. Convert native web ArrayBuffer to a Node-style Buffer wrapper exactly like your storage code
                    const fileBuffer = Buffer.from(arrayBuffer);

                    // 2. Read headers to determine the underlying database scheme type
                    const header = DatabaseHdrType.from(fileBuffer);

                    // 3. Deserialize into the correct class archetype
                    const parsedDatabase = header.attributes.resDB
                        ? RawPrcDatabase.from(fileBuffer)
                        : RawPdbDatabase.from(fileBuffer);

                    // 4. Update the component view state tree
                    setLocalDatabase(parsedDatabase);
                    setSelectedRecord(null);
                    setOpenTypes({});
                };

                reader.readAsArrayBuffer(file);
            } catch (error) {
                console.error("Error parsing upload inside inspector frame:", error);
                alert("Could not load or format this file layout via palm-pdb parsing.");
            }
        }
    };

    // Active operating target database
    const activeDb = localDatabase || propsDatabase;

    // Group records by resource type natively
    const groupedResources = useMemo(() => {
        if (!activeDb || !activeDb.records) return {};

        const groups: Record<string, ResourceRecord[]> = {};
        for (const rec of activeDb.records as ResourceRecord[]) {
            const type = rec.entry?.type ?? "unknown";
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(rec);
        }

        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
                acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
                return acc;
            }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

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
                {/* Top bar containing the direct upload inspection button */}
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb ? "Exploring loaded data module." : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    <Button variant="outlined" component="label" startIcon={<FileUploadIcon />}>
                        Open File to Inspect
                        <input type="file" hidden onChange={handleInspectFileChange} accept=".prc,.pdb" />
                    </Button>
                </Box>

                {!activeDb ? (
                    <Box p={4} textAlign="center" border="1px dashed #ccc" m={2} borderRadius={1}>
                        <Typography color="textSecondary">No database loaded into explorer view.</Typography>
                    </Box>
                ) : (
                    <Grid2 container spacing={0} sx={{ border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1 }}>

                        {/* Left Side: Tree Navigation View */}
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

                        {/* Right Side: Properties & Hex View */}
                        <Grid2 size={{ xs: 12, sm: 8 }} sx={{ p: 2, maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", bgcolor: "#fff" }}>
                            {selectedRecord ? (
                                <Box>
                                    <Typography variant="subtitle2" color="textSecondary" sx={{ fontFamily: "monospace" }}>
                                        Type: <strong>{selectedRecord.entry.type}</strong> | ID: <strong>{selectedRecord.entry.resourceId}</strong>
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ fontFamily: "monospace", mb: 1 }}>
                                        Resource Size: {selectedRecord.data?.data?.length ?? 0} bytes
                                        {selectedRecord.entry.localChunkId !== undefined && ` | Chunk Offset: 0x${selectedRecord.entry.localChunkId.toString(16).toUpperCase()}`}
                                    </Typography>

                                    <Divider sx={{ my: 1.5 }} />

                                    {/* Resource Rendering */}
                                    <Box my={2}>
                                        {["Tbmp", "tAIB"].includes(selectedRecord.entry.type) ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>
                                                <Box p={2} border="1px dashed #ccc" width="fit-content" borderRadius={1} bgcolor="#f0f0f0">
                                                    <PalmIcon bitmap={extractTAIBResource(activeDb)} />
                                                </Box>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    {/* Raw Byte Hex View */}
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
                                            {selectedRecord.data?.data?.length > 0
                                                ? selectedRecord.data.data
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