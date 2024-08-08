import { DatabaseHdrType, RawPdbDatabase, RawPrcDatabase } from "palm-pdb";
import { DatabaseStorageInterface, DlpReadUserInfoRespType } from "palm-sync";
import { v4 as uuidv4 } from 'uuid';


export class WebDatabaseStorageImplementation
  implements DatabaseStorageInterface
{
  getComputerId(): number {
    // Check if the UUID is already stored in localStorage
    const storageKey = 'device_id';
    let deviceId = localStorage.getItem(storageKey);
    
    if (!deviceId) {
      // Generate a new UUID if none exists
      deviceId = uuidv4();
      localStorage.setItem(storageKey, deviceId);
    }

    // Convert the first 8 characters of the UUID (hex string) to a 32-bit integer
    const truncatedHash = parseInt(deviceId.substring(0, 8), 16) >>> 0;

    console.log(`This computer ID is [0x${truncatedHash.toString(16)}] parsed from [${deviceId}]`);

    return truncatedHash;

  }

  async createUsernameInStorage(requestedUserName: string): Promise<void> {
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(requestedUserName, { create: true });
    await userRoot.getDirectoryHandle('backup', { create: true });
    await userRoot.getDirectoryHandle('install', { create: true });
  }
  
  async isUsernameKnownInStorage(requestedUserName: string): Promise<boolean> {
    const root = await navigator.storage.getDirectory();
    try {
      const userRoot = await root.getDirectoryHandle(requestedUserName);
      await userRoot.getDirectoryHandle('backup');
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async writeDatabaseToStorage(
    userInfo: DlpReadUserInfoRespType,
    db: RawPdbDatabase | RawPrcDatabase
  ): Promise<void> {
    console.log('Writting DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const backupDir = await userRoot.getDirectoryHandle('backup');
    const fileHandle = await backupDir.getFileHandle(this.getDbFullName(db), {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(db.serialize());
    await writable.close();
  }
  
  async readDatabaseFromStorage(
    userInfo: DlpReadUserInfoRespType,
    dbName: string
  ): Promise<RawPdbDatabase | RawPrcDatabase> {
    console.log('Reading DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const backupDir = await userRoot.getDirectoryHandle('backup');
    let fileHandle;
    
    try {
      fileHandle = await backupDir.getFileHandle(dbName);
    } catch {
      try {
        const installDir = await userRoot.getDirectoryHandle('install');
        fileHandle = await installDir.getFileHandle(dbName);
      } catch {
        throw new Error(`Database file [${dbName}] does not exist in the backup nor in the install dir.`);
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
    userInfo: DlpReadUserInfoRespType,
    dbName: string
  ): Promise<boolean> {
    console.log('Checking DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const backupDir = await userRoot.getDirectoryHandle('backup');

    try {
      const file = await backupDir.getFileHandle(dbName);
      const f2 = await file.getFile();
      const exists = f2.size != 0;
      console.log(exists);
      return exists;
    } catch (error) {
      console.log('Not exists');
      return false;
    }
  }
  
  async getAllDatabasesFromStorage(
    userInfo: DlpReadUserInfoRespType
  ): Promise<Array<RawPdbDatabase | RawPrcDatabase>> {
    console.log('Get all DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const backupDir = await userRoot.getDirectoryHandle('backup');
    const databases: Array<RawPdbDatabase | RawPrcDatabase> = [];
  
    for await (const entry of (backupDir as any).values()) {
      if (entry.kind === 'file') {
        const db = await this.readDatabaseFromStorage(userInfo, entry.name);
        databases.push(db);
      }
    }
  
    return databases;
  }
  
  async getDatabasesFromInstallList(
    userInfo: DlpReadUserInfoRespType
  ): Promise<{
    databases: Array<RawPdbDatabase | RawPrcDatabase>;
    filenames: string[];
  }> {
    console.log('Get install DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const installDir = await userRoot.getDirectoryHandle('install');
    const databases: Array<RawPdbDatabase | RawPrcDatabase> = [];
    const filenames: string[] = [];
  
    for await (const entry of (installDir as any).values()) {
      if (entry.kind === 'file' && (entry.name.endsWith('.prc') || entry.name.endsWith('.pdb'))) {
        const db = await this.readDatabaseFromStorage(userInfo, entry.name);
        databases.push(db);
        filenames.push(entry.name);
      }
    }
  
    filenames.sort();
  
    return { databases, filenames };
  }
  
  async removeDatabaseFromInstallList(
    userInfo: DlpReadUserInfoRespType,
    db: RawPdbDatabase | RawPrcDatabase,
    filename: string
  ): Promise<void> {
    console.log('Rm install DB');
    const root = await navigator.storage.getDirectory();
    const userRoot = await root.getDirectoryHandle(userInfo.userName);
    const installDir = await userRoot.getDirectoryHandle('install');
    const backupDir = await userRoot.getDirectoryHandle('backup');
  
    const installFileHandle = await installDir.getFileHandle(filename);
    const backupFileHandle = await backupDir.getFileHandle(this.getDbFullName(db), { create: true });
  
    const file = await installFileHandle.getFile();
    const writable = await backupFileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
  
    await installDir.removeEntry(filename);
  }
  
  private getDbFullName(db: RawPdbDatabase | RawPrcDatabase): string {
    const ext = db.header.attributes.resDB ? 'prc' : 'pdb';
    return `${db.header.name}.${ext}`;
  }
}