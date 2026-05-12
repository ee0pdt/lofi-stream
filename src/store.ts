/**
 * Tiny Zustand-style reactive store. Holds a single state object, supports
 * partial updates via `set`, and slice-selective subscriptions via `subscribe`.
 *
 * Listeners fire only when the value returned by their selector changes
 * (referential equality, `Object.is`). State is replaced atomically on each
 * `set` so reading an old reference always shows the pre-update value.
 */

type Listener<U> = (next: U, prev: U) => void;

type Notifier<T> = (state: T) => void;

export interface Store<T> {
  get(): T;
  set(partial: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe<U>(
    selector: (state: T) => U,
    listener: Listener<U>,
  ): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = initial;
  const subs = new Set<Notifier<T>>();

  function get(): T {
    return state;
  }

  function set(
    partial: Partial<T> | ((state: T) => Partial<T>),
  ): void {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    for (const notify of subs) notify(state);
  }

  function subscribe<U>(
    selector: (state: T) => U,
    listener: Listener<U>,
  ): () => void {
    let lastValue = selector(state);
    const notify: Notifier<T> = (s) => {
      const newValue = selector(s);
      if (!Object.is(newValue, lastValue)) {
        const prev = lastValue;
        lastValue = newValue;
        listener(newValue, prev);
      }
    };
    subs.add(notify);
    return () => {
      subs.delete(notify);
    };
  }

  return { get, set, subscribe };
}
