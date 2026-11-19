import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyConfig = {
  '/fapi': {
    target: 'https://fapi.binance.com',
    changeOrigin: true,
    secure: true,
  },
  '/testnet-fapi': {
    target: 'https://testnet.binancefuture.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/testnet-fapi/, '/fapi'),
    secure: true,
  },
  '/bapi': {
    target: 'https://www.binance.com',
    changeOrigin: true,
    secure: true,
    headers: {
      Referer: 'https://www.binance.com/en/copy-trading',
      Origin: 'https://www.binance.com',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  },
  '/kucoin-futures': {
    target: 'https://api-futures.kucoin.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/kucoin-futures/, ''),
    secure: true,
  },
  '/kucoin': {
    target: 'https://api.kucoin.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/kucoin/, ''),
    secure: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: proxyConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: proxyConfig,
  },
});

