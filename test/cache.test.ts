import { describe, expect, it, beforeEach } from "vitest";
import { GraphQLCache, responseCache } from "../src/cache.js";

describe("GraphQLCache", () => {
  let cache: GraphQLCache<any>;

  beforeEach(() => {
    cache = new GraphQLCache({
      maxSize: 10,
      maxAge: 1000, // 1 second for testing
    });
  });

  it("should cache and retrieve values", () => {
    const query = "{ viewer { login } }";
    const value = { viewer: { login: "octokit" } };

    cache.set(query, value);
    const cached = cache.get(query);

    expect(cached).toEqual(value);
  });

  it("should cache queries with variables", () => {
    const query =
      "query($owner: String!) { repository(owner: $owner) { name } }";
    const variables = { owner: "octokit" };
    const value = { repository: { name: "graphql.js" } };

    cache.set(query, value, variables);
    const cached = cache.get(query, variables);

    expect(cached).toEqual(value);
  });

  it("should differentiate queries with different variables", () => {
    const query =
      "query($owner: String!) { repository(owner: $owner) { name } }";
    const value1 = { repository: { name: "graphql.js" } };
    const value2 = { repository: { name: "octokit.js" } };

    cache.set(query, value1, { owner: "octokit" });
    cache.set(query, value2, { owner: "github" });

    expect(cache.get(query, { owner: "octokit" })).toEqual(value1);
    expect(cache.get(query, { owner: "github" })).toEqual(value2);
  });

  it("should handle variable order consistently", () => {
    const query = "query($a: String!, $b: String!) { test }";
    const value = { test: "result" };

    // Set with one order
    cache.set(query, value, { b: "two", a: "one" });

    // Get with different order should still work
    const cached = cache.get(query, { a: "one", b: "two" });
    expect(cached).toEqual(value);
  });

  it("should return null for cache miss", () => {
    const cached = cache.get("{ viewer { login } }");
    expect(cached).toBeNull();
  });

  it("should respect maxAge and invalidate old entries", async () => {
    const query = "{ viewer { login } }";
    const value = { viewer: { login: "octokit" } };

    cache.set(query, value);

    // Should be cached immediately
    expect(cache.get(query)).toEqual(value);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Should be null after expiry
    expect(cache.get(query)).toBeNull();
  });

  it("should evict oldest entries when maxSize is reached", async () => {
    const smallCache = new GraphQLCache({ maxSize: 3 });

    smallCache.set("query1", { data: 1 });
    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 5));
    smallCache.set("query2", { data: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    smallCache.set("query3", { data: 3 });

    // All should be cached
    expect(smallCache.get("query1")).toEqual({ data: 1 });
    expect(smallCache.get("query2")).toEqual({ data: 2 });
    expect(smallCache.get("query3")).toEqual({ data: 3 });

    // Adding 4th should evict oldest (query1)
    await new Promise((resolve) => setTimeout(resolve, 5));
    smallCache.set("query4", { data: 4 });

    expect(smallCache.get("query1")).toBeNull();
    expect(smallCache.get("query2")).toEqual({ data: 2 });
    expect(smallCache.get("query3")).toEqual({ data: 3 });
    expect(smallCache.get("query4")).toEqual({ data: 4 });
  });

  it("should track cache hits", () => {
    const query = "{ viewer { login } }";
    const value = { viewer: { login: "octokit" } };

    cache.set(query, value);

    // Access multiple times
    cache.get(query);
    cache.get(query);
    cache.get(query);

    const stats = cache.getStats();
    const entry = stats.entries.find((e) => e.key.startsWith(query));

    expect(entry).toBeDefined();
    expect(entry!.hits).toBeGreaterThan(0);
  });

  it("should support cache clearing", () => {
    cache.set("query1", { data: 1 });
    cache.set("query2", { data: 2 });

    expect(cache.get("query1")).toEqual({ data: 1 });
    expect(cache.get("query2")).toEqual({ data: 2 });

    cache.clear();

    expect(cache.get("query1")).toBeNull();
    expect(cache.get("query2")).toBeNull();
  });

  it("should return accurate stats", () => {
    cache.set("query1", { data: 1 });
    cache.set("query2", { data: 2 });

    const stats = cache.getStats();

    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(10);
    expect(stats.maxAge).toBe(1000);
    expect(stats.entries).toHaveLength(2);
  });

  it("should be disabled when enabled is false", () => {
    const disabledCache = new GraphQLCache({ enabled: false });

    disabledCache.set("query", { data: 1 });
    expect(disabledCache.get("query")).toBeNull();
  });

  it("should check existence with has()", () => {
    const query = "{ viewer { login } }";
    const value = { viewer: { login: "octokit" } };

    expect(cache.has(query)).toBe(false);

    cache.set(query, value);
    expect(cache.has(query)).toBe(true);
  });
});

describe("responseCache singleton", () => {
  beforeEach(() => {
    responseCache.clear();
  });

  it("should be a GraphQLCache instance", () => {
    expect(responseCache).toBeInstanceOf(GraphQLCache);
  });

  it("should cache responses", () => {
    const query = "{ viewer { login } }";
    const value = { viewer: { login: "octokit" } };

    responseCache.set(query, value);
    expect(responseCache.get(query)).toEqual(value);
  });
});

describe("RequestOptionsCache", () => {
  let cache: import("../src/cache.js").RequestOptionsCache;

  beforeEach(async () => {
    const { RequestOptionsCache } = await import("../src/cache.js");
    cache = new RequestOptionsCache();
  });

  it("should cache and retrieve request options", () => {
    const key = "test-key";
    const options = { query: "test", variables: { owner: "octokit" } };

    cache.set(key, options);
    const cached = cache.get(key);

    expect(cached).toEqual(options);
  });

  it("should return null for cache miss", () => {
    const cached = cache.get("non-existent");
    expect(cached).toBeNull();
  });

  it("should support cache clearing", () => {
    cache.set("key1", { data: 1 });
    cache.set("key2", { data: 2 });

    expect(cache.get("key1")).toEqual({ data: 1 });
    expect(cache.get("key2")).toEqual({ data: 2 });

    cache.clear();

    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key2")).toBeNull();
  });
});

describe("SchemaCache", () => {
  let schemaCache: import("../src/cache.js").SchemaCache;

  beforeEach(async () => {
    const { SchemaCache } = await import("../src/cache.js");
    schemaCache = new SchemaCache();
    schemaCache.clear();
  });

  it("should cache schema introspection results", () => {
    const query = "{ __schema { types { name } } }";
    const schema = { types: [{ name: "Query" }, { name: "Mutation" }] };

    schemaCache.set(query, schema);
    expect(schemaCache.get(query)).toEqual(schema);
  });
});
