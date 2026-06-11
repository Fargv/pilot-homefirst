/**
 * queryClient.js — global TanStack Query client + shared query descriptors.
 *
 * Single source of truth for cache keys and fetchers so pages and the
 * nav-hover prefetch (Layout) always hit the same cache entries.
 *
 * Cache policy:
 *   staleTime 5 min  — data considered fresh; navigating back is instant
 *   gcTime   10 min  — kept in memory after unmount
 *   no refetch on window focus; refetch on reconnect; 1 retry
 */

import { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// ── Query descriptors (key + fetcher pairs) ─────────────────────────────────

export const planningQuery = (weekStart) => ({
  queryKey: ["planning", weekStart],
  queryFn: () => apiRequest(`/api/kitchen/weeks/${weekStart}`),
});

export const dishesQuery = (isDinner) => ({
  queryKey: isDinner === undefined ? ["kitchen", "dishes"] : ["kitchen", "dishes", { isDinner }],
  queryFn: () =>
    apiRequest(isDinner === undefined ? "/api/kitchen/dishes" : `/api/kitchen/dishes?isDinner=${isDinner}`),
});

export const shoppingQuery = (weekStart) => ({
  queryKey: ["shopping", weekStart],
  queryFn: () => apiRequest(`/api/kitchen/shopping/${weekStart}`),
});

export const catalogQuery = () => ({
  queryKey: ["catalog"],
  queryFn: () => apiRequest("/api/kitchen/catalog/packs"),
});

/** Household summary — shared by Planning and Settings. */
export const userQuery = (userId) => ({
  queryKey: ["user", userId || "me"],
  queryFn: () => apiRequest("/api/kitchen/household/summary"),
});

export const membersQuery = () => ({
  queryKey: ["user", "members"],
  queryFn: () => apiRequest("/api/kitchen/users/members"),
});

// ── Page helpers ─────────────────────────────────────────────────────────────

/**
 * Cached fetch: returns fresh-enough cached data instantly,
 * otherwise fetches and caches. Drop-in for read paths.
 */
export function fetchCached(descriptor) {
  return queryClient.fetchQuery(descriptor);
}

/** Write a server payload into a cache entry (applyPayload flows). */
export function primeCache(descriptor, payload) {
  if (payload === undefined) return;
  queryClient.setQueryData(descriptor.queryKey, payload);
}

/**
 * Drop-in replacement for apiRequest that keeps the cache honest:
 * non-GET calls invalidate the given key prefixes after success, so the
 * next navigation refetches fresh data. GET calls pass straight through.
 */
export function createSyncedApi(keyPrefixes) {
  return async function apiSync(path, options) {
    const data = await apiRequest(path, options);
    const method = String(options?.method || "GET").toUpperCase();
    if (method !== "GET") {
      for (const queryKey of keyPrefixes) {
        queryClient.invalidateQueries({ queryKey });
      }
    }
    return data;
  };
}
