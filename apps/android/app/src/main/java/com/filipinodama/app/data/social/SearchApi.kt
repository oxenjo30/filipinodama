package com.filipinodama.app.data.social

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit interface for GET /api/users/search — the real endpoint the web
 * client's GlobalPlayerSearchModal already uses (case-insensitive substring
 * match on username/displayName/tag, capped to 20 results, empty for
 * queries < 2 chars). Confirmed real & wired server-side before building
 * this (UI-fidelity sweep boundary rule) — see
 * apps/server/src/modules/users.ts "GET /api/users/search" and
 * apps/web/src/features/nav/GlobalPlayerSearchModal.tsx.
 */
interface SearchApi {
    @GET("api/users/search")
    suspend fun searchUsers(@Query("q") q: String): ApiEnvelope<UserSearchResponse>
}
