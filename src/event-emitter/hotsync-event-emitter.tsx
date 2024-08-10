import { EventEmitter } from 'events';

export enum HotsyncEvents {
  HotsyncStarted = 'hotsyncStarted',
  HotsyncFinished = 'hotsyncFinished',
  HotsyncUserChanged = 'hotsyncUserChanged'
}

class HotsyncEventEmitter extends EventEmitter {
  emit(event: HotsyncEvents, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: HotsyncEvents, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

const hotsyncEvents = new HotsyncEventEmitter();

export default hotsyncEvents;