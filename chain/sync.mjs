/**
 * sync.mjs — клиент контрактов Reservation: Perimeter на Acki Nacki Shellnet (TVM SDK).
 *
 * Установка (бесплатно):
 *   npm i @tvmsdk/core @tvmsdk/lib-node
 *
 * Профиль (контракт PerimeterProfiles):
 *   node sync.mjs init                # сгенерировать ключи игрока (keys.json)
 *   node sync.mjs profile "Ник"       # создать профиль (рейтинг 1000) / переименоваться
 *   node sync.mjs battle win 0x1a2b3c4d        # записать результат (рейтинг считает контракт)
 *   node sync.mjs bind "hex::hex"     # привязать AN Wallet к профилю
 *   node sync.mjs read                # прочитать свой профиль (бесплатно)
 *   node sync.mjs top [N]             # он-чейн топ игроков
 *   node sync.mjs save game.json      # записать облачный сейв (JSON из игры)
 *   node sync.mjs load [out.json]     # скачать облачный сейв
 *
 * Предметы и рынок (контракт PerimeterItems, адрес в RP_ITEMS):
 *   node sync.mjs items ak47          # мой баланс предмета + кредиты
 *   node sync.mjs list ak47 1 560     # выставить 1 шт по 560 кредитов
 *   node sync.mjs unlist 3            # снять листинг #3
 *   node sync.mjs buy 3 1             # купить 1 шт из листинга #3
 *   node sync.mjs gift <pubkey> usp 1 # подарить предмет другу
 *   node sync.mjs market              # статистика рынка
 *
 * Арена PvP (контракт PerimeterArena, адрес в RP_ARENA):
 *   node sync.mjs room-create 1 100 false  # комната 1x1, ставка 100
 *   node sync.mjs room-join 5              # войти в комнату #5
 *   node sync.mjs room-result 5 <winnerPubkey> 0x1a2b  # подтвердить результат
 *   node sync.mjs room-timeout 5           # возврат ставок после дедлайна (1 час)
 *   node sync.mjs rooms                    # статистика арены
 *   node sync.mjs arena-deposit <pubkey> 500  # начислить кредиты (только owner-ключ!)
 *   node sync.mjs arena-withdraw 200        # вывести свои кредиты арены
 *   node sync.mjs arena-balance             # мой баланс в арене
 *
 * Адреса: RP_CONTRACT (профили), RP_ITEMS (предметы), RP_ARENA (арена).
 */
import { TvmClient } from "@tvmsdk/core";
import { libNode } from "@tvmsdk/lib-node";
import { readFileSync, writeFileSync, existsSync } from "fs";

TvmClient.useBinaryLibrary(libNode);

const ENDPOINT = process.env.RP_ENDPOINT || "https://shellnet.ackinacki.org/graphql";
const CONTRACT_ADDR = process.env.RP_CONTRACT || "0bce2fd11a67dedada3c2a38a182b640c4252132bc8171f1b17bf3dc4ae3aca9::0bce2fd11a67dedada3c2a38a182b640c4252132bc8171f1b17bf3dc4ae3aca9";
const ITEMS_ADDR = process.env.RP_ITEMS || "0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775::0886a98c82f7a54e046da4799e9b232623da8b599819031d037e109ee850d775";
const ARENA_ADDR = process.env.RP_ARENA || "06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd::06b6069183815f1150c8783842bc5900ab2df6e836cf9cb7bbc29fb9a6a3fdfd";
const ABI_PATH = new URL("./PerimeterProfiles.abi.json", import.meta.url).pathname;
const ITEMS_ABI_PATH = new URL("./PerimeterItems.abi.json", import.meta.url).pathname;
const ARENA_ABI_PATH = new URL("./PerimeterArena.abi.json", import.meta.url).pathname;
const KEYS_PATH = new URL("./keys.json", import.meta.url).pathname;

const client = new TvmClient({ network: { endpoints: [ENDPOINT] } });

function abi() {
  return { type: "Json", value: readFileSync(ABI_PATH, "utf8") };
}
function itemsAbi() {
  return { type: "Json", value: readFileSync(ITEMS_ABI_PATH, "utf8") };
}
function arenaAbi() {
  return { type: "Json", value: readFileSync(ARENA_ABI_PATH, "utf8") };
}
function keys() {
  if (!existsSync(KEYS_PATH)) {
    console.error("Нет keys.json — сначала выполни: node sync.mjs init");
    process.exit(1);
  }
  return JSON.parse(readFileSync(KEYS_PATH, "utf8"));
}

async function call(fn, input, address = CONTRACT_ADDR, theAbi = null) {
  const result = await client.processing.process_message({
    message_encode_params: {
      address,
      abi: theAbi || abi(),
      call_set: { function_name: fn, input },
      signer: { type: "Keys", keys: keys() },
    },
    send_events: false,
  });
  console.log(`✅ ${fn} выполнено, транзакция:`, result.transaction.id);
}

async function runGet(fn, input, address = CONTRACT_ADDR, theAbi = null) {
  const acc = await client.net.query_collection({
    collection: "accounts",
    filter: { id: { eq: address } },
    result: "boc",
  });
  if (!acc.result.length) throw new Error("Контракт не найден: " + address);
  const msg = await client.abi.encode_message({
    address,
    abi: theAbi || abi(),
    call_set: { function_name: fn, input },
    signer: { type: "None" },
  });
  const r = await client.tvm.run_tvm({
    message: msg.message,
    account: acc.result[0].boc,
    abi: theAbi || abi(),
  });
  return r.decoded.output;
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === "init") {
    const kp = await client.crypto.generate_random_sign_keys();
    writeFileSync(KEYS_PATH, JSON.stringify(kp, null, 2));
    console.log("🔑 Ключи игрока сохранены в keys.json");
    console.log("Публичный ключ (это твой игровой ID):", kp.public);
  } else if (cmd === "profile") {
    const [nick] = args;
    await call("createProfile", { nick: nick || "Stalker" });
  } else if (cmd === "battle") {
    const [res, hash] = args;
    await call("reportBattle", {
      win: res === "win",
      battleHash: BigInt(hash || "0").toString(),
    });
  } else if (cmd === "read") {
    const kp = keys();
    const out = await runGet("getProfile", { pk: "0x" + kp.public });
    console.log("📜 Профиль он-чейн:", out);
    const stats = await runGet("getStats", {});
    console.log("🌍 Всего в игре:", stats);
  } else if (cmd === "bind") {
    const [addr] = args;
    if (!addr || addr.length < 8) { console.error("Использование: node sync.mjs bind <multifactor-address>"); process.exit(1); }
    await call("bindWallet", { walletAddr: addr });
  } else if (cmd === "top") {
    const n = Math.min(Number(args[0] || 10), 50);
    const keys = await runGet("getPlayers", { offset: 0, limit: n });
    const rows = [];
    for (const pk of (keys.keys || keys)) {
      try {
        const p = await runGet("getProfile", { pk });
        rows.push({ nick: p.nick, rating: Number(p.rating), wins: Number(p.wins), losses: Number(p.losses), wallet: p.walletAddr || "" });
      } catch (e) { /* профиль без данных */ }
    }
    rows.sort((a, b) => b.rating - a.rating);
    console.log("🏆 Он-чейн топ:");
    rows.forEach((r, i) => console.log(` ${i + 1}. ${r.nick} — ${r.rating} (W${r.wins}/L${r.losses})${r.wallet ? " · " + r.wallet.slice(0, 12) + "…" : ""}`));
  } else if (cmd === "save") {
    const [path] = args;
    if (!path) { console.error("Использование: node sync.mjs save <game.json> (экспорт из игры: Профиль → Данные)"); process.exit(1); }
    const blob = readFileSync(path, "utf8");
    if (blob.length > 32768) { console.error(`Сейв слишком большой: ${blob.length} > 32768 байт`); process.exit(1); }
    JSON.parse(blob); // проверка валидности
    await call("saveGame", { blob });
  } else if (cmd === "load") {
    const kp = keys();
    const out = await runGet("getSave", { pk: "0x" + kp.public });
    if (!out.blob) { console.log("☁️ Облачный сейв пуст — сначала node sync.mjs save"); process.exit(0); }
    const [outPath] = args;
    if (outPath) { writeFileSync(outPath, out.blob); console.log(`☁️ Сейв записан в ${outPath} (${out.blob.length} байт). Импорт в игре: Профиль → Данные.`); }
    else console.log(out.blob);
  } else if (cmd === "items") {
    const kp = keys();
    const [code] = args;
    const out = await runGet("getBalance",
      { player: "0x" + kp.public, itemCode: code || "usp" }, ITEMS_ADDR, itemsAbi());
    console.log(`🎒 ${code}:`, out.count, "шт · кредиты:", out.creditBalance);
  } else if (cmd === "list") {
    const [code, amount, price] = args;
    await call("listItem",
      { itemCode: code, amount: Number(amount || 1), priceEach: Number(price || 100) },
      ITEMS_ADDR, itemsAbi());
  } else if (cmd === "unlist") {
    await call("unlist", { lid: Number(args[0]) }, ITEMS_ADDR, itemsAbi());
  } else if (cmd === "buy") {
    const [lid, amount] = args;
    await call("buy", { lid: Number(lid), amount: Number(amount || 1) }, ITEMS_ADDR, itemsAbi());
  } else if (cmd === "gift") {
    const [to, code, amount] = args;
    await call("transferItem",
      { to: to.startsWith("0x") ? to : "0x" + to, itemCode: code, amount: Number(amount || 1) },
      ITEMS_ADDR, itemsAbi());
  } else if (cmd === "market") {
    const out = await runGet("getMarketStats", {}, ITEMS_ADDR, itemsAbi());
    console.log("🏪 Рынок: всего листингов создано:", out.lids, "· активных:", out.active);
  } else if (cmd === "room-create") {
    const [mode, stake, naked] = args;
    await call("createRoom",
      { mode: Number(mode || 1), stake: Number(stake || 0), naked: naked === "true" },
      ARENA_ADDR, arenaAbi());
  } else if (cmd === "room-join") {
    await call("joinRoom", { roomId: Number(args[0]) }, ARENA_ADDR, arenaAbi());
  } else if (cmd === "room-result") {
    const [roomId, winner, hash] = args;
    await call("commitResult",
      { roomId: Number(roomId), winner: winner.startsWith("0x") ? winner : "0x" + winner,
        battleHash: BigInt(hash || "0").toString() },
      ARENA_ADDR, arenaAbi());
  } else if (cmd === "room-timeout") {
    await call("timeoutRoom", { roomId: Number(args[0]) }, ARENA_ADDR, arenaAbi());
  } else if (cmd === "rooms") {
    const out = await runGet("getArenaStats", {}, ARENA_ADDR, arenaAbi());
    console.log("🎮 Арена: всего комнат:", out.totalRooms, "· открытых:", out.open);
  } else if (cmd === "arena-deposit") {
    const [to, amount] = args;
    if (!to || !Number(amount)) { console.error("Использование: node sync.mjs arena-deposit <pubkey> <сумма> (требует owner-ключ)"); process.exit(1); }
    await call("depositFor",
      { player: to.startsWith("0x") ? to : "0x" + to, amount: Number(amount) },
      ARENA_ADDR, arenaAbi());
  } else if (cmd === "arena-withdraw") {
    await call("withdraw", { amount: Number(args[0] || 0) }, ARENA_ADDR, arenaAbi());
  } else if (cmd === "arena-balance") {
    const kp = keys();
    const out = await runGet("getBalance", { player: "0x" + kp.public }, ARENA_ADDR, arenaAbi());
    console.log("🎮 Мой баланс в арене:", out);
  } else {
    console.log("Профиль:  init | profile <ник> | battle <win|lose> <hash> | bind <walletAddr> | read | top [N] | save <game.json> | load [out.json]");
    console.log("Предметы: items <code> | list <code> <кол-во> <цена> | unlist <lid> | buy <lid> <кол-во> | gift <pubkey> <code> <кол-во> | market");
    console.log("Арена:    room-create <1|2|4> <ставка> <naked> | room-join <id> | room-result <id> <winner> <hash> | room-timeout <id> | rooms | arena-deposit <pubkey> <сумма> | arena-withdraw <сумма> | arena-balance");
  }
} catch (e) {
  console.error("❌ Ошибка:", e.message || e);
} finally {
  client.close();
}
