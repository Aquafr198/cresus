"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import { MemeAsset, MemeMetadataTemplate } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function MemeLibraryPage() {
  const [assets, setAssets] = useState<MemeAsset[]>([]);
  const [metadata, setMetadata] = useState<MemeMetadataTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"assets" | "metadata">("assets");

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Pinning
  const [pinning, setPinning] = useState<string | null>(null);

  // Delete confirmation state (shared shape for asset + metadata). Pre-
  // refactor delete fired immediately on click — there is no undo on the
  // IPFS pin nor on a metadata template referenced by mints already
  // deployed, so a misclick was permanently destructive.
  const [confirmDelete, setConfirmDelete] = useState<
    null | { kind: "asset" | "metadata"; id: string; label: string }
  >(null);

  // Metadata form
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaSymbol, setMetaSymbol] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaImageId, setMetaImageId] = useState("");
  const [creatingMeta, setCreatingMeta] = useState(false);

  // JSON preview
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [pinningMeta, setPinningMeta] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [assetsRes, metaRes] = await Promise.all([
        api.memeLibrary.listAssets(),
        api.memeLibrary.listMetadata(),
      ]);
      setAssets(assetsRes.data);
      setMetadata(metaRes.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.memeLibrary.uploadAsset(file);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await api.memeLibrary.deleteAsset(id);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setConfirmDelete(null);
    }
  };
  const requestDeleteAsset = (a: MemeAsset) => {
    setConfirmDelete({
      kind: "asset",
      id: a.id,
      label: a.filename ?? a.id.slice(0, 8),
    });
  };

  const handlePinAsset = async (id: string) => {
    setPinning(id);
    setError(null);
    try {
      await api.memeLibrary.pinAsset(id);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setPinning(null);
    }
  };

  const handleCreateMetadata = async () => {
    if (!metaName.trim() || !metaSymbol.trim()) return;
    setCreatingMeta(true);
    setError(null);
    try {
      await api.memeLibrary.createMetadata({
        name: metaName.trim(),
        symbol: metaSymbol.trim(),
        description: metaDesc.trim() || undefined,
        image_asset_id: metaImageId || undefined,
      });
      setMetaName("");
      setMetaSymbol("");
      setMetaDesc("");
      setMetaImageId("");
      setShowMetaForm(false);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setCreatingMeta(false);
    }
  };

  const handleDeleteMetadata = async (id: string) => {
    try {
      await api.memeLibrary.deleteMetadata(id);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setConfirmDelete(null);
    }
  };
  const requestDeleteMetadata = (m: MemeMetadataTemplate) => {
    setConfirmDelete({
      kind: "metadata",
      id: m.id,
      label: m.name ?? m.symbol ?? m.id.slice(0, 8),
    });
  };

  const handlePreviewJson = async (id: string) => {
    try {
      const res = await api.memeLibrary.generateJson(id);
      setPreviewJson(JSON.stringify(res.data, null, 2));
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  };

  const handlePinMetadata = async (id: string) => {
    setPinningMeta(id);
    setError(null);
    try {
      const res = await api.memeLibrary.pinMetadataJson(id);
      setPreviewJson(`Pinned! URI: ${res.data.uri}\nCID: ${res.data.cid}`);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setPinningMeta(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Meme Library</h1>

      {confirmDelete && (
        <ConfirmDialog
          title={
            confirmDelete.kind === "asset"
              ? "Delete asset"
              : "Delete metadata template"
          }
          message={
            confirmDelete.kind === "asset"
              ? `Permanently delete the asset "${confirmDelete.label}"? Any token using this image in its on-chain metadata will keep working, but the source file is gone and cannot be re-uploaded automatically.`
              : `Permanently delete the metadata template "${confirmDelete.label}"? Already-minted tokens that reference its JSON URI keep working; new mints that depend on this template will fail.`
          }
          variant="danger"
          confirmText="Delete"
          onConfirm={() => {
            if (confirmDelete.kind === "asset") {
              void handleDeleteAsset(confirmDelete.id);
            } else {
              void handleDeleteMetadata(confirmDelete.id);
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab("assets")}
          className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
            tab === "assets"
              ? "bg-gray-800 text-white border-b-2 border-indigo-500"
              : "bg-gray-900 text-gray-400 hover:text-white"
          }`}
        >
          Assets ({assets.length})
        </button>
        <button
          onClick={() => setTab("metadata")}
          className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
            tab === "metadata"
              ? "bg-gray-800 text-white border-b-2 border-indigo-500"
              : "bg-gray-900 text-gray-400 hover:text-white"
          }`}
        >
          Metadata ({metadata.length})
        </button>
      </div>

      {/* Assets Tab */}
      {tab === "assets" && (
        <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Image Assets</h2>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                id="asset-upload"
              />
              <label
                htmlFor="asset-upload"
                className={`px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors ${
                  uploading
                    ? "bg-gray-700 text-gray-400"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {uploading ? "Uploading..." : "+ Upload Image"}
              </label>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : assets.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No assets uploaded yet. Upload an image to get started.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {assets.map((a) => (
                <div
                  key={a.id}
                  className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
                >
                  <div className="aspect-square bg-gray-950 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={api.memeLibrary.serveAssetUrl(a.id)}
                      alt={a.filename}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-sm font-medium truncate">
                      {a.filename}
                    </div>
                    <div className="text-xs text-gray-500">{a.mime_type}</div>
                    {a.ipfs_cid && (
                      <div className="text-xs text-emerald-400 truncate mt-1">
                        IPFS: {a.ipfs_cid}
                      </div>
                    )}
                    <div className="flex gap-1 mt-2">
                      {!a.ipfs_cid && (
                        <button
                          onClick={() => handlePinAsset(a.id)}
                          disabled={pinning === a.id}
                          className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors disabled:opacity-50"
                        >
                          {pinning === a.id ? "Pinning..." : "Pin to IPFS"}
                        </button>
                      )}
                      <button
                        onClick={() => requestDeleteAsset(a)}
                        className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Metadata Tab */}
      {tab === "metadata" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Metadata Templates</h2>
                <button
                  onClick={() => setShowMetaForm(!showMetaForm)}
                  className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                  {showMetaForm ? "Cancel" : "+ New Template"}
                </button>
              </div>

              {/* Create Form */}
              {showMetaForm && (
                <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Name
                      </label>
                      <input
                        value={metaName}
                        onChange={(e) => setMetaName(e.target.value)}
                        placeholder="Token Name"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Symbol
                      </label>
                      <input
                        value={metaSymbol}
                        onChange={(e) => setMetaSymbol(e.target.value)}
                        placeholder="TKN"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Description
                    </label>
                    <textarea
                      value={metaDesc}
                      onChange={(e) => setMetaDesc(e.target.value)}
                      placeholder="Token description..."
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Image Asset
                    </label>
                    {assets.length === 0 ? (
                      <p className="text-yellow-500 text-xs">
                        Upload an image asset first.
                      </p>
                    ) : (
                      <select
                        value={metaImageId}
                        onChange={(e) => setMetaImageId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">None</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.filename}
                            {a.ipfs_cid ? " (pinned)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    onClick={handleCreateMetadata}
                    disabled={
                      creatingMeta || !metaName.trim() || !metaSymbol.trim()
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm transition-colors"
                  >
                    {creatingMeta ? "Creating..." : "Create Template"}
                  </button>
                </div>
              )}

              {metadata.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No metadata templates yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {metadata.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">
                            {m.name}
                          </span>
                          <span className="text-gray-400 text-sm ml-2">
                            ({m.symbol})
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handlePreviewJson(m.id)}
                            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                          >
                            Preview JSON
                          </button>
                          <button
                            onClick={() => handlePinMetadata(m.id)}
                            disabled={pinningMeta === m.id}
                            className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors disabled:opacity-50"
                          >
                            {pinningMeta === m.id ? "Pinning..." : "Pin JSON"}
                          </button>
                          <button
                            onClick={() => requestDeleteMetadata(m)}
                            className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {m.description && (
                        <p className="text-xs text-gray-500 mt-1">
                          {m.description}
                        </p>
                      )}
                      {m.image_asset_id && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Image: {m.image_asset_id.slice(0, 8)}...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* JSON Preview */}
          <div>
            <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">JSON Preview</h2>
              {previewJson ? (
                <pre className="text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">
                  {previewJson}
                </pre>
              ) : (
                <p className="text-gray-500 text-sm">
                  Select a template to preview its Metaplex-compatible JSON.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
