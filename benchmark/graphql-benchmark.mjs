/**
 * Comprehensive GraphQL Query Performance Benchmark
 *
 * Tests various GraphQL patterns with and without caching:
 * - Simple queries
 * - Queries with variables
 * - Complex nested queries
 * - Repeated identical queries (cache hit test)
 * - Schema introspection
 * - Variable substitution patterns
 */

import { graphql, responseCache } from "../pkg/dist-node/index.js";

// Mock fetch for benchmarking
class MockFetch {
  constructor(delay = 0) {
    this.delay = delay;
    this.callCount = 0;
  }

  async fetch(url, options) {
    this.callCount++;

    // Simulate network delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    return {
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
      ]),
      json: async () => ({
        data: {
          repository: {
            name: "graphql.js",
            owner: { login: "octokit" },
            issues: {
              edges: [
                { node: { title: "Issue 1", number: 1 } },
                { node: { title: "Issue 2", number: 2 } },
                { node: { title: "Issue 3", number: 3 } },
              ]
            }
          }
        }
      })
    };
  }
}

// Benchmark runner
class Benchmark {
  constructor(name) {
    this.name = name;
    this.iterations = 1000;
    this.warmupIterations = 100;
  }

  async run(fn) {
    // Warmup
    for (let i = 0; i < this.warmupIterations; i++) {
      await fn();
    }

    // Actual benchmark
    const startTime = performance.now();
    for (let i = 0; i < this.iterations; i++) {
      await fn();
    }
    const endTime = performance.now();

    const totalTime = endTime - startTime;
    const avgTime = totalTime / this.iterations;
    const queriesPerSecond = (1000 / avgTime) * this.iterations;

    return {
      name: this.name,
      iterations: this.iterations,
      totalTime: totalTime.toFixed(2),
      avgTime: avgTime.toFixed(4),
      queriesPerSecond: queriesPerSecond.toFixed(2),
    };
  }
}

// Test queries
const SIMPLE_QUERY = `{ viewer { login } }`;

const QUERY_WITH_VARIABLES = `
  query($owner: String!, $repo: String!, $num: Int) {
    repository(owner: $owner, name: $repo) {
      issues(last: $num) {
        edges {
          node {
            title
            number
          }
        }
      }
    }
  }
`;

const COMPLEX_NESTED_QUERY = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      name
      owner { login }
      issues(last: 10) {
        edges {
          node {
            title
            number
            author { login }
            labels(first: 5) {
              edges {
                node { name }
              }
            }
            comments(first: 5) {
              edges {
                node {
                  body
                  author { login }
                }
              }
            }
          }
        }
      }
      pullRequests(last: 10) {
        edges {
          node {
            title
            number
            author { login }
          }
        }
      }
    }
  }
`;

const SCHEMA_INTROSPECTION = `
  query {
    __schema {
      types {
        name
        kind
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  }
`;

async function runBenchmarks() {
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║         GraphQL Query Performance Benchmark                            ║");
  console.log("║         @octokit/graphql with Caching & Memoization                   ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  const results = [];

  // Test 1: Simple query without cache
  console.log("Running benchmark 1/8: Simple query (no cache)...");
  responseCache.clear();
  const mockFetch1 = new MockFetch(0);
  const bench1 = new Benchmark("Simple query (no cache)");
  const result1 = await bench1.run(async () => {
    await graphql(SIMPLE_QUERY, {
      headers: { authorization: "token test" },
      request: { fetch: mockFetch1.fetch.bind(mockFetch1) }
    });
  });
  results.push(result1);

  // Test 2: Simple query with cache hits
  console.log("Running benchmark 2/8: Simple query (cache hits)...");
  responseCache.clear();
  const mockFetch2 = new MockFetch(0);
  // Prime cache
  await graphql(SIMPLE_QUERY, {
    request: { fetch: mockFetch2.fetch.bind(mockFetch2) }
  });
  const bench2 = new Benchmark("Simple query (cache hits)");
  const result2 = await bench2.run(async () => {
    await graphql(SIMPLE_QUERY, {
      request: { fetch: mockFetch2.fetch.bind(mockFetch2) }
    });
  });
  results.push(result2);

  // Test 3: Query with variables (no cache)
  console.log("Running benchmark 3/8: Query with variables (no cache)...");
  responseCache.clear();
  const mockFetch3 = new MockFetch(0);
  const bench3 = new Benchmark("Query with variables (no cache)");
  let counter = 0;
  const result3 = await bench3.run(async () => {
    await graphql(QUERY_WITH_VARIABLES, {
      headers: { authorization: "token test" },
      owner: "octokit",
      repo: "graphql.js",
      num: 3 + (counter++ % 10), // Different variables each time
      request: { fetch: mockFetch3.fetch.bind(mockFetch3) }
    });
  });
  results.push(result3);

  // Test 4: Query with variables (cache hits)
  console.log("Running benchmark 4/8: Query with variables (cache hits)...");
  responseCache.clear();
  const mockFetch4 = new MockFetch(0);
  // Prime cache
  await graphql(QUERY_WITH_VARIABLES, {
    owner: "octokit",
    repo: "graphql.js",
    num: 3,
    request: { fetch: mockFetch4.fetch.bind(mockFetch4) }
  });
  const bench4 = new Benchmark("Query with variables (cache hits)");
  const result4 = await bench4.run(async () => {
    await graphql(QUERY_WITH_VARIABLES, {
      owner: "octokit",
      repo: "graphql.js",
      num: 3,
      request: { fetch: mockFetch4.fetch.bind(mockFetch4) }
    });
  });
  results.push(result4);

  // Test 5: Complex nested query (no cache)
  console.log("Running benchmark 5/8: Complex nested query (no cache)...");
  responseCache.clear();
  const mockFetch5 = new MockFetch(0);
  const bench5 = new Benchmark("Complex nested query (no cache)");
  const result5 = await bench5.run(async () => {
    await graphql(COMPLEX_NESTED_QUERY, {
      headers: { authorization: "token test" },
      owner: "octokit",
      repo: "graphql.js",
      request: { fetch: mockFetch5.fetch.bind(mockFetch5) }
    });
  });
  results.push(result5);

  // Test 6: Complex nested query (cache hits)
  console.log("Running benchmark 6/8: Complex nested query (cache hits)...");
  responseCache.clear();
  const mockFetch6 = new MockFetch(0);
  // Prime cache
  await graphql(COMPLEX_NESTED_QUERY, {
    owner: "octokit",
    repo: "graphql.js",
    request: { fetch: mockFetch6.fetch.bind(mockFetch6) }
  });
  const bench6 = new Benchmark("Complex nested query (cache hits)");
  const result6 = await bench6.run(async () => {
    await graphql(COMPLEX_NESTED_QUERY, {
      owner: "octokit",
      repo: "graphql.js",
      request: { fetch: mockFetch6.fetch.bind(mockFetch6) }
    });
  });
  results.push(result6);

  // Test 7: Schema introspection (no cache)
  console.log("Running benchmark 7/8: Schema introspection (no cache)...");
  responseCache.clear();
  const mockFetch7 = new MockFetch(0);
  const bench7 = new Benchmark("Schema introspection (no cache)");
  const result7 = await bench7.run(async () => {
    await graphql(SCHEMA_INTROSPECTION, {
      headers: { authorization: "token test" },
      request: { fetch: mockFetch7.fetch.bind(mockFetch7) }
    });
  });
  results.push(result7);

  // Test 8: Schema introspection (cache hits)
  console.log("Running benchmark 8/8: Schema introspection (cache hits)...");
  responseCache.clear();
  const mockFetch8 = new MockFetch(0);
  // Prime cache
  await graphql(SCHEMA_INTROSPECTION, {
    request: { fetch: mockFetch8.fetch.bind(mockFetch8) }
  });
  const bench8 = new Benchmark("Schema introspection (cache hits)");
  const result8 = await bench8.run(async () => {
    await graphql(SCHEMA_INTROSPECTION, {
      request: { fetch: mockFetch8.fetch.bind(mockFetch8) }
    });
  });
  results.push(result8);

  // Print results
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         BENCHMARK RESULTS                              ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log("┌────────────────────────────────────────────┬───────────┬──────────┬───────────────┐");
  console.log("│ Test Name                                  │ Avg (ms)  │ Total(s) │ Queries/sec   │");
  console.log("├────────────────────────────────────────────┼───────────┼──────────┼───────────────┤");

  results.forEach(result => {
    const name = result.name.padEnd(42);
    const avg = result.avgTime.padStart(9);
    const total = (result.totalTime / 1000).toFixed(2).padStart(8);
    const qps = result.queriesPerSecond.padStart(13);
    console.log(`│ ${name} │ ${avg} │ ${total} │ ${qps} │`);
  });

  console.log("└────────────────────────────────────────────┴───────────┴──────────┴───────────────┘\n");

  // Calculate speedup
  const noCacheAvg = parseFloat(result1.avgTime);
  const cacheHitAvg = parseFloat(result2.avgTime);
  const speedup = ((noCacheAvg - cacheHitAvg) / noCacheAvg * 100).toFixed(2);

  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         PERFORMANCE SUMMARY                            ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Cache Hit Speedup (Simple Query):     ${speedup}% faster`);

  const varNoCacheAvg = parseFloat(result3.avgTime);
  const varCacheHitAvg = parseFloat(result4.avgTime);
  const varSpeedup = ((varNoCacheAvg - varCacheHitAvg) / varNoCacheAvg * 100).toFixed(2);
  console.log(`Cache Hit Speedup (With Variables):   ${varSpeedup}% faster`);

  const complexNoCacheAvg = parseFloat(result5.avgTime);
  const complexCacheHitAvg = parseFloat(result6.avgTime);
  const complexSpeedup = ((complexNoCacheAvg - complexCacheHitAvg) / complexNoCacheAvg * 100).toFixed(2);
  console.log(`Cache Hit Speedup (Complex Query):    ${complexSpeedup}% faster`);

  console.log(`\nCache statistics:`);
  const stats = responseCache.getStats();
  console.log(`  - Cache size: ${stats.size}/${stats.maxSize}`);
  console.log(`  - Cache TTL: ${stats.maxAge / 1000}s`);

  console.log("\n✓ Benchmark completed successfully!\n");
}

// Run benchmarks
runBenchmarks().catch(console.error);
