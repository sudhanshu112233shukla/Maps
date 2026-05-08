package com.aimapsystem.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MelangeNavigationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
