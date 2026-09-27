package com.wskakuj.forestlygo;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Folder na telefonie: systemowy wybór (Storage Access Framework)
 * oraz zapis/odczyt plików do wybranego folderu — Excel, backup sesji.
 * Podmienia desktopowy File System Access API, którego WebView nie ma.
 */
@CapacitorPlugin(name = "Pliki")
public class PlikiPlugin extends Plugin {

    /* ---------- wybór folderu ---------- */
    @PluginMethod
    public void wybierzFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(call, i, "wybranoFolder");
    }

    @ActivityCallback
    private void wybranoFolder(PluginCall call, ActivityResult result) {
        if (call == null) return;
        /* androidx zwraca tu Intent — URI siedzi w nim (getData().getData()) */
        Intent dane = result.getData();
        Uri uri = (dane != null) ? dane.getData() : null;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            call.reject("anulowano");
            return;
        }
        try {
            // dostęp zapamiętany także po restarcie aplikacji
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) { /* nie krytyczne */ }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("nazwa", nazwaFolderu(uri));
        call.resolve(ret);
    }

    private String nazwaFolderu(Uri treeUri) {
        try {
            Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri,
                DocumentsContract.getTreeDocumentId(treeUri));
            try (Cursor c = getContext().getContentResolver().query(docUri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int k = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                    if (k >= 0 && c.getString(k) != null) return c.getString(k);
                }
            }
        } catch (Exception e) { /* pokażemy ogólne "folder" */ }
        return "folder";
    }

    /* ---------- zapis pliku (nadpisuje istniejący o tej nazwie) ---------- */
    @PluginMethod
    public void zapisz(PluginCall call) {
        String uri = call.getString("uri", "");
        String nazwa = call.getString("nazwa", "");
        String mime = call.getString("mime", "application/octet-stream");
        String dane = call.getString("dane", "");
        if (uri.isEmpty() || nazwa.isEmpty()) { call.reject("brak uri/nazwa"); return; }
        try {
            Uri drzewo = Uri.parse(uri);
            String idRodzica = DocumentsContract.getTreeDocumentId(drzewo);
            Uri uriRodzica = DocumentsContract.buildDocumentUriUsingTree(drzewo, idRodzica);
            // SAF nie nadpisuje w miejscu — usuwamy istniejący plik o tej nazwie
            Uri dzieci = DocumentsContract.buildChildDocumentsUriUsingTree(drzewo, idRodzica);
            try (Cursor c = getContext().getContentResolver().query(dzieci,
                    new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                                  DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                    null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (nazwa.equals(c.getString(1))) {
                        DocumentsContract.deleteDocument(getContext().getContentResolver(),
                            DocumentsContract.buildDocumentUriUsingTree(drzewo, c.getString(0)));
                    }
                }
            }
            Uri nowy = DocumentsContract.createDocument(
                getContext().getContentResolver(), uriRodzica, mime, nazwa);
            if (nowy == null) { call.reject("nie udało się utworzyć pliku"); return; }
            try (OutputStream os = getContext().getContentResolver().openOutputStream(nowy)) {
                if (os == null) { call.reject("brak dostępu do pliku"); return; }
                os.write(Base64.decode(dane, Base64.DEFAULT));
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("nazwa", nazwa);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("zapis nieudany: " + e.getMessage());
        }
    }

    /* ---------- lista plików w folderze ---------- */
    @PluginMethod
    public void lista(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri.isEmpty()) { call.reject("brak uri"); return; }
        try {
            Uri drzewo = Uri.parse(uri);
            Uri dzieci = DocumentsContract.buildChildDocumentsUriUsingTree(drzewo,
                DocumentsContract.getTreeDocumentId(drzewo));
            JSArray tab = new JSArray();
            try (Cursor c = getContext().getContentResolver().query(dzieci,
                    new String[]{ DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                    null, null, null)) {
                while (c != null && c.moveToNext()) tab.put(c.getString(0));
            }
            JSObject ret = new JSObject();
            ret.put("pliki", tab);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("nie mogę odczytać folderu: " + e.getMessage());
        }
    }

    /* ---------- odczyt pliku po nazwie (zwraca base64) ---------- */
    @PluginMethod
    public void odczytaj(PluginCall call) {
        String uri = call.getString("uri", "");
        String nazwa = call.getString("nazwa", "");
        if (uri.isEmpty() || nazwa.isEmpty()) { call.reject("brak uri/nazwa"); return; }
        try {
            Uri drzewo = Uri.parse(uri);
            String idRodzica = DocumentsContract.getTreeDocumentId(drzewo);
            Uri dzieci = DocumentsContract.buildChildDocumentsUriUsingTree(drzewo, idRodzica);
            Uri plikDoc = null;
            try (Cursor c = getContext().getContentResolver().query(dzieci,
                    new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                                  DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                    null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (nazwa.equals(c.getString(1))) {
                        plikDoc = DocumentsContract.buildDocumentUriUsingTree(drzewo, c.getString(0));
                        break;
                    }
                }
            }
            if (plikDoc == null) { call.reject("brak pliku: " + nazwa); return; }
            ByteArrayOutputStream bufor = new ByteArrayOutputStream();
            try (InputStream is = getContext().getContentResolver().openInputStream(plikDoc)) {
                if (is == null) { call.reject("brak dostępu do pliku"); return; }
                byte[] czesc = new byte[8192];
                int n;
                while ((n = is.read(czesc)) > 0) bufor.write(czesc, 0, n);
            }
            JSObject ret = new JSObject();
            ret.put("dane", Base64.encodeToString(bufor.toByteArray(), Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("odczyt nieudany: " + e.getMessage());
        }
    }
}
