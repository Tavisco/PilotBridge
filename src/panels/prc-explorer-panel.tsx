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
    decodeAlert, decodeMBAR,
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
                            fontSize: '9px', fontWeight: 700, padding: '1px 4px', lineHeight: '12px',
                        }}>
                            {form.title}
                        </Box>
                    )}

                    {form.labels.map((lbl, i) => (
                        <Box key={`lbl-${i}`} sx={{
                            position: 'absolute', left: lbl.x, top: lbl.y, fontSize: '7px', fontWeight: 600,
                            color: '#000', whiteSpace: 'pre-wrap', lineHeight: '11px', letterSpacing: '-0.2px'
                        }}>
                            {lbl.text}
                        </Box>
                    ))}

                    {form.buttons.map((btn, i) => (
                        <Box key={`btn-${i}`} sx={{
                            position: 'absolute', left: btn.x, top: btn.y, width: btn.w, height: btn.h,
                            border: '1px solid #000', borderRadius: '4px', backgroundColor: '#cccccc', color: '#000',
                            fontSize: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
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

interface PalmAlertVisualizerProps {
    pilrcText: string;
}

export const PalmAlertVisualizer = ({ pilrcText }: PalmAlertVisualizerProps) => {
    const alert = useMemo(() => {
        const data = {
            type: "INFORMATION",
            title: "",
            message: "",
            buttons: [] as string[]
        };

        // Ensure we are working with a string
        const text = String(pilrcText || "");
        if (!text) return data;

        // 1. Extract Alert Type using simple includes (ignores boundary quirks)
        const upperText = text.toUpperCase();
        if (upperText.includes("CONFIRMATION")) data.type = "CONFIRMATION";
        else if (upperText.includes("WARNING")) data.type = "WARNING";
        else if (upperText.includes("ERROR")) data.type = "ERROR";
        else if (upperText.includes("INFORMATION")) data.type = "INFORMATION";

        // 2. Extract Title: Looks for "TITLE", skips any junk (even newlines or missing spaces), and grabs the first quoted string
        const titleMatch = text.match(/TITLE[^"]*"([^"]*)"/i);
        if (titleMatch) data.title = titleMatch[1];

        // 3. Extract Message: Same logic, but unescapes PilRC newlines
        const msgMatch = text.match(/MESSAGE[^"]*"([^"]*)"/i);
        if (msgMatch) {
            data.message = msgMatch[1].replace(/\\n/g, '\n').replace(/\\r/g, '');
        }

        // 4. Extract Buttons: Find where "BUTTONS" starts, then grab every quoted string after it
        const buttonsIndex = upperText.indexOf("BUTTONS");
        if (buttonsIndex !== -1) {
            const buttonsSection = text.slice(buttonsIndex);
            const btnMatches = buttonsSection.match(/"([^"]*)"/g);
            if (btnMatches) {
                // Remove the actual quotes from the matched strings
                data.buttons = btnMatches.map(b => b.replace(/"/g, ''));
            }
        }

        return data;
    }, [pilrcText]);

    // Render a simple 1-bit icon based on the alert type
    const renderIcon = () => {
        let symbol = "i";
        if (alert.type === "CONFIRMATION") symbol = "?";
        if (alert.type === "WARNING") symbol = "!";
        if (alert.type === "ERROR") symbol = "X";

        return (
            <Box sx={{
                width: 18,
                height: 18,
                border: '2px solid #000',
                borderRadius: alert.type === "WARNING" ? '0' : '50%', // Square for warning, circle for others
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '12px',
                fontFamily: 'serif',
                color: '#000',
                flexShrink: 0,
            }}>
                {symbol}
            </Box>
        );
    };

    return (
        <Box sx={{ width: 320, height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#e0e0e0', borderRadius: 1 }}>
            {/* Base Screen (160x160 scaled 2x) */}
            <Box sx={{
                width: 160, height: 160, backgroundColor: '#ffffff', position: 'relative',
                transform: 'scale(2)', border: '1px solid #999', boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
                fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box',
                // Add a subtle dot pattern to simulate background screen
                backgroundImage: 'radial-gradient(#d3d3d3 1px, transparent 1px)',
                backgroundSize: '4px 4px'
            }}>

                {/* Alert Modal Dialog */}
                <Box sx={{
                    position: 'absolute',
                    left: 2, right: 2, bottom: 2, // Alerts typically anchor near the bottom
                    border: '2px solid #000',
                    backgroundColor: '#fff',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    boxShadow: '1px 1px 0px #000', // Classic Palm OS hard drop shadow
                    display: 'flex',
                    flexDirection: 'column',
                    p: 1,
                    gap: 1
                }}>
                    {/* Header: Icon + Title */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        {renderIcon()}
                        <Box sx={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#000',
                            lineHeight: '14px',
                            mt: '2px'
                        }}>
                            {alert.title}
                        </Box>
                    </Box>

                    {/* Message Body */}
                    <Box sx={{
                        fontSize: '7px',
                        fontWeight: 400,
                        color: '#000',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '12px',
                        letterSpacing: '-0.2px',
                        pl: '26px' // Indent to align with text next to the icon
                    }}>
                        {alert.message}
                    </Box>

                    {/* Buttons Row */}
                    <Box sx={{
                        display: 'flex',
                        gap: '6px',
                        pl: '26px', // Indent buttons as well
                        mt: 0.5,
                        flexWrap: 'wrap'
                    }}>
                        {alert.buttons.map((btn, i) => (
                            <Box key={`btn-${i}`} sx={{
                                border: '1px solid #000',
                                borderRadius: '4px',
                                backgroundColor: i === 0 ? '#000' : '#fff', // Typically the first button is filled/default
                                color: i === 0 ? '#fff' : '#000',
                                fontSize: '7px',
                                fontWeight: 700,
                                px: 1,
                                py: '2px',
                                minWidth: '24px',
                                textAlign: 'center'
                            }}>
                                {btn}
                            </Box>
                        ))}
                    </Box>
                </Box>

            </Box>
        </Box>
    );
};

interface PalmMenuVisualizerProps {
    pilrcText: string;
}

type MenuItem = {
    separator: boolean;
    id?: number;
    text?: string;
    command?: string;
};

type MenuPulldown = {
    title: string;
    items: MenuItem[];
};

type ParsedMenu = {
    resourceId: string;
    pulldowns: MenuPulldown[];
};

function unescapePilrcString(text: string): string {
    return text
        .replace(/\\r/g, "\r")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function parseMenuResource(pilrcText: string): ParsedMenu {
    const result: ParsedMenu = {
        resourceId: "ID",
        pulldowns: [],
    };

    const text = String(pilrcText || "");
    if (!text) return result;

    const headerMatch = text.match(/MENU\s+ID\s+([^\n]+)\s+BEGIN/i);
    if (headerMatch) {
        result.resourceId = headerMatch[1].trim();
    }

    const pulldownRegex = /PULLDOWN\s+"((?:\\.|[^"])*)"\s*\n\s*BEGIN([\s\S]*?)\n\s*END/gim;
    let pulldownMatch: RegExpExecArray | null;

    while ((pulldownMatch = pulldownRegex.exec(text)) !== null) {
        const title = unescapePilrcString(pulldownMatch[1].trim());
        const body = pulldownMatch[2];

        const items: MenuItem[] = [];

        const lines = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (const line of lines) {
            if (/^MENUITEM\s+SEPARATOR$/i.test(line)) {
                items.push({ separator: true });
                continue;
            }

            const itemMatch = line.match(
                /^MENUITEM\s+"((?:\\.|[^"])*)"\s+ID\s+([0-9+-]+)(?:\s+"((?:\\.|[^"])*)")?$/i
            );

            if (itemMatch) {
                items.push({
                    separator: false,
                    text: unescapePilrcString(itemMatch[1].trim()),
                    id: Number(itemMatch[2]),
                    command: itemMatch[3] ? unescapePilrcString(itemMatch[3]).slice(0, 1) : undefined,
                });
            }
        }

        result.pulldowns.push({ title, items });
    }

    return result;
}

export const PalmMenuVisualizer = ({ pilrcText }: PalmMenuVisualizerProps) => {
    const menu = useMemo(() => parseMenuResource(pilrcText), [pilrcText]);

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        setOpenIndex(null);
    }, [pilrcText]);

    const titleLayout = useMemo(() => {
        let x = 4;
        return menu.pulldowns.map((pd) => {
            const w = Math.max(28, Math.min(56, Math.round(pd.title.length * 4.5 + 10)));
            const item = { x, w };
            x += w;
            return item;
        });
    }, [menu.pulldowns]);

    const activePulldown = openIndex !== null ? menu.pulldowns[openIndex] : null;
    const activeLayout = openIndex !== null ? titleLayout[openIndex] : null;

    const screenWidth = 160;
    const dropdownWidth = 120;

    const dropdownLeft =
        activeLayout
            ? Math.max(2, Math.min(activeLayout.x, screenWidth - dropdownWidth - 2))
            : 2;

    return (
        <Box
            sx={{
                width: 320,
                height: 320,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                bgcolor: "#e0e0e0",
                borderRadius: 1,
            }}
        >
            <Box
                sx={{
                    width: 160,
                    height: 160,
                    backgroundColor: "#ffffff",
                    position: "relative",
                    transform: "scale(2)",
                    transformOrigin: "center center",
                    border: "1px solid #999",
                    boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                    fontFamily: "sans-serif",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    backgroundImage: "radial-gradient(#d3d3d3 1px, transparent 1px)",
                    backgroundSize: "4px 4px",
                }}
            >
                <Box
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 13,
                        bgcolor: "#fff",
                        borderBottom: "1px solid #000",
                        display: "flex",
                        alignItems: "center",
                        px: "2px",
                        gap: "1px",
                        zIndex: 2,
                        boxSizing: "border-box",
                    }}
                >
                    {menu.pulldowns.map((pd, index) => {
                        const layout = titleLayout[index];
                        const isOpen = openIndex === index;

                        return (
                            <Box
                                key={`${pd.title}-${index}`}
                                onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                                sx={{
                                    position: "absolute",
                                    left: `${layout.x}px`,
                                    top: "1px",
                                    width: `${layout.w}px`,
                                    height: "10px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "7px",
                                    fontWeight: 700,
                                    bgcolor: isOpen ? "#000" : "transparent",
                                    color: isOpen ? "#fff" : "#000",
                                    border: "1px solid transparent",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    lineHeight: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {pd.title}
                            </Box>
                        );
                    })}
                </Box>

                {activePulldown && (
                    <Box
                        sx={{
                            position: "absolute",
                            top: "13px",
                            left: `${dropdownLeft}px`,
                            width: `${dropdownWidth}px`,
                            bgcolor: "#fff",
                            border: "1px solid #000",
                            boxShadow: "1px 1px 0px #000",
                            zIndex: 3,
                            boxSizing: "border-box",
                            pb: "1px",
                        }}
                    >

                        <Box sx={{ py: "1px" }}>
                            {activePulldown.items.map((item, itemIndex) => {
                                if (item.separator) {
                                    return (
                                        <Box
                                            key={`sep-${itemIndex}`}
                                            sx={{
                                                height: "5px",
                                                my: "1px",
                                                mx: "3px",
                                                borderTop: "1px solid #000",
                                            }}
                                        />
                                    );
                                }

                                const label = item.text || "";
                                const command = item.command ? `  [${item.command}]` : "";

                                return (
                                    <Box
                                        key={`item-${itemIndex}`}
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            px: "3px",
                                            py: "1px",
                                            fontSize: "7px",
                                            lineHeight: "10px",
                                            color: "#000",
                                            cursor: "pointer",
                                            userSelect: "none",
                                            "&:hover": {
                                                bgcolor: "#000",
                                                color: "#fff",
                                            },
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                minWidth: 0,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                pr: "4px",
                                            }}
                                        >
                                            {label}
                                        </Box>
                                        <Box sx={{ flexShrink: 0, opacity: item.command ? 1 : 0.35 }}>
                                            {item.id !== undefined ? item.id : ""}
                                            {command}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                )}
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
        const targetBmp = decodedBitmaps
            .filter((x) => x.density == 72)
            .sort((a,b)=> a < b ? 1:-1)
            .at(0);

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
                                                                    {bmp.width} x {bmp.height}, {bmp.bpp} bpp, {bmp.density} dpi
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
                                                                fontSize: "7px"
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
                                        ) : selectedRecord.entry.type === "Talt" ? (
                                            /* Alert resource decoder */
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    PilRC Alert Decoder:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        <Paper
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                                fontFamily: "monospace", whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word", maxHeight: 320, overflowY: "auto",
                                                                fontSize: "10px"
                                                            }}
                                                        >
                                                            {selectedAlert || "Could not decompile this Talt resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedAlert && (
                                                            <PalmAlertVisualizer
                                                                pilrcText={selectedAlert}
                                                            />
                                                        )}
                                                    </Grid2>
                                                </Grid2>
                                            </Box>
                                        ) : selectedRecord.entry.type === "MENU" || selectedRecord.entry.type === "MBAR" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    PilRC Menu Decoder:
                                                </Typography>
                                                <Grid2 container spacing={2}>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        <Paper
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2,
                                                                bgcolor: "#fafafa",
                                                                borderRadius: 1,
                                                                fontFamily: "monospace",
                                                                whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word",
                                                                maxHeight: 320,
                                                                overflowY: "auto",
                                                                fontSize: "9px"
                                                            }}
                                                        >
                                                            {selectedMBAR || "Could not decompile this menu resource."}
                                                        </Paper>
                                                    </Grid2>
                                                    <Grid2 size={{ xs: 12, md: 6 }}>
                                                        {selectedMBAR && <PalmMenuVisualizer pilrcText={selectedMBAR} />}
                                                    </Grid2>
                                                </Grid2>
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