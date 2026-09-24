# DEPLOYMENT SUMMARY — RESERVATION: PERIMETER

## ✅ COMPLETED

### 1. Contracts Compiled (via GitHub Actions)
All 3 contracts compiled to TVM bytecode (`.tvc`) + ABI (`.abi.json`):
- `PerimeterProfiles.tvc` / `.abi.json` — профили/рейтинг
- `PerimeterItems.tvc` / `.abi.json` — предметы/рынок/NPC-цены
- `PerimeterArena.tvc` / `.abi.json` — PvP-комнаты 1x1/2x2/4x4
- ⚠️ **Текущие .tvc собраны из СТАРЫХ .sol.** После фикса `PerimeterArena.deposit`
  (закрыта mint-дыра: начисление только через `depositFor` от owner + `withdraw`)
  workflow `deploy.yml` сначала **перекомпилирует** все контракты
  (`sold --tvm-version gosh`), потом деплоит. Ручная пересборка:
  `sold --tvm-version gosh PerimeterArena.sol` (sold 0.81.0, x86_64).

### 2. Deployer Keys Generated
```
chain/deploy.keys.json — ТОЛЬКО ЛОКАЛЬНО, в git НЕ попадает (.gitignore)
Public:  c8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72
Secret:  <удалён из документации — лежит только в chain/deploy.keys.json>
```
> ⚠️ Секрет раньше светился в этом файле (закоммичен в истории). Так как сеть
> тестовая и деплоя ещё не было, после мержа **сгенерируй новую пару**
> (`tvm-cli genphrase --dump chain/deploy.keys.json`), пересчитай адреса
> (`tvm-cli genaddr ... --save`) и обнови адреса в README/sync.mjs/игре.
> Старый ключ считай скомпрометированным.

### 3. Contract Addresses Precomputed (root dapps, dapp_id == account_id)

| Contract | Address (new format: dapp_id::account_id) | Legacy (0:...) |
|----------|-------------------------------------------|----------------|
| **PerimeterProfiles** | `86ca05001af647f241857371c1aab21895604ce95526393c5dbe437a73f8a71c::86ca05001af647f241857371c1aab21895604ce95526393c5dbe437a73f8a71c` | `0:86ca05001af647f241857371c1aab21895604ce95526393c5dbe437a73f8a71c` |
| **PerimeterItems** | `0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775::0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775` | `0:0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775` |
| **PerimeterArena** | `fa598be10db0f9dd13d63d83cb8c87c2e0df5b2f727b03dc6e0e35328bb50d74::fa598be10db0f9dd13d63d83cb8c87c2e0df5b2f727b03dc6e0e35328bb50d74` | `0:fa598be10db0f9dd13d63d83cb8c87c2e0df5b2f727b03dc6e0e35328bb50d74` |

> **PerimeterItems** requires constructor init data: `ownerKey = 0xc8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72` (deployer public key)
> **PerimeterArena** requires static init data: `ownerKey = 0xc8f43f...` (same key, passed via `--data`).
> Arena credits are issued ONLY by owner: `node sync.mjs arena-deposit <pubkey> <сумма>` (owner key required).

### 4. Multisig Wallet Deployed (for future contract management)
- Address: `73e271257c9b6b5b32f31d1af74dce240e2113f13db959c09c4a534ebf959847::73e271257c9b6b5b32f31d1af74dce240e2113f13db959c09c4a534ebf959847`
- Status: **Active**
- Balance: ~10,000 VMSHELL native + 10,000 SHELL ECC
- Custodian: deployer public key (1 confirm required)

### 5. sync.mjs Updated
Default contract addresses now point to the precomputed addresses above.

## ❌ BLOCKED: Final Deploy Step

**Issue**: TVM v3 requires deployer account to be **Active** (initialized) to send deploy transactions. The deployer account (`c8f4...`) is Uninit. The giver contract on Shellnet currently fails with exit code 40 (empty ECC balance), preventing funding of Uninit accounts.

**Root cause**: 
- `@tvmsdk/lib-node` has no arm64 native binary → can't use TVM SDK from Node.js
- `tvm-cli deploy` routes through signer's dapp_id (Uninit) → rejected by network
- Giver contract broken on Shellnet (exit code 40)

## 🔧 TO COMPLETE DEPLOY (run on x86_64 machine)

### Option A: Use TVM SDK on x86_64 (recommended)
```bash
# On x86_64 Linux/macOS:
cd chain
npm i @tvmsdk/core @tvmsdk/lib-node
node deploy.js  # (create deploy.js using TVM SDK contracts.deploy())
```

### Option B: Use tvm-cli on x86_64 with funded deployer
```bash
# 1. Get test tokens for deployer (c8f4...) via giver or Telegram
# 2. Deploy contracts:
tvm-cli -u shellnet.ackinacki.org deploy PerimeterProfiles.tvc --abi PerimeterProfiles.abi.json --sign deploy.keys.json '{"value":10000000000}'
tvm-cli -u shellnet.ackinacki.org deploy PerimeterItems.tvc --abi PerimeterItems.abi.json --sign deploy.keys.json --data '{"ownerKey":"0xc8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72"}' '{"value":10000000000}'
tvm-cli -u shellnet.ackinacki.org deploy PerimeterArena.tvc --abi PerimeterArena.abi.json --sign deploy.keys.json --data '{"ownerKey":"0xc8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72"}' '{"value":10000000000}'
```

### Option C: Wait for giver fix + deploy from this machine
Once giver works, fund deployer then deploy:
```bash
# Fund deployer (c8f4...) with flag=17
tvm-cli -u shellnet.ackinacki.org callx --abi GiverV3.abi.json --addr 000...::111... -m sendCurrencyWithFlag '{"dest":"c8f4...","value":10000000000000,"ecc":{"2":10000000000000},"flag":17}'
# Then deploy
tvm-cli -u shellnet.ackinacki.org deploy PerimeterProfiles.tvc --abi PerimeterProfiles.abi.json --sign deploy.keys.json '{"value":10000000000}'
# ...etc
```

## 📋 POST-DEPLOY CHECKLIST

After contracts are deployed:

1. **Verify contracts are Active**:
   ```bash
   tvm-cli -u shellnet.ackinacki.org account <ADDRESS>::<ADDRESS>
   ```

2. **Set NPC prices in PerimeterItems** (required for NPC shop):
   ```bash
   # For each item code in game:
   tvm-cli -u shellnet.ackinacki.org callx --abi PerimeterItems.abi.json --keys deploy.keys.json --addr <ITEMS_ADDR> -m setNpcPrice '{"itemCode":"usp","price":100000000}'
   # ...repeat for all items (ak47, vest2, imp_acc, etc.)
   ```

3. **Update index.html** (Profile tab) with contract addresses

4. **Test sync.mjs**:
   ```bash
   cd chain && node sync.mjs init
   node sync.mjs profile "TestNick"
   node sync.mjs read
   ```

5. **Git commit & push**:
   ```bash
   cd /root/tio-nacki
   git init
   git add .
   git commit -m "Initial commit: Reservation: Perimeter v5"
   git remote add origin https://github.com/Reshet21/reservation-perimeter.git
   git push -u origin main
   ```

## 📁 FILES IN /root/tio-nacki/chain/
```
PerimeterProfiles.tvc / .abi.json
PerimeterItems.tvc / .abi.json
PerimeterArena.tvc / .abi.json
Multisig.tvc / .abi.json
deploy.keys.json          # DEPLOYER KEYS — KEEP SECRET
sync.mjs                  # Updated with contract addresses
```

## ⚠️ SECURITY
- `deploy.keys.json` contains the deployer secret key — **never commit**
- Multisig keys same as deployer — **never commit**
- Add `chain/*.keys.json` to `.gitignore`

## 🎮 GAME READY
Once deployed, the game at `https://reshet21.github.io/reservation-perimeter/` will have full on-chain functionality:
- Profiles & rating (PerimeterProfiles)
- Items, NPC shop, player market (PerimeterItems)
- PvP arena 1x1/2x2/4x4 with escrow (PerimeterArena)