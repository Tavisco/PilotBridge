import { RawPdbDatabase, RawPrcDatabase } from "palm-pdb";
import { DatabaseStorageInterface, DlpReadUserInfoRespType } from "palm-sync";


export class WebDatabaseStorageImplementation
  implements DatabaseStorageInterface
{
  getComputerId(): number {
    throw new Error("Method not implemented.");
  }
  createUsernameInStorage(requestedUserName: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  isUsernameKnownInStorage(requestedUserName: string): Promise<boolean> {
    throw new Error("Method not implemented!!!");
  }
  writeDatabaseToStorage(userInfo: DlpReadUserInfoRespType, db: RawPdbDatabase | RawPrcDatabase): Promise<void> {
    throw new Error("Method not implemented.");
  }
  readDatabaseFromStorage(userInfo: DlpReadUserInfoRespType, dbName: string): Promise<RawPdbDatabase | RawPrcDatabase> {
    throw new Error("Method not implemented.");
  }
  databaseExistsInStorage(userInfo: DlpReadUserInfoRespType, dbName: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  getAllDatabasesFromStorage(userInfo: DlpReadUserInfoRespType): Promise<Array<RawPdbDatabase | RawPrcDatabase>> {
    throw new Error("Method not implemented.");
  }
  getDatabasesFromInstallList(userInfo: DlpReadUserInfoRespType): Promise<{ databases: Array<RawPdbDatabase | RawPrcDatabase>; filenames: string[]; }> {
    throw new Error("Method not implemented.");
  }
  removeDatabaseFromInstallList(userInfo: DlpReadUserInfoRespType, db: RawPdbDatabase | RawPrcDatabase, filename: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

}