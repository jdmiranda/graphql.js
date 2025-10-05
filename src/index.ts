import { request } from "@octokit/request";
import { getUserAgent } from "universal-user-agent";

import { VERSION } from "./version.js";

import { withDefaults } from "./with-defaults.js";

export const graphql = withDefaults(request, {
  headers: {
    "user-agent": `octokit-graphql.js/${VERSION} ${getUserAgent()}`,
  },
  method: "POST",
  url: "/graphql",
});

export type { GraphQlQueryResponseData } from "./types.js";
export { GraphqlResponseError } from "./error.js";

// Export cache utilities for advanced usage
export {
  GraphQLCache,
  SchemaCache,
  RequestOptionsCache,
  responseCache,
  schemaCache,
  requestOptionsCache,
  type CacheEntry,
  type CacheOptions,
} from "./cache.js";

export function withCustomRequest(customRequest: typeof request) {
  return withDefaults(customRequest, {
    method: "POST",
    url: "/graphql",
  });
}
