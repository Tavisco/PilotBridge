import { useMemo} from "react";
import Box from "@mui/material/Box";
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