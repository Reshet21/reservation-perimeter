/**
 * sync.mjs — клиент контрактов TIO:Nacki на Acki Nacki Shellnet (TVM SDK).
 *
 * Установка (бесплатно):
 *   npm i @tvmsdk/core @tvmsdk/lib-node
 *
 * Профиль (контракт TIOProfiles):
 *   node sync.mjs init                # сгенерировать ключи игрока (keys.json)
 *   node sync.mjs profile "Ник"       # создать профиль (рейтинг 1000) / переименоваться
 *   node sync.mjs battle win 0x1a2b3c4d        # записать результат (рейтинг считает контракт)
 *   node sync.mjs read                # прочитать свой профиль (бесплатно)
 *
 * Предметы и рынок (контракт TIOItems, адрес в TIO_ITEMS):
 *   node sync.mjs items ak47          # мой баланс предмета + кредиты
 *   node sync.mjs list ak47 1 560     # выставить 1 шт по 560 кредитов
 *   node sync.mjs unlist 3            # снять листинг #3
 *   node sync.mjs buy 3 1             # купить 1 шт из листинга #3
 *   node sync.mjs gift <pubkey> usp 1 # подарить предмет другу
 *   node sync.mjs market              # статистика рынка
 *
 * Арена PvP (контракт TIOArena, адрес в TIO_ARENA):
 *   node sync.mjs room-create 1 100 false  # комната 1x1, ставка 100
 *   node sync.mjs room-join 5              # войти в комнату #5
 *   node sync.mjs room-result 5 <winnerPubkey> 0x1a2b  # подтвердить результат
 *   node sync.mjs room-timeout 5           # возврат ставок после дедлайна (1 час)
 *   node sync.mjs rooms                    # статистика арены
 *
 * Адреса: TIO_CONTRACT (профили), TIO_ITEMS (предметы), TIO_ARENA (арена).
 */
import { TvmClient } from "@tvmsdk/core";
import { libNode } from "@tvmsdk/lib-node";
import { readFileSync, writeFileSync, existsSync } from "fs";

TvmClient.useBinaryLibrary(libNode);

const ENDPOINT = process.env.TIO_ENDPOINT || "https://shellnet.ackinacki.org/graphql";
const CONTRACT_ADDR = process.env.TIO_CONTRACT || "PASTE_PROFILES_ADDRESS_HERE";
const ITEMS_ADDR = process.env.TIO_ITEMS || "PASTE_ITEMS_ADDRESS_HERE";
const ARENA_ADDR = process.env.TIO_ARENA || "PASTE_ARENA_ADDRESS_HERE";
const ABI_PATH = new URL("./TIOProfiles.abi.json", import.meta.url).pathname;
const ITEMS_ABI_PATH = new URL("./TIOItems.abi.json", import.meta.url).pathname;
const ARENA_ABI_PATH = new URL("./TIOArena.abi.json", import.meta.url).pathname;
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
  } else {
    console.log("Профиль:  init | profile <ник> | battle <win|lose> <hash> | read");
    console.log("Предметы: items <code> | list <code> <кол-во> <цена> | unlist <lid> | buy <lid> <кол-во> | gift <pubkey> <code> <кол-во> | market");
    console.log("Арена:    room-create <1|2|4> <ставка> <naked> | room-join <id> | room-result <id> <winner> <hash> | room-timeout <id> | rooms");
  }
} catch (e) {
  console.error("❌ Ошибка:", e.message || e);
} finally {
  client.close();
}
