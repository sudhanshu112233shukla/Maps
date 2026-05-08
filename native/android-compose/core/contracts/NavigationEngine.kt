package com.melangemaps.core.contracts

data class NavCoordinate(
    val lat: Double,
    val lng: Double,
)

enum class RouteMode {
    FASTEST,
    SAFEST,
    ECO,
    NO_TOLL,
}

data class RouteRequest(
    val origin: NavCoordinate,
    val destination: NavCoordinate,
    val mode: RouteMode,
    val avoid: Set<String> = emptySet(),
)

data class RouteStep(
    val instruction: String,
    val distanceMeters: Int,
)

data class RouteResult(
    val polyline: List<NavCoordinate>,
    val distanceMeters: Int,
    val durationSeconds: Int,
    val steps: List<RouteStep>,
)

interface NavigationEngine {
    suspend fun prepare(regionId: String)
    suspend fun route(request: RouteRequest): RouteResult?
    suspend fun reroute(request: RouteRequest): RouteResult?
}
