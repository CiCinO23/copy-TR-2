package ai.whalecopy.pro

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
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
import java.util.concurrent.Executors

private val Ink = Color(0xFF0B0E11)
private val Gold = Color(0xFF01BC8D)
private val RedAlert = Color(0xFFF6465D)
private val Muted = Color(0xFF8A99AD)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                WhaleApp()
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
    private val executor = Executors.newCachedThreadPool()

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

        executor.execute {
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    executor.execute {
                        handleClient(appContext, client)
                    }
                } catch (_: Exception) {
                    break
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
                connectTimeout = 12000
                readTimeout = 12000
                instanceFollowRedirects = true
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
        } catch (e: Exception) {
            val errJson = """{"error":"${(e.localizedMessage ?: "Proxy error").replace("\"", "'")}"}"""
            writeResponse(
                output,
                502,
                "Bad Gateway",
                "application/json; charset=utf-8",
                errJson.toByteArray(Charsets.UTF_8)
            )
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
        return try {
            val bytes = context.assets.open(path).use { it.readBytes() }
            bytes to guessMimeType(path)
        } catch (_: Exception) {
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
        headerBuilder.append("Cache-Control: no-cache\r\n")
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
fun WhaleApp() {
    val context = LocalContext.current
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }
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

    BackHandler(enabled = webViewInstance?.canGoBack() == true) {
        webViewInstance?.goBack()
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewInstance?.destroy()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink)
            .windowInsetsPadding(WindowInsets.safeDrawing)
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
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
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    settings.cacheMode = WebSettings.LOAD_DEFAULT

                    addJavascriptInterface(AndroidFileDownloader(ctx), "AndroidDownloader")

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
                    webViewInstance = this
                }
            }
        )

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
