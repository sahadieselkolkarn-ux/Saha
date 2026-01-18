
type Listener = (...args: any[]) => void;
type Events = {
  [eventName: string]: Listener[];
};

class EventEmitter {
  private events: Events = {};

  on(eventName: string, fn: Listener) {
    this.events[eventName] = this.events[eventName] || [];
    this.events[eventName].push(fn);
  }

  emit(eventName: string, ...data: any[]) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(function (fn) {
        fn(...data);
      });
    }
  }
}

export const errorEmitter = new EventEmitter();
