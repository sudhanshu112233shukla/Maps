import Capacitor
import Foundation
import Darwin

@objc(RustSearchPlugin)
public class RustSearchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RustSearchPlugin"
    public let jsName = "RustSearch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepareIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "search", returnType: CAPPluginReturnPromise)
    ]

    private var prepared = false
    private var activeRegion = ""
    private var activeVersion = ""
    private let bridge = RustSearchBridge()

    @objc func prepareIndex(_ call: CAPPluginCall) {
        let regionId = call.getString("regionId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let graphPath = call.getString("graphPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let poiPath = call.getString("poiPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let dataVersion = call.getString("dataVersion")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        var response: [String: Any] = [
            "nativeAvailable": bridge.isAvailable
        ]

        guard bridge.isAvailable else {
            prepared = false
            response["prepared"] = false
            response["reason"] = "Rust native library not loaded"
            call.resolve(response)
            return
        }

        let success = bridge.prepareIndex(
            regionId: regionId,
            graphPath: graphPath,
            poiPath: poiPath,
            dataVersion: dataVersion
        )

        prepared = success
        if success {
            activeRegion = regionId
            activeVersion = dataVersion
        }

        response["prepared"] = success
        response["regionId"] = regionId
        response["dataVersion"] = dataVersion
        call.resolve(response)
    }

    @objc func search(_ call: CAPPluginCall) {
        let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let regionId = call.getString("regionId")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? activeRegion
        let limit = max(1, min(call.getInt("limit") ?? 6, 20))
        let biasLng = call.getDouble("biasLng") ?? 0.0
        let biasLat = call.getDouble("biasLat") ?? 0.0

        var response: [String: Any] = [
            "nativeAvailable": bridge.isAvailable,
            "prepared": prepared,
            "results": []
        ]

        guard bridge.isAvailable, prepared, !query.isEmpty else {
            call.resolve(response)
            return
        }

        guard let payload = bridge.search(
            query: query,
            regionId: regionId,
            limit: limit,
            biasLng: biasLng,
            biasLat: biasLat
        ) else {
            call.resolve(response)
            return
        }

        guard
            let data = payload.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            response["error"] = "Rust response could not be parsed"
            call.resolve(response)
            return
        }

        if let results = object["results"] as? [[String: Any]] {
            response["results"] = results
        }
        response["regionId"] = object["regionId"] as? String ?? regionId
        response["dataVersion"] = object["dataVersion"] as? String ?? activeVersion
        response["latencyMs"] = object["latencyMs"] as? Double ?? -1
        call.resolve(response)
    }
}

private final class RustSearchBridge {
    private typealias PrepareIndexFn = @convention(c) (
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?
    ) -> Bool

    private typealias SearchFn = @convention(c) (
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?,
        Int32,
        Double,
        Double
    ) -> UnsafePointer<CChar>?

    private typealias FreeStringFn = @convention(c) (UnsafeMutablePointer<CChar>?) -> Void

    private let handle: UnsafeMutableRawPointer?
    private let prepareIndexFn: PrepareIndexFn?
    private let searchFn: SearchFn?
    private let freeStringFn: FreeStringFn?

    var isAvailable: Bool {
        handle != nil && prepareIndexFn != nil && searchFn != nil
    }

    init() {
        if let dynamicHandle = RustSearchBridge.openDynamicLibrary() {
            handle = dynamicHandle
        } else if let existing = dlopen(nil, RTLD_NOW) {
            handle = existing
        } else {
            handle = nil
        }

        prepareIndexFn = RustSearchBridge.loadSymbol(
            name: "rust_search_prepare_index",
            handle: handle
        )
        searchFn = RustSearchBridge.loadSymbol(
            name: "rust_search_search",
            handle: handle
        )
        freeStringFn = RustSearchBridge.loadSymbol(
            name: "rust_search_free_string",
            handle: handle
        )
    }

    func prepareIndex(regionId: String, graphPath: String, poiPath: String, dataVersion: String) -> Bool {
        guard let fn = prepareIndexFn else { return false }
        return regionId.withCString { regionCString in
            graphPath.withCString { graphCString in
                poiPath.withCString { poiCString in
                    dataVersion.withCString { versionCString in
                        fn(regionCString, graphCString, poiCString, versionCString)
                    }
                }
            }
        }
    }

    func search(query: String, regionId: String, limit: Int, biasLng: Double, biasLat: Double) -> String? {
        guard let fn = searchFn else { return nil }

        let resultPtr: UnsafePointer<CChar>? = query.withCString { queryCString in
            regionId.withCString { regionCString in
                fn(queryCString, regionCString, Int32(limit), biasLng, biasLat)
            }
        }

        guard let resultPtr else {
            return nil
        }

        let output = String(cString: resultPtr)
        if let freeFn = freeStringFn {
            let mutable = UnsafeMutablePointer(mutating: resultPtr)
            freeFn(mutable)
        }
        return output
    }

    private static func loadSymbol<T>(name: String, handle: UnsafeMutableRawPointer?) -> T? {
        guard let handle else { return nil }
        guard let symbol = dlsym(handle, name) else { return nil }
        return unsafeBitCast(symbol, to: T.self)
    }

    private static func openDynamicLibrary() -> UnsafeMutableRawPointer? {
        let candidates: [String] = [
            "libmelange_rust_search.dylib",
            "melange_rust_search.framework/melange_rust_search"
        ]

        for candidate in candidates {
            if let frameworksPath = Bundle.main.privateFrameworksPath {
                let fullPath = "\(frameworksPath)/\(candidate)"
                if let handle = dlopen(fullPath, RTLD_NOW | RTLD_GLOBAL) {
                    return handle
                }
            }
        }
        return nil
    }
}
