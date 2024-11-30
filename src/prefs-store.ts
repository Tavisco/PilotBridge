import {action, makeObservable, observable} from 'mobx';

export interface Prefs {
  connectionString: 'usb' | 'serial:web';
  selectedDevice: string;
  iCalendarURL: string;
  googleClientID: string;
  googleSecretKey: string;
  enabledOptConduits: string[];
}

function getDefaultConnectionString() {
  for (const [isEnabled, connectionString] of [
    [!!navigator.usb, 'usb'],
    [!!navigator.serial, 'serial:web'],
  ] as const) {
    if (isEnabled) {
      return connectionString;
    }
  }
  return 'usb';
}

export const DEFAULT_PREFS: Prefs = Object.freeze({
  connectionString: getDefaultConnectionString(),
  selectedDevice: '',
  iCalendarURL: '',
  googleClientID: '',
  googleSecretKey: '',
  enabledOptConduits: [] as string[],
});

class PrefsStore {
  constructor() {
    const savedPrefs = localStorage.getItem('prefs');
    if (savedPrefs) {
      try {
        this.prefs = JSON.parse(savedPrefs);
      } catch (e) {
        console.error('Failed to load prefs:', e);
      }
    }
    makeObservable(this, {
      prefs: observable,
      update: action,
      set: action,
    });
  }

  prefs: Partial<Prefs> = {};

  update(prefs: Partial<Prefs>) {
    Object.assign(this.prefs, prefs);
    localStorage.setItem('prefs', JSON.stringify(this.prefs));
  }

  get(key: keyof Prefs): Prefs[keyof Prefs] {
    return this.prefs[key] ?? DEFAULT_PREFS[key];
  }

  set(key: keyof Prefs, value: Prefs[keyof Prefs]) {
    this.update({[key]: value});
  }

  enableConduit(conduitName: string) {
    var currentConduits = this.get('enabledOptConduits') as string[];
    if (currentConduits.indexOf(conduitName) == -1) {
      currentConduits.push(conduitName);
    }
    this.set('enabledOptConduits', currentConduits);
  }

  disableConduit(conduitName: string) {
    var currentConduits = this.get('enabledOptConduits') as string[];
    const conduitIndex = currentConduits.indexOf(conduitName);
    if (conduitIndex != -1) {
      currentConduits.splice(conduitIndex, 1);
    }
    
    this.set('enabledOptConduits', currentConduits);
  }

  isConduitEnabled(conduitName: string): boolean {
    var currentConduits = this.get('enabledOptConduits') as string[];
    return currentConduits.indexOf(conduitName) != -1;
  }

}

export const prefsStore = new PrefsStore();
