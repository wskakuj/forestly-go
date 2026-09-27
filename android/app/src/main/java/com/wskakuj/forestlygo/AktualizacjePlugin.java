package com.wskakuj.forestlygo;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Instalacja pobranego APK aktualizacji — otwiera systemowy instalator
 * (Package Installer) na pliku z pamięci aplikacji. Bez przeglądarki.
 */
@CapacitorPlugin(name = "Aktualizacje")
public class AktualizacjePlugin extends Plugin {

    @PluginMethod
    public void zainstaluj(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri == null || uri.isEmpty()) {
            call.reject("brak ścieżki pliku");
            return;
        }
        File plik;
        try {
            String sciezka = uri.startsWith("file://") ? Uri.parse(uri).getPath() : uri;
            plik = new File(sciezka);
        } catch (Exception e) {
            call.reject("nieprawidłowa ścieżka: " + uri);
            return;
        }
        if (!plik.exists()) {
            call.reject("plik nie istnieje: " + uri);
            return;
        }
        try {
            Uri contentUri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", plik);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(contentUri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            // najczęściej: brak zgody "Instaluj nieznane aplikacje" (Android 8+)
            try {
                Intent ustawienia = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                ustawienia.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(ustawienia);
                JSObject wynik = new JSObject();
                wynik.put("wymagaZgody", true);
                call.resolve(wynik);
            } catch (Exception e2) {
                call.reject("nie udało się otworzyć instalatora: " + e2.getMessage());
            }
        }
    }
}
