import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";
import { DatabaseStorageInterface } from "palm-sync";
import { v4 as uuidv4 } from "uuid";

export class WebDatabaseStorageImplementation
  implements DatabaseStorageInterface
{
  getComputerId(): number {
    // Check if the UUID is already stored in localStorage
    const storageKey = "device_id";
    let deviceId = localStorage.getItem(storageKey);

    if (!deviceId) {
      // Generate a new UUID if none exists
      deviceId = uuidv4();
      localStorage.setItem(storageKey, deviceId);
    }

    // Convert the first 8 characters of the UUID (hex string) to a 32-bit integer
    const truncatedHash = parseInt(deviceId.substring(0, 8), 16) >>> 0;

    console.log(
      `This computer ID is [0x${truncatedHash.toString(
        16
      )}] parsed from [${deviceId}]`
    );

    return truncatedHash;
  }

  async createUsernameInStorage(requestedUserName: string): Promise<void> {
    await this.getBackupDirectory(requestedUserName, true);
    await this.getInstallDirectory(requestedUserName, true);
  }

  async isUsernameKnownInStorage(requestedUserName: string): Promise<boolean> {
    try {
      await this.getBackupDirectory(requestedUserName);
      return true;
    } catch (error) {
      return false;
    }
  }

  async writeDatabaseToStorage(
    requestedUserName: string,
    db: RawPdbDatabase | RawPrcDatabase
  ): Promise<void> {
    console.log("Writting DB");
    const backupDir = await this.getBackupDirectory(requestedUserName);
    const fileHandle = await backupDir.getFileHandle(this.getDbFullName(db), {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(db.serialize());
    await writable.close();
  }

  async readDatabaseFromStorage(
    requestedUserName: string,
    dbName: string
  ): Promise<RawPdbDatabase | RawPrcDatabase> {
    console.log("Reading DB");
    const backupDir = await this.getBackupDirectory(requestedUserName);
    let fileHandle;

    try {
      fileHandle = await backupDir.getFileHandle(dbName);
    } catch {
      try {
        const installDir = await this.getInstallDirectory(requestedUserName);
        fileHandle = await installDir.getFileHandle(dbName);
      } catch {
        throw new Error(
          `Database file [${dbName}] does not exist in the backup nor in the install dir.`
        );
      }
    }

    const file = await fileHandle.getFile();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const header = DatabaseHdrType.from(fileBuffer);
    return header.attributes.resDB
      ? RawPrcDatabase.from(fileBuffer)
      : RawPdbDatabase.from(fileBuffer);
  }

  async databaseExistsInStorage(
    requestedUserName: string,
    dbName: string
  ): Promise<boolean> {
    console.log("Checking DB " + dbName);
    const backupDir = await this.getBackupDirectory(requestedUserName);

    try {
      const file = await backupDir.getFileHandle(dbName);
      const f2 = await file.getFile();
      const exists = f2.size != 0;
      return Promise.resolve(exists);
    } catch (error) {
      return false;
    }
  }

  async getAllDatabasesFromStorage(
    requestedUserName: string
  ): Promise<Array<RawPdbDatabase | RawPrcDatabase>> {
    console.log(`Get all DB for [${requestedUserName}]`);
    const backupDir = await this.getBackupDirectory(requestedUserName);
    const databases: Array<RawPdbDatabase | RawPrcDatabase> = [];

    for await (const entry of (backupDir as any).values()) {
      if (entry.kind === "file") {
        const db = await this.readDatabaseFromStorage(
          requestedUserName,
          entry.name
        );
        databases.push(db);
      }
    }

    return databases;
  }

  async getDatabasesFromInstallList(requestedUserName: string): Promise<{
    databases: Array<RawPdbDatabase | RawPrcDatabase>;
    filenames: string[];
  }> {
    console.log("Get install DB");
    const installDir = await this.getInstallDirectory(requestedUserName);
    const databases: Array<RawPdbDatabase | RawPrcDatabase> = [];
    const filenames: string[] = [];

    for await (const entry of (installDir as any).values()) {
      if (
        entry.kind === "file" &&
        (entry.name.endsWith(".prc") || entry.name.endsWith(".pdb"))
      ) {
        const db = await this.readDatabaseFromStorage(
          requestedUserName,
          entry.name
        );
        databases.push(db);
        filenames.push(entry.name);
      }
    }

    return { databases, filenames };
  }

  async removeDatabaseFromInstallList(
    requestedUserName: string,
    db: RawPdbDatabase | RawPrcDatabase,
    filename: string
  ): Promise<void> {
    console.log("Rm install DB " + filename);
    const installDir = await this.getInstallDirectory(requestedUserName);
    const backupDir = await this.getBackupDirectory(requestedUserName);

    const installFileHandle = await installDir.getFileHandle(filename);
    const backupFileHandle = await backupDir.getFileHandle(
      this.getDbFullName(db),
      { create: true }
    );

    const file = await installFileHandle.getFile();
    const writable = await backupFileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();

    await installDir.removeEntry(filename);
  }

  private getDbFullName(db: RawPdbDatabase | RawPrcDatabase): string {
    const ext = db.header.attributes.resDB ? "prc" : "pdb";
    return `${db.header.name}.${ext}`;
  }

  async putDatabaseInInstallList(username: string, file: File): Promise<void> {
    const installDir = await this.getInstallDirectory(username);

    const fileHandle = await installDir.getFileHandle(file.name, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
  }

  async removeDatabaseBeforeInstallFromList(
    username: string,
    filename: string
  ) {
    const installDir = await this.getInstallDirectory(username);
    await installDir.removeEntry(filename);
  }

  async removeDevice(username: string): Promise<void> {
    const rootDir = await this.getRootDirectory();
    await rootDir.removeEntry(username, {recursive: true});
  }

  async getAllDevicesNames(): Promise<string[]> {
    const rootDir = await this.getRootDirectory();
    const devices: string[] = [];

    for await (const entry of (rootDir as any).values()) {
      if (entry.kind !== "directory") {
        continue;
      }

      devices.push(entry.name);
    }

    return devices;
  }

  async getBackupDirectory(
    username: string,
    shouldCreate: boolean = false
  ): Promise<FileSystemDirectoryHandle> {
    const userRoot = await this.getUserDirectory(username, shouldCreate);
    return await userRoot.getDirectoryHandle("backup", { create: shouldCreate });
  }

  async getInstallDirectory(
    username: string,
    shouldCreate: boolean = false
  ): Promise<FileSystemDirectoryHandle> {
    const userRoot = await this.getUserDirectory(username, shouldCreate);
    return await userRoot.getDirectoryHandle("install", { create: shouldCreate });
  }

  async getUserDirectory(username: string, shouldCreate: boolean = false): Promise<FileSystemDirectoryHandle> {
    const root = await this.getRootDirectory();
    return await root.getDirectoryHandle(username, { create: shouldCreate });
  }

  async getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle("pilot-bridge", { create: true });
  }
}
