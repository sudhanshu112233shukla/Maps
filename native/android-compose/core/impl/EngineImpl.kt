package com.melangemaps.core.impl

import com.melangemaps.core.contracts.*
import kotlinx.coroutines.delay
import java.io.File

class SearchEngineImpl : SearchEngine {
    private var isPrepared = false
    private var activeRegionId: String? = null

    override suspend fun buildIndex(regionId: String) {
        delay(300) // Simulate fast index compilation
        activeRegionId = regionId
        isPrepared = true
    }

    override suspend fun search(query: SearchQuery, limit: Int): List<SearchResult> {
        if (!isPrepared) return emptyList()
        
        // Return structured POI matching the offline region
        val mockPois = listOf(
            SearchResult("1", "Gateway of India", "Landmark - Mumbai", NavCoordinate(18.922, 72.8347), 95.0),
            SearchResult("2", "Tata Power EV Hub", "Charging - Mumbai", NavCoordinate(18.9355, 72.8403), 88.0),
            SearchResult("3", "Apollo Pharmacy", "Pharmacy - Mumbai", NavCoordinate(18.9231, 72.8338), 82.0),
            SearchResult("4", "Fortis Hospital", "Hospital - Mumbai", NavCoordinate(19.0596, 72.8421), 78.0),
            SearchResult("5", "Prayagraj Junction", "Station - Allahabad", NavCoordinate(25.4358, 81.8463), 90.0)
        )

        return mockPois.filter { 
            it.title.contains(query.text, ignoreCase = true) || 
            it.subtitle.contains(query.text, ignoreCase = true)
        }.take(limit)
    }
}

class NavigationEngineImpl : NavigationEngine {
    override suspend fun prepare(regionId: String) {
        delay(200)
    }

    override suspend fun route(request: RouteRequest): RouteResult? {
        delay(400) // Simulate fast A* routing execution
        
        // Generate coordinates along the route
        val coords = listOf(
            request.origin,
            NavCoordinate((request.origin.lat + request.destination.lat) / 2, (request.origin.lng + request.destination.lng) / 2),
            request.destination
        )

        val steps = listOf(
            RouteStep("Head toward ${request.mode} corridor", 1500),
            RouteStep("Turn right at primary junction", 800),
            RouteStep("Arrive at offline destination", 0)
        )

        return RouteResult(
            polyline = coords,
            distanceMeters = 2300,
            durationSeconds = 180,
            steps = steps
        )
    }

    override suspend fun reroute(request: RouteRequest): RouteResult? {
        return route(request)
    }
}

class AiEngineImpl : AiEngine {
    override suspend fun prepare(locale: String) {
        delay(250)
    }

    override suspend fun parseIntent(text: String, locale: String): SemanticIntent {
        val mode = when {
            text.contains("safe", ignoreCase = true) -> RouteMode.SAFEST
            text.contains("eco", ignoreCase = true) -> RouteMode.ECO
            text.contains("toll", ignoreCase = true) -> RouteMode.NO_TOLL
            else -> RouteMode.FASTEST
        }

        val poiType = when {
            text.contains("fuel", ignoreCase = true) -> "fuel"
            text.contains("ev", ignoreCase = true) || text.contains("charging", ignoreCase = true) -> "charging"
            text.contains("hospital", ignoreCase = true) -> "hospital"
            else -> null
        }

        return SemanticIntent(
            destinationText = if (poiType == null) "Gateway of India" else null,
            poiType = poiType,
            mode = mode,
            avoid = if (text.contains("highway", ignoreCase = true)) setOf("highways") else emptySet(),
            confidence = 0.92
        )
    }

    override suspend fun chat(message: String, history: List<AiChatTurn>, locale: String): String {
        return when {
            message.contains("fuel", ignoreCase = true) -> "Nearest fuel routing is available offline and prefers primary corridors."
            message.contains("offline", ignoreCase = true) -> "Routing, search, and region data provisioning remain available offline."
            else -> "Offline AI mapping core active. I can parse destinations, charging corridors, and safety modes completely offline."
        }
    }

    override suspend fun transcribe(locale: String): String {
        return "navigate to Apollo Pharmacy Colaba avoiding tolls"
    }
}

class MapPackManagerImpl : MapPackManager {
    private val installedPacks = mutableSetOf<String>()

    override suspend fun listAvailablePacks(): List<RegionPack> {
        return listOf(
            RegionPack("india", "2026.05.18", 120_000_000, "sha256_india_pack"),
            RegionPack("usa", "2026.05.18", 340_000_000, "sha256_usa_pack"),
            RegionPack("europe", "2026.05.18", 450_000_000, "sha256_europe_pack")
        )
    }

    override suspend fun install(regionId: String, onProgress: (PackProgress) -> Unit) {
        val totalBytes = 120_000_000L
        for (percent in 10..100 step 10) {
            delay(150)
            onProgress(PackProgress(regionId, percent, (totalBytes * percent) / 100))
        }
        installedPacks.add(regionId)
    }

    override suspend fun validate(regionId: String): Boolean {
        return true
    }

    override suspend fun applyDelta(regionId: String, targetVersion: String): Boolean {
        return true
    }
}
