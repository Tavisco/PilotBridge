import { useState } from "react";
import { Paper, Box, IconButton, Tooltip, Typography, Stack } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

interface PilrcTextVisualizerProps {
    pilrcText: string; // Fixed: primitive 'string' instead of object 'String'
}

// Simple regex map for light PilRC syntax coloring
const highlightPilrcLine = (line: string) => {
    if (line.trim().startsWith("//")) {
        return <span style={{ color: "#6a737d", fontStyle: "italic" }}>{line}</span>;
    }

    // Match keywords like FORM, BUTTON, AT, LEFT, ID, etc.
    const keywordRegex = /\b(FORM|BUTTON|LABEL|FIELD|LIST|POPUPTRIGGER|SELECTORTRIGGER|CHECKBOX|BITMAP|FONT|MENU|TITLE|AT|LEFT|RIGHT|CENTER|BOTTOM|PREV|AUTO|ID|ALERT|VERSION|ICON|STRING|BEGIN|MODAL|MENUID|NOSAVEBEHIND|OBJECT|END|FRAME|DEFAULTBTNID|FORMBITMAP|DEFAULTBUTTON|INFORMATION|WARNING|ERROR|CONFIRMATION|MESSAGE|BUTTONS|PULLDOWN|MENUITEM|SEPARATOR|HIDDEN|NONUSABLE|NOFRAME|USABLE|LEFTALIGN|EDITABLE|UNDERLINED|SINGLELINE|AUTOSHIFT|MAXCHARS|LEFTANCHOR|GRAFFITISTATEINDICATOR|PUSHBUTTON|MULTIPLELINES|GROUP|HELPID)\b/g;

    const parts = line.split(keywordRegex);
    return parts.map((part, index) => {
        if (part.match(keywordRegex)) {
            return <span key={index} style={{ color: "#005cc5", fontWeight: "bold" }}>{part}</span>;
        }
        // Secondary color for numbers/coordinates
        if (part.match(/^\d+$/)) {
            return <span key={index} style={{ color: "#e36209" }}>{part}</span>;
        }
        return part;
    });
};

export const PilrcTextVisualizer = ({ pilrcText }: PilrcTextVisualizerProps) => {
    const [copied, setCopied] = useState(false);

    if (!pilrcText || pilrcText.trim().length === 0) {
        return (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <Typography variant="body2" fontFamily="monospace">
                    Could not decompile this resource
                </Typography>
            </Paper>
        );
    }

    const lines = pilrcText.split("\n");

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(pilrcText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                borderRadius: 1,
                overflow: "hidden",
                borderColor: "divider"
            }}
        >
            {/* Header Actions Bar */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    px: 2,
                    py: 0.5,
                    borderBottom: "1px solid",
                    borderColor: "divider"
                }}
            >
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, fontFamily: "monospace" }}>
                    PILRC SOURCE
                </Typography>
                <Tooltip title={copied ? "Copied!" : "Copy code"}>
                    <IconButton onClick={handleCopy} size="small" color={copied ? "success" : "default"}>
                        {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Code Content Window */}
            <Box
                sx={{
                    p: 2,
                    maxHeight: "500px",
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    whiteSpace: "pre",
                }}
            >
                {lines.map((line, index) => (
                    <Stack direction="row" spacing={2} key={index} sx={{ minWidth: "max-content" }}>
                        {/* Line Numbers */}
                        <Typography
                            variant="caption"
                            sx={{
                                display: "inline-block",
                                width: "24px",
                                textAlign: "right",
                                color: "text.disabled",
                                userSelect: "none",
                                pr: 1,
                                borderRight: "1px solid",
                                borderColor: "divider"
                            }}
                        >
                            {index + 1}
                        </Typography>
                        {/* Code Stream */}
                        <Box sx={{ pl: 1}}>
                            {highlightPilrcLine(line) || " "}
                        </Box>
                    </Stack>
                ))}
            </Box>
        </Paper>
    );
};