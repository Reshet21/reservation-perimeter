// SPDX-License-Identifier: MIT
pragma tvm-solidity >=0.76.1;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

/**
 * PerimeterArena — он-чейн комнаты PvP-боёв Reservation: Perimeter (комнаты PvP).
 * Режимы: 1x1, 2x2, 4x4. Ставки в кредитах (эскроу в контракте PerimeterItems
 * упрощён до внутреннего учёта кредитов арены).
 *
 * Поток:
 *  1) createRoom(mode, stake)  — хозяин открывает комнату, ставка в эскроу
 *  2) joinRoom(roomId)         — гость заходит, его ставка в эскроу
 *  3) commitResult(roomId, winner, battleHash) — оба игрока подписывают
 *     одинаковый результат (2 подписи = финал); победитель получает банк
 *  4) cancelRoom(roomId)       — хозяин может закрыть пустую комнату
 *
 * Для честности commitResult требует совпадающего battleHash от обоих:
 * клиенты обоих игроков детерминированно реплеят бой по логу ходов.
 */
contract PerimeterArena {

    uint8 constant MODE_1X1 = 1;
    uint8 constant MODE_2X2 = 2;
    uint8 constant MODE_4X4 = 4;
    uint32 constant ROOM_TIMEOUT = 3600; // 1 час на бой после входа гостя

    struct Room {
        uint256 host;
        uint256 guest;
        uint8   mode;        // 1 / 2 / 4 бойцов на сторону
        uint64  stake;
        bool    naked;       // «голый» бой без экипировки
        uint8   state;       // 0 нет, 1 открыта, 2 в бою, 3 закрыта
        uint64  deadline;    // после него timeoutRoom() возвращает ставки
        // подтверждения результата
        uint256 hostClaimWinner;
        uint256 guestClaimWinner;
        uint64  hostHash;
        uint64  guestHash;
    }

    mapping(uint64 => Room) public rooms;
    mapping(uint256 => uint64) public balance;   // кредиты игрока в арене
    uint64 public nextRoomId = 1;
    uint32 public openRooms;

    modifier onlySigned() {
        require(msg.pubkey() != 0, 101);
        tvm.accept();
        _;
    }

    constructor(uint64 value) {
        require(tvm.pubkey() != 0, 100);
        tvm.accept();
        gosh.cnvrtshellq(value);
    }

    /// Пополнить арену кредитами (в проде — перевод из PerimeterItems)
    function deposit(uint64 amount) public onlySigned {
        balance[msg.pubkey()] += amount;
    }

    function createRoom(uint8 mode, uint64 stake, bool naked) public onlySigned returns (uint64 roomId) {
        require(mode == MODE_1X1 || mode == MODE_2X2 || mode == MODE_4X4, 201);
        uint256 pk = msg.pubkey();
        require(balance[pk] >= stake, 202);
        balance[pk] -= stake; // эскроу
        roomId = nextRoomId++;
        Room r;
        r.host = pk; r.mode = mode; r.stake = stake; r.naked = naked; r.state = 1;
        rooms[roomId] = r;
        openRooms++;
    }

    function joinRoom(uint64 roomId) public onlySigned {
        Room r = rooms[roomId];
        require(r.state == 1, 203);
        uint256 pk = msg.pubkey();
        require(pk != r.host, 204);
        require(balance[pk] >= r.stake, 202);
        balance[pk] -= r.stake; // эскроу гостя
        r.guest = pk; r.state = 2;
        r.deadline = block.timestamp + ROOM_TIMEOUT; // дедлайн на результат
        rooms[roomId] = r;
        openRooms--;
    }

    function cancelRoom(uint64 roomId) public onlySigned {
        Room r = rooms[roomId];
        require(r.state == 1, 203);
        require(r.host == msg.pubkey(), 205);
        balance[r.host] += r.stake; // возврат эскроу
        r.state = 3;
        rooms[roomId] = r;
        openRooms--;
    }

    /// ТАЙМАУТ: если бой не завершён двумя подписями за отведённое время,
    /// ставки возвращаются обоим. Чинит дедлок: молчание/спор второй стороны
    /// больше не замораживает банк навсегда.
    function timeoutRoom(uint64 roomId) public onlySigned {
        Room r = rooms[roomId];
        require(r.state == 2, 206);
        require(block.timestamp > r.deadline, 210);
        balance[r.host] += r.stake;   // возврат обоим — спор решается вне цепи
        balance[r.guest] += r.stake;
        r.state = 3;
        rooms[roomId] = r;
    }

    /// Оба игрока отправляют результат; при совпадении — расчёт банка
    function commitResult(uint64 roomId, uint256 winner, uint64 battleHash) public onlySigned {
        Room r = rooms[roomId];
        require(r.state == 2, 206);
        uint256 pk = msg.pubkey();
        require(pk == r.host || pk == r.guest, 207);
        require(winner == r.host || winner == r.guest, 208);
        if (pk == r.host) { r.hostClaimWinner = winner; r.hostHash = battleHash; }
        else { r.guestClaimWinner = winner; r.guestHash = battleHash; }
        // финал: оба подтвердили одинаково
        if (r.hostClaimWinner != 0 && r.hostClaimWinner == r.guestClaimWinner
            && r.hostHash == r.guestHash) {
            balance[r.hostClaimWinner] += r.stake * 2; // банк победителю
            r.state = 3;
        }
        rooms[roomId] = r;
    }

    function topUp(uint64 value) public pure {
        tvm.accept();
        gosh.cnvrtshellq(value);
    }

    // ---------- get-методы ----------

    function getRoom(uint64 roomId) public view returns (
        uint256 host, uint256 guest, uint8 mode, uint64 stake,
        bool naked, uint8 state, uint64 deadline
    ) {
        Room r = rooms[roomId];
        return (r.host, r.guest, r.mode, r.stake, r.naked, r.state, r.deadline);
    }

    function getArenaStats() public view returns (uint64 totalRooms, uint32 open) {
        return (nextRoomId - 1, openRooms);
    }

    function getBalance(uint256 player) public view returns (uint64) {
        return balance[player];
    }
}
