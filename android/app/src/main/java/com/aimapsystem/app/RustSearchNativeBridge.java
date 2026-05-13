package com.aimapsystem.app;

public final class RustSearchNativeBridge {
    private static boolean available;

    static {
        try {
            System.loadLibrary("melange_rust_search");
            available = true;
        } catch (Throwable ignored) {
            available = false;
        }
    }

    private RustSearchNativeBridge() {}

    public static boolean isAvailable() {
        return available;
    }

    public static native boolean nativePrepareIndex(
      String regionId,
      String graphPath,
      String poiPath,
      String dataVersion
    );

    public static native String nativeSearch(
      String query,
      String regionId,
      int limit,
      double biasLng,
      double biasLat
    );
}
