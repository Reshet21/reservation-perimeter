// SPDX-License-Identifier: MIT
pragma tvm-solidity >=0.76.1;
pragma AbiHeader expire;
pragma AbiHeader pubkey;

contract TestContract {
    uint256 public value;
    
    constructor(uint256 _value) {
        require(tvm.pubkey() != 0, 100);
        tvm.accept();
        value = _value;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}