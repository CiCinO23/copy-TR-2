# WHALE COPY PRO (ويل كوبي برو) — React Web Application

USDⓈ-M Futures copy trading and smart money paper trading dashboard. Rewritten as a modern React + TypeScript + Vite web application with Tailwind CSS and full RTL Arabic/English interface.

## Features

- **Dashboard (الرئيسية)**: Real-time Binance futures balances, active positions, unrealized PnL, latency ping, portfolio asset breakdown, and live 24h market tickers (BTC, ETH, SOL, BNB, XRP, DOGE).
- **Binance API Integration (ربط باينانس)**: Configurable environments (USDⓈ-M Mainnet, Futures Testnet, Backend Proxy), HMAC SHA-256 Web Crypto authentication, read-only protection toggle, diagnostic tests, and secure browser-side storage.
- **Whale Radar (رادار الحيتان)**: Live Open Interest (OI) tracking, smart money volume calculation, and institutional liquidity accumulation signals.
- **Copy Trading (نسخ التداول)**: Automated strategy copy mode with pre-configured high-probability whale strategies for BTC, ETH, and SOL.
- **Simulation Engine (المحاكاة)**: Built-in paper trading engine supporting Long and Short orders, 1x-20x leverage, real-time mark-to-market PnL calculation, margin verification, position closing, and virtual balance management.
- **Settings & Risk Management (الإعدادات)**: Safety controls, live trading safety review dialog, leverage limits, and connection telemetry.

## Technology Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom dark luxury trading terminal palette
- **Icons**: Lucide React
- **Security**: Web Crypto API (HMAC SHA-256), client-side read-only defaults

## Development

```bash
npm install
npm run dev
```

Server runs on `http://0.0.0.0:3000`.
