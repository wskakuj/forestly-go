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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Aktualizacja w aplikacji.
 *
 * pobierz(url, wersja): pobiera APK NATYWNIE (HttpURLConnection, we własnym wątku) —
 * WebView blokował pobieranie plików z GitHuba przez CORS, dlatego JS-owy
 * fetch kończył się wyrzuceniem do przeglądarki. Postęp raportowany
 * zdarzeniem „postep” { pobrano, calkowite?, procent? }, po skończeniu
 * zwraca uri pliku w pamięci aplikacji.
 *
 * zainstaluj(uri): otwiera systemowy instalator (Package Installer)
 * na pliku z pamięci aplikacji. Bez przeglądarki, bez szukania APK.
 */
@CapacitorPlugin(name = "Aktualizacje")
public class AktualizacjePlugin extends Plugin {

    @PluginMethod
    public void pobierz(PluginCall call) {
        String url = call.getString("url", "");
        String wersja = call.getString("wersja", "aktualizacja");
        if (url == null || url.isEmpty()) { call.reject("brak adresu"); return; }
        new Thread(() -> {
            HttpURLConnection pol = null;
            try {
                pol = (HttpURLConnection) new URL(url).openConnection();
                /* GitHub odsyła przekierowania — HttpURLConnection idzie za nimi sam */
                pol.setConnectTimeout(15000);
                pol.setReadTimeout(30000);
                int kod = pol.getResponseCode();
                if (kod < 200 || kod >= 300) {
                    call.reject("serwer odpowiedział HTTP " + kod);
                    return;
                }
                /* -1, gdy serwer nie poda rozmiaru (GitHub podaje) */
                long calosc = pol.getContentLength();
                File plik = new File(getContext().getCacheDir(),
                    "ForestlyGO-" + wersja + ".apk");
                InputStream we = pol.getInputStream();
                OutputStream wy = new FileOutputStream(plik);
                byte[] bufor = new byte[16384];
                long pobrano = 0;
                int n;
                long ostatniRaport = 0;
                while ((n = we.read(bufor)) > 0) {
                    wy.write(bufor, 0, n);
                    pobrano += n;
                    long teraz = System.currentTimeMillis();
                    if (teraz - ostatniRaport >= 200) { /* max 5 raportów/s */
                        ostatniRaport = teraz;
                        JSObject p = new JSObject();
                        p.put("pobrano", pobrano);
                        if (calosc > 0) {
                            p.put("calkowite", calosc);
                            p.put("procent", (int) (pobrano * 100 / calosc));
                        }
                        notifyListeners("postep", p);
                    }
                }
                wy.flush();
                wy.close();
                we.close();
                JSObject wynik = new JSObject();
                wynik.put("uri", Uri.fromFile(plik).toString());
                call.resolve(wynik);
            } catch (Exception e) {
                call.reject("pobieranie nie wyszło: " + e.getMessage());
            } finally {
                if (pol != null) pol.disconnect();
            }
        }).start();
    }

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
            // najczęściej: brak zgody „Instaluj nieznane aplikacje” (Android 8+)
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
