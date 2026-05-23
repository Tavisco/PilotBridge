import {useState, useMemo, useEffect, type ChangeEvent} from "react";
import {
    Box,
    Typography,
    List,
    ListItemButton,
    ListItemText,
    Collapse,
    Paper,
    Divider,
    Button
} from "@mui/material";
import Grid2 from "@mui/material/Grid2";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import {DatabaseHdrType, RawPdbDatabase, RawPrcDatabase} from "palm-pdb";
import {Panel} from "../panel";
import {PalmIcon} from "../components/PalmIcon";
import {
    extractAllTAIBBitmapsFromResource,
    toUint8Array,
} from "../utils/taib-extractor";
import type {ResourceRecord} from "../utils/prc-types";
import {
    decodeAlert, decodeMBAR,
    decodeTFRM, decodeTSTL,
    decodeTSTR,
    formatHexView,
} from "../utils/prc-resource-parsers";
import {PalmFormVisualizer} from "../components/form-visualizer/PalmFormVisualizer.tsx";
import {PalmMenuVisualizer} from "../components/form-visualizer/PalmMenuVisualizer.tsx";
import {PalmAlertVisualizer} from "../components/form-visualizer/PalmAlertVisualizer.tsx";
import PalmBitmapVisualizer from "../components/form-visualizer/PalmBitmapVisualizer.tsx";
import {PalmStringVisualizer} from "../components/form-visualizer/PalmStringVisualizer.tsx";
import {PalmStringTableVisualizer} from "../components/form-visualizer/PalmStringTableVisualizer.tsx";

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
        const targetBmp = decodedBitmaps
            .filter((x) => x.density == 72)
            .sort((a, b) => a < b ? 1 : -1)
            .at(0);

        if (!targetBmp) {
            return null;
        }

        return <PalmIcon bitmap={targetBmp} scale={1}/>;
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

    const selectedAlert = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "Talt") {
            return "";
        }
        // Assuming your selectedRecord includes the resource ID in `.entry.id`
        const resId = selectedRecord.entry.resourceId || "UNKNOWN_ID";
        return decodeAlert(selectedRecord.data, resId);
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

    const selectedMBAR = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "MBAR") {
            return "";
        }
        const resId = selectedRecord.entry.resourceId || "UNKNOWN_ID";
        return decodeMBAR(selectedRecord.data, resId);
    }, [selectedRecord]);

    const selectedBytes = selectedRecord ? toUint8Array(selectedRecord.data) : new Uint8Array();

    const toggleTypeOpen = (type: string) =>
        setOpenTypes((prev) => ({...prev, [type]: !prev[type]}));

    return (
        <Panel
            title={
                activeDb
                    ? `${activeDb.header?.name ?? "Database"} - PRC Explorer`
                    : "PRC Explorer"
            }
            isExpandedByDefault
            {...panelProps}
            sx={{width: "100%", ...((panelProps as any)?.sx ?? {})}}
        >
            <Box>
                <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="textSecondary">
                        {activeDb
                            ? "Exploring loaded data module."
                            : "Select an app below or open a local file directly to inspect."}
                    </Typography>
                    {enableFileUpload && (
                        <Button variant="outlined" component="label" startIcon={<FileUploadIcon/>}>
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
                    <Grid2 container spacing={0} sx={{border: "1px solid #ccc", minHeight: 400, m: 2, borderRadius: 1}}>
                        {/* Left sidebar: resource tree */}
                        <Grid2
                            size={{xs: 12, sm: 4}}
                            sx={{borderRight: "1px solid #ccc", maxHeight: 500, overflowY: "auto", bgcolor: "#f9f9f9"}}
                        >
                            <List dense component="nav">
                                {Object.entries(groupedResources).map(([type, records]) => {
                                    const isExpanded = !!openTypes[type];
                                    return (
                                        <Box key={type}>
                                            <ListItemButton onClick={() => toggleTypeOpen(type)} sx={{py: 0.5}}>
                                                <FolderIcon fontSize="small" sx={{mr: 1, color: "#e0a910"}}/>
                                                <ListItemText
                                                    primary={`${type} (${records.length})`}
                                                    primaryTypographyProps={{
                                                        style: {
                                                            fontFamily: "monospace",
                                                            fontWeight: 600
                                                        }
                                                    }}
                                                />
                                                {isExpanded ? <ExpandLess fontSize="small"/> :
                                                    <ExpandMore fontSize="small"/>}
                                            </ListItemButton>
                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <List dense component="div" disablePadding sx={{pl: 3}}>
                                                    {records.map((rec) => {
                                                        const isSelected = selectedRecord === rec;
                                                        const resIdHex = `0x${rec.entry.resourceId.toString(16).padStart(4, "0")}`;
                                                        return (
                                                            <ListItemButton
                                                                key={`${type}-${rec.entry.resourceId}`}
                                                                selected={isSelected}
                                                                onClick={() => setSelectedRecord(rec)}
                                                                sx={{py: 0.2}}
                                                            >
                                                                <InsertDriveFileIcon fontSize="small"
                                                                                     sx={{mr: 1, color: "#757575"}}/>
                                                                <ListItemText
                                                                    primary={`${rec.entry.resourceId} (${resIdHex})`}
                                                                    primaryTypographyProps={{style: {fontFamily: "monospace"}}}
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
                            size={{xs: 12, sm: 8}}
                            sx={{
                                p: 2,
                                maxHeight: 500,
                                overflowY: "auto",
                                display: "flex",
                                flexDirection: "column",
                                bgcolor: "#fff"
                            }}
                        >
                            {selectedRecord ? (
                                <Box>
                                    <Typography variant="subtitle2" color="textSecondary"
                                                sx={{fontFamily: "monospace"}}>
                                        Type: <strong>{selectedRecord.entry.type}</strong> |
                                        ID: <strong>{selectedRecord.entry.resourceId}</strong>
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary"
                                                sx={{fontFamily: "monospace", mb: 1}}>
                                        Resource Size: {selectedBytes.length} bytes
                                        {selectedRecord.entry.localChunkId !== undefined &&
                                            ` | Chunk Offset: 0x${selectedRecord.entry.localChunkId.toString(16).toUpperCase()}`}
                                    </Typography>

                                    <Divider sx={{my: 1.5}}/>

                                    <Box my={2}>
                                        {/* Bitmap visualizer */}
                                        {(selectedRecord.entry.type === "Tbmp" || selectedRecord.entry.type === "tAIB") ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    Bitmap Visualizer:
                                                </Typography>
                                                <PalmBitmapVisualizer bitmaps={selectedBitmaps}/>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tFRM" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    Form Decompiler & Visualizer:
                                                </Typography>
                                                <PalmFormVisualizer
                                                    pilrcText={selectedTFRM}
                                                    renderBitmap={handleRenderFormBitmap}
                                                />
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTR" || selectedRecord.entry.type === "tver" ? (
                                            /* String decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    String Decoder:
                                                </Typography>
                                                <PalmStringVisualizer selectedTSTR={selectedTSTR}/>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTL" ? (
                                            /* String table decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    String Table Decoder:
                                                </Typography>
                                                <PalmStringTableVisualizer selectedTSTL={selectedTSTL}/>
                                            </Box>
                                        ) : selectedRecord.entry.type === "Talt" ? (
                                            /* Alert resource decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    PilRC Alert Decoder:
                                                </Typography>
                                                <PalmAlertVisualizer pilrcText={selectedAlert}
                                                />
                                            </Box>
                                        ) : selectedRecord.entry.type === "MENU" || selectedRecord.entry.type === "MBAR" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom
                                                            color="textSecondary">
                                                    PilRC Menu Decoder:
                                                </Typography>

                                                            <PalmMenuVisualizer pilrcText={selectedMBAR}/>

                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="textSecondary"
                                                        sx={{fontStyle: "italic"}}>
                                                No visual handler compiled for type "{selectedRecord.entry.type}".
                                            </Typography>
                                        )}
                                    </Box>

                                    <Divider sx={{my: 1.5}}/>

                                    {/* Hex view (always visible) */}
                                    <Typography variant="caption" display="block" color="textSecondary" sx={{mb: 0.5}}>
                                        Hex View:
                                    </Typography>
                                    <Paper
                                        variant="outlined"
                                        sx={{
                                            p: 1,
                                            bgcolor: "#1e1e1e",
                                            color: "#39ff14",
                                            maxHeight: 200,
                                            overflowY: "auto",
                                            borderRadius: 1
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            component="pre"
                                            sx={{
                                                fontFamily: "'Courier New', Courier, monospace",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-all",
                                                m: 0,
                                                fontSize: "0.85rem",
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