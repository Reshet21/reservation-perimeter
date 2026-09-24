# DEPLOYMENT SUMMARY — RESERVATION: PERIMETER

## ✅ DEPLOYED TO SHELLNET (2026-09-24)

Все три контракта скомпилированы (`sold 0.81.0`), профинансированы из
мультисига флагом 16 и задеплоены через workflow `Deploy Contracts to Shellnet`.
Статус всех — **Active**, проверено `tvm-cli account` + геттерами.
Сквозной тест: createProfile → reportBattle (рейтинг 1000→1025) →
bindWallet → getProfile/getPlayers — всё exit_code 0.

| Contract | Address (dapp_id::account_id) | Code hash |
|----------|-------------------------------|-----------|
| **PerimeterProfiles** | `390146e4e421bd97bc8e674801cec5c93ac922d93b1e6477a19242c5f026941a::390146e4e421bd97bc8e674801cec5c93ac922d93b1e6477a19242c5f026941a` | `ae538c41…` |
| **PerimeterItems** | `0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775::0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775` | `44b05074…` |
| **PerimeterArena** | `06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd::06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd` | `4a8c52e8…` |

NPC-цены выставлены workflow (39 позиций, см. лог `deploy-results`).
`tvc`/`abi.json` в `chain/` — свежие, из артефактов CI.

> Старые предвычисленные адреса (86ca…/fa59…) больше не используются:
> код изменился (привязка кошелька, фикс арены) → адреса изменились.
> На 86ca… зависло ~10k тестовых (было залито под старый код) — faucet-деньги,
> не достать (у старого кода нет вывода). Не критично для тестнета.

## Ключи и кошельки

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

### 3. Адреса боевых контрактов (root dapps, dapp_id == account_id)

| Contract | Address (новый формат: dapp_id::account_id) | Legacy (0:...) |
|----------|-------------------------------------------|----------------|
| **PerimeterProfiles** | `390146e4e421bd97bc8e674801cec5c93ac922d93b1e6477a19242c5f026941a::390146e4e421bd97bc8e674801cec5c93ac922d93b1e6477a19242c5f026941a` | `0:390146e4e421bd97bc8e674801cec5c93ac922d93b1e6477a19242c5f026941a` |
| **PerimeterItems** | `0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775::0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775` | `0:0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775` |
| **PerimeterArena** | `06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd::06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd` | `0:06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd` |

> **PerimeterItems/PerimeterArena**: static `ownerKey = 0xc8f43f24be0fb530d4752b68421c5d3dfd377ebc9459ee5442c5f3cf7719fc72` вшивается через `genaddr --save --data` до деплоя.
> Кредиты арены начисляет ТОЛЬКО owner: `node sync.mjs arena-deposit <pubkey> <сумма>` (нужен owner-ключ).
> Привязка кошелька: `node sync.mjs bind <multifactor-address>`, топ: `node sync.mjs top [N]`.

### Мультисиг (фандинг и управление)
- Address: `73e271257c9b6b5b32f31d1af74dce240e2113f13db959c09c4a534ebf959847::73e271257c9b6b5b32f31d1af74dce240e2113f13db959c09c4a534ebf959847`
- Status: **Active**, кастодиан — ключ деплоера (1 подтверждение)
- Использовался для предфандинга адресов (флаг 16, по 500 SHELL на контракт)

### sync.mjs
Дефолтные адреса = боевые (см. таблицу выше). На ARM64 `sync.mjs` не взлетает
(`@tvmsdk/lib-node` без arm64-бинарника) — для вызовов используй `tvm-cli`
(call/run, как в примерах выше) или x86_64-машину.

## Повторный деплой (при изменении .sol)

1. Закоммить изменения, запустить workflow `Deploy Contracts to Shellnet`
   (Actions → Run workflow): компиляция sold 0.81.0 → genaddr → фандинг
   из мультисига → deploy с `--dst-dapp-id` → NPC-цены → проверка Active.
2. Адреса изменятся (код входит в init-хэш) — забери новые из Summary рана,
   обнови README / `sync.mjs` / `RP_DEFAULTS` и `defaultSave` в игре,
   закоммить свежие `.tvc`/`.abi.json` из артефактов.
3. Секрет `DEPLOY_KEYS_JSON` уже заведён в репозитории (для workflow).

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