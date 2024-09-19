import { PaperProps } from "@mui/material/Paper";
import { Box } from "@mui/material";
import { Panel } from "../panel";
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useEffect, useState } from "react";
import { ToDoDatabase } from "palm-pdb";
import { WebDatabaseStorageImplementation } from "../database-storage/web-db-stg-impl";
import { prefsStore } from "../prefs-store";

const columns: GridColDef<(typeof rows)[number]>[] = [
    {
        field: 'completed',
        headerName: 'Completed',
        width: 130,
        editable: false,
    },
    {
        field: 'priority',
        headerName: 'Priority',
        width: 130,
        editable: false,
    },
    {
        field: 'description',
        headerName: 'Description',
        flex: 1,
        minWidth: 300,
        editable: false,
    },
    {
        field: 'dueDate',
        headerName: 'Due Date',
        type: 'number',
        width: 135,
        editable: true,
    },
    // {
    //     field: 'category',
    //     headerName: 'Category',
    //     type: 'number',
    //     width: 150,
    //     editable: true,
    // },
    // {
    //     field: 'private',
    //     headerName: '🔒',
    //     type: 'number',
    //     width: 90,
    //     editable: true,
    // },
    // {
    //     field: 'note',
    //     headerName: '🗒️',
    //     type: 'number',
    //     width: 90,
    //     editable: true,
    // },
];

interface Row {
    completed: string;
    id: number;
    priority: number;
    description: string;
    dueDate: string | null; // Use the correct type for 'dueDate'
}

const dbStg = new WebDatabaseStorageImplementation();

export function TodoPanel(props: PaperProps) {
    const [rows, setRows] = useState<Row[]>([]);


    async function loadToDo() {
        const selectedDeviceName = prefsStore.get("selectedDevice") as string;
        const db = ToDoDatabase.from(await dbStg.getDatabaseBuffer(selectedDeviceName, 'ToDoDB.pdb'));

        console.log(db);

        setRows(
            db.records.map((record, index) => ({
                completed: record.isCompleted? '✅' : '',
                id: index,
                priority: record.priority,
                description: record.description,
                dueDate: record.dueDate == null? 'Not set' : record.dueDate.value.toLocaleDateString(),
            }))
        );
    }

    useEffect(() => {
        loadToDo();
      }, []);

    return (
        <Panel
            title="To Do List"
            isExpandedByDefault={true}
            {...props}
            sx={{ width: "100%" }}
        >
            <Box>
                <div
                    style={{
                        minHeight: "25vh",
                        placeContent: "start",
                        textAlign: "start",
                        padding: "1em",
                        width: "100%"
                    }}
                >
                    <DataGrid
                        style={{
                            minHeight: "25vh"
                        }}
                        rows={rows}
                        columns={columns}
                        initialState={{
                            pagination: {
                                paginationModel: {
                                    pageSize: 5,
                                },
                            },
                        }}
                        pageSizeOptions={[5]}
                        disableRowSelectionOnClick
                    />
                </div>
            </Box>
        </Panel>
    );
}