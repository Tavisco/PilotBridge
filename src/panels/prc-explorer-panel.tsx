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
    Stack
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

interface RectLike {
    x: number;
    y: number;
    w: number;
    h: number;
}

// ------------------------------------------------------------
//  Helper: read a null‑terminated C string from absolute offset
// ------------------------------------------------------------
function readCStringAtOffset(reader: PalmBinaryReader, offset: number): string {
    let out = "";
    for (let i = offset; i < reader.length; i++) {
        const b = reader.u8(i);
        if (b === 0) break;
        if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) break;
        out += String.fromCharCode(b);
    }
    return out;
}

// ------------------------------------------------------------
//  Deterministic struct parser (68K, big‑endian)
// ------------------------------------------------------------
class PalmBinaryReader {
    private readonly bytes: Uint8Array;
    private readonly view: DataView;

    constructor(data: Uint8Array | ArrayBuffer) {
        this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    }

    get length() { return this.bytes.length; }

    u8(offset: number): number {
        return (offset < 0 || offset >= this.length) ? 0 : this.view.getUint8(offset);
    }

    i16be(offset: number): number {
        return (offset < 0 || offset + 2 > this.length) ? 0 : this.view.getInt16(offset, false);
    }

    u16be(offset: number): number {
        return (offset < 0 || offset + 2 > this.length) ? 0 : this.view.getUint16(offset, false);
    }

    u32be(offset: number): number {
        return (offset < 0 || offset + 4 > this.length) ? 0 : this.view.getUint32(offset, false);
    }
}

// Read a struct from the reader, returning an object with named fields.
// The format string is a simplified version that ignores 'z' and 's' for reading.
// We manually parse each object type with explicit offsets instead.
// ------------------------------------------------------------
//  Object parsers (68K big‑endian)
// ------------------------------------------------------------
function parseTitle(reader: PalmBinaryReader, offset: number) {
    const rect = { x: reader.i16be(offset), y: reader.i16be(offset+2),
        w: reader.i16be(offset+4), h: reader.i16be(offset+6) };

    // FormTitleType is exactly 12 bytes long (8 for bounds, 4 for the pointer placeholder)
    // Read the string immediately after the struct:
    const text = readCStringAtOffset(reader, offset + 12);

    return { rect, text };
}

function parseLabel(reader: PalmBinaryReader, offset: number) {
    const id = reader.u16be(offset);
    const pos = { x: reader.i16be(offset+2), y: reader.i16be(offset+4) };
    const attrWord = reader.u16be(offset+6);
    const font = reader.u8(offset+8);
    const usable = (attrWord & 0x8000) !== 0;

    // FormLabelType is exactly 14 bytes long
    // Read the string immediately after the struct:
    const text = readCStringAtOffset(reader, offset + 14);

    return { id, pos, font, text, usable };
}

function parseControl(reader: PalmBinaryReader, offset: number) {
    const id = reader.u16be(offset);
    const rect = {
        x: reader.i16be(offset+2), y: reader.i16be(offset+4),
        w: reader.i16be(offset+6), h: reader.i16be(offset+8)
    };

    // offset + 10 contains the 4-byte pointer (NULL on disk, so we ignore it)

    const attrOffset = offset + 14;
    const attrWord = reader.u16be(attrOffset);
    const style = reader.u8(attrOffset + 2);
    const font = reader.u8(attrOffset + 3);
    const group = reader.u8(attrOffset + 4);

    const usable = !!(attrWord & 0x8000);
    const enabled = !!(attrWord & 0x4000);
    const visible = !!(attrWord & 0x2000);
    const on = !!(attrWord & 0x1000);
    const leftAnchor = !!(attrWord & 0x0800);
    const frame = (attrWord >> 8) & 0x07;

    // ControlType is exactly 20 bytes long
    // Read the string immediately after the struct:
    const text = readCStringAtOffset(reader, offset + 20);

    return { id, rect, style, font, group, text, usable, enabled, visible, on, leftAnchor, frame };
}

function parseFormBitmap(reader: PalmBinaryReader, offset: number) {
    // format: uzu15,w2,w  (attr, pos, rscID)
    const attrWord = reader.u16be(offset);
    const pos = { x: reader.i16be(offset+2), y: reader.i16be(offset+4) };
    const rscID = reader.u16be(offset+6);
    const usable = !!(attrWord & 0x8000);
    return { pos, rscID, usable };
}

function parseField(reader: PalmBinaryReader, offset: number) {
    // format: w,w4,uuuuuuuu,u2u2uuuzu,p,zl,zl,zw,zw,w,zw,zw,zw,zw,b,zb
    // We only extract id, rect, maxChars for display.
    const id = reader.u16be(offset);
    const rect = {
        x: reader.i16be(offset+2), y: reader.i16be(offset+4),
        w: reader.i16be(offset+6), h: reader.i16be(offset+8)
    };
    // maxChars is at offset 18? Let's compute: id(2)+rect(8)=10, attr fields (2 bytes? Actually attr is packed in 16 bits? format "uuuuuuuu,u2u2uuuzu" -> 2 bytes? That's a total of 16 bits, so 2 bytes. So after rect: 2 bytes attr. So offset 12. Then pointer (4) at offset 14, then zl (4), zl (4), zw (2), zw (2), maxChars (w) at offset? 14+4=18 for pointer, +4 (zl)=22, +4 (zl)=26, +2 (zw)=28, +2 (zw)=30, then maxChars at 32? Let's trust the format: after the first part, maxChars is a word. We'll use a simpler approach: scan for the maxChars field known offset from pilrc.h. The format string szRCFieldBA16 = "w,w4,uuuuuuuu,u2u2uuuzu,p,zl,zl,zw,zw,w,zw,zw,zw,zw,b,zb". So the 'w' for maxChars appears after "zw,zw". Counting tokens: id(w), rect(w4), attr_bits(uuuuuuuu,u2u2uuuzu) which is one word (16 bits), pointer(p), zl, zl, zw, zw, w(maxChars), ... The offset of that 'w' is after two zw. Total before: id(2)+rect(8)+attr(2)+ptr(4)+zl(4)+zl(4)+zw(2)+zw(2) = 2+8+2+4+4+4+2+2 = 28. So maxChars at offset 28. We'll use 28.
    const maxChars = reader.u16be(offset + 28);
    return { id, rect, maxChars };
}

// ------------------------------------------------------------
//  Main form decoder
// ------------------------------------------------------------
function decodeTFRM(data: Uint8Array | number[] | ArrayBuffer, resourceId: number): string {
    const bytes = toUint8Array(data);
    const reader = new PalmBinaryReader(bytes);

    // Form header (68 bytes)
    // Important fields at known offsets:
    // const formId = reader.u16be(0x28);   // formId at 0x28
    const formAttr = reader.u16be(0x2A); // RCFORMATTR word at 0x2A
    const defaultBtnId = reader.u16be(0x38);
    const numObjects = reader.u16be(0x3E);
    // form bounds from window header at 0x14: x,y,w,h (each i16be)
    const formBounds = {
        x: reader.i16be(0x14), y: reader.i16be(0x16),
        w: reader.i16be(0x18), h: reader.i16be(0x1A)
    };

    // Decode form attribute bits (RCFORMATTR: uuuuuuuu,uzu7,zw)
    const fUsable = !!(formAttr & 0x8000);
    const fEnabled = !!(formAttr & 0x4000);
    const fVisible = !!(formAttr & 0x2000);
    // const fDirty = !!(formAttr & 0x1000);
    const fSaveBehind = !!(formAttr & 0x0800);
    // const fGraffitiShift = !!(formAttr & 0x0400);
    // const fGlobalsAvailable = !!(formAttr & 0x0200);
    const fDoingDialog = !!(formAttr & 0x0100);
    // const fExitDialog = !!(formAttr & 0x0080);
    // bits 6-0 reserved

    const formFlags: string[] = [];
    if (fUsable) formFlags.push("USABLE");
    if (fEnabled) formFlags.push("ENABLED");
    if (fVisible) formFlags.push("VISIBLE");
    if (fSaveBehind) formFlags.push("SAVEBEHIND");
    if (fDoingDialog) formFlags.push("MODAL"); // often used for modal
    // (Note: the exact mapping can be refined, but this matches common forms)

    // Directory starts at offset 0x44 (68)
    const dirStart = 0x44;
    const dirEntrySize = 6; // RCFormObjListBA16 = b,zb,l → 1+1+4 = 6
    const objectLines: string[] = [];

    const sortedOffsets: number[] = [];
    const objects: { type: number; offset: number }[] = [];
    for (let i = 0; i < numObjects; i++) {
        const entryOffset = dirStart + i * dirEntrySize;
        const type = reader.u8(entryOffset);
        const objOff = reader.u32be(entryOffset + 2);
        objects.push({ type, offset: objOff });
        sortedOffsets.push(objOff);
    }
    sortedOffsets.sort((a, b) => a - b);

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        // const nextOffset = sortedOffsets.find(o => o > obj.offset) ?? bytes.length;
        let line = "";
        switch (obj.type) {
            case 9: { // TITLE
                const t = parseTitle(reader, obj.offset);
                line = `TITLE "${escapeQuotedText(t.text)}"`;
                break;
            }
            case 8: { // LABEL
                const l = parseLabel(reader, obj.offset);
                const parts = [`LABEL "${escapeQuotedText(l.text)}"`, `ID ${l.id}`, `AT (${l.pos.x} ${l.pos.y})`];
                if (l.usable) parts.push("USABLE");
                parts.push(`FONT ${l.font}`);
                line = parts.join(" ");
                break;
            }
            case 1: { // CONTROL / BUTTON
                const c = parseControl(reader, obj.offset);
                const styleNames = [
                    "BUTTON",           // 0
                    "PUSHBUTTON",       // 1
                    "CHECKBOX",         // 2
                    "POPUPTRIGGER",     // 3
                    "SELECTORTRIGGER",  // 4
                    "REPEATBUTTON",     // 5
                    "SLIDER",           // 6
                    "FEEDBACKSLIDER"    // 7
                ];
                const styleName = styleNames[c.style] ?? "BUTTON";
                const parts = [styleName, `"${escapeQuotedText(c.text)}"`, `ID ${c.id}`, `AT ${fmtBounds(c.rect)}`];
                if (c.usable) parts.push("USABLE");
                if (c.leftAnchor) parts.push("LEFTANCHOR");
                if (c.frame === 1) parts.push("FRAME");
                else if (c.frame === 0) parts.push("NOFRAME");
                // other flags can be added
                line = parts.join(" ");
                break;
            }
            case 4: { // FORMBITMAP
                const bm = parseFormBitmap(reader, obj.offset);
                const parts = ["FORMBITMAP", `AT (${bm.pos.x} ${bm.pos.y})`, `BITMAP ${bm.rscID}`];
                if (bm.usable) parts.push("USABLE");
                line = parts.join(" ");
                break;
            }
            case 0: { // FIELD
                const f = parseField(reader, obj.offset);
                line = `FIELD ID ${f.id} AT ${fmtBounds(f.rect)} MAXCHARS ${f.maxChars}`;
                break;
            }
            default:
                line = `OBJECT ${kindName(obj.type)}`;
        }
        objectLines.push(`  ${line}`);
    }

    const headerParts = [`FORM ID ${resourceId}`];
    if (formBounds.w > 0 || formBounds.h > 0) {
        headerParts.push(`AT ${fmtBounds(formBounds)}`);
    }
    const headerLine = headerParts.join(" ");
    const lines = [headerLine];
    if (formFlags.length > 0) lines.push(`\tFRAME ${formFlags.join(" ")}`);
    if (defaultBtnId > 0) lines.push(`\tDEFAULTBTNID ${defaultBtnId}`);
    lines.push("BEGIN");
    lines.push(...objectLines);
    lines.push("END");

    // Discovered strings for reference
    const discovered = extractAsciiRuns(bytes, 3);
    if (discovered.length > 0) {
        lines.push("", "; discovered strings");
        for (const s of discovered.slice(0, 128)) {
            lines.push(`; "${escapeQuotedText(s)}"`);
        }
    }

    return lines.join("\n");
}

// ------------------------------------------------------------
//  Remaining unchanged utility functions
// ------------------------------------------------------------
function decodeTSTR(data: Uint8Array | number[] | ArrayBuffer): string {
    const bytes = toUint8Array(data);
    let out = "";
    for (const byte of bytes) {
        if (byte === 0x00) break;
        out += String.fromCharCode(byte);
    }
    return out;
}

function isPrintableAsciiByte(byte: number): boolean {
    return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

function escapeQuotedText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function fmtBounds(r: RectLike | null): string {
    if (!r) return "(? ? ? ?)";
    const ww = r.w === 0 ? "AUTO" : String(r.w);
    const hh = r.h === 0 ? "AUTO" : String(r.h);
    return `(${r.x} ${r.y} ${ww} ${hh})`;
}

function extractAsciiRuns(bytes: Uint8Array, minLen = 3): string[] {
    const runs: string[] = [];
    let start = -1;
    const flush = (endExclusive: number) => {
        if (start < 0) return;
        const chunk = bytes.slice(start, endExclusive);
        let text = "", printable = 0;
        for (const b of chunk) {
            if (isPrintableAsciiByte(b)) { text += String.fromCharCode(b); printable++; }
        }
        if (printable >= minLen) {
            const trimmed = text.replace(/\s+/g, " ").trim();
            if (trimmed) runs.push(trimmed);
        }
        start = -1;
    };
    for (let i = 0; i < bytes.length; i++) {
        if (isPrintableAsciiByte(bytes[i])) { if (start < 0) start = i; }
        else flush(i);
    }
    flush(bytes.length);
    return Array.from(new Set(runs));
}

function kindName(kind: number): string {
    switch (kind) {
        case 0: return "frmFieldObj";
        case 1: return "frmControlObj";
        case 2: return "frmListObj";
        case 3: return "frmTableObj";
        case 4: return "frmBitmapObj";
        case 5: return "frmLineObj";
        case 6: return "frmFrameObj";
        case 7: return "frmRectangleObj";
        case 8: return "frmLabelObj";
        case 9: return "frmTitleObj";
        case 10: return "frmPopupObj";
        case 11: return "frmGraffitiStateObj";
        case 12: return "frmGadgetObj";
        case 13: return "frmScrollBarObj";
        case 14: return "frmSliderObj";
        case 15: return "frmGraphicalControlObj";
        default: return `unknown(${kind})`;
    }
}

function formatHexView(bytes: Uint8Array): string {
    if (bytes.length === 0) return "EMPTY BUFFER";
    const out: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        out.push(Array.from(chunk).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" "));
    }
    return out.join("\n");
}

// ------------------------------------------------------------
//  React component (unchanged except selectedTFRM now uses decodeTFRM)
// ------------------------------------------------------------
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

    const selectedTSTRText = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "tSTR" && selectedRecord.entry.type !== "tver")) return "";
        return decodeTSTR(selectedRecord.data);
    }, [selectedRecord]);

    const selectedTFRM = useMemo(() => {
        if (!selectedRecord || selectedRecord.entry.type !== "tFRM") return { text: "", debug: null as any };
        const text = decodeTFRM(selectedRecord.data, selectedRecord.entry.resourceId);
        return { text, debug: null }; // debug info no longer needed
    }, [selectedRecord]);

    const handleInspectFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
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
        return Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key].sort((a, b) => a.entry.resourceId - b.entry.resourceId);
            return acc;
        }, {} as Record<string, ResourceRecord[]>);
    }, [activeDb]);

    const selectedBitmaps: TAIBBitmap[] = useMemo(() => {
        if (!selectedRecord || (selectedRecord.entry.type !== "Tbmp" && selectedRecord.entry.type !== "tAIB")) return [];
        return extractAllTAIBBitmapsFromResource(toUint8Array(selectedRecord.data));
    }, [selectedRecord]);

    const toggleTypeOpen = (type: string) => {
        setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    };

    const selectedBytes = selectedRecord ? toUint8Array(selectedRecord.data) : new Uint8Array();

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
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    Form Decompiler:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                        fontFamily: "monospace", whiteSpace: "pre-wrap",
                                                        wordBreak: "break-word", maxHeight: 320, overflowY: "auto"
                                                    }}
                                                >
                                                    {selectedTFRM.text || "Could not decompile this tFRM resource."}
                                                </Paper>
                                            </Box>
                                        ) : selectedRecord.entry.type === "tSTR" || selectedRecord.entry.type === "tver" ? (
                                            <Box>
                                                <Typography variant="caption" display="block" gutterBottom color="textSecondary">
                                                    String Decoder:
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 2, bgcolor: "#fafafa", borderRadius: 1,
                                                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word"
                                                    }}
                                                >
                                                    {selectedTSTRText.length > 0 ? selectedTSTRText : "EMPTY STRING"}
                                                </Paper>
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
                                    <Paper
                                        variant="outlined"
                                        sx={{ p: 1, bgcolor: "#1e1e1e", color: "#39ff14", maxHeight: 200, overflowY: "auto", borderRadius: 1 }}
                                    >
                                        <Typography
                                            variant="body2"
                                            component="pre"
                                            sx={{
                                                fontFamily: "'Courier New', Courier, monospace",
                                                whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0, fontSize: "0.85rem"
                                            }}
                                        >
                                            {formatHexView(selectedBytes)}
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