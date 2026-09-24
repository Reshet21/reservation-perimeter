// SPDX-License-Identifier: MIT
pragma tvm-solidity >=0.76.1;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

/**
 * PerimeterProfiles — он-чейн реестр профилей игры Reservation: Perimeter
 * для блокчейна Acki Nacki (тестовая сеть Shellnet).
 *
 * Лёгкая он-чейн модель:
 *  - сам бой считается в клиенте (телефоне);
 *  - в контракт записываются результаты: рейтинг, победы/поражения,
 *    и hash последнего боя (анти-чит/проверяемость).
 *
 * Деплой создаёт новый Dapp ID (контракт = корень дапа).
 */
contract PerimeterProfiles {

    struct Profile {
        string  nick;
        uint32  rating;
        uint32  wins;
        uint32  losses;
        uint32  battles;
        uint64  lastBattleHash;
        uint32  updatedAt;
        bool    exists;
        string  walletAddr; // адрес AN Wallet владельца (привязка кошелёк↔профиль)
        string  saveBlob;   // облачный сейв (JSON игры, до 32 КБ)
        uint32  saveUpdatedAt;
    }

    // pubkey игрока -> профиль
    mapping(uint256 => Profile) public profiles;
    // перечисление игроков для он-чейн топа (mapping не итерируется)
    uint256[] public playerKeys;
    uint32 public totalPlayers;
    uint32 public totalBattles;

    modifier onlySigned() {
        require(msg.pubkey() != 0, 101);
        tvm.accept();
        _;
    }

    constructor(uint64 value) {
        require(tvm.pubkey() != 0, 100);
        tvm.accept();
        // конвертируем SHELL -> VMSHELL для оплаты газа (особенность Acki Nacki)
        gosh.cnvrtshellq(value);
    }

    /// Создать профиль (первый раз — рейтинг 1000) или переименовать себя.
    /// Рейтинг НИКОГДА не принимается от клиента — только внутренняя математика.
    function createProfile(string nick) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        if (!p.exists) {
            p.exists = true;
            p.rating = 1000;
            playerKeys.push(pk);
            totalPlayers++;
        }
        p.nick = nick;
        p.updatedAt = block.timestamp;
        profiles[pk] = p;
    }

    /// Привязать AN Wallet к своему профилю (адрес вида hex::hex).
    /// Только владелец профиля; перепривязка разрешена (смена кошелька).
    function bindWallet(string walletAddr) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        require(p.exists, 102);
        uint256 len = bytes(walletAddr).length;
        require(len >= 8 && len <= 256, 105);
        p.walletAddr = walletAddr;
        p.updatedAt = block.timestamp;
        profiles[pk] = p;
    }

    /// Облачный сейв: перезаписать свой blob (JSON игры, лимит 32 КБ).
    /// Хранится он-чейн и привязан к pubkey; выгрузить можно с любого устройства.
    function saveGame(string blob) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        require(p.exists, 102);
        require(bytes(blob).length <= 32768, 106);
        p.saveBlob = blob;
        p.saveUpdatedAt = block.timestamp;
        p.updatedAt = block.timestamp;
        profiles[pk] = p;
    }

    /// Записать результат боя. Рейтинг считает КОНТРАКТ: +25 победа / −15 поражение.
    /// Анти-реплей: тот же battleHash повторно принять нельзя.
    function reportBattle(
        bool win,
        uint64 battleHash
    ) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        require(p.exists, 102);
        require(battleHash != 0, 103);
        require(battleHash != p.lastBattleHash, 104); // анти-переигрывание
        if (win) { p.wins++; p.rating += 25; }
        else {
            p.losses++;
            p.rating = p.rating > 15 ? p.rating - 15 : 0;
        }
        p.battles++;
        p.lastBattleHash = battleHash;
        p.updatedAt = block.timestamp;
        profiles[pk] = p;
        totalBattles++;
    }

    /// Пополнение газа: любой может докинуть SHELL и сконвертировать
    function topUp(uint64 value) public pure {
        tvm.accept();
        gosh.cnvrtshellq(value);
    }

    // ----- get-методы (бесплатные, off-chain) -----

    function getProfile(uint256 pk) public view returns (
        string nick, uint32 rating, uint32 wins, uint32 losses,
        uint32 battles, uint64 lastBattleHash, uint32 updatedAt, bool exists,
        string walletAddr
    ) {
        Profile p = profiles[pk];
        return (p.nick, p.rating, p.wins, p.losses,
                p.battles, p.lastBattleHash, p.updatedAt, p.exists,
                p.walletAddr);
    }

    /// Срез ключей игроков для он-чейн топа/списка (листать offset/limit).
    function getPlayers(uint32 offset, uint32 limit) public view returns (uint256[] keys) {
        uint256 total = playerKeys.length;
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 n = limit;
        if (offset + limit > total) n = total - offset;
        keys = new uint256[](n);
        for (uint256 i = 0; i < n; i++) keys[i] = playerKeys[offset + i];
    }

    /// Облачный сейв профиля (blob + время записи).
    function getSave(uint256 pk) public view returns (string blob, uint32 updatedAt) {
        Profile p = profiles[pk];
        return (p.saveBlob, p.saveUpdatedAt);
    }

    function getStats() public view returns (uint32 players, uint32 battles) {
        return (totalPlayers, totalBattles);
    }
}
