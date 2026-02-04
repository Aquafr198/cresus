"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function WalletsPage() {
  const toast = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  } | null>(null);

  // Subwallet modal state
  const [subwalletTarget, setSubwalletTarget] = useState<string | null>(null);
  const [subwalletCount, setSubwalletCount] = useState(5);
  const [creatingSubwallets, setCreatingSubwallets] = useState(false);

  // Export modal state
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportPasswordPrompt, setExportPasswordPrompt] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState("");
  const [showExportedKey, setShowExportedKey] = useState(false);
  const [keyDismissCountdown, setKeyDismissCountdown] = useState<number | null>(null);

  // Balance modal state
  const [balanceWallet, setBalanceWallet] = useState<string | null>(null);
  const [balanceData, setBalanceData] = useState<{ lamports: number; sol: number; tokens: Array<{ mint: string; amount: number; account: string }> } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Send modal state
  const [sendWallet, setSendWallet] = useState<string | null>(null);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    try {
      setError(null);
      const res = await api.wallets.list();
      setWallets(res.data);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Failed to fetch wallets");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  // Auto-dismiss exported key after 30 seconds
  useEffect(() => {
    if (exportedKey && showExportedKey) {
      setKeyDismissCountdown(30);
      const interval = setInterval(() => {
        setKeyDismissCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            setExportedKey(null);
            setShowExportedKey(false);
            setKeyDismissCountdown(null);
            toast.info("Exported key dismissed for security");
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setKeyDismissCountdown(null);
    }
  }, [exportedKey, showExportedKey, toast]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.wallets.create(newName || undefined);
      setNewName("");
      await fetchWallets();
      toast.success("Wallet created successfully!");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePrompt = (id: string) => {
    setConfirmDialog({
      title: "Delete Wallet",
      message: "Are you sure you want to delete this wallet? This action cannot be undone.",
      variant: "danger",
      onConfirm: () => handleDeleteConfirm(id),
    });
  };

  const handleDeleteConfirm = async (id: string) => {
    setConfirmDialog(null);
    try {
      await api.wallets.delete(id);
      await fetchWallets();
      toast.success("Wallet deleted successfully");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
    }
  };

  const handleCreateSubwallets = async () => {
    if (!subwalletTarget) return;
    setCreatingSubwallets(true);
    try {
      await api.wallets.createSubwallets(subwalletTarget, subwalletCount);
      setSubwalletTarget(null);
      await fetchWallets();
      toast.success(`${subwalletCount} sub-wallets created successfully!`);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
    } finally {
      setCreatingSubwallets(false);
    }
  };

  const handleExportPrompt = (id: string) => {
    setExportPasswordPrompt(id);
    setExportPassword("");
  };

  const handleExport = async () => {
    if (!exportPasswordPrompt || exportPassword.length < 8) return;
    setExporting(exportPasswordPrompt);
    try {
      const res = await api.wallets.export(exportPasswordPrompt, exportPassword);
      setExportedKey(JSON.stringify(res.data.encrypted_key, null, 2));
      setShowExportedKey(false);
      setExportPasswordPrompt(null);
      setExportPassword("");
      toast.success("Secret key exported successfully!");
      // Auto-dismiss after 30 seconds
      setTimeout(() => setExportedKey(null), 30000);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
    } finally {
      setExporting(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const handleViewBalance = async (id: string) => {
    setBalanceWallet(id);
    setLoadingBalance(true);
    setBalanceData(null);
    try {
      const res = await api.wallets.balance(id);
      setBalanceData(res.data);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
      setBalanceWallet(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleSendPrompt = (id: string) => {
    setSendWallet(id);
    setSendRecipient("");
    setSendAmount("");
    setSendResult(null);
  };

  const handleSend = async () => {
    if (!sendWallet || !sendRecipient || !sendAmount) return;

    // Validate amount format
    const amountNum = parseFloat(sendAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Invalid amount");
      toast.error("Invalid amount");
      return;
    }

    // Validate SOL amount is reasonable (not more than 9 decimal places)
    const decimals = sendAmount.split('.')[1]?.length || 0;
    if (decimals > 9) {
      setError("SOL can have at most 9 decimal places");
      toast.error("SOL can have at most 9 decimal places");
      return;
    }

    // Confirmation for large amounts (> 1 SOL)
    if (amountNum > 1.0) {
      setConfirmDialog({
        title: "Confirm Large Transaction",
        message: `You are about to send ${amountNum} SOL to ${sendRecipient.slice(0, 8)}...${sendRecipient.slice(-8)}.\n\nThis is a large amount. Are you sure you want to proceed?`,
        variant: "warning",
        onConfirm: () => {
          setConfirmDialog(null);
          executeSend();
        },
      });
      return;
    }

    await executeSend();
  };

  const executeSend = async () => {
    if (!sendWallet || !sendRecipient || !sendAmount) return;

    setSending(true);
    try {
      // Convert SOL to lamports safely using string manipulation
      const [whole, fraction = ""] = sendAmount.split(".");
      const paddedFraction = fraction.padEnd(9, "0").slice(0, 9);
      const lamports = parseInt(whole) * 1_000_000_000 + parseInt(paddedFraction || "0");

      const res = await api.wallets.send(sendWallet, sendRecipient, lamports);
      setSendResult(res.data.signature);
      setSendRecipient("");
      setSendAmount("");
      toast.success("Transaction sent successfully!");
      // Increased timeout to 15 seconds for user to copy signature
      setTimeout(() => {
        setSendWallet(null);
        setSendResult(null);
      }, 15000);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        toast.error(e.message);
      }
    } finally {
      setSending(false);
    }
  };

  const parentWallets = wallets.filter((w) => !w.parent_id);
  const getChildren = (parentId: string) =>
    wallets.filter((w) => w.parent_id === parentId);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Wallet Manager</h1>
          <p className="text-gray-400 mt-1">
            {wallets.length} wallet{wallets.length !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create wallet form */}
      <div className="mb-8 p-4 rounded-xl bg-gray-900 border border-gray-800">
        <h2 className="text-lg font-semibold mb-3">Create New Wallet</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Wallet name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {creating ? "Creating..." : "Create Wallet"}
          </button>
        </div>
      </div>

      {/* Wallet list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading wallets...</div>
      ) : parentWallets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No wallets yet. Create one above.
        </div>
      ) : (
        <div className="space-y-3">
          {parentWallets.map((wallet) => {
            const children = getChildren(wallet.id);
            return (
              <div
                key={wallet.id}
                className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden"
              >
                {/* Parent wallet row */}
                <div className="p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {wallet.public_key.slice(0, 4)}...
                        {wallet.public_key.slice(-4)}
                      </span>
                      {wallet.name && (
                        <span className="font-medium">{wallet.name}</span>
                      )}
                      {children.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {children.length} sub-wallet
                          {children.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 font-mono truncate">
                      {wallet.public_key}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewBalance(wallet.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-green-400 transition-colors"
                      title="View balance"
                    >
                      Balance
                    </button>
                    <button
                      onClick={() => handleSendPrompt(wallet.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 transition-colors"
                      title="Send SOL"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => copyToClipboard(wallet.public_key)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      title="Copy public key"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleExportPrompt(wallet.id)}
                      disabled={exporting === wallet.id}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 transition-colors"
                      title="Export secret key"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => {
                        setSubwalletTarget(wallet.id);
                        setSubwalletCount(5);
                      }}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-indigo-400 transition-colors"
                    >
                      + Sub-wallets
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(wallet.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-red-900/50 text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Children */}
                {children.length > 0 && (
                  <div className="border-t border-gray-800">
                    {children.map((child) => (
                      <div
                        key={child.id}
                        className="px-4 py-2.5 flex items-center justify-between pl-10 border-b border-gray-800/50 last:border-b-0 bg-gray-900/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">|-</span>
                            <span className="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                              {child.public_key.slice(0, 4)}...
                              {child.public_key.slice(-4)}
                            </span>
                            {child.name && (
                              <span className="text-sm text-gray-300">
                                {child.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => copyToClipboard(child.public_key)}
                            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => handleDeletePrompt(child.id)}
                            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900/50 text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Subwallet modal */}
      {subwalletTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Generate Sub-wallets</h3>
            <label className="block text-sm text-gray-400 mb-2">
              Number of sub-wallets
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={subwalletCount}
              onChange={(e) => setSubwalletCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSubwalletTarget(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubwallets}
                disabled={creatingSubwallets}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
              >
                {creatingSubwallets ? "Creating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export password prompt modal */}
      {exportPasswordPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold mb-2 text-amber-400">
              Export Secret Key
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter a password to encrypt the exported key. You will need this
              password to decrypt and use the key later.
            </p>
            <input
              type="password"
              placeholder="Export password (min 8 characters)"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExport()}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setExportPasswordPrompt(null);
                  setExportPassword("");
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exportPassword.length < 8 || exporting !== null}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-medium transition-colors"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export key result modal */}
      {exportedKey && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[480px]">
            <h3 className="text-lg font-semibold mb-2 text-amber-400">
              Encrypted Secret Key
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              This key is encrypted with your export password. Store it safely.
              {keyDismissCountdown !== null && showExportedKey && (
                <span className="ml-1 font-semibold text-amber-500">
                  Auto-dismisses in {keyDismissCountdown}s
                </span>
              )}
            </p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4 font-mono text-xs break-all text-gray-200 max-h-48 overflow-y-auto">
              {showExportedKey ? exportedKey : "••••••••••••••••••••••••"}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setShowExportedKey(!showExportedKey)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors text-sm"
              >
                {showExportedKey ? "Hide" : "Show"}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => copyToClipboard(exportedKey)}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => setExportedKey(null)}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance modal */}
      {balanceWallet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold mb-4 text-green-400">
              Wallet Balance
            </h3>
            {loadingBalance ? (
              <div className="text-center py-8 text-gray-400">
                Loading balance...
              </div>
            ) : balanceData ? (
              <div>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-1">SOL Balance</div>
                  <div className="text-2xl font-bold text-green-400">
                    {balanceData.sol.toFixed(9)} SOL
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-1">
                    {balanceData.lamports.toLocaleString()} lamports
                  </div>
                </div>
                {balanceData.tokens.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Token Balances</div>
                    <div className="space-y-2">
                      {balanceData.tokens.map((token) => (
                        <div
                          key={token.account}
                          className="bg-gray-800 rounded-lg p-3"
                        >
                          <div className="text-xs text-gray-500 font-mono mb-1">
                            {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                          </div>
                          <div className="text-sm font-medium">
                            {token.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Failed to load balance
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setBalanceWallet(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send modal */}
      {sendWallet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[480px]">
            <h3 className="text-lg font-semibold mb-4 text-blue-400">
              Send SOL
            </h3>
            {sendResult ? (
              <div>
                <div className="mb-4 px-4 py-3 rounded-lg bg-green-900/30 border border-green-800 text-green-300">
                  Transaction sent successfully!
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-400 mb-2">Transaction Signature</div>
                  <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs break-all text-gray-200">
                    {sendResult}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => copyToClipboard(sendResult)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Copy Signature
                  </button>
                  <button
                    onClick={() => {
                      setSendWallet(null);
                      setSendResult(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    placeholder="Solana address"
                    value={sendRecipient}
                    onChange={(e) => setSendRecipient(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Amount (SOL)
                  </label>
                  <input
                    type="number"
                    step="0.000000001"
                    placeholder="0.0"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSendWallet(null)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !sendRecipient || !sendAmount}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {sending ? "Sending..." : "Send SOL"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
