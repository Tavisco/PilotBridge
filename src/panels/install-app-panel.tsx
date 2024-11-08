import { useEffect, useRef, useState } from "react";
import {
  Button,
  Box,
  List,
  ListItem,
  ListItemText,
  IconButton,
  ListItemIcon,
  PaperProps,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { RawPdbDatabase, RawPrcDatabase, RsrcEntryType } from "palm-pdb";
import { Panel } from "../panel";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import hotsyncEvents, {
  HotsyncEvents,
} from "../event-emitter/hotsync-event-emitter";
import { prefsStore } from "../prefs-store";

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

const extractTAIBResource = (
  rawDb: RawPdbDatabase | RawPrcDatabase
): TAIBBitmap => {
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
    return {
      width: 22,
      height: 22,
      rowBytes: 3,
      flags: 0,
      pixelSize: 1,
      version: 1,
      transparentIndex: 0,
      compressionType: 0,
      data: new Uint8Array(),
    }; // No "tAIB" resource found.
  }

  let dataView = new DataView(element.data.buffer);
  let arrayBuffer = element.data.buffer;

  let offset = 0;
  while (offset < arrayBuffer.byteLength) {
    const width = dataView.getUint16(offset, false);
    const height = dataView.getUint16(offset + 2, false);
    const rowBytes = dataView.getUint16(offset + 4, false);
    const flags = dataView.getUint16(offset + 6, false);
    const pixelSize = dataView.getUint8(offset + 8);
    const version = dataView.getUint8(offset + 9);
    // const nextDepthOffset = dataView.getUint16(offset + 10, false);

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

    return {
      width,
      height,
      rowBytes,
      flags,
      pixelSize,
      version,
      transparentIndex,
      compressionType,
      data,
    };

    // Early return to only get the first bitmap because
    // the rest of the code is not prepared to handle
    // multiple images
    // return { bitmaps };

    // offset += bitmapHeaderSize + dataLength;

    // if (nextDepthOffset === 0) {
    //   break;
    // }

    // Update offset to the next bitmap's header
    // offset = dataStart + nextDepthOffset * 4;
  }

  /**
   * 
   * {"width":22,"height":22,"rowBytes":4,"flags":0,"pixelSize":1,"version":1,"data":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":1,"9":255,"10":0,"11":0,"12":2,"13":0,"14":192,"15":0,"16":12,"17":0,"18":96,"19":0,"20":24,"21":0,"22":176,"23":0,"24":31,"25":255,"26":48,"27":0,"28":56,"29":1,"30":56,"31":0,"32":56,"33":1,"34":56,"35":0,"36":120,"37":249,"38":60,"39":0,"40":121,"41":9,"42":60,"43":0,"44":121,"45":249,"46":60,"47":0,"48":120,"49":1,"50":60,"51":0,"52":120,"53":1,"54":60,"55":0,"56":127,"57":255,"58":60,"59":0,"60":120,"61":1,"62":60,"63":0,"64":56,"65":1,"66":56,"67":0,"68":56,"69":249,"70":56,"71":0,"72":25,"73":9,"74":48,"75":0,"76":9,"77":249,"78":112,"79":0,"80":8,"81":1,"82":96,"83":0,"84":8,"85":1,"86":128,"87":0}}
   */

  return {
    width: 22,
    height: 22,
    rowBytes: 3,
    flags: 0,
    pixelSize: 1,
    version: 1,
    transparentIndex: 0,
    compressionType: 0,
    data: new Uint8Array(),
  };
  // console.log(bitmaps);

  // return { bitmaps };
};

const drawTAIBBitmap = (canvas: HTMLCanvasElement, bitmap: TAIBBitmap) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height, rowBytes, data } = bitmap;

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

const BitmapCanvas: React.FC<{ bitmap: TAIBBitmap }> = ({ bitmap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawTAIBBitmap(canvasRef.current, bitmap);
    }
  }, [bitmap]);

  return <canvas ref={canvasRef}></canvas>;
};

const dbStg = new WebDatabaseStorageImplementation();

export function InstallAppPanel(props: PaperProps) {
  const [hasValidUser, setHasValidUser] = useState<boolean>(true);
  const [filenames, setFilenames] = useState<string[]>([]);
  const [appNames, setAppNames] = useState<string[]>([]);
  const [bitmaps, setBitmaps] = useState<TAIBBitmap[]>([]);

  async function renderFiles() {
    const deviceName = prefsStore.get("selectedDevice") as string;

    try {
      let { databases, filenames } = await dbStg.getDatabasesFromInstallList(
        deviceName
      );

      setAppNames(databases.flatMap((db) => db.header.name));
      setFilenames(filenames);
      setBitmaps(databases.flatMap((db) => extractTAIBResource(db)));
      setHasValidUser(true);
    } catch (error) {
      setHasValidUser(false);
      setFilenames([]);
      setAppNames([]);
      setBitmaps([]);
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const validFiles = files.filter(
        (file) => file.name.endsWith(".prc") || file.name.endsWith(".pdb")
      );

      const deviceName = prefsStore.get("selectedDevice") as string;

      for (const file of validFiles) {
        await dbStg.putDatabaseInInstallList(deviceName, file);
      }

      renderFiles();
    }
  };

  const handleRemoveFile = async (index: number) => {
    const deviceName = prefsStore.get("selectedDevice") as string;

    await dbStg.removeDatabaseBeforeInstallFromList(
      deviceName,
      filenames[index]
    );
    renderFiles();
  };

  useEffect(() => {
    renderFiles();

    const refreshScreen = () => {
      renderFiles();
    };

    hotsyncEvents.on(HotsyncEvents.HotsyncFinished, refreshScreen);
    hotsyncEvents.on(HotsyncEvents.HotsyncUserChanged, refreshScreen);

    return () => {
      hotsyncEvents.off(HotsyncEvents.HotsyncFinished, refreshScreen);
      hotsyncEvents.off(
        HotsyncEvents.HotsyncUserChanged,
        refreshScreen
      );
    };
  }, []);

  return (
    <Panel
      title="Install list"
      isExpandedByDefault={true}
      {...props}
      sx={{ width: "100%" }}
    >
      <Box>
        <Box p={2}>
          <Button
            variant="contained"
            component="label"
            disabled={!hasValidUser}
          >
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
        <div>
          {!hasValidUser && (
            <div
              style={{
                display: "grid",
                placeContent: "center",
                textAlign: "center",
                padding: "2em",
              }}
            >
              <Typography variant="h5" gutterBottom>
                That's a new device! 🎉
              </Typography>
              <Typography variant="body1">
                Please hotsync it first before installing new software.
              </Typography>
            </div>
          )}
        </div>

        <List>
          {appNames.map((appName, index) => (
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
                <BitmapCanvas key={index} bitmap={bitmaps[index]} />
              </ListItemIcon>
              <ListItemText
                primary={`${appName || "Loading..."}`}
                secondary={`${filenames[index]}`}
              />
            </ListItem>
          ))}
        </List>
      </Box>
    </Panel>
  );
}
