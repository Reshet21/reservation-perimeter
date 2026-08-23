// SPDX-License-Identifier: MIT
pragma tvm-solidity >=0.76.1;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

/**
 * TIOItems — он-чейн предметы и рынок игры TIO:Nacki
 * для блокчейна Acki Nacki (Shellnet).
 *
 * Модель:
 *  - предметы взаимозаменяемы внутри типа (как стек в TIO-складе):
 *    itemCode = строковый код ("ak47", "vest2", "imp_acc"...)
 *  - баланс игрока: pubkey -> (itemCode -> количество)
 *  - кредиты: внутриигровая валюта, начисляется сервером игры
 *    (контрактом-владельцем) за победы
 *  - рынок: листинги «продаю N штук itemCode по цене P за штуку»,
 *    покупка переводит кредиты продавцу и предметы покупателю —
 *    свободная торговля между игроками, как аукцион в TIO.
 */
contract TIOItems {

    struct Listing {
        uint256 seller;     // pubkey продавца
        string  itemCode;
        uint32  amount;
        uint64  priceEach;  // в кредитах
        bool    active;
    }

    // владелец (геймсервер/деплоер) — может минтить предметы и кредиты
    uint256 static ownerKey;

    mapping(uint256 => mapping(uint256 => uint32)) items;   // pubkey -> hash(itemCode) -> count
    mapping(uint256 => uint64) public credits;              // pubkey -> кредиты
    mapping(uint64 => Listing) public listings;             // lid -> листинг
    uint64 public nextLid = 1;
    uint32 public totalListings;

    modifier onlySigned() {
        require(msg.pubkey() != 0, 101);
        tvm.accept();
        _;
    }
    modifier onlyOwner() {
        require(msg.pubkey() == ownerKey, 100);
        tvm.accept();
        _;
    }

    constructor(uint64 value) {
        require(tvm.pubkey() != 0, 102);
        tvm.accept();
        gosh.cnvrtshellq(value); // SHELL -> VMSHELL на газ (особенность Acki Nacki)
    }

    function codeHash(string itemCode) private pure returns (uint256) {
        return tvm.hash(abi.encode(itemCode));
    }

    // ---------- минт (награды за бой, покупки в NPC-магазине) ----------

    function mintItem(uint256 player, string itemCode, uint32 amount) public onlyOwner {
        items[player][codeHash(itemCode)] += amount;
    }

    function mintCredits(uint256 player, uint64 amount) public onlyOwner {
        credits[player] += amount;
    }

    /// Покупка в NPC-магазине: списать кредиты, выдать предмет
    function npcBuy(string itemCode, uint64 price, uint32 amount) public onlySigned {
        uint256 pk = msg.pubkey();
        uint64 total = price * amount;
        require(credits[pk] >= total, 201);
        credits[pk] -= total;
        items[pk][codeHash(itemCode)] += amount;
    }

    /// Продажа скупщику (50% цены задаётся клиентом-сервером через owner... упрощённо: фикс)
    function npcSell(string itemCode, uint64 priceEach, uint32 amount) public onlySigned {
        uint256 pk = msg.pubkey();
        uint256 h = codeHash(itemCode);
        require(items[pk][h] >= amount, 202);
        items[pk][h] -= amount;
        credits[pk] += priceEach * amount;
    }

    // ---------- рынок игроков (свободная торговля) ----------

    /// Выставить предметы на продажу (эскроу: предметы блокируются в контракте)
    function listItem(string itemCode, uint32 amount, uint64 priceEach) public onlySigned returns (uint64 lid) {
        uint256 pk = msg.pubkey();
        uint256 h = codeHash(itemCode);
        require(amount > 0 && priceEach > 0, 203);
        require(items[pk][h] >= amount, 202);
        items[pk][h] -= amount; // эскроу
        lid = nextLid++;
        listings[lid] = Listing(pk, itemCode, amount, priceEach, true);
        totalListings++;
    }

    /// Снять листинг — предметы возвращаются продавцу
    function unlist(uint64 lid) public onlySigned {
        Listing lst = listings[lid];
        require(lst.active, 204);
        require(lst.seller == msg.pubkey(), 205);
        items[lst.seller][codeHash(lst.itemCode)] += lst.amount;
        lst.active = false;
        listings[lid] = lst;
        totalListings--;
    }

    /// Купить у другого игрока
    function buy(uint64 lid, uint32 amount) public onlySigned {
        uint256 pk = msg.pubkey();
        Listing lst = listings[lid];
        require(lst.active, 204);
        require(amount > 0 && amount <= lst.amount, 206);
        uint64 total = lst.priceEach * amount;
        require(credits[pk] >= total, 201);
        credits[pk] -= total;
        credits[lst.seller] += total;
        items[pk][codeHash(lst.itemCode)] += amount;
        lst.amount -= amount;
        if (lst.amount == 0) { lst.active = false; totalListings--; }
        listings[lid] = lst;
    }

    /// Прямой перевод предмета другу
    function transferItem(uint256 to, string itemCode, uint32 amount) public onlySigned {
        uint256 pk = msg.pubkey();
        uint256 h = codeHash(itemCode);
        require(items[pk][h] >= amount, 202);
        items[pk][h] -= amount;
        items[to][h] += amount;
    }

    function topUp(uint64 value) public pure {
        tvm.accept();
        gosh.cnvrtshellq(value);
    }

    // ---------- get-методы (бесплатно, off-chain) ----------

    function getBalance(uint256 player, string itemCode) public view returns (uint32 count, uint64 creditBalance) {
        return (items[player][codeHash(itemCode)], credits[player]);
    }

    function getListing(uint64 lid) public view returns (
        uint256 seller, string itemCode, uint32 amount, uint64 priceEach, bool active
    ) {
        Listing l = listings[lid];
        return (l.seller, l.itemCode, l.amount, l.priceEach, l.active);
    }

    function getMarketStats() public view returns (uint64 lids, uint32 active) {
        return (nextLid - 1, totalListings);
    }
}
