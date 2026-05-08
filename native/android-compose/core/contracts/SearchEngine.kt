package com.melangemaps.core.contracts

data class SearchQuery(
    val text: String,
    val locale: String,
    val regionId: String,
    val bias: NavCoordinate? = null,
)

data class SearchResult(
    val placeId: String,
    val title: String,
    val subtitle: String,
    val coordinate: NavCoordinate,
    val score: Double,
)

interface SearchEngine {
    suspend fun buildIndex(regionId: String)
    suspend fun search(query: SearchQuery, limit: Int = 8): List<SearchResult>
}
