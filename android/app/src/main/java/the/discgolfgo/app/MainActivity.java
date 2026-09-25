package the.discgolfgo.app;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The app runs the live site in a WebView, and the session is mirrored into
    // a cookie so it survives localStorage being evicted. Android writes cookies
    // to disk lazily, so swiping the app away can kill the process before the
    // session cookie is ever persisted. Flushing when we lose the foreground
    // makes it outlive a force close.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
