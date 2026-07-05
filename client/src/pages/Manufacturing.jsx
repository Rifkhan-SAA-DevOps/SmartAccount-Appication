import { useEffect, useMemo, useState } from 'react';
import { Factory, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import StatCard from '../components/ui/StatCard.jsx';

function money(value) { return `LKR ${Number(value || 0).toFixed(2)}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function emptyRecipeForm() {
  return { name: '', type: 'RECIPE', outputProductId: '', outputQty: 1, notes: '', items: [{ productId: '', qty: 1, wastagePercent: 0, notes: '' }] };
}

export default function Manufacturing() {
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm());
  const [orderForm, setOrderForm] = useState({ recipeId: '', warehouseId: '', outputQty: 1, additionalCost: 0, updateOutputCost: true, notes: '' });
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectedRecipeRow, setSelectedRecipeRow] = useState(null);
  const [selectedOrderRow, setSelectedOrderRow] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const activeRecipes = useMemo(() => recipes.filter((r) => r.isActive), [recipes]);
  const selectedRecipe = activeRecipes.find((r) => r.id === orderForm.recipeId);

  async function load() {
    setError('');
    const [summaryRes, productsRes, warehousesRes, recipesRes, ordersRes] = await Promise.all([
      api.get('/manufacturing/summary'),
      api.get('/products'),
      api.get('/branches/warehouses'),
      api.get('/manufacturing/recipes'),
      api.get('/manufacturing/orders')
    ]);
    setSummary(summaryRes.data);
    setProducts(productsRes.data || []);
    setWarehouses(warehousesRes.data || []);
    setRecipes(recipesRes.data || []);
    setOrders(ordersRes.data || []);
    if (!orderForm.warehouseId && warehousesRes.data?.[0]?.id) setOrderForm((f) => ({ ...f, warehouseId: warehousesRes.data[0].id }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || e.message)); }, []);

  function updateRecipeItem(index, key, value) {
    const next = [...recipeForm.items];
    next[index] = { ...next[index], [key]: value };
    setRecipeForm({ ...recipeForm, items: next });
  }

  function addRecipeItem() { setRecipeForm({ ...recipeForm, items: [...recipeForm.items, { productId: '', qty: 1, wastagePercent: 0, notes: '' }] }); }
  function removeRecipeItem(index) { setRecipeForm({ ...recipeForm, items: recipeForm.items.filter((_, i) => i !== index) }); }

  async function createRecipe(e) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/manufacturing/recipes', { ...recipeForm, outputQty: Number(recipeForm.outputQty), items: recipeForm.items.map((item) => ({ ...item, qty: Number(item.qty), wastagePercent: Number(item.wastagePercent || 0) })) });
      setRecipeForm(emptyRecipeForm());
      setRecipeOpen(false);
      setSuccess('Recipe saved successfully.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save recipe'); }
    finally { setLoading(false); }
  }

  async function postManufacturingOrder(e) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/manufacturing/orders', { ...orderForm, outputQty: Number(orderForm.outputQty), additionalCost: Number(orderForm.additionalCost || 0) });
      setOrderForm({ ...orderForm, outputQty: 1, additionalCost: 0, notes: '' });
      setOrderOpen(false);
      setSuccess('Manufacturing order posted. Raw stock reduced and finished stock increased.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to post manufacturing order'); }
    finally { setLoading(false); }
  }

  const recipeColumns = [
    { key: 'recipeNo', label: 'Recipe No', render: (r) => <strong>{r.recipeNo}</strong> },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'outputProductName', label: 'Finished Product' },
    { key: 'outputQty', label: 'Output Qty', render: (r) => Number(r.outputQty || 0).toFixed(3) },
    { key: 'inputSummary', label: 'Inputs' },
    { key: 'isActive', label: 'Status', render: (r) => <span className={`badge ${r.isActive ? 'posted' : 'cancelled'}`}>{r.isActive ? 'ACTIVE' : 'INACTIVE'}</span> }
  ];

  const orderColumns = [
    { key: 'orderNo', label: 'Order No', render: (r) => <strong>{r.orderNo}</strong> },
    { key: 'productionDate', label: 'Date', render: (r) => dateOnly(r.productionDate) },
    { key: 'warehouseName', label: 'Warehouse' },
    { key: 'recipeName', label: 'Recipe' },
    { key: 'outputProductName', label: 'Finished Product' },
    { key: 'outputQty', label: 'Output Qty', render: (r) => Number(r.outputQty || 0).toFixed(3) },
    { key: 'totalCost', label: 'Total Cost', render: (r) => money(r.totalCost) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${String(r.status).toLowerCase()}`}>{r.status}</span> }
  ];

  return (
    <div className="page stage6-list-page manufacturing-page">
      <div className="stage6-hero">
        <div>
          <h1>Manufacturing / Recipe / Assembly</h1>
          <p>Recipes and work orders are no longer always visible. Use the action buttons, while the page stays focused on recipe and production registers.</p>
        </div>
        <div className="stage6-actions">
          <button className="secondary-btn" onClick={load}><RefreshCw size={18} /> Refresh</button>
          <button className="secondary-btn" onClick={() => setRecipeOpen(true)}><Settings2 size={18} /> Create Recipe</button>
          <button className="primary-btn" onClick={() => setOrderOpen(true)}><Factory size={18} /> Create Work Order</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid manufacturing-stat-grid">
        <StatCard title="Recipes" value={summary?.recipes || 0} subtitle={`${summary?.activeRecipes || 0} active`} />
        <StatCard title="Manufacturing Orders" value={summary?.orders || 0} subtitle={`${summary?.postedOrders || 0} posted`} tone="green" />
        <StatCard title="Monthly Output Qty" value={Number(summary?.monthlyOutputQty || 0).toFixed(3)} subtitle="Finished goods quantity" tone="blue" />
        <StatCard title="Monthly Production Cost" value={money(summary?.monthlyProductionCost)} subtitle="Raw + additional cost" tone="orange" />
      </div>

      <section className="panel stage6-table-panel">
        <div className="section-title-row"><div><h2>Recipes</h2><p>Click a recipe row to view the recipe details.</p></div></div>
        <DataTable columns={recipeColumns} rows={recipes} pageSize={10} onRowClick={setSelectedRecipeRow} />
      </section>

      <section className="panel stage6-table-panel">
        <div className="section-title-row"><div><h2>Manufacturing Orders</h2><p>Click a work order to view production details.</p></div></div>
        <DataTable columns={orderColumns} rows={orders} pageSize={10} onRowClick={setSelectedOrderRow} />
      </section>

      <ModalDrawer open={recipeOpen} size="xl" title="Create Recipe" description="Build a BOM/recipe: raw materials in, finished product out." onClose={() => setRecipeOpen(false)}>
        <form onSubmit={createRecipe} className="form-grid two compact">
          <label className="span-two">Recipe name<input value={recipeForm.name} onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })} placeholder="Cake mix, PC assembly, gift bundle..." required /></label>
          <label>Type<select value={recipeForm.type} onChange={(e) => setRecipeForm({ ...recipeForm, type: e.target.value })}><option>RECIPE</option><option>ASSEMBLY</option><option>BUNDLE</option></select></label>
          <label>Output quantity<input type="number" step="0.001" value={recipeForm.outputQty} onChange={(e) => setRecipeForm({ ...recipeForm, outputQty: e.target.value })} /></label>
          <label className="span-two">Finished product<select value={recipeForm.outputProductId} onChange={(e) => setRecipeForm({ ...recipeForm, outputProductId: e.target.value })} required><option value="">Select finished product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · stock {Number(p.stockQty || 0)}</option>)}</select></label>
          <label className="span-two">Notes<input value={recipeForm.notes} onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })} /></label>
          <div className="span-two recipe-lines"><div className="section-title-row small"><strong>Raw materials / input products</strong><button type="button" className="secondary-btn" onClick={addRecipeItem}><Plus size={16} /> Add line</button></div>{recipeForm.items.map((item, index) => <div className="recipe-item-row" key={index}><select value={item.productId} onChange={(e) => updateRecipeItem(index, 'productId', e.target.value)} required><option value="">Input product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · cost {money(p.costPrice)}</option>)}</select><input type="number" step="0.001" value={item.qty} onChange={(e) => updateRecipeItem(index, 'qty', e.target.value)} placeholder="Qty" required /><input type="number" step="0.01" value={item.wastagePercent} onChange={(e) => updateRecipeItem(index, 'wastagePercent', e.target.value)} placeholder="Waste %" /><button type="button" className="mini-danger" onClick={() => removeRecipeItem(index)} disabled={recipeForm.items.length === 1}>Remove</button></div>)}</div>
          <div className="stage6-form-actions span-two"><button type="button" className="secondary-btn" onClick={() => setRecipeOpen(false)}>Cancel</button><button className="primary-btn" disabled={loading}>Save Recipe</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={orderOpen} size="lg" title="Create Work Order" description="Post a production order. Raw stock will reduce and finished goods stock will increase." onClose={() => setOrderOpen(false)}>
        <form onSubmit={postManufacturingOrder} className="form-grid compact">
          <label>Recipe<select value={orderForm.recipeId} onChange={(e) => setOrderForm({ ...orderForm, recipeId: e.target.value })} required><option value="">Select recipe</option>{activeRecipes.map((r) => <option key={r.id} value={r.id}>{r.recipeNo} · {r.name}</option>)}</select></label>
          <label>Warehouse<select value={orderForm.warehouseId} onChange={(e) => setOrderForm({ ...orderForm, warehouseId: e.target.value })} required><option value="">Select warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label>Output quantity<input type="number" step="0.001" value={orderForm.outputQty} onChange={(e) => setOrderForm({ ...orderForm, outputQty: e.target.value })} required /></label>
          <label>Additional cost<input type="number" step="0.01" value={orderForm.additionalCost} onChange={(e) => setOrderForm({ ...orderForm, additionalCost: e.target.value })} /></label>
          <label className="check-label"><input type="checkbox" checked={orderForm.updateOutputCost} onChange={(e) => setOrderForm({ ...orderForm, updateOutputCost: e.target.checked })} /> Update finished product cost price</label>
          <label>Notes<input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} /></label>
          {selectedRecipe && <div className="recipe-preview"><strong>{selectedRecipe.outputProductName}</strong><p>Output per recipe: {Number(selectedRecipe.outputQty || 0).toFixed(3)}</p><p>Inputs: {selectedRecipe.inputSummary || 'No input summary'}</p></div>}
          <div className="stage6-form-actions"><button type="button" className="secondary-btn" onClick={() => setOrderOpen(false)}>Cancel</button><button className="primary-btn" disabled={loading}>Post Work Order</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selectedRecipeRow} mode="modal" size="lg" title="Recipe Details" onClose={() => setSelectedRecipeRow(null)}>
        {selectedRecipeRow && <div className="stage6-detail-grid"><div className="stage6-detail-item"><span>Recipe No</span><strong>{selectedRecipeRow.recipeNo}</strong></div><div className="stage6-detail-item"><span>Name</span><strong>{selectedRecipeRow.name}</strong></div><div className="stage6-detail-item"><span>Output Product</span><strong>{selectedRecipeRow.outputProductName}</strong></div><div className="stage6-detail-item"><span>Inputs</span><strong>{selectedRecipeRow.inputSummary || '-'}</strong></div></div>}
      </ModalDrawer>

      <ModalDrawer open={!!selectedOrderRow} mode="modal" size="lg" title="Work Order Details" onClose={() => setSelectedOrderRow(null)}>
        {selectedOrderRow && <div className="stage6-detail-grid"><div className="stage6-detail-item"><span>Order No</span><strong>{selectedOrderRow.orderNo}</strong></div><div className="stage6-detail-item"><span>Date</span><strong>{dateOnly(selectedOrderRow.productionDate)}</strong></div><div className="stage6-detail-item"><span>Finished Product</span><strong>{selectedOrderRow.outputProductName}</strong></div><div className="stage6-detail-item"><span>Total Cost</span><strong>{money(selectedOrderRow.totalCost)}</strong></div></div>}
      </ModalDrawer>
    </div>
  );
}
