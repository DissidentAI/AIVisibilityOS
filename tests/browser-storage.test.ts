import { describe, expect, test } from "vitest";
import { MAX_COMPETITORS, MAX_BROWSER_DRAFT_CHARS } from "../src/lib/project-limits";
import {
  accountStorageKey,
  BROWSER_RETENTION_MS,
  clearBrowserValue,
  emptyProjectDraft,
  projectDraftSchema,
  readBrowserValue,
  saveBrowserValue,
} from "../src/lib/browser-storage";
function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
describe("account-scoped browser drafts", () => {
  test("legacy two-row drafts and fifty competitors survive browser storage", () => {
    const store = memoryStore();
    expect(projectDraftSchema.parse(emptyProjectDraft()).competitors).toHaveLength(2);
    const draft = {
      ...emptyProjectDraft(),
      questions: "q".repeat(50000),
      competitors: Array.from({ length: MAX_COMPETITORS }, (_, i) => ({
        name: `Brand ${i}`,
        domain: "https://example.com/" + "a".repeat(2000),
      })),
    };
    expect(saveBrowserValue("many", draft, projectDraftSchema, store, 100)).toBe(true);
    expect(
      readBrowserValue("many", projectDraftSchema, store, 101).value?.competitors,
    ).toHaveLength(50);
    expect(
      projectDraftSchema.safeParse({
        ...draft,
        competitors: [...draft.competitors, draft.competitors[0]],
      }).success,
    ).toBe(false);
    expect(projectDraftSchema.parse({ ...draft, competitors: [] }).competitors).toEqual([]);
  });
  test("round-trips unfinished entries and strips unexpected secret fields", () => {
    const store = memoryStore();
    const draft = {
      ...emptyProjectDraft(),
      name: "Karburo",
      step: 3,
      questions: "Question in progress",
      apiKey: "test-only-secret",
      password: "test-only-password",
    };
    expect(saveBrowserValue("draft", draft, projectDraftSchema, store, 100)).toBe(true);
    expect(store.getItem("draft")).not.toContain("test-only-secret");
    expect(store.getItem("draft")).not.toContain("test-only-password");
    expect(readBrowserValue("draft", projectDraftSchema, store, 101).value).toMatchObject({
      name: "Karburo",
      step: 3,
      questions: draft.questions,
    });
    expect(clearBrowserValue("draft", store)).toBe(true);
    expect(store.getItem("draft")).toBeNull();
  });
  test("different accounts and organizations cannot restore each other's draft", () => {
    const store = memoryStore();
    const owner = { id: "one", org_id: "org-one" };
    saveBrowserValue(
      accountStorageKey("project-draft", owner),
      { ...emptyProjectDraft(), name: "Private draft" },
      projectDraftSchema,
      store,
      100,
    );
    for (const user of [
      { id: "two", org_id: "org-one" },
      { id: "one", org_id: "org-two" },
    ])
      expect(
        readBrowserValue(accountStorageKey("project-draft", user), projectDraftSchema, store, 101)
          .value,
      ).toBeNull();
  });
  test("expired, malformed and oversized drafts are discarded", () => {
    const store = memoryStore();
    saveBrowserValue("draft", emptyProjectDraft(), projectDraftSchema, store, 100);
    expect(
      readBrowserValue("draft", projectDraftSchema, store, 101 + BROWSER_RETENTION_MS).value,
    ).toBeNull();
    expect(store.data.size).toBe(0);
    for (const raw of [
      "{invalid",
      "x".repeat(MAX_BROWSER_DRAFT_CHARS + 1),
      JSON.stringify({ version: 9, savedAt: 100, value: emptyProjectDraft() }),
    ]) {
      store.setItem("draft", raw);
      expect(readBrowserValue("draft", projectDraftSchema, store, 101)).toEqual({
        value: null,
        available: true,
      });
      expect(store.getItem("draft")).toBeNull();
    }
  });
  test("blocked storage and quota errors never prevent form use", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    expect(readBrowserValue("draft", projectDraftSchema, blocked)).toEqual({
      value: null,
      available: false,
    });
    expect(saveBrowserValue("draft", emptyProjectDraft(), projectDraftSchema, blocked)).toBe(false);
    expect(clearBrowserValue("draft", blocked)).toBe(false);
  });
});
