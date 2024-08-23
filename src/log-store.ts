import { action, makeObservable, observable } from 'mobx';
import { debug } from 'palm-sync';

export enum LogEntryType {
  LOG = 'log',
  DIVIDER = 'divider',
}

export type LogEntry =
  | {
      type: LogEntryType.LOG;
      module: string;
      message: string;
    }
  | {
      type: LogEntryType.DIVIDER;
    };

class LogStore {
  private static readonly MAX_LOG_ENTRIES = 1000;

  constructor() {
    makeObservable(this, {
      logs: observable,
      addLog: action,
      addDivider: action,
    });
    debug.enable('palm-sync:*');
    debug.log = this.addLog.bind(this);
  }

  readonly logs: Array<LogEntry> = [];

  private maintainLogSize() {
    // Remove one item from the front if the array exceeds the max size
    if (this.logs.length > LogStore.MAX_LOG_ENTRIES) {
      this.logs.shift();
    }
  }

  addLog(message: string) {
    // eslint-disable-next-line prefer-rest-params
    const match = message.match(/^%c([^%]*) %c(.*)/s);
    let module;
    if (match) {
      [module, message] = [match[1], match[2]];
    } else {
      module = '';
    }
    message = message.replace(/%c/g, '').replace(/[+][0-9]+m?s$/, '');

    if (module === 'palm-sync:padp' || module === 'palm-sync:dlp') {
      return;
    }

    // console.log(...arguments);
    this.logs.push({
      type: LogEntryType.LOG,
      module,
      message,
    });

    this.maintainLogSize();
  }

  addDivider() {
    console.log('-'.repeat(40));
    this.logs.push({ type: LogEntryType.DIVIDER });
    this.maintainLogSize();
  }
}

export const logStore = new LogStore();