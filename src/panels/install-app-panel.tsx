import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  ListItemIcon,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import BoltIcon from "@mui/icons-material/Bolt";
import { runSync } from "./../run-sync";
import { DlpConnection, writeDb } from "palm-sync";
import {
  DatabaseHdrType,
  RawPdbDatabase,
  RawPrcDatabase,
  RsrcEntryType,
} from "palm-pdb";

interface TAIBBitmap {
  width: number;
  height: number;
  rowBytes: number;
  flags: number;
  pixelSize: number;
  version: number;
  transparentIndex?: number;
  compressionType?: number;
  data: Uint8Array;
}

interface TAIBHeader {
  bitmaps: TAIBBitmap[];
}

const extractTAIBResource = async (file: File): Promise<TAIBHeader | null> => {
  let arrayBuffer = await file.arrayBuffer();
  let dataView = new DataView(arrayBuffer);

  // Assuming you have code here to parse the database and get the correct element.
  const arrbuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrbuf);
  const header = DatabaseHdrType.from(buffer);
  const rawDb = header.attributes.resDB
    ? RawPrcDatabase.from(buffer)
    : RawPdbDatabase.from(buffer);

  let element;
  for (let index = 0; index < rawDb.records.length; index++) {
    const record = rawDb.records[index];
    const entries = record.entry as RsrcEntryType;
    if (entries.type === "tAIB" && entries.resourceId == 1000) {
      element = record;
      break;
    }
  }

  if (!element) {
    return null; // No "tAIB" resource found.
  }

  dataView = new DataView(element.data.buffer);
  arrayBuffer = element.data.buffer;

  const bitmaps: TAIBBitmap[] = [];

  let offset = 0;
  while (offset < arrayBuffer.byteLength) {
    const width = dataView.getUint16(offset, false);
    const height = dataView.getUint16(offset + 2, false);
    const rowBytes = dataView.getUint16(offset + 4, false);
    const flags = dataView.getUint16(offset + 6, false);
    const pixelSize = dataView.getUint8(offset + 8);
    const version = dataView.getUint8(offset + 9);
    const nextDepthOffset = dataView.getUint16(offset + 10, false);

    let transparentIndex: number | undefined;
    let compressionType: number | undefined;

    if (version >= 2) {
      transparentIndex = dataView.getUint8(offset + 12);
      compressionType = dataView.getUint8(offset + 13);
    }

    const bitmapHeaderSize = version >= 2 ? 16 : 12;
    const dataStart = offset + bitmapHeaderSize;
    const dataLength = rowBytes * height;

    const data = new Uint8Array(arrayBuffer, dataStart, dataLength);

    bitmaps.push({
      width,
      height,
      rowBytes,
      flags,
      pixelSize,
      version,
      transparentIndex,
      compressionType,
      data,
    });

    // Early return to only get the first bitmap because
    // the rest of the code is not prepared to handle
    // multiple images
    return { bitmaps };

    offset += bitmapHeaderSize + dataLength;

    if (nextDepthOffset === 0) {
      break;
    }

    // Update offset to the next bitmap's header
    offset = dataStart + nextDepthOffset * 4;
  }

  console.log(bitmaps);

  return { bitmaps };
};

const drawTAIBBitmap = (canvas: HTMLCanvasElement, bitmap: TAIBBitmap) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height, rowBytes, pixelSize, data } = bitmap;

  // Set canvas size to be double the size of the original bitmap
  const newWidth = width * 2;
  const newHeight = height * 2;
  canvas.width = newWidth;
  canvas.height = newHeight;

  // Create a scaled image data object
  const imageData = ctx.createImageData(newWidth, newHeight);
  const pixels = imageData.data;

  // Iterate over the bitmap data and scale it
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIndex = y * rowBytes + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);

      const color = data[byteIndex] & (1 << bitIndex) ? 0 : 255;

      // Calculate the corresponding position in the scaled canvas
      const newX = x * 2;
      const newY = y * 2;

      // Set the pixel values for the 2x2 block
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const pixelIndex = ((newY + dy) * newWidth + (newX + dx)) * 4;
          pixels[pixelIndex] = color;
          pixels[pixelIndex + 1] = color;
          pixels[pixelIndex + 2] = color;
          pixels[pixelIndex + 3] = 255; // Alpha channel
        }
      }
    }
  }

  // Put the scaled image data onto the canvas
  ctx.putImageData(imageData, 0, 0);
};

// Example React component
const BitmapCanvas: React.FC<{ bitmap: TAIBBitmap }> = ({ bitmap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawTAIBBitmap(canvasRef.current, bitmap);
    }
  }, [bitmap]);

  return <canvas ref={canvasRef}></canvas>;
};

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

const getAppName = async (file: File): Promise<string> => {
  const arrbuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrbuf);
  const header = DatabaseHdrType.from(buffer);
  return header.name;
};

export function InstallAppPanel() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileNames, setFileNames] = useState<{ [key: string]: string }>({});
  const [bitmaps, setBitmaps] = useState<{ [key: string]: TAIBBitmap[] }>({});

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const validFiles = files.filter(
        (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );

      const newFileNames: { [key: string]: string } = {};
      const newBitmaps: { [key: string]: TAIBBitmap[] } = {};

      for (const file of validFiles) {
        const appName = await getAppName(file);
        newFileNames[file.name] = appName;

        const taibHeader = await extractTAIBResource(file);
        if (taibHeader) {
          newBitmaps[file.name] = taibHeader.bitmaps;
        }
      }

      // Merge new file names with existing ones
      setFileNames((prevFileNames) => ({
        ...prevFileNames,
        ...newFileNames,
      }));

      // Merge new bitmaps with existing ones
      setBitmaps((prevBitmaps) => ({
        ...prevBitmaps,
        ...newBitmaps,
      }));

      setSelectedFiles((prevFiles) => [...prevFiles, ...validFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prevFiles) => {
      const updatedFiles = prevFiles.filter((_, i) => i !== index);
      const updatedFileNames = updatedFiles.reduce((acc, file) => {
        acc[file.name] = fileNames[file.name] || "";
        return acc;
      }, {} as { [key: string]: string });
      setFileNames(updatedFileNames);

      // Filter out bitmaps for the removed files
      const updatedBitmaps = Object.keys(bitmaps).reduce((acc, fileName) => {
        if (updatedFiles.find((file) => file.name === fileName)) {
          acc[fileName] = bitmaps[fileName];
        }
        return acc;
      }, {} as { [key: string]: TAIBBitmap[] });

      setBitmaps(updatedBitmaps);

      return updatedFiles;
    });
  };

  const handleGoClick = async () => {
    await runSync(async (dlpConnection: DlpConnection) => {
      for (const file of selectedFiles) {
        const arrbuf = await file.arrayBuffer();
        const buffer = Buffer.from(arrbuf);

        const header = DatabaseHdrType.from(buffer);
        const rawDb = header.attributes.resDB
          ? RawPrcDatabase.from(buffer)
          : RawPdbDatabase.from(buffer);

        await writeDb(dlpConnection, rawDb, { overwrite: true });
      }
    });
  };

  return (
    <Card sx={{ width: "100%"}}>
      <CardContent>
        <Typography variant="h6" component="div">
          Install list
        </Typography>
        <Box mt={2}>
          <Button variant="contained" component="label">
            Select Files
            <input
              type="file"
              hidden
              onChange={handleFileChange}
              multiple
              accept=".prc,.pdb"
            />
          </Button>
        </Box>
        <List>
          {selectedFiles.map((file, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleRemoveFile(index)}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemIcon>
                {bitmaps[file.name]?.map((bitmap, bitmapIndex) => (
                  <BitmapCanvas key={bitmapIndex} bitmap={bitmap} />
                ))}
              </ListItemIcon>
              <ListItemText
                primary={`${fileNames[file.name] || "Loading..."}`}
                secondary={`${file.name} - ${formatBytes(file.size)}`}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
      <CardActions>
        {/* <Button
          variant="contained"
          color="primary"
          onClick={handleGoClick}
          disabled={selectedFiles.length === 0}
          endIcon={<BoltIcon />}
        >
          Install
        </Button> */}
      </CardActions>
    </Card>
  );
}
