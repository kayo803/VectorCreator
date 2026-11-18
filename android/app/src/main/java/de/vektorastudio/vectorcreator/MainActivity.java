package de.vektorastudio.vectorcreator;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) {
            int darkBg = Color.parseColor("#111215");
            window.setStatusBarColor(darkBg);
            window.setNavigationBarColor(darkBg);
            WindowInsetsControllerCompat controller =
                    new WindowInsetsControllerCompat(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            webView.addJavascriptInterface(new AndroidDownloadBridge(), "AndroidBridge");
        }
    }

    private class AndroidDownloadBridge {
        @JavascriptInterface
        public boolean saveBase64File(String filename, String base64Data, String mimeType) {
            String safeName = sanitizeFilename(filename);
            String resolvedMime = (mimeType != null && !mimeType.isEmpty())
                    ? mimeType
                    : "application/octet-stream";

            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, resolvedMime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/VectorCreator");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        return false;
                    }
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) {
                            return false;
                        }
                        out.write(bytes);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                } else {
                    File downloadsDir = new File(
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                            "VectorCreator"
                    );
                    if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
                        return false;
                    }
                    File target = new File(downloadsDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(target)) {
                        fos.write(bytes);
                    }
                }

                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Gespeichert in Downloads/VectorCreator/" + safeName,
                        Toast.LENGTH_LONG
                ).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "Export fehlgeschlagen: " + e.getMessage(),
                        Toast.LENGTH_LONG
                ).show());
                return false;
            }
        }

        private String sanitizeFilename(String input) {
            if (input == null || input.trim().isEmpty()) {
                return "vector-creator-export";
            }
            return input.replaceAll("[^a-zA-Z0-9._-]", "_");
        }
    }
}
