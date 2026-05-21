import { useState, useMemo, useEffect, type ChangeEvent } from "react";
import {
    Box,
    Typography,
    List,
    ListItemButton,
    ListItemText,
    Collapse,
    Paper,
    Divider,
    Button,
    Stack,
} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";
import ImageIcon from '@mui/icons-material/Image';
import { Panel } from "../panel";
import { PalmIcon } from "../components/PalmIcon";
import {
    extractAllTAIBBitmapsFromResource,
    toUint8Array,
} from "../utils/taib-extractor";
import type { ResourceRecord } from "../utils/prc-types";
import {
    decodeTFRM, decodeTSTL,
    decodeTSTR,
    formatHexView,
} from "../utils/prc-resource-parsers";

interface PalmFormVisualizerProps {
    pilrcText: string;
    renderBitmap?: (id: number) => React.ReactNode;
}

const PalmFormVisualizer = ({ pilrcText, renderBitmap }: PalmFormVisualizerProps) => {
    const form = useMemo(() => {
        const data = {
            x: 0, y: 0, w: 160, h: 160,
            title: "",
            labels: [] as Array<{ text: string; x: number; y: number }>,
            buttons: [] as Array<{ text: string; x: number; y: number; w: number; h: number }>,
            bitmaps: [] as Array<{ id: number; x: number; y: number }>
        };

        const formMatch = pilrcText.match(/FORM\s+ID\s+\d+\s+AT\s+\(\s*(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s*\)/i);
        if (formMatch) {
            data.x = parseInt(formMatch[1], 10);
            data.y = parseInt(formMatch[2], 10);
            data.w = parseInt(formMatch[3], 10);
            data.h = parseInt(formMatch[4], 10);
        }

        const titleMatch = pilrcText.match(/TITLE\s+"([^"]+)"/i);
        if (titleMatch) data.title = titleMatch[1];

        const labelRegex = /LABEL\s+"([^"]+)"\s+ID\s+\d+\s+AT\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)/gi;
        let m;
        while ((m = labelRegex.exec(pilrcText)) !== null) {
            const parsedText = m[1].replace(/\\r/g, '\n').replace(/\\n/g, '\n');
            data.labels.push({ text: parsedText, x: parseInt(m[2], 10), y: parseInt(m[3], 10) });
        }

        const btnRegex = /BUTTON\s+"([^"]+)"\s+ID\s+\d+\s+AT\s+\(\s*(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s*\)/gi;
        while ((m = btnRegex.exec(pilrcText)) !== null) {
            data.buttons.push({
                text: m[1],
                x: parseInt(m[2], 10), y: parseInt(m[3], 10),
                w: parseInt(m[4], 10), h: parseInt(m[5], 10)
            });
        }

        const bmpRegex = /FORMBITMAP\s+AT\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+BITMAP\s+(\d+)/gi;
        while ((m = bmpRegex.exec(pilrcText)) !== null) {
            data.bitmaps.push({
                x: parseInt(m[1], 10), y: parseInt(m[2], 10),
                id: parseInt(m[3], 10)
            });
        }

        return data;
    }, [pilrcText]);

    return (
        <Box sx={{ width: 320, height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#e0e0e0', borderRadius: 1 }}>
            <Box sx={{
                width: 160, height: 160, backgroundColor: '#ffffff', position: 'relative',
                transform: 'scale(2)', border: '1px solid #999', boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
                fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box'
            }}>
                <Box sx={{
                    position: 'absolute', left: form.x, top: form.y, width: form.w, height: form.h,
                    border: '2px solid #000080', backgroundColor: '#fff', borderRadius: '3px', boxSizing: 'border-box',
                }}>
                    {form.title && (
                        <Box sx={{
                            position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#000080', color: '#fff',
                            fontSize: '11px', fontWeight: 700, padding: '1px 4px', lineHeight: '12px',
                        }}>
                            {form.title}
                        </Box>
                    )}

                    {form.labels.map((lbl, i) => (
                        <Box key={`lbl-${i}`} sx={{
                            position: 'absolute', left: lbl.x, top: lbl.y, fontSize: '10px', fontWeight: 600,
                            color: '#000', whiteSpace: 'pre-wrap', lineHeight: '11px', letterSpacing: '-0.2px'
                        }}>
                            {lbl.text}
                        </Box>
                    ))}

                    {form.buttons.map((btn, i) => (
                        <Box key={`btn-${i}`} sx={{
                            position: 'absolute', left: btn.x, top: btn.y, width: btn.w, height: btn.h,
                            border: '1px solid #000', borderRadius: '4px', backgroundColor: '#cccccc', color: '#000',
                            fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                            {btn.text}
                        </Box>
                    ))}

                    {form.bitmaps.map((bmp, i) => {
                        const customImageNode = renderBitmap ? renderBitmap(bmp.id) : null;

                        return (
                            <Box key={`bmp-${i}`} sx={{
                                position: 'absolute',
                                left: bmp.x,
                                top: bmp.y,
                                ...(!customImageNode && {
                                    width: 36, height: 40, backgroundColor: '#00703c', border: '1px dashed #fff',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                })
                            }}>
                                {customImageNode ? (
                                    customImageNode
                                ) : (
                                    <>
                                        <ImageIcon sx={{ fontSize: 16 }} />
                                        <Typography sx={{ fontSize: '7px', mt: 0.5 }}>{bmp.id}</Typography>
                                    </>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
};

export interface PrcExplorerPanelProps {
    /** Database to inspect (embedding case). If omitted, only upload is available. */
    database?: RawPdbDatabase | RawPrcDatabase | null;
    /** Show the local file upload button. Default true. */
    enableFileUpload?: boolean;
    [key: string]: unknown;
}

export function PrcExplorerPanel({
                                     database: externalDb,
                                     enableFileUpload = true,
                                     ...panelProps
                                 }: PrcExplorerPanelProps) {
    const [localDb, setLocalDb] = useState<RawPdbDatabase | RawPrcDatabase | null>(null);
    const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
    const [selectedRecord, setSelectedRecord] = useState<ResourceRecord | null>(null);

    // If an external database is provided (embedding case), clear local state.
    useEffect(() => {
        if (externalDb) {
            setLocalDb(null);
            setSelectedRecord(null);
            setOpenTypes({});
        }
    }, [externalDb]);

    const activeDb = externalDb ?? localDb;

    const handleRenderFormBitmap = (resourceId: number) => {
        if (!activeDb || !activeDb.records) return null;

        // Look up the specific record by the resourceId extracted from the PilRC text
        const imageRecord = (activeDb.records as ResourceRecord[]).find(
            (r) => r.entry.resourceId === resourceId && (r.entry.type === "Tbmp" || r.entry.type === "tAIB")
        );

        if (!imageRecord) {
            return null; // Will fallback to the green placeholder block
        }

        // Decode the raw buffer using the already imported extractor
        const decodedBitmaps = extractAllTAIBBitmapsFromResource(toUint8Array(imageRecord.data));

        // Forms usually use the first bitmap variant
        const targetBmp = decodedBitmaps[0];

        if (!targetBmp) {
            return null;
        }

        return <PalmIcon bitmap={targetBmp} scale={1} />;
    };

    // --- file upload (only used when enableFileUpload is true) ---
    const handleInspectFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".prc") && !file.name.endsWith(".pdb")) {
            alert("Please select a valid Palm .prc or .pdb file");
            return;
        }
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const fileBuffer = Buffer.from(arrayBuffer);
                const header = DatabaseHdrType.from(fileBuffer);
                const parsed = header.attributes.resDB
                    ? RawPrcDatabase.from(fileBuffer)
                    : RawPdbDatabase.from(fileBuffer);
                setLocalDb(parsed);
                setSelectedRecord(null);
                setOpenTypes({});
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error("Error parsing uploaded file:", error);
            alert("Could not load or parse the file. See console for details.");
        }
    };

    // --- resource grouping ---
    const groupedResources = useMemo(() => {
        if (!activeDb?.records) return {};
        const groups: Record<string, ResourceRecord[]> = {};
        for (const rec of activeDb.records as ResourceRecord[]) {
            const type = rec.entry?.type ?? "unknown";
            (groups[type] ??= []).push(rec);
        }
        return Object.keys(groups)
            .sort()
            .reduce((acc, key) => {
                acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
                return acc;
            }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

    // --- decoders & extractors (only run when selected record matches) ---
    const selectedTSTR = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "tSTR" && selectedRecord.entry.type !== "tver"))
            return "";
        return decodeTSTR(selectedRecord.data);
    }, [selectedRecord]);

    const selectedTSTL = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tSTL") {
            return [""];
        }
        return decodeTSTL(selectedRecord.data);
    }, [selectedRecord]);

    const selectedTFRM = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tFRM") return "";
        return decodeTFRM(selectedRecord.data, selectedRecord.entry.resourceId);
    }, [selectedRecord]);

    const selectedBitmaps = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "Tbmp" && selectedRecord.entry.type !== "tAIB"))
            return [];
        return extractAllTAIBBitmapsFromResource(toUint8Array(selectedRecord.data));
    }, [selectedRecord]);

    const selectedBytes = selectedRecord ? toUint8Array(selectedRecord.data) : new Uint8Array();

    const toggleTypeOpen = (type: string) =>
        setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));

    return (
        <Panel
            title={
                activeDb
                    ? `${activeDb.header?.name ?? "Database"} - PRC Explorer`
                    : "PRC Explorer"
            }
            isExpandedByDefault
            {...panelProps}
            sx={{ width: "100%", ...((panelProps as any)?.sx ?? {}) }}
        >
            <Box>
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb
                            ? "Exploring loaded data module."
                            : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    {enableFileUpload && (
                        <Button variant="outlined" component="label" startIcon={<FileUploadIcon />}>
                            OPEN FILE TO INSPECT
                            <input
                                type="file"
                                hidden
                                onChange={handleInspectFileChange}
                                accept=".prc,.pdb"
                            />
                        </Button>
                    )}
                </Box>

                {!activeDb ? (
                    <Box p={4} textAlign="center" border="1px dashed #ccc" m={2} borderRadius={1}>
                        <Typography color="textSecondary">
                            No database loaded into explorer view.
                        </Typography>
                    </Box>
                ) : (
                    <Grid2 container spacing={0} sx={{ border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1 }}>
                        {/* Left sidebar: resource tree */}
                        <Grid2
                            size={{ xs: 12, sm: 4 }}
                            sx={{ borderRight: "1px solid #ccc", maxHeight: 500, overflowY: "auto", bgcolor: "#f9f9f9" }}
                        >
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

                        {/* Right detail pane */}
                        <Grid2
                            size={{ xs: 12, sm: 8 }}
                            sx={{ p: 2, maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", bgcolor: "#fff" }}
                        >
                            {selectedRecord ? (
                                <Box>
                                    <Typography variant="subtitle2" color="textSecondary" sx={{ fontFamily: "monospace" }}>
                                        Type: <strong>{selectedRecord.entry.type}</strong> | ID: <strong>{selectedRecord.entry.resourceId}</strong>
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ fontFamily: "monospace", mb: 1 }}>
                                        Resource Size: {selectedBytes.length} bytes
                                        {selectedRecord.entry.localChunkId !== undefined &&
                                            ` | Chunk Offset: 0x${selectedRecord.entry.localChunkId.toString(16).toUpperCase()}`}
                                    </Typography>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box my={2}>
                                        {/* Bitmap visualizer */}
                                        {(selectedRecord.entry.type === "Tbmp" || selectedRecord.entry.type === "tAIB") ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>
                                                <Stack spacing={2}>
                                                    {selectedBitmaps.length > 0 ? (
                                                        selectedBitmaps.map((bmp, index) => (
                                                            <Box key={index}>
                                                                <Typography variant="body2" sx={{ fontFamily: "monospace", mb: 1 }}>
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
                                        ) : selectedRecord.entry.type === "tFRM" ? (
                                            /* MODIFIED: Embedded Visualizer into the tFRM section */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Form Decompiler & Visualizer:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        <Paper
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                                fontFamily: "monospace", whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word", maxHeight: 320, overflowY: "auto",
                                                            }}
                                                        >
                                                            {selectedTFRM || "Could not decompile this tFRM resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedTFRM && (
                                                            <PalmFormVisualizer
                                                                pilrcText={selectedTFRM}
                                                                renderBitmap={handleRenderFormBitmap}
                                                            />
                                                        )}
                                                    </Grid2>
                                                </Grid2>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTR" || selectedRecord.entry.type === "tver" ? (
                                            /* String decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Decoder:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
                                                    }}
                                                >
                                                    {selectedTSTR.length > 0 ? selectedTSTR : "EMPTY STRING"}
                                                </Paper>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTL"? (
                                            /* String table decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Table Decoder:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        bgcolor: "#fafafa",
                                                        borderRadius: 1,
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {selectedTSTL.length > 0 ? (
                                                        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                                                            {selectedTSTL.map((str, index) => (
                                                                <Box
                                                                    component="li"
                                                                    key={index}
                                                                    sx={{
                                                                        display: "flex",
                                                                        px: 2,
                                                                        py: 1,
                                                                        borderBottom: index < selectedTSTL.length - 1 ? "1px solid #e0e0e0" : "none",
                                                                        fontFamily: "monospace",
                                                                        "&:hover": { bgcolor: "#f0f0f0" }, // Nice hover effect per row
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        component="span"
                                                                        sx={{
                                                                            fontFamily: "inherit",
                                                                            color: "text.disabled",
                                                                            mr: 2,
                                                                            userSelect: "none",
                                                                        }}
                                                                    >
                                                                        {String(index).padStart(4, "0")}
                                                                    </Typography>
                                                                    <Typography
                                                                        component="span"
                                                                        sx={{
                                                                            fontFamily: "inherit",
                                                                            color: "text.primary",
                                                                            wordBreak: "break-word",
                                                                            whiteSpace: "pre-wrap",
                                                                        }}
                                                                    >
                                                                        {str}
                                                                    </Typography>
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    ) : (
                                                        <Typography
                                                            sx={{ p: 2, fontFamily: "monospace", color: "text.disabled" }}
                                                        >
                                                            EMPTY STRING TABLE
                                                        </Typography>
                                                    )}
                                                </Paper>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    {/* Hex view (always visible) */}
                                    <Typography variant="caption" display="block" color="textSecondary" sx={{ mb: 0.5 }}>
                                        Hex View:
                                    </Typography>
                                    <Paper
                                        variant="outlined"
                                        sx={{ p: 1, bgcolor: "#1e1e1e", color: "#39ff14", maxHeight: 200, overflowY: "auto", borderRadius: 1 }}
                                    >
                                        <Typography
                                            variant="body2"
                                            component="pre"
                                            sx={{
                                                fontFamily: "'Courier New', Courier, monospace",
                                                whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0, fontSize: "0.85rem",
                                            }}
                                        >
                                            {formatHexView(selectedBytes)}
                                        </Typography>
                                    </Paper>
                                </Box>
                            ) : (
                                <Box m="auto" textAlign="center">
                                    <Typography color="textSecondary" variant="body2">
                                        Select an entry inside the directory tree to view its contents.
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