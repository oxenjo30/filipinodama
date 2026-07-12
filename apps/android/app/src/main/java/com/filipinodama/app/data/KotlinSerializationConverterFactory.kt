package com.filipinodama.app.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Converter
import retrofit2.Retrofit
import java.lang.reflect.Type

/**
 * Minimal Retrofit [Converter.Factory] bridging kotlinx.serialization's
 * [Json] directly, in place of the `com.jakewharton.retrofit:
 * retrofit2-kotlinx-serialization-converter` artifact.
 *
 * DEVIATION FROM PLAN: that third-party converter (version 1.0.0, the only
 * version published — last updated 2023) exposes its `create(...)` factory
 * as a Kotlin multi-file class facade (`@JvmName`-backed top-level
 * function). That facade reliably failed to resolve from Kotlin call sites
 * under this project's Gradle 8.10.2 / Kotlin 2.0.21 toolchain — reproduced
 * in an isolated, AGP-free minimal Gradle project, with both K1 and K2
 * language versions, ruling out project-specific misconfiguration. Rather
 * than depend on a flaky/unmaintained artifact, this ~40-line factory
 * (a well-established, standard pattern) replaces it. Same runtime
 * behavior, zero external dependency risk.
 */
class KotlinSerializationConverterFactory(
    private val json: Json,
    private val contentType: MediaType
) : Converter.Factory() {

    override fun responseBodyConverter(
        type: Type,
        annotations: Array<out Annotation>,
        retrofit: Retrofit
    ): Converter<ResponseBody, *> {
        val serializer = json.serializersModule.serializer(type)
        return ResponseBodyConverter(json, serializer)
    }

    override fun requestBodyConverter(
        type: Type,
        parameterAnnotations: Array<out Annotation>,
        methodAnnotations: Array<out Annotation>,
        retrofit: Retrofit
    ): Converter<*, RequestBody> {
        val serializer = json.serializersModule.serializer(type)
        return RequestBodyConverter(json, contentType, serializer)
    }

    private class ResponseBodyConverter(
        private val json: Json,
        private val serializer: KSerializer<Any>
    ) : Converter<ResponseBody, Any?> {
        override fun convert(value: ResponseBody): Any? =
            value.use { json.decodeFromString(serializer, it.string()) }
    }

    private class RequestBodyConverter(
        private val json: Json,
        private val contentType: MediaType,
        private val serializer: KSerializer<Any>
    ) : Converter<Any, RequestBody> {
        override fun convert(value: Any): RequestBody =
            json.encodeToString(serializer, value).toRequestBody(contentType)
    }

    companion object {
        fun create(json: Json, contentType: MediaType): KotlinSerializationConverterFactory =
            KotlinSerializationConverterFactory(json, contentType)
    }
}
