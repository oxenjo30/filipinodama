package com.filipinodama.app.data.config

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET

/**
 * Retrofit interface for the unauthenticated public config endpoint
 * (apps/server/src/modules/admin-config.ts `GET /config/public`). Response is
 * a flat `Record<string,string>` — only the keys the client cares about are
 * declared here as nullable strings; unknown/missing keys are simply absent
 * from the map, matching how apps/web AppLayout.tsx reads this same payload.
 */
interface ConfigApi {
    @GET("api/config/public")
    suspend fun publicConfig(): ApiEnvelope<Map<String, String>>
}
