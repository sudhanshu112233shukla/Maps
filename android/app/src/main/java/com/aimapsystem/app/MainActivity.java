package com.aimapsystem.app;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.zeticai.mlange.core.model.ZeticMLangeModel;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private final ExecutorService melangeInitExecutor = Executors.newSingleThreadExecutor();
    private ZeticMLangeModel semanticWarmupModel = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MelangeNavigationPlugin.class);
        registerPlugin(RustSearchPlugin.class);
        registerPlugin(GraphHopperRoutingPlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
        warmupMelangeSemanticModel();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        semanticWarmupModel = null;
        melangeInitExecutor.shutdownNow();
    }

    private void warmupMelangeSemanticModel() {
        final String personalAccessToken = BuildConfig.ZETIC_PAT;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            Log.w(TAG, "Skipping Melange warmup because Melange runtime requires Android 12/API 31+.");
            return;
        }
        if (personalAccessToken == null || personalAccessToken.trim().isEmpty()) {
            Log.w(TAG, "Skipping Melange warmup because ZETIC_PAT is empty.");
            return;
        }

        melangeInitExecutor.execute(() -> {
            try {
                semanticWarmupModel = new ZeticMLangeModel(
                        getApplicationContext(),
                        personalAccessToken,
                        "Steve/all-MiniLM-L6-v2"
                );
                Log.i(TAG, "Melange semantic model warmup completed.");
            } catch (Exception error) {
                Log.e(TAG, "Melange semantic model warmup failed: " + error.getMessage(), error);
            }
        });
    }
}
