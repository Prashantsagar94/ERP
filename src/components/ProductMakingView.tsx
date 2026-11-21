import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Factory,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  BomMaterial,
  Hub,
  ProductCategory,
  ProductFormula,
  ProductionBatch,
} from '../types/erp';
import { computeProductMakingMetrics, formatInr } from '../utils/erpEngine';

interface ProductMakingViewProps {
  products: ProductFormula[];
  batches: ProductionBatch[];
  hubs: Hub[];
  onSaveProduct: (product: ProductFormula) => void;
  onDeleteProduct: (productId: string) => void;
  onRunProductionBatch: (payload: {
    productId: string;
    hubId: string;
    quantityProduced: number;
  }) => void;
}

export const ProductMakingView: React.FC<ProductMakingViewProps> = ({
  products,
  batches,
  hubs,
  onSaveProduct,
  onDeleteProduct,
  onRunProductionBatch,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.productId ?? '');
  const [isCreating, setIsCreating] = useState(false);

  // New / Edit Product Formula state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>(ProductCategory.LAUNDRY_SERVICE);
  const [unitType, setUnitType] = useState('Kg');
  const [sellingPrice, setSellingPrice] = useState('199');
  const [turnaroundHours, setTurnaroundHours] = useState('24');
  const [isPublished, setIsPublished] = useState(true);
  const [materials, setMaterials] = useState<BomMaterial[]>([
    { materialId: 'new_m1', name: 'Bio-Enzymatic Wash Concentrate', unit: 'ml', quantityPerUnit: 30, unitCost: 0.5 },
    { materialId: 'new_m2', name: 'Moisture-Guard QR Bag', unit: 'pcs', quantityPerUnit: 1, unitCost: 9 },
  ]);

  // Production Batch runner state
  const [batchHubId, setBatchHubId] = useState(hubs[0]?.hubId ?? '');
  const [batchQty, setBatchQty] = useState('50');
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.productId === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );

  const loadForEdit = (product: ProductFormula) => {
    setSelectedProductId(product.productId);
    setIsCreating(false);
    setSku(product.sku);
    setName(product.name);
    setCategory(product.category);
    setUnitType(product.unitType);
    setSellingPrice(String(product.sellingPrice));
    setTurnaroundHours(String(product.turnaroundHours));
    setIsPublished(product.isPublished);
    setMaterials(product.materials.map((m) => ({ ...m })));
    setFeedback(null);
  };

  const startNewProduct = () => {
    setIsCreating(true);
    setSku(`IW-PRD-${Math.floor(100 + Math.random() * 899)}`);
    setName('');
    setCategory(ProductCategory.RETAIL_CARE);
    setUnitType('Bottle');
    setSellingPrice('249');
    setTurnaroundHours('12');
    setIsPublished(true);
    setMaterials([
      { materialId: `mat_${Date.now()}_1`, name: 'Plant-Based Active Base', unit: 'ml', quantityPerUnit: 400, unitCost: 0.16 },
      { materialId: `mat_${Date.now()}_2`, name: 'Packaging Bottle & Label', unit: 'pcs', quantityPerUnit: 1, unitCost: 22 },
    ]);
    setFeedback(null);
  };

  const activeMaterials = isCreating ? materials : selectedProduct?.materials ?? [];
  const activeSellPrice = isCreating ? parseFloat(sellingPrice) || 0 : selectedProduct?.sellingPrice ?? 0;

  const liveMetrics = useMemo(
    () => computeProductMakingMetrics(activeMaterials, activeSellPrice),
    [activeMaterials, activeSellPrice]
  );

  const handleAddBomRow = () => {
    setMaterials((prev) => [
      ...prev,
      {
        materialId: `mat_${Date.now()}`,
        name: '',
        unit: 'ml',
        quantityPerUnit: 10,
        unitCost: 1,
      },
    ]);
  };

  const handleUpdateBomRow = (index: number, patch: Partial<BomMaterial>) => {
    setMaterials((prev) =>
      prev.map((m, idx) => (idx === index ? { ...m, ...patch } : m))
    );
  };

  const handleRemoveBomRow = (index: number) => {
    setMaterials((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveFormula = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = name.trim();
    const cleanedSku = sku.trim().toUpperCase();
    const priceNum = parseFloat(sellingPrice);
    if (!cleanedName || !cleanedSku || !Number.isFinite(priceNum) || priceNum <= 0) {
      setFeedback('Please provide a valid SKU, product name, and positive selling price.');
      return;
    }
    const validMaterials = materials.filter((m) => m.name.trim().length > 0);
    if (validMaterials.length === 0) {
      setFeedback('Add at least one Bill of Materials (BOM) consumable or ingredient.');
      return;
    }
    const productId = isCreating ? `prd_${Date.now()}` : selectedProduct?.productId ?? `prd_${Date.now()}`;
    const saved: ProductFormula = {
      productId,
      sku: cleanedSku,
      name: cleanedName,
      category,
      unitType: unitType.trim() || 'Unit',
      sellingPrice: Number(priceNum.toFixed(2)),
      stockUnits: isCreating ? 0 : selectedProduct?.stockUnits ?? 0,
      turnaroundHours: Math.max(1, parseInt(turnaroundHours, 10) || 24),
      isPublished,
      materials: validMaterials,
      updatedAt: new Date().toISOString(),
    };
    onSaveProduct(saved);
    setSelectedProductId(saved.productId);
    setIsCreating(false);
    setFeedback(`Saved product making formula "${saved.name}" (${saved.sku}).`);
  };

  const handleRunBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const qty = parseInt(batchQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;
    onRunProductionBatch({
      productId: selectedProduct.productId,
      hubId: batchHubId,
      quantityProduced: qty,
    });
    setFeedback(`Executed production batch of ${qty} ${selectedProduct.unitType}(s) for "${selectedProduct.name}". Inventory updated.`);
  };

  const handleExportBomExcel = () => {
    const rows = products.flatMap((p) => {
      const m = computeProductMakingMetrics(p.materials, p.sellingPrice);
      return p.materials.map((mat) => ({
        SKU: p.sku,
        'Product / Service': p.name,
        Category: p.category,
        'Selling Price (INR)': p.sellingPrice,
        'Unit Making Cost (INR)': m.unitMakingCost,
        'Gross Margin %': m.marginPercent,
        'Raw Material': mat.name,
        'Qty Per Unit': mat.quantityPerUnit,
        Unit: mat.unit,
        'Material Unit Cost (INR)': mat.unitCost,
        'Material Line Cost (INR)': Number((mat.quantityPerUnit * mat.unitCost).toFixed(2)),
      }));
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Product_Making_BOM');
    XLSX.writeFile(wb, 'instawash-product-making-bom.xlsx');
  };

  // Initialize editor state when selecting a product first time
  const showEditorForm = isCreating || (name !== '' && sku !== '');

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Product &amp; Service Making Management (BOM &amp; Costing Studio)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define wash services, stain treatments, and retail care products with Bill of Materials (BOM) recipes, real-time unit cost margins, and plant production batches.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportBomExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export BOM (.xlsx)
          </button>
          <button
            type="button"
            onClick={startNewProduct}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Product Formula
          </button>
        </div>
      </section>

      {feedback && (
        <div role="status" className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Catalog of Products & Services */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Active Product &amp; Service Formulas ({products.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-200">
            {products.map((prod) => {
              const metrics = computeProductMakingMetrics(prod.materials, prod.sellingPrice);
              const isActive = !isCreating && selectedProduct?.productId === prod.productId;
              return (
                <div
                  key={prod.productId}
                  className={`p-4 transition-colors ${isActive ? 'bg-sky-50/70' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => loadForEdit(prod)}
                        className="text-left text-sm font-bold text-slate-900 hover:text-sky-800"
                      >
                        {prod.name}
                      </button>
                      <div className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{prod.sku}</span> · {prod.category.replace(/_/g, ' ')} ·{' '}
                        {prod.isPublished ? 'Live on Booking Portal' : 'Internal Only'}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums shrink-0">
                      <div className="font-bold text-slate-900">{formatInr(prod.sellingPrice)}</div>
                      <div className="text-emerald-700 font-semibold">{metrics.marginPercent}% margin</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                    <span>BOM Cost: {formatInr(metrics.unitMakingCost)} / {prod.unitType}</span>
                    <span>Stock / Capacity: {prod.stockUnits}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => loadForEdit(prod)}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900"
                    >
                      Edit BOM Formula
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductId(prod.productId);
                        setIsCreating(false);
                        setName('');
                        setSku('');
                      }}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Run Batch
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: BOM Formula Editor OR Production Batch Runner */}
        <section className="lg:col-span-7 space-y-6">
          {showEditorForm ? (
            <form onSubmit={handleSaveFormula} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-900">
                  {isCreating ? 'Create New Product / Service Formula' : `Edit BOM Formula: ${sku}`}
                </h3>
                {!isCreating && selectedProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteProduct(selectedProduct.productId);
                      setName('');
                      setSku('');
                    }}
                    className="text-xs font-medium text-rose-700 hover:text-rose-900"
                  >
                    Delete Formula
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Product / Service Name
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Organic Linen Steam Finish"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="prod-sku" className="block text-xs font-medium text-slate-700 mb-1">
                    SKU Code
                  </label>
                  <input
                    id="prod-sku"
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="prod-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="prod-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    {Object.values(ProductCategory).map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="prod-unit" className="block text-xs font-medium text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    id="prod-unit"
                    type="text"
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div>
                  <label htmlFor="prod-sell" className="block text-xs font-medium text-slate-700 mb-1">
                    Selling Price (₹)
                  </label>
                  <input
                    id="prod-sell"
                    type="number"
                    step="0.5"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="prod-tat" className="block text-xs font-medium text-slate-700 mb-1">
                    SLA Turnaround (hrs)
                  </label>
                  <input
                    id="prod-tat"
                    type="number"
                    min="1"
                    value={turnaroundHours}
                    onChange={(e) => setTurnaroundHours(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>

              {/* BOM Ingredients Table */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    Bill of Materials (BOM) — Consumables &amp; Raw Cost per {unitType}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBomRow}
                    className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    + Add Material
                  </button>
                </div>

                <div className="space-y-2">
                  {materials.map((mat, idx) => (
                    <div key={mat.materialId} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        aria-label={`Material ${idx + 1} name`}
                        value={mat.name}
                        onChange={(e) => handleUpdateBomRow(idx, { name: e.target.value })}
                        placeholder="Raw material / chemical"
                        className="col-span-5 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                      <input
                        type="number"
                        step="0.5"
                        aria-label={`Material ${idx + 1} quantity`}
                        value={mat.quantityPerUnit}
                        onChange={(e) =>
                          handleUpdateBomRow(idx, { quantityPerUnit: parseFloat(e.target.value) || 0 })
                        }
                        className="col-span-2 px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        aria-label={`Material ${idx + 1} unit`}
                        value={mat.unit}
                        onChange={(e) => handleUpdateBomRow(idx, { unit: e.target.value })}
                        className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                      <input
                        type="number"
                        step="0.05"
                        aria-label={`Material ${idx + 1} unit cost`}
                        value={mat.unitCost}
                        onChange={(e) =>
                          handleUpdateBomRow(idx, { unitCost: parseFloat(e.target.value) || 0 })
                        }
                        className="col-span-2 px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md"
                      />
                      <button
                        type="button"
                        aria-label={`Remove material ${idx + 1}`}
                        onClick={() => handleRemoveBomRow(idx)}
                        className="col-span-1 p-1.5 text-slate-400 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Costing Summary */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Unit Making Cost</span>
                  <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {formatInr(computeProductMakingMetrics(materials, parseFloat(sellingPrice) || 0).unitMakingCost)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Gross Profit / Unit</span>
                  <span className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                    {formatInr(computeProductMakingMetrics(materials, parseFloat(sellingPrice) || 0).grossProfit)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Gross Margin</span>
                  <span className="font-mono text-base font-bold text-sky-800 tabular-nums">
                    {computeProductMakingMetrics(materials, parseFloat(sellingPrice) || 0).marginPercent}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="rounded border-slate-300 text-sky-700"
                  />
                  Publish to Customer 10-Min Booking Portal
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setName('');
                      setSku('');
                    }}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
                  >
                    Save Product Formula
                  </button>
                </div>
              </div>
            </form>
          ) : (
            selectedProduct && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <Factory className="w-4 h-4 text-slate-600" aria-hidden="true" />
                      Run Production / Prep Batch — {selectedProduct.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedProduct.sku} · Making Cost {formatInr(liveMetrics.unitMakingCost)} · Selling {formatInr(selectedProduct.sellingPrice)} ({liveMetrics.marginPercent}% margin)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadForEdit(selectedProduct)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Edit Formula
                  </button>
                </div>

                {/* BOM Breakdown Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3 font-medium">BOM Material</th>
                        <th className="py-2.5 px-3 font-medium text-right">Qty / {selectedProduct.unitType}</th>
                        <th className="py-2.5 px-3 font-medium text-right">Unit Cost</th>
                        <th className="py-2.5 px-3 font-medium text-right">Line Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProduct.materials.map((m) => (
                        <tr key={m.materialId}>
                          <td className="py-2 px-3 font-medium text-slate-800">{m.name}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {m.quantityPerUnit} {m.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {formatInr(m.unitCost)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {formatInr(m.quantityPerUnit * m.unitCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Execute Production Batch Form */}
                <form onSubmit={handleRunBatch} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="sm:col-span-5">
                    <label htmlFor="batch-hub" className="block text-xs font-medium text-slate-700 mb-1">
                      Target Manufacturing / Plant Hub
                    </label>
                    <select
                      id="batch-hub"
                      value={batchHubId}
                      onChange={(e) => setBatchHubId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      {hubs.map((h) => (
                        <option key={h.hubId} value={h.hubId}>
                          {h.name} ({h.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor="batch-qty" className="block text-xs font-medium text-slate-700 mb-1">
                      Batch Quantity ({selectedProduct.unitType})
                    </label>
                    <input
                      id="batch-qty"
                      type="number"
                      min="1"
                      max="10000"
                      value={batchQty}
                      onChange={(e) => setBatchQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <button
                      type="submit"
                      className="w-full px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      Execute Production Batch
                    </button>
                  </div>
                </form>
              </div>
            )
          )}

          {/* Production Batch History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Recent Production &amp; Chemical Prep Batches ({batches.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4 font-medium">Batch Code</th>
                    <th className="py-2.5 px-4 font-medium">Product</th>
                    <th className="py-2.5 px-4 font-medium text-right">Qty</th>
                    <th className="py-2.5 px-4 font-medium text-right">Total Cost</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.batchId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {b.batchCode}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{b.productName}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                        {b.quantityProduced}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                        {formatInr(b.totalCost)}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-700 font-semibold whitespace-nowrap">
                        {b.status.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
