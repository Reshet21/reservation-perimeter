// SPDX-License-Identifier: MIT
pragma tvm-solidity >=0.76.1;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

/**
 * TIOProfiles — он-чейн реестр профилей игры TIO:Nacki
 * для блокчейна Acki Nacki (тестовая сеть Shellnet).
 *
 * Лёгкая он-чейн модель:
 *  - сам бой считается в клиенте (телефоне);
 *  - в контракт записываются результаты: рейтинг, победы/поражения,
 *    и hash последнего боя (анти-чит/проверяемость).
 *
 * Деплой создаёт новый Dapp ID (контракт = корень дапа).
 */
contract TIOProfiles {

    struct Profile {
        string  nick;
        uint32  rating;
        uint32  wins;
        uint32  losses;
        uint32  battles;
        uint64  lastBattleHash;
        uint32  updatedAt;
        bool    exists;
    }

    // pubkey игрока -> профиль
    mapping(uint256 => Profile) public profiles;
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
            totalPlayers++;
        }
        p.nick = nick;
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
        uint32 battles, uint64 lastBattleHash, uint32 updatedAt, bool exists
    ) {
        Profile p = profiles[pk];
        return (p.nick, p.rating, p.wins, p.losses,
                p.battles, p.lastBattleHash, p.updatedAt, p.exists);
    }

    function getStats() public view returns (uint32 players, uint32 battles) {
        return (totalPlayers, totalBattles);
    }
}
