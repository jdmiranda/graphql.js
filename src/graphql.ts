import { request as Request } from "@octokit/request";
import type { ResponseHeaders } from "@octokit/types";
import { GraphqlResponseError } from "./error.js";
import type {
  GraphQlEndpointOptions,
  RequestParameters,
  GraphQlQueryResponse,
  GraphQlQueryResponseData,
} from "./types.js";
import { responseCache } from "./cache.js";

const NON_VARIABLE_OPTIONS = [
  "method",
  "baseUrl",
  "url",
  "headers",
  "request",
  "query",
  "mediaType",
  "operationName",
];

const FORBIDDEN_VARIABLE_OPTIONS = ["query", "method", "url"];

const GHES_V3_SUFFIX_REGEX = /\/api\/v3\/?$/;

/**
 * Optimized request options builder
 */
function buildRequestOptions(
  parsedOptions: RequestParameters,
  request: typeof Request,
): GraphQlEndpointOptions {
  const requestOptions = Object.keys(
    parsedOptions,
  ).reduce<GraphQlEndpointOptions>((result, key) => {
    if (NON_VARIABLE_OPTIONS.includes(key)) {
      result[key] = parsedOptions[key];
      return result;
    }

    if (!result.variables) {
      result.variables = {};
    }

    result.variables[key] = parsedOptions[key];
    return result;
  }, {} as GraphQlEndpointOptions);

  // workaround for GitHub Enterprise baseUrl set with /api/v3 suffix
  // https://github.com/octokit/auth-app.js/issues/111#issuecomment-657610451
  const baseUrl = parsedOptions.baseUrl || request.endpoint.DEFAULTS.baseUrl;
  if (GHES_V3_SUFFIX_REGEX.test(baseUrl)) {
    requestOptions.url = baseUrl.replace(GHES_V3_SUFFIX_REGEX, "/api/graphql");
  }

  return requestOptions;
}

export function graphql<ResponseData = GraphQlQueryResponseData>(
  request: typeof Request,
  query: string | RequestParameters,
  options?: RequestParameters,
): Promise<ResponseData> {
  if (options) {
    if (typeof query === "string" && "query" in options) {
      return Promise.reject(
        new Error(`[@octokit/graphql] "query" cannot be used as variable name`),
      );
    }

    for (const key in options) {
      if (!FORBIDDEN_VARIABLE_OPTIONS.includes(key)) continue;

      return Promise.reject(
        new Error(
          `[@octokit/graphql] "${key}" cannot be used as variable name`,
        ),
      );
    }
  }

  const parsedOptions =
    typeof query === "string" ? Object.assign({ query }, options) : query;

  // Extract query string and variables for caching
  const queryString = typeof query === "string" ? query : parsedOptions.query;
  const variables = parsedOptions.variables as
    | Record<string, unknown>
    | undefined;

  // Check response cache first (only for queries without custom headers/request options)
  const shouldCache = !parsedOptions.headers && !parsedOptions.request;
  if (shouldCache && queryString) {
    const cachedResponse = responseCache.get(queryString, variables);
    if (cachedResponse !== null) {
      return Promise.resolve(cachedResponse as ResponseData);
    }
  }

  const requestOptions = buildRequestOptions(parsedOptions, request);

  return request(requestOptions).then((response) => {
    if (response.data.errors) {
      const headers: ResponseHeaders = {};
      for (const key of Object.keys(response.headers)) {
        headers[key] = response.headers[key];
      }

      throw new GraphqlResponseError(
        requestOptions,
        headers,
        response.data as Required<GraphQlQueryResponse<ResponseData>>,
      );
    }

    const responseData = response.data.data;

    // Cache successful responses
    if (shouldCache && queryString && responseData) {
      responseCache.set(queryString, responseData, variables);
    }

    return responseData;
  });
}
