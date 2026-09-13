/**
 * wallet-manager.js — Управление кошельком для RESERVATION: PERIMETER
 *
 * 1. bee-sdk (WASM) — идентификация AN Wallet, чтение балансов
 * 2. GraphQL API — чтение состояния контрактов
 * 3. Ключи — хранятся в IndexedDB, генерируются при подключении
 */

const RP_CONFIG = {
  BEE_SDK_URL: 'https://unpkg.com/@teamgosh/bee-sdk@5.1.1/bee_sdk.js',
  BEE_WASM_URL: 'https://unpkg.com/@teamgosh/bee-sdk@5.1.1/bee_sdk_bg.wasm',
  AN_API: 'https://app-backend-dev.ackinacki.org/api',
  APP_ID: '0x0000000000000000000000000000000000000000000000000000000000000026',
  ENDPOINTS: ['https://mainnet.ackinacki.org'],
  GRAPHQL_ENDPOINT: 'https://shellnet.ackinacki.org/graphql',
  PROFILES_ADDR: '',
  ITEMS_ADDR: '',
  ARENA_ADDR: '',
  KEYS_DB: 'rp-wallet-keys',
  SESSION_KEY: 'rp-wallet-session',
};

function log(...a) { console.log('[RP-Wallet]', ...a); }
function logErr(...a) { console.error('[RP-Wallet]', ...a); }

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  hex = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

// ─── IndexedDB ───
class KeysDB {
  constructor() { this.db = null; }

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(RP_CONFIG.KEYS_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('keys', 'readonly');
      const req = tx.objectStore('keys').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('keys', 'readwrite');
      const req = tx.objectStore('keys').put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ─── Ed25519 через Web Crypto ───
class GameKeys {
  constructor() { this.publicKeyHex = null; this.secretKeyHex = null; }

  async generate() {
    // Проверяем поддержку Ed25519
    if (!crypto.subtle || !crypto.subtle.generateKey) {
      throw new Error('Web Crypto API не поддерживается');
    }

    // Пробуем Ed25519, если нет — fallback на ECDSA P-256
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' }, true, ['sign', 'verify']
      );
      const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      this.publicKeyHex = bytesToHex(new Uint8Array(pubRaw));

      // Экспортируем приватный ключ как raw seed
      const privPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const privBytes = new Uint8Array(privPkcs8);
      // Ed25519 PKCS8: 16-byte header + 32-byte seed
      const seed = privBytes.slice(privBytes.length - 32);
      this.secretKeyHex = bytesToHex(seed);

      // Сохраняем CryptoKey для подписания
      this._signingKey = keyPair.privateKey;
      this._algo = 'Ed25519';

      log('Ed25519 ключи сгенерированы:', this.publicKeyHex.slice(0, 16) + '...');
      return { publicKey: this.publicKeyHex, secretKey: this.secretKeyHex };
    } catch (e) {
      // Ed25519 не поддерживается — используем ECDSA P-256
      log('Ed25519 не поддерживается, используем ECDSA P-256');
      const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
      );
      const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      this.publicKeyHex = bytesToHex(new Uint8Array(pubRaw));

      const privRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      this.secretKeyHex = bytesToHex(new Uint8Array(privRaw));

      this._signingKey = keyPair.privateKey;
      this._algo = 'ECDSA-P256';

      log('ECDSA P-256 ключи сгенерированы:', this.publicKeyHex.slice(0, 16) + '...');
      return { publicKey: this.publicKeyHex, secretKey: this.secretKeyHex };
    }
  }

  async restore(secretKeyHex) {
    this.secretKeyHex = secretKeyHex.replace(/^0x/, '');

    try {
      // Пробуем как Ed25519 seed (32 bytes)
      const seed = hexToBytes(this.secretKeyHex);
      if (seed.length === 32) {
        const pkcs8Header = new Uint8Array([
          0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
          0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
        ]);
        const pkcs8 = new Uint8Array(pkcs8Header.length + seed.length);
        pkcs8.set(pkcs8Header);
        pkcs8.set(seed, pkcs8Header.length);

        const key = await crypto.subtle.importKey(
          'pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']
        );
        const pubRaw = await crypto.subtle.exportKey('raw', key.publicKey);
        this.publicKeyHex = bytesToHex(new Uint8Array(pubRaw));
        this._signingKey = key;
        this._algo = 'Ed25519';
        log('Ed25519 ключи восстановлены');
        return;
      }
    } catch (e) { /* не Ed25519 */ }

    try {
      // Пробуем как PKCS8 (ECDSA)
      const key = await crypto.subtle.importKey(
        'pkcs8', hexToBytes(this.secretKeyHex),
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
      );
      const pubRaw = await crypto.subtle.exportKey('raw', key.publicKey);
      this.publicKeyHex = bytesToHex(new Uint8Array(pubRaw));
      this._signingKey = key;
      this._algo = 'ECDSA-P256';
      log('ECDSA ключи восстановлены');
    } catch (e) {
      logErr('Не удалось восстановить ключи:', e);
    }
  }

  async sign(data) {
    if (!this._signingKey) throw new Error('Ключи не инициализированы');
    const dataBytes = typeof data === 'string' ? hexToBytes(data) : data;
    if (this._algo === 'Ed25519') {
      const sig = await crypto.subtle.sign({ name: 'Ed25519' }, this._signingKey, dataBytes);
      return bytesToHex(new Uint8Array(sig));
    } else {
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, this._signingKey, dataBytes
      );
      return bytesToHex(new Uint8Array(sig));
    }
  }
}

// ─── GraphQL ───
async function gqlQuery(query, variables = {}) {
  const resp = await fetch(RP_CONFIG.GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await resp.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

// ─── Главный класс ───
class RPWallet {
  constructor() {
    this.keysDb = new KeysDB();
    this.gameKeys = new GameKeys();
    this.connected = false;
    this.walletName = null;
    this.walletAddress = null;
    this.balances = { nackl: '0', shell: '0', usdc: '0' };
    this._sdkMod = null;
    this._sdkReady = false;
  }

  async init() {
    log('Инициализация...');
    try { await this.keysDb.open(); } catch (e) { logErr('IndexedDB ошибка:', e); }
    try { await this._loadBeeSdk(); } catch (e) { logErr('bee-sdk ошибка:', e); }
    await this._restoreSession();
    log('Готово');
  }

  async _loadBeeSdk() {
    if (this._sdkReady) return;
    log('Загрузка bee-sdk...');
    const t0 = Date.now();
    const mod = await import(RP_CONFIG.BEE_SDK_URL);
    await mod.default({ module_or_path: RP_CONFIG.BEE_WASM_URL });
    this._sdkMod = mod;
    this._sdkReady = true;
    log('bee-sdk OK', Date.now() - t0, 'мс');
  }

  async _restoreSession() {
    try {
      const s = localStorage.getItem(RP_CONFIG.SESSION_KEY);
      if (!s) return;
      const session = JSON.parse(s);
      if (!session || !session.walletAddress) return;

      // Восстанавливаем ключи
      const stored = await this.keysDb.get(session.walletAddress);
      if (stored && stored.secretKey) {
        await this.gameKeys.restore(stored.secretKey);
      }

      this.walletName = session.walletName;
      this.walletAddress = session.walletAddress;
      this.balances = session.balances || this.balances;
      this.connected = true;
      log('Сессия восстановлена:', this.walletName);
    } catch (e) {
      logErr('Ошибка восстановления:', e);
    }
  }

  _saveSession() {
    localStorage.setItem(RP_CONFIG.SESSION_KEY, JSON.stringify({
      walletName: this.walletName,
      walletAddress: this.walletAddress,
      balances: this.balances,
    }));
  }

  async connectByName(walletName) {
    log('Подключение:', walletName);
    if (!this._sdkReady) await this._loadBeeSdk();

    let beeWallet;
    try {
      beeWallet = new this._sdkMod.Wallet(
        RP_CONFIG.ENDPOINTS, null, RP_CONFIG.AN_API, RP_CONFIG.APP_ID
      );
    } catch (e) {
      throw new Error('Не удалось подключиться к блокчейну');
    }

    let nameInfo;
    try {
      nameInfo = await beeWallet.check_name_availability(walletName);
    } catch (e) {
      beeWallet.free();
      throw new Error('Ошибка проверки имени: ' + e.message);
    }

    if (nameInfo.is_available) {
      beeWallet.free();
      throw new Error('Кошелёк "' + walletName + '" не найден');
    }

    const addr = nameInfo.multifactor_address;
    if (!addr) { beeWallet.free(); throw new Error('Адрес не найден'); }

    let balances = { nackl: '0', shell: '0', usdc: '0' };
    try {
      const b = await beeWallet.get_multifactor_balances({ multifactor_address: addr });
      balances = this._parseBalances(b);
    } catch (e) { logErr('Баланс:', e); }
    beeWallet.free();

    // Генерируем ключи
    let stored = await this.keysDb.get(addr);
    if (!stored) {
      await this.gameKeys.generate();
      await this.keysDb.set(addr, { publicKey: this.gameKeys.publicKeyHex, secretKey: this.gameKeys.secretKeyHex });
    } else {
      await this.gameKeys.restore(stored.secretKey);
    }

    this.walletName = walletName;
    this.walletAddress = addr;
    this.balances = balances;
    this.connected = true;
    this._saveSession();

    return { walletName, walletAddress: addr, balances, publicKey: this.gameKeys.publicKeyHex };
  }

  _parseBalances(b) {
    const out = { nackl: '0', shell: '0', usdc: '0' };
    if (b && b.ecc) {
      out.nackl = (BigInt(b.ecc['1'] || '0') / 1000000000n).toString();
      out.shell = (BigInt(b.ecc['2'] || '0') / 1000000000n).toString();
      out.usdc = (BigInt(b.ecc['3'] || '0') / 1000000000n).toString();
    }
    if (b && b.native) out.shell = (BigInt(b.native) / 1000000000n).toString();
    return out;
  }

  async refreshBalance() {
    if (!this.connected || !this.walletAddress) return;
    try {
      const beeWallet = new this._sdkMod.Wallet(
        RP_CONFIG.ENDPOINTS, null, RP_CONFIG.AN_API, RP_CONFIG.APP_ID
      );
      const b = await beeWallet.get_multifactor_balances({ multifactor_address: this.walletAddress });
      this.balances = this._parseBalances(b);
      beeWallet.free();
      this._saveSession();
    } catch (e) { logErr('Обновление баланса:', e); }
  }

  async disconnect() {
    this.connected = false;
    this.walletName = null;
    this.walletAddress = null;
    this.balances = { nackl: '0', shell: '0', usdc: '0' };
    this.gameKeys = new GameKeys();
    localStorage.removeItem(RP_CONFIG.SESSION_KEY);
  }

  isConnected() { return this.connected && !!this.walletAddress; }
  getPublicKey() { return this.gameKeys.publicKeyHex ? '0x' + this.gameKeys.publicKeyHex : null; }

  // ─── GraphQL чтение контрактов ───
  async readAccountBalance(address) {
    try {
      const data = await gqlQuery(`{
        blockchain {
          account(address: "${address}") {
            info { balance acc_type_name }
          }
        }
      }`);
      return data.blockchain.account.info;
    } catch (e) {
      logErr('readAccountBalance:', e);
      return null;
    }
  }

  // ─── Бой ───
  async reportBattleOffline(win, newRating, battleHash) {
    // Локальная запись результата (до деплоя контракта)
    const pending = JSON.parse(localStorage.getItem('rp-pending-txs') || '[]');
    pending.push({
      function: 'reportBattle',
      input: { win, newRating, battleHash: String(battleHash) },
      publicKey: this.getPublicKey(),
      timestamp: Date.now(),
    });
    localStorage.setItem('rp-pending-txs', JSON.stringify(pending));
    return { success: true, pending: true };
  }

  getPendingTxs() {
    try { return JSON.parse(localStorage.getItem('rp-pending-txs') || '[]'); }
    catch { return []; }
  }

  clearPendingTxs() { localStorage.removeItem('rp-pending-txs'); }

  exportKeys() {
    return { publicKey: this.gameKeys.publicKeyHex, secretKey: this.gameKeys.secretKeyHex,
             walletName: this.walletName, walletAddress: this.walletAddress };
  }

  async importKeys(secretKeyHex, walletName, walletAddress) {
    await this.gameKeys.restore(secretKeyHex);
    this.walletName = walletName;
    this.walletAddress = walletAddress;
    this.connected = true;
    await this.keysDb.set(walletAddress, { publicKey: this.gameKeys.publicKeyHex, secretKey: secretKeyHex });
    this._saveSession();
  }
}

export { RPWallet };
export default RPWallet;
