package com.melangemaps.core.contracts

data class RegionPack(
    val regionId: String,
    val version: String,
    val sizeBytes: Long,
    val checksum: String,
)

data class PackProgress(
    val regionId: String,
    val progressPercent: Int,
    val bytesDownloaded: Long,
)

interface MapPackManager {
    suspend fun listAvailablePacks(): List<RegionPack>
    suspend fun install(regionId: String, onProgress: (PackProgress) -> Unit)
    suspend fun validate(regionId: String): Boolean
    suspend fun applyDelta(regionId: String, targetVersion: String): Boolean
}
