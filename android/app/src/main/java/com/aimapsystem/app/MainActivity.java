package com.aimapsystem.app;

import android.os.Bundle;
import android.util.Log;
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

