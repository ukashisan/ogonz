package app.ogonz.tv;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

// Shows the park running on a computer on the same Wi-Fi. Finds the computer
// by itself (UDP broadcast, answered by server/server.js); if that fails, the
// address can be typed in. MENU on the remote comes back to that screen.
public class MainActivity extends Activity {
    static final int DISCOVERY_PORT = 41234;
    static final int DEFAULT_PORT = 8080;
    static final String SETUP = "file:///android_asset/setup.html";

    WebView web;
    SharedPreferences prefs;
    volatile boolean searching;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("ogonz", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0x15, 0x11, 0x0d));
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "OgonzTV");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (failingUrl != null && !failingUrl.startsWith("file:")) {
                    showSetup("Lost the park at " + failingUrl + ". Is the computer on?");
                    findPark();
                }
            }
        });
        setContentView(web);
        hideBars();
        showSetup(null);
        findPark();
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) hideBars();
    }

    void hideBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSetup(null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ---------- setup screen ----------

    void showSetup(String message) {
        runOnUiThread(() -> {
            if (!SETUP.equals(web.getUrl())) web.loadUrl(SETUP + (message == null ? "" : "#" + Uri.encode(message)));
            else if (message != null) status(message);
        });
    }

    void status(String message) {
        runOnUiThread(() -> web.evaluateJavascript("window.setStatus && setStatus(" + quote(message) + ")", null));
    }

    void open(String url) {
        prefs.edit().putString("last", url).apply();
        runOnUiThread(() -> web.loadUrl(url));
    }

    class Bridge {
        @JavascriptInterface public String last() { return prefs.getString("last", ""); }
        @JavascriptInterface public void connect(String address) {
            new Thread(() -> {
                String url = normalize(address);
                if (url == null) { status("Type the address shown on the computer, like 192.168.1.20"); return; }
                status("Connecting to " + url + "…");
                if (isPark(url)) open(url);
                else status("No park at " + url + ". Is npm start running on the computer?");
            }).start();
        }
        @JavascriptInterface public void search() { findPark(); }
    }

    // ---------- finding the computer ----------

    void findPark() {
        if (searching) return;
        searching = true;
        new Thread(() -> {
            try {
                String last = prefs.getString("last", "");
                if (!last.isEmpty()) {
                    status("Trying " + last + "…");
                    if (isPark(last)) { open(last); return; }
                }
                status("Looking for the park on your Wi-Fi…");
                String found = discover();
                if (found != null) open(found);
                else status("No park found. Start it on the computer (npm start), then search again, or type its address.");
            } finally {
                searching = false;
            }
        }).start();
    }

    String discover() {
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            socket.setSoTimeout(1000);
            byte[] ask = "OGONZ?".getBytes(StandardCharsets.UTF_8);
            for (int attempt = 0; attempt < 3; attempt++) {
                for (InetAddress target : broadcastAddresses()) {
                    socket.send(new DatagramPacket(ask, ask.length, target, DISCOVERY_PORT));
                }
                byte[] buf = new byte[64];
                DatagramPacket reply = new DatagramPacket(buf, buf.length);
                try {
                    socket.receive(reply);
                } catch (SocketTimeoutException e) {
                    continue;
                }
                String text = new String(reply.getData(), 0, reply.getLength(), StandardCharsets.UTF_8).trim();
                if (text.startsWith("OGONZ ")) {
                    String url = "http://" + reply.getAddress().getHostAddress() + ":" + text.substring(6).trim() + "/";
                    if (isPark(url)) return url;
                }
            }
        } catch (Exception e) {
            // No network: fall through to typing the address.
        }
        return null;
    }

    Set<InetAddress> broadcastAddresses() throws Exception {
        Set<InetAddress> out = new LinkedHashSet<>();
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        DhcpInfo dhcp = wifi == null ? null : wifi.getDhcpInfo();
        if (dhcp != null && dhcp.ipAddress != 0) {
            int bc = (dhcp.ipAddress & dhcp.netmask) | ~dhcp.netmask;
            if (dhcp.netmask == 0) bc = (dhcp.ipAddress & 0x00ffffff) | 0xff000000;   // assume a /24
            byte[] q = new byte[4];
            for (int k = 0; k < 4; k++) q[k] = (byte) ((bc >> (k * 8)) & 0xff);
            out.add(InetAddress.getByAddress(q));
        }
        out.add(InetAddress.getByName("255.255.255.255"));
        return out;
    }

    static boolean isPark(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url + "api/info").openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(1500);
            try {
                if (c.getResponseCode() != 200) return false;
                byte[] body = new byte[256];
                int n = c.getInputStream().read(body);
                return n > 0 && new String(body, 0, n, StandardCharsets.UTF_8).contains("\"ogonz\"");
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return false;
        }
    }

    static String normalize(String address) {
        String a = address == null ? "" : address.trim();
        if (a.isEmpty()) return null;
        if (!a.startsWith("http://") && !a.startsWith("https://")) a = "http://" + a;
        String rest = a.substring(a.indexOf("//") + 2);
        String host = rest.contains("/") ? rest.substring(0, rest.indexOf('/')) : rest;
        if (!host.contains(":")) host = host + ":" + DEFAULT_PORT;
        return a.substring(0, a.indexOf("//") + 2) + host + "/";
    }

    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }
}
