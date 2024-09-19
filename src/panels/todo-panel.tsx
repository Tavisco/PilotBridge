import { PaperProps } from "@mui/material/Paper";
import { Box, Typography } from "@mui/material";
import { Panel } from "../panel";
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef<(typeof rows)[number]>[] = [
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
    {
        field: 'category',
        headerName: 'Category',
        type: 'number',
        width: 150,
        editable: true,
    },
    {
        field: 'private',
        headerName: '🔒',
        type: 'number',
        width: 90,
        editable: true,
    },
    {
        field: 'note',
        headerName: '🗒️',
        type: 'number',
        width: 90,
        editable: true,
    },
];

const rows = [
    //   { id: 1, lastName: 'Snow', firstName: 'Jon', age: 14 },
    //   { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 31 },
    //   { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 31 },
    //   { id: 4, lastName: 'Stark', firstName: 'Arya', age: 11 },
    //   { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: null },
    //   { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
    //   { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
    //   { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
    //   { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
];

export function TodoPanel(props: PaperProps) {



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
                        checkboxSelection
                        disableRowSelectionOnClick
                    />
                </div>
            </Box>
        </Panel>
    );
}