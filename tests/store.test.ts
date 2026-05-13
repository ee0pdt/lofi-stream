import { assertEquals } from "jsr:@std/assert@^1";
import { createStore } from "../src/store.ts";

interface TestState {
  count: number;
  name: string;
}

const initial = (): TestState => ({ count: 0, name: "init" });

Deno.test("store.get returns the current state", () => {
  const store = createStore<TestState>(initial());
  assertEquals(store.get(), { count: 0, name: "init" });
});

Deno.test("store.set with a partial object merges into state", () => {
  const store = createStore<TestState>(initial());
  store.set({ count: 5 });
  assertEquals(store.get(), { count: 5, name: "init" });
});

Deno.test("store.set with a function receives current state and returns partial", () => {
  const store = createStore<TestState>(initial());
  store.set((s) => ({ count: s.count + 10 }));
  store.set((s) => ({ count: s.count + 10 }));
  assertEquals(store.get().count, 20);
});

Deno.test("store.subscribe fires when the selected slice changes", () => {
  const store = createStore<TestState>(initial());
  const events: Array<[number, number]> = [];
  store.subscribe(
    (s) => s.count,
    (next, prev) => events.push([next, prev]),
  );
  store.set({ count: 1 });
  store.set({ count: 2 });
  assertEquals(events, [[1, 0], [2, 1]]);
});

Deno.test("store.subscribe does NOT fire when an unselected slice changes", () => {
  const store = createStore<TestState>(initial());
  const events: number[] = [];
  store.subscribe(
    (s) => s.count,
    (next) => events.push(next),
  );
  store.set({ name: "changed" });
  store.set({ name: "changed-again" });
  assertEquals(events, []);
});

Deno.test("store.subscribe does NOT fire when selector returns the same primitive", () => {
  const store = createStore<TestState>(initial());
  const events: number[] = [];
  store.subscribe(
    (s) => s.count,
    (next) => events.push(next),
  );
  store.set({ count: 0 }); // same as initial — selector returns same primitive
  store.set({ count: 0 }); // set again with same value
  assertEquals(events, []);
});

Deno.test("store.subscribe returns an unsubscribe function", () => {
  const store = createStore<TestState>(initial());
  const events: number[] = [];
  const unsub = store.subscribe(
    (s) => s.count,
    (next) => events.push(next),
  );
  store.set({ count: 1 });
  unsub();
  store.set({ count: 2 });
  assertEquals(events, [1]);
});

Deno.test("store.subscribe with object selector uses referential equality", () => {
  const store = createStore<TestState>(initial());
  const events: TestState[] = [];
  store.subscribe(
    (s) => s,
    (next) => events.push(next),
  );
  store.set({ count: 1 });
  // Same value via function-form set produces a new state object — fires.
  store.set((s) => ({ count: s.count }));
  assertEquals(events.length, 2);
});
