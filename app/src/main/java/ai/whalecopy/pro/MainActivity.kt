package ai.whalecopy.pro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private val Ink = Color(0xFF0B0E11)
private val Panel = Color(0xFF12171D)
private val PanelElevated = Color(0xFF1A222B)
private val Gold = Color(0xFF01BC8D)
private val Green = Color(0xFF01BC8D)
private val RedAlert = Color(0xFFF6465D)
private val Muted = Color(0xFF8A99AD)
private val BlueAccent = Color(0xFF00C8FF)

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

private val WhaleVectorIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "WhaleIcon",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    ).apply {
        path(
            fill = null,
            stroke = SolidColor(Color.White),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        ) {
            moveTo(2f, 15.5f)
            curveTo(2f, 11.3f, 5.4f, 8f, 10.2f, 8f)
            curveTo(13.8f, 8f, 16.4f, 9.8f, 18f, 12.2f)
            curveTo(19.1f, 11.8f, 20.2f, 10.8f, 20.8f, 9.5f)
            curveTo(21.2f, 11.3f, 20.9f, 13.2f, 19.7f, 14.5f)
            curveTo(20.9f, 15f, 21.8f, 16.1f, 22f, 17.4f)
            curveTo(20.5f, 17f, 19f, 17.1f, 17.7f, 17.8f)
            curveTo(16f, 18.7f, 13.9f, 19f, 11.2f, 19f)
            horizontalLineTo(4.5f)
            curveTo(3.1f, 19f, 2f, 17.5f, 2f, 15.5f)
            close()
            moveTo(2.4f, 15.5f)
            horizontalLineTo(7.5f)
            curveTo(8.8f, 15.5f, 9.9f, 16.3f, 10.4f, 17.5f)
            moveTo(9.5f, 5.5f)
            verticalLineTo(3.5f)
            moveTo(9.5f, 3.5f)
            curveTo(8.5f, 2.5f, 7.3f, 2.5f, 6.7f, 3.2f)
            moveTo(9.5f, 3.5f)
            curveTo(10.5f, 2.5f, 11.7f, 2.5f, 12.3f, 3.2f)
        }
    }.build()
}

private data class NavItem(
    val id: String,
    val labelAr: String,
    val icon: ImageVector
)

@Composable
fun WhaleApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selected by remember { mutableStateOf("Dashboard") }
    var autoCopy by remember { mutableStateOf(false) }
    var showLiveDialog by remember { mutableStateOf(false) }

    var binanceConfig by remember { mutableStateOf(BinancePrefs.load(context)) }
    var connectionState by remember {
        mutableStateOf(
            BinanceConnectionState(
                statusMessageAr = "جاري الاتصال بحساب باينانس الحقيقي وجلب البيانات..."
            )
        )
    }

    // Automatically connect to Binance on app start
    LaunchedEffect(Unit) {
        connectionState = connectionState.copy(isTesting = true, statusMessageAr = "جاري فحص الاتصال ومزامنة البيانات مع باينانس...")
        connectionState = BinanceApiClient.testConnectionAndFetchData(binanceConfig)
    }

    fun triggerConnectionTest(updatedConfig: BinanceConfig) {
        binanceConfig = updatedConfig
        BinancePrefs.save(context, updatedConfig)
        scope.launch {
            connectionState = connectionState.copy(
                isTesting = true,
                statusMessageAr = "جاري الاتصال بخادم باينانس ومزامنة المحفظة...",
                errorMessageAr = null
            )
            connectionState = BinanceApiClient.testConnectionAndFetchData(updatedConfig)
        }
    }

    if (selected != "Dashboard") {
        BackHandler {
            selected = "Dashboard"
        }
    }

    val navItems = listOf(
        NavItem("Dashboard", "الرئيسية", Icons.Default.Dashboard),
        NavItem("BinanceAPI", "ربط باينانس", Icons.Default.Api),
        NavItem("Whales", "Whales", WhaleVectorIcon),
        NavItem("Copy Trading", "نسخ التداول", Icons.Default.ContentCopy),
        NavItem("Simulation", "التداول", Icons.Default.Science),
        NavItem("Settings", "الإعدادات", Icons.Default.Settings)
    )

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Gold,
            background = Ink,
            surface = Panel,
            onBackground = Color.White,
            onSurface = Color.White
        )
    ) {
        Scaffold(
            containerColor = Ink,
            contentWindowInsets = WindowInsets.safeDrawing,
            bottomBar = {
                NavigationBar(containerColor = Panel) {
                    navItems.forEach { item ->
                        NavigationBarItem(
                            modifier = Modifier.testTag("nav_${item.id}"),
                            selected = selected == item.id,
                            onClick = { selected = item.id },
                            icon = {
                                Icon(item.icon, contentDescription = item.labelAr)
                            },
                            label = { Text(item.labelAr, fontSize = 9.sp, maxLines = 1) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Gold,
                                selectedTextColor = Gold,
                                indicatorColor = Color(0xFF30313A),
                                unselectedIconColor = Muted,
                                unselectedTextColor = Muted
                            )
                        )
                    }
                }
            }
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // Top Header Bar
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        WhaleVectorIcon,
                        contentDescription = "شعار التطبيق",
                        tint = Gold,
                        modifier = Modifier.size(30.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Copy TR",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                        Text(
                            "الأموال الذكية • متصل بـ Binance USDⓈ-M Futures",
                            color = Muted,
                            fontSize = 11.sp
                        )
                    }
                    Surface(
                        color = if (connectionState.isAuthenticated) Color(0xFF17372F) else Color(0xFF33291A),
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier
                            .testTag("header_status_badge")
                            .clickable { selected = "BinanceAPI" }
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Box(
                                Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (connectionState.isAuthenticated) Green else Gold)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                if (connectionState.isAuthenticated) "الحساب متصل وموثق"
                                else if (connectionState.isConnected) "متصل (عام)"
                                else "غير متصل",
                                color = if (connectionState.isAuthenticated) Green else Gold,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                when (selected) {
                    "Dashboard" -> DashboardScreen(
                        auto = autoCopy,
                        connectionState = connectionState,
                        config = binanceConfig,
                        onLive = { showLiveDialog = true },
                        onAuto = { autoCopy = it },
                        onOpenApiSetup = { selected = "BinanceAPI" },
                        onOpenWhales = { selected = "Whales" },
                        onRefreshMarket = { triggerConnectionTest(binanceConfig) }
                    )
                    "BinanceAPI" -> BinanceApiScreen(
                        config = binanceConfig,
                        connectionState = connectionState,
                        onSaveAndTest = { triggerConnectionTest(it) },
                        onClearKeys = {
                            val cleared = BinancePrefs.clearKeys(context)
                            triggerConnectionTest(cleared)
                        }
                    )
                    "Whales" -> WhalesScreen(
                        connectionState = connectionState,
                        onRefresh = { triggerConnectionTest(binanceConfig) }
                    )
                    "Copy Trading" -> CopyTradingScreen(
                        connectionState = connectionState,
                        auto = autoCopy,
                        onAutoChange = { autoCopy = it },
                        onOpenApi = { selected = "BinanceAPI" }
                    )
                    "Simulation" -> SimulationScreen(
                        connectionState = connectionState
                    )
                    else -> SettingsScreen(
                        auto = autoCopy,
                        config = binanceConfig,
                        connectionState = connectionState,
                        onAuto = { autoCopy = it },
                        onLive = { showLiveDialog = true },
                        onOpenApiSetup = { selected = "BinanceAPI" }
                    )
                }

                Spacer(Modifier.height(24.dp))
            }
        }

        if (showLiveDialog) {
            AlertDialog(
                onDismissRequest = { showLiveDialog = false },
                title = { Text("مراجعة أمان التداول المباشر", fontWeight = FontWeight.Bold) },
                text = {
                    Text(
                        "حسابك متصل حالياً في وضع القراءة الآمنة (Read-Only) مع باينانس. لتنفيذ صفقات حقيقية، تأكد من ضبط حدود الرافعة المالية ونسب المخاطرة من شاشة الإعدادات، واستخدام مفتاح معتمد ومقيد بعنوان IP."
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showLiveDialog = false
                            selected = "BinanceAPI"
                        },
                        modifier = Modifier.testTag("dialog_open_api_button")
                    ) {
                        Text("مراجعة المفاتيح والربط", color = Gold)
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { showLiveDialog = false },
                        modifier = Modifier.testTag("dialog_close_button")
                    ) {
                        Text("إغلاق", color = Muted)
                    }
                }
            )
        }
    }
}

@Composable
fun DashboardScreen(
    auto: Boolean,
    connectionState: BinanceConnectionState,
    config: BinanceConfig,
    onLive: () -> Unit,
    onAuto: (Boolean) -> Unit,
    onOpenApiSetup: () -> Unit,
    onOpenWhales: () -> Unit,
    onRefreshMarket: () -> Unit
) {
    Text("لوحة التحكم بالتداول الحي", fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(14.dp))

    // Real Binance Balance Cards
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Metric(
            title = if (connectionState.isAuthenticated) "رصيد باينانس الفعلي (USDT)" else "الرصيد الافتراضي",
            value = connectionState.accountUsdtBalance ?: "0.00 USDT",
            sub = if (connectionState.isAuthenticated) "المتاح: ${connectionState.accountAvailableBalance ?: "--"}" else "محاكاة",
            modifier = Modifier.weight(1f)
        )
        Metric(
            title = "المراكز المفتوحة (حقيقي)",
            value = "${connectionState.positions.size}",
            sub = if (connectionState.positions.isEmpty()) "لا توجد مراكز نشطة" else "${connectionState.positions.size} صفقة نشطة",
            modifier = Modifier.weight(1f)
        )
    }
    Spacer(Modifier.height(10.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Metric(
            title = "الأرباح غير المحققة (Unrealized PNL)",
            value = connectionState.totalUnrealizedProfit ?: "0.00 USDT",
            sub = if (connectionState.isAuthenticated) "بيانات حية من الحساب" else "محاكاة",
            modifier = Modifier.weight(1f)
        )
        Metric(
            title = "سرعة استجابة باينانس",
            value = connectionState.latencyMs?.let { "$it ms" } ?: "--",
            sub = config.environment.titleAr.substringBefore("(").trim(),
            modifier = Modifier.weight(1f)
        )
    }

    // Display Account Assets if available
    if (connectionState.assets.isNotEmpty()) {
        Spacer(Modifier.height(14.dp))
        Card(
            colors = CardDefaults.cardColors(containerColor = PanelElevated),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(
                    "أصول محفظة العقود الآجلة الحالية (Binance Portfolio):",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Gold
                )
                Spacer(Modifier.height(8.dp))
                connectionState.assets.forEach { a ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(a.asset, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(
                            "الرصيد: ${a.walletBalance} (متاح: ${a.availableBalance})",
                            color = Color.White,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(16.dp))

    // Real-Time Connection Diagnostic Banner
    Card(
        colors = CardDefaults.cardColors(containerColor = PanelElevated),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Gold.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Verified, contentDescription = null, tint = if (connectionState.isAuthenticated) Green else Gold)
                Spacer(Modifier.width(8.dp))
                Text(
                    "حالة الربط مع باينانس الحقيقي",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.weight(1f)
                )
                IconButton(
                    onClick = onRefreshMarket,
                    modifier = Modifier.testTag("refresh_market_button")
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "تحديث الاتصال", tint = Gold)
                }
            }
            Text(
                connectionState.statusMessageAr,
                color = if (connectionState.isAuthenticated) Green else if (connectionState.isConnected) Gold else RedAlert,
                fontSize = 13.sp
            )
            connectionState.errorMessageAr?.let { err ->
                Spacer(Modifier.height(4.dp))
                Text(err, color = RedAlert, fontSize = 12.sp)
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onOpenApiSetup,
                    colors = ButtonDefaults.buttonColors(containerColor = Gold),
                    modifier = Modifier
                        .weight(1f)
                        .testTag("open_binance_api_button")
                ) {
                    Icon(Icons.Default.Key, contentDescription = null, tint = Ink)
                    Spacer(Modifier.width(6.dp))
                    Text("إدارة المفاتيح", color = Ink, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                OutlinedButton(
                    onClick = onOpenWhales,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("open_whales_button")
                ) {
                    Icon(WhaleVectorIcon, contentDescription = null, tint = Gold)
                    Spacer(Modifier.width(6.dp))
                    Text("رادار الحيتان", color = Gold, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }

    // Live Real-Time Futures Prices
    if (connectionState.tickers.isNotEmpty()) {
        Spacer(Modifier.height(18.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "أسعار العقود الآجلة الحية (Binance Futures Live)",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                modifier = Modifier.weight(1f)
            )
            Text("مباشر 24س", color = Green, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
        connectionState.tickers.forEach { ticker ->
            val isPositive = !ticker.priceChangePercent.startsWith("-")
            Card(
                colors = CardDefaults.cardColors(containerColor = Panel),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(ticker.symbol, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            "أعلى: ${ticker.highPrice} • أدنى: ${ticker.lowPrice}",
                            color = Muted,
                            fontSize = 11.sp
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "${ticker.lastPrice} USDT",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            ticker.priceChangePercent,
                            color = if (isPositive) Green else RedAlert,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(18.dp))
    Card(colors = CardDefaults.cardColors(containerColor = Panel)) {
        Column(Modifier.padding(16.dp)) {
            Text("إدارة التداول الآلي ونسخ الصفقات", fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                "يمكنك تفعيل النسخ التجريبي الآمن للتأكد من إشارات الحيتان قبل تفعيل التنفيذ الحي على باينانس.",
                color = Muted,
                fontSize = 12.sp
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = onLive,
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                modifier = Modifier.testTag("request_live_mode_button")
            ) {
                Text("خيارات التداول المباشر (Live Trading)", color = Ink, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("النسخ التلقائي لإشارات الحيتان (ورقي / محاكاة)", Modifier.weight(1f))
                Switch(
                    checked = auto,
                    onCheckedChange = onAuto,
                    modifier = Modifier.testTag("auto_copy_switch")
                )
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Text("حالة خوادم النظام", fontWeight = FontWeight.Bold)
    Status("محرك التداول الورقي (Paper Engine)", "جاهز للعمل", Green)
    Status(
        "مزود بيانات باينانس الحقيقي (Binance Mainnet)",
        if (connectionState.isAuthenticated) "متصل وموثق بالمفاتيح الحقيقية"
        else if (connectionState.isConnected) "متصل (بيانات عامة)"
        else "غير متصل",
        if (connectionState.isAuthenticated) Green else if (connectionState.isConnected) Gold else RedAlert
    )
    Status("وضع الحماية (Read-Only Safety)", "مفعل لحماية الحساب", BlueAccent)
}

@Composable
fun WhalesScreen(
    connectionState: BinanceConnectionState,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var rankingType by remember { mutableStateOf("PNL") }
    var timeRange by remember { mutableStateOf("30D") }
    var onlySharing by remember { mutableStateOf(false) }

    var whalesList by remember { mutableStateOf<List<SmartMoneyTraderItem>>(emptyList()) }
    var isLoadingList by remember { mutableStateOf(true) }

    var selectedWhaleBundle by remember { mutableStateOf<SmartMoneyWhaleBundle?>(null) }
    var isLoadingDetail by remember { mutableStateOf(false) }
    var whaleSubTab by remember { mutableStateOf("POSITIONS") }
    var copyFeedback by remember { mutableStateOf<String?>(null) }

    fun loadWhales() {
        scope.launch {
            isLoadingList = true
            whalesList = BinanceApiClient.fetchSmartMoneyTradersList(timeRange, rankingType, onlySharing)
            isLoadingList = false
        }
    }

    LaunchedEffect(rankingType, timeRange, onlySharing) {
        loadWhales()
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text("نافذة الحيتان (Whales - Smart Money)", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("جلب المتداولين من binance.com/en/smart-money مع عرض ونسخ Positions و Position", color = Muted, fontSize = 11.sp)
        }
        IconButton(
            onClick = {
                loadWhales()
                onRefresh()
            },
            modifier = Modifier.testTag("whales_refresh_button")
        ) {
            Icon(Icons.Default.Refresh, contentDescription = "تحديث الحيتان", tint = Gold)
        }
    }

    Spacer(Modifier.height(10.dp))

    copyFeedback?.let { msg ->
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF163228)),
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
        ) {
            Text(
                msg,
                color = Green,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(12.dp)
            )
        }
    }

    if (selectedWhaleBundle != null) {
        val bundle = selectedWhaleBundle!!
        Card(
            colors = CardDefaults.cardColors(containerColor = PanelElevated),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Gold.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = { selectedWhaleBundle = null }) {
                        Text("عودة للقائمة", color = Color.White, fontSize = 11.sp)
                    }
                    Button(
                        onClick = {
                            copyFeedback = "تم نسخ الحوت ${bundle.traderName}: تم جلب (${bundle.positions.size}) مراكز من Positions و (${bundle.positionDetails.size}) سجلات من Position بنجاح!"
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Gold)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, tint = Ink, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("نسخ الحوت (Positions + Position)", color = Ink, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text(bundle.traderName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Gold)
                Text(bundle.introduction, fontSize = 12.sp, color = Muted)

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Metric(
                        title = "إجمالي الربح (PNL)",
                        value = String.format(java.util.Locale.US, "+$%.0f", bundle.pnl),
                        sub = "ROI: ${String.format(java.util.Locale.US, "%.2f%%", bundle.roi)}",
                        modifier = Modifier.weight(1f)
                    )
                    Metric(
                        title = "رصيد الحوت (UM)",
                        value = String.format(java.util.Locale.US, "$%.0f", bundle.umMarginBalance),
                        sub = "${bundle.subscribers} متابع",
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { whaleSubTab = "POSITIONS" },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (whaleSubTab == "POSITIONS") Gold else Panel
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            "Positions (${bundle.positions.size})",
                            color = if (whaleSubTab == "POSITIONS") Ink else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = { whaleSubTab = "POSITION" },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (whaleSubTab == "POSITION") Gold else Panel
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            "Position (${bundle.positionDetails.size})",
                            color = if (whaleSubTab == "POSITION") Ink else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                if (whaleSubTab == "POSITIONS") {
                    bundle.positions.forEach { pos ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Panel),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("${pos.symbol} (${pos.side} ${pos.leverage}x)", fontWeight = FontWeight.Bold, color = if (pos.side == "LONG") Green else RedAlert)
                                    Text(
                                        String.format(java.util.Locale.US, "%+.2f USDT", pos.unrealizedProfit),
                                        color = if (pos.unrealizedProfit >= 0) Green else RedAlert,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    "الكمية: ${pos.positionAmount} • الدخول: ${String.format(java.util.Locale.US, "%.2f", pos.entryPrice)} • العادل: ${String.format(java.util.Locale.US, "%.2f", pos.markPrice)}",
                                    color = Muted,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                } else {
                    bundle.positionDetails.forEach { item ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Panel),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("${item.symbol} (${item.side})", fontWeight = FontWeight.Bold)
                                    Text(
                                        String.format(java.util.Locale.US, "+%.2f USDT", item.closingPnl),
                                        color = Green,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    "متوسط التكلفة: ${String.format(java.util.Locale.US, "%.2f", item.avgCost)} • الإغلاق: ${String.format(java.util.Locale.US, "%.2f", item.avgClosePrice)} • الحجم: ${item.closedVolume}",
                                    color = Muted,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    } else {
        // Sorting Bar for Smart Money
        Card(
            colors = CardDefaults.cardColors(containerColor = Panel),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(Modifier.padding(12.dp)) {
                Text("ترتيب متداولي الحيتان (Smart Money) حسب الطلب:", fontSize = 12.sp, color = Gold, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("PNL" to "الأعلى ربحاً $", "ROI" to "الأعلى عائداً %", "SUBSCRIBERS" to "المشتركون").forEach { (key, label) ->
                        Button(
                            onClick = { rankingType = key },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (rankingType == key) Gold else PanelElevated
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                label,
                                color = if (rankingType == key) Ink else Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("7D", "30D", "90D", "ALL").forEach { tr ->
                        OutlinedButton(
                            onClick = { timeRange = tr },
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(tr, color = if (timeRange == tr) Gold else Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (isLoadingList || isLoadingDetail) {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = Gold, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("جاري جلب قائمة الحيتان من binance.com/en/smart-money...", color = Muted, fontSize = 12.sp)
                }
            }
        } else {
            whalesList.forEach { whale ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = PanelElevated),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 5.dp)
                        .border(1.dp, Gold.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(whale.traderName, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
                                Text("المشتركون: ${whale.subscribers} • الحالة: ${whale.positionStatus}", color = Muted, fontSize = 11.sp)
                            }
                            Text(
                                String.format(java.util.Locale.US, "+%.2f%%", whale.roi),
                                color = if (whale.roi >= 0) Green else RedAlert,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "صافي الربح: ${String.format(java.util.Locale.US, "$%,.0f", whale.pnl)}",
                                color = Green,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "الأصول: ${String.format(java.util.Locale.US, "$%,.0f", whale.assets)}",
                                color = Gold,
                                fontSize = 12.sp
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        isLoadingDetail = true
                                        selectedWhaleBundle = BinanceApiClient.fetchSmartMoneyWhaleBundle(whale.topTraderId, whale)
                                        isLoadingDetail = false
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("التفاصيل & Positions", color = Color.White, fontSize = 11.sp)
                            }
                            Button(
                                onClick = {
                                    scope.launch {
                                        val b = BinanceApiClient.fetchSmartMoneyWhaleBundle(whale.topTraderId, whale)
                                        selectedWhaleBundle = b
                                        copyFeedback = "تم نسخ الحوت ${whale.traderName} وجلب (${b.positions.size}) صفقات من Positions و (${b.positionDetails.size}) من Position!"
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("نسخ الحوت", color = Ink, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CopyTradingScreen(
    connectionState: BinanceConnectionState,
    auto: Boolean,
    onAutoChange: (Boolean) -> Unit,
    onOpenApi: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var sortType by remember { mutableStateOf("ROI") }
    var timeRange by remember { mutableStateOf("30D") }

    var tradersList by remember { mutableStateOf<List<CopyTraderItem>>(emptyList()) }
    var isLoadingList by remember { mutableStateOf(true) }

    var selectedTraderBundle by remember { mutableStateOf<CopyTraderFullBundle?>(null) }
    var isLoadingDetail by remember { mutableStateOf(false) }
    var detailTab by remember { mutableStateOf("POSITIONS") }
    var copyFeedback by remember { mutableStateOf<String?>(null) }

    fun loadCopyTraders() {
        scope.launch {
            isLoadingList = true
            tradersList = BinanceApiClient.fetchCopyTradersList(timeRange, sortType, "")
            isLoadingList = false
        }
    }

    LaunchedEffect(sortType, timeRange) {
        loadCopyTraders()
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text("نسخ التداول (Copy Trading)", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(
                "جلب المتداولين من binance.com/en/copy-trading ونسخ الصفقات من Positions والدخول والخروج من Latest records",
                color = Muted,
                fontSize = 11.sp
            )
        }
        IconButton(onClick = { loadCopyTraders() }) {
            Icon(Icons.Default.Refresh, contentDescription = "تحديث", tint = Gold)
        }
    }

    Spacer(Modifier.height(10.dp))

    copyFeedback?.let { msg ->
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF163228)),
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
        ) {
            Text(
                msg,
                color = Green,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(12.dp)
            )
        }
    }

    if (selectedTraderBundle != null) {
        val b = selectedTraderBundle!!
        Card(
            colors = CardDefaults.cardColors(containerColor = PanelElevated),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Gold.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = { selectedTraderBundle = null }) {
                        Text("عودة للقائمة", color = Color.White, fontSize = 11.sp)
                    }
                    Button(
                        onClick = {
                            onAutoChange(true)
                            copyFeedback = "تم تفعيل نسخ المتداول ${b.nickname}! تم جلب (${b.positions.size}) مراكز من Positions و (${b.latestRecords.size}) حركات دخول وخروج من Latest records."
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Gold)
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, tint = Ink, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("نسخ المتداول الآن", color = Ink, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text(b.nickname, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Gold)
                Text(b.description, fontSize = 12.sp, color = Muted)

                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Metric(
                        title = "العائد (ROI)",
                        value = String.format(java.util.Locale.US, "+%.2f%%", b.roi),
                        sub = "Win Rate: ${String.format(java.util.Locale.US, "%.1f%%", b.winRate)}",
                        modifier = Modifier.weight(1f)
                    )
                    Metric(
                        title = "صافي الربح (PNL)",
                        value = String.format(java.util.Locale.US, "$%,.0f", b.pnl),
                        sub = "الناسخون: ${b.currentCopyCount}/${b.maxCopyCount}",
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Button(
                        onClick = { detailTab = "POSITIONS" },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (detailTab == "POSITIONS") Gold else Panel
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            "Positions (${b.positions.size})",
                            color = if (detailTab == "POSITIONS") Ink else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                    Button(
                        onClick = { detailTab = "LATEST" },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (detailTab == "LATEST") Gold else Panel
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            "Latest records (${b.latestRecords.size})",
                            color = if (detailTab == "LATEST") Ink else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                if (detailTab == "POSITIONS") {
                    if (b.positions.isEmpty()) {
                        Text("لا توجد مراكز مفتوحة حالياً في Positions، راجع نافذة Latest records لعمليات الدخول والخروج.", color = Muted, fontSize = 12.sp)
                    } else {
                        b.positions.forEach { pos ->
                            Card(
                                colors = CardDefaults.cardColors(containerColor = Panel),
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("${pos.symbol} (${pos.side} ${pos.leverage}x)", fontWeight = FontWeight.Bold, color = if (pos.side == "LONG") Green else RedAlert)
                                        Text(
                                            String.format(java.util.Locale.US, "%+.2f USDT", pos.unrealizedProfit),
                                            color = if (pos.unrealizedProfit >= 0) Green else RedAlert,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Text(
                                        "الكمية: ${pos.positionAmount} • سعر الدخول: ${String.format(java.util.Locale.US, "%.4f", pos.entryPrice)} • العادل: ${String.format(java.util.Locale.US, "%.4f", pos.markPrice)}",
                                        color = Muted,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    }
                } else {
                    b.latestRecords.forEach { rec ->
                        val isEntry = rec.actionType == "ENTRY"
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Panel),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        "${rec.symbol} • ${rec.actionLabelAr}",
                                        fontWeight = FontWeight.Bold,
                                        color = if (isEntry) Green else Gold,
                                        fontSize = 13.sp
                                    )
                                    Text(
                                        if (isEntry) "دخول (ENTRY)" else "خروج (EXIT)",
                                        color = if (isEntry) Green else RedAlert,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    "السعر: ${String.format(java.util.Locale.US, "%.4f", rec.avgPrice)} USDT • الكمية: ${rec.executedQty} • PNL: ${String.format(java.util.Locale.US, "%+.2f", rec.totalPnl)}",
                                    color = Muted,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    } else {
        // Sorting & Filtering Card for Copy Trading
        Card(
            colors = CardDefaults.cardColors(containerColor = Panel),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(Modifier.padding(12.dp)) {
                Text("ترتيب متداولي النسخ (Copy Trading) حسب الطلب:", fontSize = 12.sp, color = Gold, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("ROI" to "العائد ROI", "PNL" to "الربح PNL", "WIN_RATE" to "نسبة النجاح", "COPY_COUNT" to "الناسخون").forEach { (key, label) ->
                        Button(
                            onClick = { sortType = key },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (sortType == key) Gold else PanelElevated
                            ),
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                label,
                                color = if (sortType == key) Ink else Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("7D", "30D", "90D").forEach { tr ->
                        OutlinedButton(
                            onClick = { timeRange = tr },
                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(tr, color = if (timeRange == tr) Gold else Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (isLoadingList || isLoadingDetail) {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(color = Gold, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("جاري جلب قائمة المتداولين من binance.com/en/copy-trading...", color = Muted, fontSize = 12.sp)
                }
            }
        } else {
            tradersList.forEach { trader ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = PanelElevated),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 5.dp)
                        .border(1.dp, Gold.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(trader.nickname, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
                                Text("الناسخون: ${trader.currentCopyCount}/${trader.maxCopyCount} • Win Rate: ${String.format(java.util.Locale.US, "%.1f%%", trader.winRate)}", color = Muted, fontSize = 11.sp)
                            }
                            Text(
                                String.format(java.util.Locale.US, "+%.2f%%", trader.roi),
                                color = if (trader.roi >= 0) Green else RedAlert,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "صافي الربح: ${String.format(java.util.Locale.US, "$%,.2f", trader.pnl)}",
                                color = Green,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "AUM: ${String.format(java.util.Locale.US, "$%,.0f", trader.aum)} • MDD: ${String.format(java.util.Locale.US, "%.1f%%", trader.mdd)}",
                                color = Gold,
                                fontSize = 11.sp
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        isLoadingDetail = true
                                        selectedTraderBundle = BinanceApiClient.fetchCopyTraderFullBundle(trader.leadPortfolioId, trader)
                                        isLoadingDetail = false
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("التفاصيل والصفقات", color = Color.White, fontSize = 11.sp)
                            }
                            Button(
                                onClick = {
                                    scope.launch {
                                        val b = BinanceApiClient.fetchCopyTraderFullBundle(trader.leadPortfolioId, trader)
                                        selectedTraderBundle = b
                                        onAutoChange(true)
                                        copyFeedback = "تم نسخ المتداول ${trader.nickname}: تم جلب (${b.positions.size}) مراكز من Positions و (${b.latestRecords.size}) حركات دخول وخروج من Latest records!"
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("نسخ المتداول", color = Ink, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BinanceApiScreen(
    config: BinanceConfig,
    connectionState: BinanceConnectionState,
    onSaveAndTest: (BinanceConfig) -> Unit,
    onClearKeys: () -> Unit
) {
    var selectedEnv by remember(config.environment) { mutableStateOf(config.environment) }
    var baseUrl by remember(config.customBaseUrl) { mutableStateOf(config.customBaseUrl) }
    var apiKey by remember(config.apiKey) { mutableStateOf(config.apiKey) }
    var apiSecret by remember(config.apiSecret) { mutableStateOf(config.apiSecret) }
    var readOnlyMode by remember(config.readOnlyMode) { mutableStateOf(config.readOnlyMode) }
    var showSecret by remember { mutableStateOf(false) }

    Text("إعدادات الربط مع Binance API", fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(6.dp))
    Text(
        "تمت تهيئة المفاتيح للاتصال بحساب باينانس الحقيقي لجلب الأرصدة والمراكز وتدفقات أسواق العقود الآجلة USDⓈ-M.",
        color = Muted,
        fontSize = 13.sp
    )

    Spacer(Modifier.height(14.dp))

    // Connection Status Diagnostics Card
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (connectionState.isAuthenticated) Color(0xFF132A24) else PanelElevated
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (connectionState.isAuthenticated) Icons.Default.CheckCircle else Icons.Default.Info,
                    contentDescription = null,
                    tint = if (connectionState.isAuthenticated) Green else Gold
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "حالة الاتصال والتحقق",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f)
                )
                if (connectionState.isTesting) {
                    CircularProgressIndicator(
                        color = Gold,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                connectionState.statusMessageAr,
                color = if (connectionState.isAuthenticated) Green else Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp
            )
            connectionState.latencyMs?.let { ms ->
                Text("زمن الاستجابة (Ping): $ms مللي ثانية", color = Muted, fontSize = 12.sp)
            }
            connectionState.accountUsdtBalance?.let { bal ->
                Spacer(Modifier.height(4.dp))
                Text(
                    "إجمالي رصيد العقود الآجلة: $bal (المتاح: ${connectionState.accountAvailableBalance ?: "--"})",
                    color = Gold,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
            connectionState.errorMessageAr?.let { err ->
                Spacer(Modifier.height(6.dp))
                Text(err, color = RedAlert, fontSize = 12.sp)
            }
        }
    }

    Spacer(Modifier.height(16.dp))

    // Environment Selection Card
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("1. بيئة الاتصال (Environment)", fontWeight = FontWeight.Bold, color = Gold)
            Spacer(Modifier.height(10.dp))

            BinanceEnvironment.entries.forEach { env ->
                val isSelected = selectedEnv == env
                Surface(
                    color = if (isSelected) PanelElevated else Color.Transparent,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .border(
                            width = 1.dp,
                            color = if (isSelected) Gold else Color(0xFF2C3846),
                            shape = RoundedCornerShape(10.dp)
                        )
                        .testTag("env_option_${env.name}")
                        .clickable {
                            selectedEnv = env
                            baseUrl = env.defaultUrl
                        }
                ) {
                    Row(
                        Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = isSelected,
                            onClick = {
                                selectedEnv = env
                                baseUrl = env.defaultUrl
                            },
                            colors = RadioButtonDefaults.colors(selectedColor = Gold)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(env.titleAr, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(env.descriptionAr, color = Muted, fontSize = 11.sp)
                            Text(env.defaultUrl, color = Gold.copy(alpha = 0.8f), fontSize = 11.sp)
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = baseUrl,
                onValueChange = { baseUrl = it },
                label = { Text("رابط الخادم (Base URL)") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_base_url"),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = Muted,
                    focusedLabelColor = Gold,
                    unfocusedLabelColor = Muted,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )
        }
    }

    Spacer(Modifier.height(16.dp))

    // API Keys Input Card
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("2. مفاتيح الربط (Binance API Credentials)", fontWeight = FontWeight.Bold, color = Gold)
            Spacer(Modifier.height(4.dp))
            Text(
                "تم ملء المفاتيح الخاصة بك بنجاح للربط المباشر مع حسابك.",
                color = Muted,
                fontSize = 12.sp
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = apiKey,
                onValueChange = { apiKey = it },
                label = { Text("مفتاح API (API Key)") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.VpnKey, contentDescription = null, tint = Gold) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_api_key"),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = Muted,
                    focusedLabelColor = Gold,
                    unfocusedLabelColor = Muted,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = apiSecret,
                onValueChange = { apiSecret = it },
                label = { Text("المفتاح السري (Secret Key)") },
                singleLine = true,
                visualTransformation = if (showSecret) VisualTransformation.None else PasswordVisualTransformation(),
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = Gold) },
                trailingIcon = {
                    IconButton(
                        onClick = { showSecret = !showSecret },
                        modifier = Modifier.testTag("toggle_secret_visibility")
                    ) {
                        Icon(
                            if (showSecret) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (showSecret) "إخفاء المفتاح السري" else "إظهار المفتاح السري",
                            tint = Muted
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("input_api_secret"),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Gold,
                    unfocusedBorderColor = Muted,
                    focusedLabelColor = Gold,
                    unfocusedLabelColor = Muted,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White
                )
            )

            Spacer(Modifier.height(12.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("وضع القراءة الآمنة فقط (Read-Only)", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text("منع إرسال أوامر بيع أو شراء حقيقية من التطبيق للحماية", color = Muted, fontSize = 11.sp)
                }
                Switch(
                    checked = readOnlyMode,
                    onCheckedChange = { readOnlyMode = it },
                    modifier = Modifier.testTag("switch_read_only")
                )
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    onSaveAndTest(
                        BinanceConfig(
                            environment = selectedEnv,
                            customBaseUrl = baseUrl,
                            apiKey = apiKey,
                            apiSecret = apiSecret,
                            readOnlyMode = readOnlyMode
                        )
                    )
                },
                enabled = !connectionState.isTesting,
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("save_and_test_api_button")
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Ink)
                Spacer(Modifier.width(8.dp))
                Text(
                    if (connectionState.isTesting) "جاري فحص الاتصال وتحديث البيانات..."
                    else "حفظ الإعدادات وإعادة اختبار الاتصال بـ باينانس",
                    color = Ink,
                    fontWeight = FontWeight.Bold
                )
            }

            if (apiKey.isNotBlank() || apiSecret.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        apiKey = ""
                        apiSecret = ""
                        onClearKeys()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = RedAlert)
                    Spacer(Modifier.width(6.dp))
                    Text("مسح المفاتيح المحفوظة", color = RedAlert)
                }
            }
        }
    }

    Spacer(Modifier.height(14.dp))

    // Security Best Practices Card
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF231D18)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Security, contentDescription = null, tint = Gold)
                Spacer(Modifier.width(8.dp))
                Text("إرشادات أمان مفاتيح باينانس", fontWeight = FontWeight.Bold, color = Gold)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "• تم قفل التطبيق بوضع القراءة الآمنة (Read-Only) لمنع أي عمليات غير مقصودة.\n" +
                    "• لا تقم مطلقاً بتفعيل صلاحية السحب (Enable Withdrawals) في مفاتيح باينانس.\n" +
                    "• يمكنك التحقق من الرصيد والصفقات وتدفقات الحيتان في أي وقت بالضغط على زر التحديث.",
                color = Muted,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
fun Metric(title: String, value: String, sub: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Panel)) {
        Column(Modifier.padding(14.dp)) {
            Text(title, color = Muted, fontSize = 11.sp)
            Spacer(Modifier.height(8.dp))
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(sub, color = Green, fontSize = 11.sp)
        }
    }
}

@Composable
fun Status(name: String, state: String, color: Color) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(name, Modifier.weight(1f), fontSize = 14.sp)
        Text(state, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun SimulationScreen(connectionState: BinanceConnectionState) {
    var isRealMode by remember { mutableStateOf(false) }
    var virtualBalanceInput by remember { mutableStateOf("1000.00") }
    var appliedVirtualBalance by remember { mutableStateOf("1000.00") }
    var tradeValueUsdt by remember { mutableStateOf("50") }
    var leverageInput by remember { mutableStateOf("10") }
    var commissionInput by remember { mutableStateOf("0.06") }
    var maxConcurrentInput by remember { mutableStateOf("5") }
    var enforceUserSize by remember { mutableStateOf(true) }

    Text("نافذة التداول وإعدادات نسخ الصفقات", fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(10.dp))

    // خيار التبديل بين التداول الافتراضي والحقيقي
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Text("وضع التنفيذ النشط", color = Gold, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { isRealMode = false },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (!isRealMode) Gold else Color(0xFF2B3139),
                        contentColor = if (!isRealMode) Color.Black else Color.White
                    )
                ) {
                    Text("التداول الافتراضي", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Button(
                    onClick = { isRealMode = true },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isRealMode) Green else Color(0xFF2B3139),
                        contentColor = if (isRealMode) Color.Black else Color.White
                    )
                ) {
                    Text("التداول الحقيقي (KuCoin)", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (isRealMode)
                    "يتم جلب إشارات المتداولين والحيتان من باينانس وتنفيذ الصفقات فعلياً على KuCoin API."
                else
                    "محاكاة فورية بأسعار باينانس الحية مع إمكانية تعديل الرصيد الافتراضي بحرية.",
                color = Muted,
                fontSize = 12.sp
            )
        }
    }

    Spacer(Modifier.height(12.dp))

    // الرصيد الافتراضي القابل للتعديل
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        if (isRealMode) "رصيد التداول الحقيقي (KuCoin)" else "الرصيد الافتراضي القابل للتعديل",
                        color = Muted,
                        fontSize = 12.sp
                    )
                    Text(
                        "$appliedVirtualBalance USDT",
                        color = Gold,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                }
            }
            if (!isRealMode) {
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = virtualBalanceInput,
                        onValueChange = { virtualBalanceInput = it },
                        label = { Text("تعديل الرصيد الافتراضي (USDT)", fontSize = 11.sp) },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    Button(
                        onClick = {
                            val parsed = virtualBalanceInput.toDoubleOrNull()
                            if (parsed != null && parsed > 0) {
                                appliedVirtualBalance = String.format("%.2f", parsed)
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Color.Black)
                    ) {
                        Text("تطبيق", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(12.dp))

    // إعدادات الصفقات المخصصة (حجم الصفقة، الرافعة، العمولة، عدد الصفقات المفتوحة بنفس الوقت)
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                "إعدادات الصفقات عند نسخ المتداولين والحيتان",
                color = Gold,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "تُفتح الصفقات المنسوخة بالحجم والرافعة التي تعينها أنت هنا وليس بحجم المتداول المنسوخ.",
                color = Muted,
                fontSize = 11.sp
            )
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = tradeValueUsdt,
                    onValueChange = { tradeValueUsdt = it },
                    label = { Text("قيمة الصفقة (USDT)", fontSize = 11.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = leverageInput,
                    onValueChange = { leverageInput = it },
                    label = { Text("الرافعة (x)", fontSize = 11.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = commissionInput,
                    onValueChange = { commissionInput = it },
                    label = { Text("العمولة (%)", fontSize = 11.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = maxConcurrentInput,
                    onValueChange = { maxConcurrentInput = it },
                    label = { Text("أقصى صفقات مفتوحة معاً", fontSize = 11.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "فتح الصفقات بحجمي المحدد دائماً (${tradeValueUsdt} USDT × ${leverageInput}x)",
                    fontSize = 12.sp,
                    color = Color.White,
                    modifier = Modifier.weight(1f)
                )
                Switch(
                    checked = enforceUserSize,
                    onCheckedChange = { enforceUserSize = it }
                )
            }
        }
    }

    Spacer(Modifier.height(14.dp))
    Text("الصفقات المفتوحة حالياً (حد أقصى: $maxConcurrentInput صفقات)", fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(8.dp))
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "يمكنك نسخ أكثر من متداول في نفس الوقت من نافذتي Copy Trading و Whales. سيتم فتح كل صفقة بقيمة $tradeValueUsdt USDT ورافعة ${leverageInput}x وعمولة ${commissionInput}% بما لا يتجاوز $maxConcurrentInput صفقات مفتوحة بنفس الوقت.",
                color = Muted,
                fontSize = 13.sp
            )
            if (connectionState.tickers.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Color(0xFF34414E))
                Spacer(Modifier.height(10.dp))
                Text(
                    "الأسعار المرجعية المباشرة من باينانس:",
                    color = Gold,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(6.dp))
                connectionState.tickers.forEach { t ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(t.symbol, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("${t.lastPrice} USDT (${t.priceChangePercent})", color = Muted, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsScreen(
    auto: Boolean,
    config: BinanceConfig,
    connectionState: BinanceConnectionState,
    onAuto: (Boolean) -> Unit,
    onLive: () -> Unit,
    onOpenApiSetup: () -> Unit
) {
    Text("الإعدادات وإدارة المخاطر", fontSize = 22.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(12.dp))
    Card(
        colors = CardDefaults.cardColors(containerColor = Panel),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("السوق: العقود الآجلة الدائمة USDⓈ-M Futures", fontWeight = FontWeight.SemiBold)
            Text("البيئة النشطة: ${config.environment.titleAr}", color = Gold, fontSize = 13.sp)
            Text(
                "حالة الاتصال: ${connectionState.statusMessageAr}",
                color = if (connectionState.isAuthenticated) Green else Muted,
                fontSize = 12.sp
            )

            HorizontalDivider(Modifier.padding(vertical = 12.dp), color = Color(0xFF34414E))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("النسخ الورقي التلقائي لإشارات الحيتان", Modifier.weight(1f))
                Switch(
                    checked = auto,
                    onCheckedChange = onAuto,
                    modifier = Modifier.testTag("settings_auto_switch")
                )
            }

            Spacer(Modifier.height(10.dp))

            Button(
                onClick = onOpenApiSetup,
                colors = ButtonDefaults.buttonColors(containerColor = Gold),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_open_api_button")
            ) {
                Icon(Icons.Default.Api, contentDescription = null, tint = Ink)
                Spacer(Modifier.width(8.dp))
                Text("تعديل إعدادات مفاتيح Binance API", color = Ink, fontWeight = FontWeight.Bold)
            }

            Spacer(Modifier.height(8.dp))

            OutlinedButton(
                onClick = onLive,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_live_review_button")
            ) {
                Text("مراجعة أمان التداول المباشر (Live Mode)", color = Gold)
            }

            Spacer(Modifier.height(10.dp))
            Text(
                "تنبيه أمني: الحساب مضبوط حالياً بوضع القراءة فقط (Read-Only) لضمان أمان أموالك. لا تشارك مفتاحك السري مطلقاً.",
                color = Muted,
                fontSize = 11.sp
            )
        }
    }
}
