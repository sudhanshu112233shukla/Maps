package com.melangemaps.core.contracts

data class SemanticIntent(
    val destinationText: String?,
    val poiType: String?,
    val mode: RouteMode?,
    val avoid: Set<String>,
    val confidence: Double,
)

data class AiChatTurn(
    val role: String,
    val content: String,
)

interface AiEngine {
    suspend fun prepare(locale: String)
    suspend fun parseIntent(text: String, locale: String): SemanticIntent
    suspend fun chat(message: String, history: List<AiChatTurn>, locale: String): String
    suspend fun transcribe(locale: String): String
}
