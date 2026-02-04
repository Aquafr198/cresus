"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";

type TradeDirection = "buy" | "sell";

export default function TradePage() {
  const toast = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  // Trade form state
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [selectedWallet, setSelectedWallet] = useState("");
  const [tokenMint, setTokenMint] = useState("");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("5");

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      setLoading(true);
      const walletsRes = await api.wallets.list();
      setWallets(walletsRes.data);
      if (walletsRes.data.length > 0) {
        setSelectedWallet(walletsRes.data[0].id);
      }
    } catch (e) {
      toast.error("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!selectedWallet || !tokenMint.trim() || !amount.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Invalid amount");
      return;
    }

    setExecuting(true);
    try {
      const res = await api.trading.swap({
        wallet_id: selectedWallet,
        token_mint: tokenMint,
        direction,
        amount: amountNum,
        slippage_bps: parseInt(slippage) * 100,
      });

      toast.success(
        `${direction === "buy" ? "Buy" : "Sell"} executed: ${res.data.signature.slice(0, 12)}...`
      );

      setTokenMint("");
      setAmount("");
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Trade execution failed");
      }
    } finally {
      setExecuting(false);
    }
  };

  const parentWallets = wallets.filter((w) => !w.parent_id);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Manual Trade</h1>
        <p className="text-gray-400 mt-1">
          Buy or sell tokens using Jupiter aggregator
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading wallets...</div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          {/* Direction Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Trade Direction
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setDirection("buy")}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  direction === "buy"
                    ? "bg-green-600 text-white shadow-lg"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                Buy (SOL → Token)
              </button>
              <button
                onClick={() => setDirection("sell")}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  direction === "sell"
                    ? "bg-red-600 text-white shadow-lg"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                Sell (Token → SOL)
              </button>
            </div>
          </div>

          {/* Wallet Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Wallet
            </label>
            <select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-sm"
            >
              {parentWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.public_key.slice(0, 8)}...{wallet.public_key.slice(-6)}
                  {wallet.name && ` - ${wallet.name}`}
                </option>
              ))}
            </select>
          </div>

          {/* Token Mint */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Token Mint Address
            </label>
            <input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Enter token mint address..."
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Amount */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount ({direction === "buy" ? "SOL" : "Tokens"})
            </label>
            <input
              type="number"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter ${direction === "buy" ? "SOL" : "token"} amount...`}
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Slippage */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Slippage Tolerance (%)
            </label>
            <div className="flex gap-3">
              {["1", "3", "5", "10"].map((val) => (
                <button
                  key={val}
                  onClick={() => setSlippage(val)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    slippage === val
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {val}%
                </button>
              ))}
              <input
                type="number"
                step="0.1"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm text-center focus:outline-none focus:border-indigo-500"
                placeholder="Custom"
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Trade Type:</span>
                <span className="text-white font-medium">
                  {direction === "buy" ? "Buy with SOL" : "Sell for SOL"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Slippage:</span>
                <span className="text-white">{slippage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Router:</span>
                <span className="text-indigo-400">Jupiter Aggregator</span>
              </div>
            </div>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecuteTrade}
            disabled={executing || !selectedWallet || !tokenMint.trim() || !amount.trim()}
            className={`w-full px-6 py-4 rounded-lg font-semibold text-lg transition-all ${
              direction === "buy"
                ? "bg-green-600 hover:bg-green-500"
                : "bg-red-600 hover:bg-red-500"
            } disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg hover:shadow-xl`}
          >
            {executing
              ? "Executing..."
              : direction === "buy"
              ? `Buy ${tokenMint ? tokenMint.slice(0, 8) + "..." : "Token"}`
              : `Sell ${tokenMint ? tokenMint.slice(0, 8) + "..." : "Token"}`}
          </button>
        </div>
      )}

      {/* Quick Guide */}
      <div className="mt-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h3 className="text-lg font-semibold mb-3">How to Use</h3>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex gap-3">
            <span className="text-indigo-400 font-bold">1.</span>
            <div>
              <p className="font-medium text-gray-300">Select trade direction</p>
              <p>Buy converts SOL to tokens, Sell converts tokens to SOL</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-indigo-400 font-bold">2.</span>
            <div>
              <p className="font-medium text-gray-300">Choose your wallet</p>
              <p>Select the wallet you want to trade from</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-indigo-400 font-bold">3.</span>
            <div>
              <p className="font-medium text-gray-300">Enter token address</p>
              <p>Paste the SPL token mint address you want to trade</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-indigo-400 font-bold">4.</span>
            <div>
              <p className="font-medium text-gray-300">Set amount and slippage</p>
              <p>Enter the amount and adjust slippage tolerance for price impact</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
