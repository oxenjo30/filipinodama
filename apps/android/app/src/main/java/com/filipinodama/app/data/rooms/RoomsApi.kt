package com.filipinodama.app.data.rooms

import com.filipinodama.app.data.ApiEnvelope
import retrofit2.http.GET

/**
 * Retrofit interface for the room/spectate REST endpoints, matching
 * apps/server/src/modules/rooms.ts and the /matches/live handler in
 * apps/server/src/modules/matches.ts exactly.
 */
interface RoomsApi {

    /** GET /api/rooms/mine — the caller's currently-active private room code (resume-on-entry). */
    @GET("api/rooms/mine")
    suspend fun mine(): ApiEnvelope<RoomsMineResponse>

    /** GET /api/matches/live — watchable live matches + open private rooms (Live Match Browser). */
    @GET("api/matches/live")
    suspend fun live(): ApiEnvelope<LiveMatchesResponse>
}
