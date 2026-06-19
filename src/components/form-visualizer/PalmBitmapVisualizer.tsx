import { Box, Typography, Stack } from '@mui/material';
import {PalmIcon} from "../PalmIcon.tsx";
import {TAIBBitmap} from "../../utils/taib-extractor.ts";

interface BitmapVisualizerProps {
    bitmaps: TAIBBitmap[];
}

const BitmapVisualizer = ({ bitmaps }: BitmapVisualizerProps) => {
    return (
        <Stack spacing={2}>
            {bitmaps.length > 0 ? (
                bitmaps.map((bmp, index) => (
                    <Box key={index}>
                        <Typography variant="body2" sx={{ fontFamily: "monospace", mb: 1 }}>
                            {bmp.width} x {bmp.height}, {bmp.bpp} bpp, {bmp.density} dpi
                        </Typography>
                        <Box p={2} border="1px dashed #ccc" width="fit-content" borderRadius={1} bgcolor="#f0f0f0">
                            {/* Ensure PalmIcon is imported or available in scope */}
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
    );
};

export default BitmapVisualizer;