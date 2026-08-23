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

    /// Создать/обновить профиль игрока (вызывается внешним подписанным сообщением)
    function upsertProfile(string nick, uint32 rating) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        if (!p.exists) {
            p.exists = true;
            totalPlayers++;
        }
        p.nick = nick;
        p.rating = rating;
        p.updatedAt = block.timestamp;
        profiles[pk] = p;
    }

    /// Записать результат боя
    function reportBattle(
        bool win,
        uint32 newRating,
        uint64 battleHash
    ) public onlySigned {
        uint256 pk = msg.pubkey();
        Profile p = profiles[pk];
        require(p.exists, 102);
        if (win) { p.wins++; } else { p.losses++; }
        p.battles++;
        p.rating = newRating;
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
