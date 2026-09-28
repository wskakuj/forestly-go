package com.wskakuj.forestlygo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* WTYCZKI PRZED super.onCreate() — mostek Capacitora buduje się
           w środku super.onCreate (BridgeActivity.onCreate → load()),
           a registerPlugin po zbudowaniu mostka trafia w próżnię:
           wtyczki nie zostają zarejestrowane i JS ich nie widzi.
           (Raport diagnostyczny v1.0.44 to potwierdził: mostek był,
           ale wtyczek Pliki i Aktualizacje nie było na liście.) */
        registerPlugin(AktualizacjePlugin.class);
        registerPlugin(PlikiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
