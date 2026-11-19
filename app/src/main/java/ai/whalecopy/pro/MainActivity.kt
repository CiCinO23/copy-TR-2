package ai.whalecopy.pro

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

private val Ink = Color(0xFF0B0E11)
private val Gold = Color(0xFF01BC8D)
private val RedAlert = Color(0xFFF6465D)
private val Muted = Color(0xFF8A99AD)

private const val PREFS_NAME = "copytr_app_prefs"
private const val KEY_KEEP_ALIVE_BG = "keep_alive_bg"
private const val KEY_LOCKSCREEN_NOTIF = "lockscreen_notif"
private const val KEY_SHOW_SENSITIVE = "show_sensitive"

private const val BG_CHANNEL_ID = "copytr_bg_service_channel"
private const val ALERT_CHANNEL_ID = "copytr_lockscreen_alerts_v2"
private const val BG_NOTIF_ID = 91001

object WebViewHolder {
    @SuppressLint("StaticFieldLeak")
    @Volatile
    var activeWebView: KeepAliveWebView? = null

    @SuppressLint("StaticFieldLeak")
    @Volatile
    var currentActivity: Activity? = null

    @Volatile
    var isActivityInForeground: Boolean = false
}

class KeepAliveWebView(context: Context) : WebView(context) {
    override fun onWindowVisibilityChanged(visibility: Int) {
        if (AppPreferencesHelper.isKeepAliveEnabled(context)) {
            // Keep Chromium WebView in VISIBLE state even when screen is locked or user switches to another app
            super.onWindowVisibilityChanged(View.VISIBLE)
        } else {
            super.onWindowVisibilityChanged(visibility)
        }
    }
}

object AppPreferencesHelper {
    fun isKeepAliveEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_KEEP_ALIVE_BG, true)
    }

    fun isLockScreenNotifEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_LOCKSCREEN_NOTIF, true)
    }

    fun isShowSensitiveEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_SHOW_SENSITIVE, true)
    }

    fun saveBackgroundConfig(
        context: Context,
        keepAlive: Boolean,
        lockScreenNotif: Boolean,
        showSensitive: Boolean
    ) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_KEEP_ALIVE_BG, keepAlive)
            .putBoolean(KEY_LOCKSCREEN_NOTIF, lockScreenNotif)
            .putBoolean(KEY_SHOW_SENSITIVE, showSensitive)
            .apply()
    }
}

class WhaleBackgroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (!AppPreferencesHelper.isKeepAliveEnabled(applicationContext)) return
            try {
                acquireWakeLock()
                // Only pulse WebView timers from the service when Activity is in background / screen locked
                // so foreground user interaction and scrolling are never interrupted
                if (!WebViewHolder.isActivityInForeground) {
                    WebViewHolder.activeWebView?.let { wv ->
                        wv.resumeTimers()
                        wv.evaluateJavascript(
                            "window.__copyTrNativeHeartbeat && window.__copyTrNativeHeartbeat('native_bg');",
                            null
                        )
                    }
                }
            } catch (_: Throwable) {
                // ignore
            }
            mainHandler.postDelayed(this, 2500L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        ensureChannels(this)
        LocalWebProxyServer.ensureStarted(applicationContext)
        acquireWakeLock()
        startHeartbeatLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!AppPreferencesHelper.isKeepAliveEnabled(this)) {
            stopHeartbeatLoop()
            releaseWakeLock()
            stopSelf()
            return START_NOT_STICKY
        }

        acquireWakeLock()
        startHeartbeatLoop()

        val notification = buildForegroundNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    BG_NOTIF_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(BG_NOTIF_ID, notification)
            }
        } catch (_: Exception) {
            // ignore
        }

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        if (!AppPreferencesHelper.isKeepAliveEnabled(this)) {
            stopHeartbeatLoop()
            releaseWakeLock()
            stopSelf()
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            LocalWebProxyServer.clearStaticAssetCache()
            mainHandler.post {
                try {
                    WebViewHolder.activeWebView?.let { wv ->
                        wv.clearCache(false)
                        wv.evaluateJavascript(
                            "window.__copyTrPerformMemoryCleanup && window.__copyTrPerformMemoryCleanup('OS_LOW_MEMORY');",
                            null
                        )
                    }
                    System.gc()
                } catch (_: Throwable) {
                }
            }
        }
    }

    override fun onDestroy() {
        stopHeartbeatLoop()
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startHeartbeatLoop() {
        mainHandler.removeCallbacks(heartbeatRunnable)
        mainHandler.postDelayed(heartbeatRunnable, 3500L)
    }

    private fun stopHeartbeatLoop() {
        mainHandler.removeCallbacks(heartbeatRunnable)
    }

    @Suppress("DEPRECATION")
    private fun acquireWakeLock() {
        try {
            if (wakeLock == null || wakeLock?.isHeld == false) {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "CopyTR::BackgroundSyncWakeLock"
                ).apply {
                    setReferenceCounted(false)
                    acquire(24 * 60 * 60 * 1000L)
                }
            }
            if (wifiLock == null || wifiLock?.isHeld == false) {
                val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                wifiLock = wm?.createWifiLock(
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                    "CopyTR::BackgroundWifiLock"
                )?.apply {
                    setReferenceCounted(false)
                    acquire()
                }
            }
        } catch (_: Exception) {
            // ignore
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null
            wifiLock?.let {
                if (it.isHeld) it.release()
            }
            wifiLock = null
        } catch (_: Exception) {
            // ignore
        }
    }

    private fun buildForegroundNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 0, openIntent, pendingFlags)

        return NotificationCompat.Builder(this, BG_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Copy TR يعمل في الخلفية (v2.24)")
            .setContentText("مراقبة الصفقات المنسوخة وإشعارات شاشة القفل نشطة بلا توقف")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        fun ensureChannels(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

                val bgChannel = NotificationChannel(
                    BG_CHANNEL_ID,
                    "تشغيل Copy TR في الخلفية",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "يبقي محرك نسخ الصفقات ومراقبة التراجع نشطاً في الخلفية"
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }

                val alertChannel = NotificationChannel(
                    ALERT_CHANNEL_ID,
                    "تنبيهات الصفقات وشاشة القفل الفورية",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "إشعارات فتح الصفقات، التدعيم، الإغلاق، وتنبيهات التراجع على شاشة القفل"
                    enableVibration(true)
                    enableLights(true)
                    setBypassDnd(true)
                    vibrationPattern = longArrayOf(0, 240, 80, 240, 80, 320)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }

                nm.createNotificationChannel(bgChannel)
                nm.createNotificationChannel(alertChannel)
            }
        }

        fun updateServiceState(context: Context, keepAlive: Boolean) {
            val intent = Intent(context, WhaleBackgroundService::class.java)
            try {
                if (keepAlive) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                } else {
                    context.stopService(intent)
                }
            } catch (_: Exception) {
                // ignore
            }
        }
    }
}

class AndroidAppControl(private val activity: Activity) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun setBackgroundMode(
        keepAlive: Boolean,
        lockScreenNotifications: Boolean,
        showSensitiveDetails: Boolean
    ) {
        AppPreferencesHelper.saveBackgroundConfig(
            activity.applicationContext,
            keepAlive,
            lockScreenNotifications,
            showSensitiveDetails
        )
        mainHandler.post {
            WhaleBackgroundService.updateServiceState(activity.applicationContext, keepAlive)
        }
    }

    @JavascriptInterface
    fun isIgnoringBatteryOptimizations(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
                pm.isIgnoringBatteryOptimizations(activity.packageName)
            } else {
                true
            }
        } catch (_: Exception) {
            true
        }
    }

    @SuppressLint("BatteryLife")
    @JavascriptInterface
    fun requestIgnoreBatteryOptimizations() {
        mainHandler.post {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
                    if (!pm.isIgnoringBatteryOptimizations(activity.packageName)) {
                        val intent = Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:${activity.packageName}")
                        )
                        activity.startActivity(intent)
                    }
                }
            } catch (_: Exception) {
                // ignore
            }
        }
    }

    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun showNativeNotification(
        title: String,
        body: String,
        notifId: String,
        isUrgent: Boolean
    ) {
        val ctx = activity.applicationContext
        if (!AppPreferencesHelper.isLockScreenNotifEnabled(ctx)) return

        WhaleBackgroundService.ensureChannels(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Wake up screen briefly if device is locked so the lock-screen banner is immediately visible
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isInteractive) {
                val screenWake = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "CopyTR::LockScreenAlertWakeLock"
                )
                screenWake.setReferenceCounted(false)
                screenWake.acquire(4500L)
            }
        } catch (_: Exception) {
            // ignore
        }

        val openIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(ctx, notifId.hashCode(), openIntent, pendingFlags)

        val visibility = if (AppPreferencesHelper.isShowSensitiveEnabled(ctx)) {
            NotificationCompat.VISIBILITY_PUBLIC
        } else {
            NotificationCompat.VISIBILITY_PRIVATE
        }

        val notification = NotificationCompat.Builder(ctx, ALERT_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title)
            .setContentText(body.lines().firstOrNull() ?: body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(if (isUrgent) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(visibility)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVibrate(longArrayOf(0, 240, 80, 240, 80, 320))
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, isUrgent)
            .build()

        try {
            nm.notify(notifId.hashCode(), notification)
        } catch (_: Exception) {
            // ignore
        }
    }

    @JavascriptInterface
    fun performNativeMemoryCleanup() {
        LocalWebProxyServer.clearStaticAssetCache()
        mainHandler.post {
            try {
                WebViewHolder.activeWebView?.clearCache(false)
                System.gc()
            } catch (_: Throwable) {
            }
        }
    }

    @JavascriptInterface
    fun exitAppCompletely() {
        AppPreferencesHelper.saveBackgroundConfig(
            activity.applicationContext,
            false,
            AppPreferencesHelper.isLockScreenNotifEnabled(activity.applicationContext),
            AppPreferencesHelper.isShowSensitiveEnabled(activity.applicationContext)
        )
        mainHandler.post {
            WhaleBackgroundService.updateServiceState(activity.applicationContext, false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                activity.finishAndRemoveTask()
            } else {
                activity.finishAffinity()
            }
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        WebViewHolder.currentActivity = this
        installBackgroundCrashGuard()

        WhaleBackgroundService.ensureChannels(applicationContext)
        requestNotificationPermissionIfNeeded()

        if (AppPreferencesHelper.isKeepAliveEnabled(applicationContext)) {
            WhaleBackgroundService.updateServiceState(applicationContext, true)
        }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                WhaleApp(activity = this)
            }
        }
    }

    private fun installBackgroundCrashGuard() {
        val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Prevent non-main-thread exceptions (proxy sockets, JavaBridge, etc.) from force-closing the app
            if (thread.id != Looper.getMainLooper().thread.id) {
                return@setDefaultUncaughtExceptionHandler
            }
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    override fun onResume() {
        super.onResume()
        WebViewHolder.currentActivity = this
        WebViewHolder.isActivityInForeground = true
        WebViewHolder.activeWebView?.let { wv ->
            wv.resumeTimers()
            wv.onResume()
            wv.evaluateJavascript(
                "window.__copyTrNativeHeartbeat && window.__copyTrNativeHeartbeat('native_resume');",
                null
            )
        }
    }

    override fun onPause() {
        WebViewHolder.isActivityInForeground = false
        super.onPause()
        if (AppPreferencesHelper.isKeepAliveEnabled(applicationContext)) {
            WebViewHolder.activeWebView?.let { wv ->
                wv.resumeTimers()
            }
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            LocalWebProxyServer.clearStaticAssetCache()
            try {
                WebViewHolder.activeWebView?.let { wv ->
                    wv.clearCache(false)
                    wv.evaluateJavascript(
                        "window.__copyTrPerformMemoryCleanup && window.__copyTrPerformMemoryCleanup('OS_LOW_MEMORY');",
                        null
                    )
                }
                System.gc()
            } catch (_: Throwable) {
            }
        }
    }

    override fun onDestroy() {
        if (WebViewHolder.currentActivity === this) {
            WebViewHolder.currentActivity = null
        }
        WebViewHolder.isActivityInForeground = false
        if (!AppPreferencesHelper.isKeepAliveEnabled(applicationContext)) {
            WhaleBackgroundService.updateServiceState(applicationContext, false)
        }
        super.onDestroy()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    1001
                )
            }
        }
    }
}

class AndroidFileDownloader(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun saveFile(content: String, fileName: String, mimeType: String) {
        try {
            val cleanName = fileName.ifBlank { "CopyTR_Export_${System.currentTimeMillis()}.xls" }
            val cleanMime = mimeType.substringBefore(";").ifBlank { "application/vnd.ms-excel" }
            val bytes = content.toByteArray(Charsets.UTF_8)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName)
                    put(MediaStore.MediaColumns.MIME_TYPE, cleanMime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { out ->
                        out.write(bytes)
                        out.flush()
                    }
                }
            } else {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs()
                }
                val outFile = File(downloadsDir, cleanName)
                FileOutputStream(outFile).use { out ->
                    out.write(bytes)
                    out.flush()
                }
            }

            mainHandler.post {
                Toast.makeText(
                    context,
                    "تم حفظ الملف في التنزيلات (Downloads): $cleanName",
                    Toast.LENGTH_LONG
                ).show()
            }
        } catch (e: Exception) {
            mainHandler.post {
                Toast.makeText(
                    context,
                    "تعذر حفظ الملف: ${e.localizedMessage ?: "خطأ غير معروف"}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}

object LocalWebProxyServer {
    @Volatile
    private var serverSocket: ServerSocket? = null
    // Bounded thread pools prevent OutOfMemoryError (pthread_create failed) during rapid real-time polling
    private val acceptExecutor = Executors.newSingleThreadExecutor()
    private val clientExecutor = Executors.newFixedThreadPool(16)
    private val staticAssetCache = ConcurrentHashMap<String, Pair<ByteArray, String>>()

    fun clearStaticAssetCache() {
        staticAssetCache.clear()
    }

    @Synchronized
    fun ensureStarted(context: Context): Int {
        val existing = serverSocket
        if (existing != null && !existing.isClosed) {
            return existing.localPort
        }

        val appContext = context.applicationContext
        val socket = try {
            ServerSocket(38475, 50, InetAddress.getByName("127.0.0.1"))
        } catch (_: Exception) {
            ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        }
        serverSocket = socket

        acceptExecutor.execute {
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    clientExecutor.execute {
                        try {
                            handleClient(appContext, client)
                        } catch (_: Throwable) {
                            try {
                                client.close()
                            } catch (_: Throwable) {
                            }
                        }
                    }
                } catch (_: Throwable) {
                    if (socket.isClosed) break
                }
            }
        }

        return socket.localPort
    }

    fun hasBundledAssets(context: Context): Boolean {
        return try {
            context.assets.open("www/index.html").use { true }
        } catch (_: Exception) {
            false
        }
    }

    private fun readLineAscii(input: InputStream): String? {
        val buffer = ByteArrayOutputStream()
        var prev = -1
        while (true) {
            val b = input.read()
            if (b == -1) {
                return if (buffer.size() == 0) null else buffer.toString("UTF-8")
            }
            if (b == '\n'.code) {
                val bytes = buffer.toByteArray()
                val len = if (prev == '\r'.code && bytes.isNotEmpty()) bytes.size - 1 else bytes.size
                return String(bytes, 0, len, Charsets.UTF_8)
            }
            buffer.write(b)
            prev = b
        }
    }

    private fun handleClient(context: Context, socket: Socket) {
        socket.use { client ->
            client.soTimeout = 15000
            val input = BufferedInputStream(client.getInputStream())
            val output = client.getOutputStream()

            val requestLine = readLineAscii(input) ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0].uppercase(Locale.US)
            val fullTarget = parts[1]

            val headers = mutableMapOf<String, String>()
            while (true) {
                val line = readLineAscii(input) ?: break
                if (line.isEmpty()) break
                val colonIdx = line.indexOf(':')
                if (colonIdx > 0) {
                    val key = line.substring(0, colonIdx).trim()
                    val value = line.substring(colonIdx + 1).trim()
                    headers[key] = value
                }
            }

            val contentLength = headers.entries
                .firstOrNull { it.key.equals("Content-Length", ignoreCase = true) }
                ?.value?.toIntOrNull() ?: 0

            val bodyBytes = if (contentLength > 0) {
                val buf = ByteArray(contentLength)
                var readTotal = 0
                while (readTotal < contentLength) {
                    val r = input.read(buf, readTotal, contentLength - readTotal)
                    if (r <= 0) break
                    readTotal += r
                }
                if (readTotal == contentLength) buf else buf.copyOf(readTotal)
            } else {
                ByteArray(0)
            }

            if (method == "OPTIONS") {
                writeResponse(output, 200, "OK", "text/plain", ByteArray(0))
                return
            }

            if (isProxyPath(fullTarget)) {
                handleProxyRequest(output, method, fullTarget, headers, bodyBytes)
            } else {
                handleStaticAsset(context, output, fullTarget)
            }
        }
    }

    private fun isProxyPath(target: String): Boolean {
        return target.startsWith("/fapi/") ||
            target.startsWith("/testnet-fapi/") ||
            target.startsWith("/bapi/") ||
            target.startsWith("/kucoin/") ||
            target.startsWith("/kucoin-futures/")
    }

    private fun handleProxyRequest(
        output: OutputStream,
        method: String,
        fullTarget: String,
        headers: Map<String, String>,
        bodyBytes: ByteArray
    ) {
        val targetUrl = when {
            fullTarget.startsWith("/fapi/") ->
                "https://fapi.binance.com$fullTarget"
            fullTarget.startsWith("/testnet-fapi/") ->
                "https://testnet.binancefuture.com" + fullTarget.replaceFirst("/testnet-fapi", "/fapi")
            fullTarget.startsWith("/bapi/") ->
                "https://www.binance.com$fullTarget"
            fullTarget.startsWith("/kucoin/") ->
                "https://api.kucoin.com" + fullTarget.removePrefix("/kucoin")
            fullTarget.startsWith("/kucoin-futures/") ->
                "https://api-futures.kucoin.com" + fullTarget.removePrefix("/kucoin-futures")
            else -> return
        }

        var conn: HttpURLConnection? = null
        try {
            conn = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 10000
                readTimeout = 10000
                useCaches = false
                instanceFollowRedirects = true
                setRequestProperty("Cache-Control", "no-cache, no-store")
                setRequestProperty("Pragma", "no-cache")
                setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )
                if (fullTarget.startsWith("/bapi/")) {
                    setRequestProperty("Referer", "https://www.binance.com/en/copy-trading")
                    setRequestProperty("Origin", "https://www.binance.com")
                }

                val forwardedHeaders = listOf(
                    "Content-Type",
                    "Accept",
                    "X-MBX-APIKEY",
                    "KC-API-KEY",
                    "KC-API-SIGN",
                    "KC-API-TIMESTAMP",
                    "KC-API-PASSPHRASE",
                    "KC-API-KEY-VERSION",
                    "clientType"
                )
                for (hName in forwardedHeaders) {
                    val match = headers.entries.firstOrNull { it.key.equals(hName, ignoreCase = true) }
                    if (match != null) {
                        setRequestProperty(hName, match.value)
                    }
                }

                if (bodyBytes.isNotEmpty() && (method == "POST" || method == "PUT")) {
                    doOutput = true
                    outputStream.use { os ->
                        os.write(bodyBytes)
                        os.flush()
                    }
                }
            }

            val code = conn.responseCode
            val contentType = conn.contentType ?: "application/json; charset=utf-8"
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val respBytes = stream?.use { it.readBytes() } ?: ByteArray(0)
            writeResponse(output, code, "OK", contentType, respBytes)
        } catch (e: Throwable) {
            val errJson = """{"error":"${(e.localizedMessage ?: "Proxy error").replace("\"", "'")}"}"""
            try {
                writeResponse(
                    output,
                    502,
                    "Bad Gateway",
                    "application/json; charset=utf-8",
                    errJson.toByteArray(Charsets.UTF_8)
                )
            } catch (_: Throwable) {
            }
        } finally {
            conn?.disconnect()
        }
    }

    private fun handleStaticAsset(context: Context, output: OutputStream, fullTarget: String) {
        val rawPath = fullTarget.substringBefore("?").substringBefore("#").trimStart('/')
        val assetRelPath = if (rawPath.isEmpty()) "index.html" else rawPath

        val bytesAndMime = tryOpenAsset(context, "www/$assetRelPath")
            ?: tryOpenAsset(context, "www/index.html")

        if (bytesAndMime != null) {
            writeResponse(output, 200, "OK", bytesAndMime.second, bytesAndMime.first)
        } else {
            val notFound = "Not Found".toByteArray(Charsets.UTF_8)
            writeResponse(output, 404, "Not Found", "text/plain; charset=utf-8", notFound)
        }
    }

    private fun tryOpenAsset(context: Context, path: String): Pair<ByteArray, String>? {
        staticAssetCache[path]?.let { return it }
        return try {
            val bytes = context.assets.open(path).use { it.readBytes() }
            val pair = bytes to guessMimeType(path)
            if (bytes.size <= 2 * 1024 * 1024) {
                staticAssetCache[path] = pair
            }
            pair
        } catch (_: Throwable) {
            null
        }
    }

    private fun guessMimeType(path: String): String {
        val lower = path.lowercase(Locale.US)
        return when {
            lower.endsWith(".html") -> "text/html; charset=utf-8"
            lower.endsWith(".js") || lower.endsWith(".mjs") -> "application/javascript; charset=utf-8"
            lower.endsWith(".css") -> "text/css; charset=utf-8"
            lower.endsWith(".json") || lower.endsWith(".webmanifest") -> "application/json; charset=utf-8"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".ico") -> "image/x-icon"
            lower.endsWith(".woff2") -> "font/woff2"
            lower.endsWith(".woff") -> "font/woff"
            else -> "application/octet-stream"
        }
    }

    private fun writeResponse(
        output: OutputStream,
        statusCode: Int,
        statusText: String,
        contentType: String,
        body: ByteArray
    ) {
        val headerBuilder = StringBuilder()
        headerBuilder.append("HTTP/1.1 $statusCode $statusText\r\n")
        headerBuilder.append("Content-Type: $contentType\r\n")
        headerBuilder.append("Content-Length: ${body.size}\r\n")
        headerBuilder.append("Access-Control-Allow-Origin: *\r\n")
        headerBuilder.append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n")
        headerBuilder.append("Access-Control-Allow-Headers: *\r\n")
        headerBuilder.append("Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n")
        headerBuilder.append("Pragma: no-cache\r\n")
        headerBuilder.append("Connection: close\r\n\r\n")
        output.write(headerBuilder.toString().toByteArray(Charsets.UTF_8))
        if (body.isNotEmpty()) {
            output.write(body)
        }
        output.flush()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WhaleApp(activity: Activity) {
    val context = LocalContext.current
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
    var webViewRecoveryKey by remember { mutableStateOf(0) }
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }

    val startUrl = remember(context) {
        if (LocalWebProxyServer.hasBundledAssets(context)) {
            val port = LocalWebProxyServer.ensureStarted(context)
            "http://127.0.0.1:$port/index.html"
        } else {
            "https://ais-pre-ahokpnh2dw5lc4zjnbhmkv-37129485862.europe-west1.run.app"
        }
    }

    BackHandler(enabled = true) {
        val wv = webViewInstance
        if (wv != null) {
            // Ask React SPA first to close open modals, trader/whale details, or navigate back to Dashboard
            // and require double-press confirmation before minimizing
            wv.evaluateJavascript(
                "(function(){ try { return window.__copyTrHandleBackPress ? Boolean(window.__copyTrHandleBackPress()) : false; } catch(e){ return false; } })()"
            ) { result ->
                if (result == "true") {
                    return@evaluateJavascript
                }
                if (wv.canGoBack()) {
                    wv.goBack()
                } else {
                    // Never kill the task on Back press; move gracefully to background
                    activity.moveTaskToBack(true)
                }
            }
        } else {
            activity.moveTaskToBack(true)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            if (!AppPreferencesHelper.isKeepAliveEnabled(context)) {
                WebViewHolder.activeWebView = null
                webViewInstance?.destroy()
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink)
            .windowInsetsPadding(WindowInsets.safeDrawing)
    ) {
        androidx.compose.runtime.key(webViewRecoveryKey) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val existing = WebViewHolder.activeWebView
                    if (existing != null) {
                        (existing.parent as? ViewGroup)?.removeView(existing)
                        existing.resumeTimers()
                        existing.onResume()
                        isLoading = false
                        webViewInstance = existing
                        existing
                    } else {
                        KeepAliveWebView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            setBackgroundColor(0xFF0B0E11.toInt())
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.databaseEnabled = true
                            settings.allowFileAccess = true
                            settings.useWideViewPort = true
                            settings.loadWithOverviewMode = true
                            settings.setSupportZoom(false)
                            settings.mediaPlaybackRequiresUserGesture = false
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                            settings.cacheMode = WebSettings.LOAD_DEFAULT

                            addJavascriptInterface(AndroidFileDownloader(ctx), "AndroidDownloader")
                            addJavascriptInterface(AndroidAppControl(activity), "AndroidAppControl")

                            CookieManager.getInstance().setAcceptCookie(true)
                            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                            webChromeClient = object : WebChromeClient() {
                                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                    if (newProgress >= 90) {
                                        isLoading = false
                                    }
                                }
                            }

                            webViewClient = object : WebViewClient() {
                                override fun onPageFinished(view: WebView?, url: String?) {
                                    isLoading = false
                                    hasError = false
                                }

                                @Deprecated("Deprecated in Java")
                                override fun onReceivedError(
                                    view: WebView?,
                                    errorCode: Int,
                                    description: String?,
                                    failingUrl: String?
                                ) {
                                    if (failingUrl == startUrl) {
                                        isLoading = false
                                        hasError = true
                                    }
                                }

                                override fun onRenderProcessGone(
                                    view: WebView?,
                                    detail: RenderProcessGoneDetail?
                                ): Boolean {
                                    // Return true so Android NEVER kills the app if Chromium WebView renderer restarts;
                                    // instead, smoothly recreate the WebView in-place.
                                    try {
                                        (view?.parent as? ViewGroup)?.removeView(view)
                                        view?.destroy()
                                    } catch (_: Throwable) {
                                    }
                                    WebViewHolder.activeWebView = null
                                    webViewInstance = null
                                    webViewRecoveryKey += 1
                                    return true
                                }
                            }

                            setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
                                if (url.startsWith("blob:") || url.startsWith("data:")) {
                                    return@setDownloadListener
                                }
                                try {
                                    val request = DownloadManager.Request(Uri.parse(url)).apply {
                                        setMimeType(mimetype)
                                        val cookies = CookieManager.getInstance().getCookie(url)
                                        if (!cookies.isNullOrEmpty()) {
                                            addRequestHeader("cookie", cookies)
                                        }
                                        addRequestHeader("User-Agent", userAgent)
                                        setDescription("جاري تنزيل الملف...")
                                        val fileName = URLUtil.guessFileName(url, contentDisposition, mimetype)
                                        setTitle(fileName)
                                        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                                    }
                                    val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                                    dm.enqueue(request)
                                    Toast.makeText(ctx, "بدأ تنزيل الملف...", Toast.LENGTH_SHORT).show()
                                } catch (_: Exception) {
                                    try {
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                        ctx.startActivity(intent)
                                    } catch (_: Exception) {
                                    }
                                }
                            }

                            loadUrl(startUrl)
                            WebViewHolder.activeWebView = this
                            webViewInstance = this
                        }
                    }
                }
            )
        }

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Ink),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Gold)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "جاري تشغيل Copy TR...",
                        color = Muted,
                        fontSize = 12.sp
                    )
                }
            }
        }

        if (hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Ink)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "تعذر تحميل الواجهة. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.",
                        color = RedAlert,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            hasError = false
                            isLoading = true
                            webViewInstance?.loadUrl(startUrl)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Gold)
                    ) {
                        Text("إعادة المحاولة", color = Ink, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
