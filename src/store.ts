/**
 * Tiny Zustand-style reactive store. Holds a single state object, supports
 * partial updates via `set`, and slice-selective subscriptions via `subscribe`.
 *
 * Listeners fire only when the value returned by their selector changes
 * (referential equality, `Object.is`). State is replaced atomically on each
 * `set` so reading an old reference always shows the pre-update value.
 */

type Listener<U> = (next: U, prev: U) => void;

interface Subscription<T, U> {
  selector: (state: T) => U;
  listener: Listener<U>;
  lastValue: U;
}

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
  // deno-lint-ignore no-explicit-any
  const subs = new Set<Subscription<T, any>>();

  function get(): T {
    return state;
  }

  function set(
    partial: Partial<T> | ((state: T) => Partial<T>),
  ): void {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    for (const sub of subs) {
      const newValue = sub.selector(state);
      if (!Object.is(newValue, sub.lastValue)) {
        const prev = sub.lastValue;
        sub.lastValue = newValue;
        sub.listener(newValue, prev);
      }
    }
  }

  function subscribe<U>(
    selector: (state: T) => U,
    listener: Listener<U>,
  ): () => void {
    const sub: Subscription<T, U> = {
      selector,
      listener,
      lastValue: selector(state),
    };
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }

  return { get, set, subscribe };
}
