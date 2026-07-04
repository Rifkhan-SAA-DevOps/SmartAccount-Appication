import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

function ProductCodePreview({ product, type = 'barcode', compact = false }) {
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const codeValue = product.barcode || product.sku || product.id?.slice(0, 12);

  useEffect(() => {
    if (!product || !codeValue) return;
    if (type !== 'qr' && svgRef.current) {
      try {
        JsBarcode(svgRef.current, codeValue, {
          format: 'CODE128',
          displayValue: true,
          fontSize: compact ? 10 : 12,
          height: compact ? 28 : 38,
          width: compact ? 1.1 : 1.35,
          margin: 4
        });
      } catch {
        svgRef.current.innerHTML = '';
      }
    }
    if (type !== 'barcode' && canvasRef.current) {
      const payload = JSON.stringify({ productId: product.id, sku: product.sku, barcode: codeValue, name: product.name });
      QRCode.toCanvas(canvasRef.current, payload, { width: compact ? 68 : 82, margin: 1 }).catch(() => null);
    }
  }, [product, codeValue, type, compact]);

  return (
    <div className={`code-preview ${compact ? 'compact' : ''}`}>
      {type !== 'qr' && <svg ref={svgRef} className="barcode-svg" />}
      {type !== 'barcode' && <canvas ref={canvasRef} className="qr-canvas" />}
    </div>
  );
}

export default function BarcodeLabels() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const [labelQty, setLabelQty] = useState(1);
  const [labelType, setLabelType] = useState('barcode');
  const [labelSize, setLabelSize] = useState('small');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/products', { params: query ? { q: query } : {} });
    setProducts(data);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load products')); }, []);

  const selectedProducts = useMemo(() => {
    return products.filter((product) => selected[product.id]);
  }, [products, selected]);

  const labels = useMemo(() => {
    const count = Math.max(1, Number(labelQty || 1));
    return selectedProducts.flatMap((product) => Array.from({ length: count }, () => product));
  }, [selectedProducts, labelQty]);

  function toggle(product) {
    setSelected((prev) => ({ ...prev, [product.id]: !prev[product.id] }));
  }

  function selectLowStock() {
    const next = {};
    products.forEach((p) => {
      if (Number(p.stockQty || 0) <= Number(p.reorderLevel || 0)) next[p.id] = true;
    });
    setSelected(next);
  }

  return (
    <div className="page barcode-page">
      <section className="panel page-header-panel">
        <div>
          <h1>Barcode / QR Labels</h1>
          <p>Create printable product labels for barcode scanners, QR scanning, shelves and packaging.</p>
        </div>
        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={selectLowStock}>Select Low Stock</button>
          <button className="primary-btn" type="button" onClick={() => window.print()} disabled={!labels.length}>Print Labels</button>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <section className="panel label-tools no-print">
        <div className="form-grid four compact">
          <label className="span-two">Search Product / SKU / Barcode
            <div className="inline-input">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type and click search" />
              <button className="secondary-btn" type="button" onClick={load}>Search</button>
            </div>
          </label>
          <label>Copies per product
            <input type="number" min="1" max="100" value={labelQty} onChange={(e) => setLabelQty(e.target.value)} />
          </label>
          <label>Label type
            <select value={labelType} onChange={(e) => setLabelType(e.target.value)}>
              <option value="barcode">Barcode only</option>
              <option value="qr">QR only</option>
              <option value="both">Barcode + QR</option>
            </select>
          </label>
          <label>Label size
            <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)}>
              <option value="small">Small shelf label</option>
              <option value="medium">Medium product label</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel no-print">
        <h2>Products</h2>
        <DataTable columns={[
          { key: 'select', label: 'Select', render: (r) => <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r)} /> },
          { key: 'name', label: 'Product' },
          { key: 'sku', label: 'SKU' },
          { key: 'barcode', label: 'Barcode' },
          { key: 'stockQty', label: 'Stock' },
          { key: 'salePrice', label: 'Sale Price', render: (r) => `LKR ${Number(r.salePrice || 0).toFixed(2)}` },
          { key: 'preview', label: 'Preview', render: (r) => <ProductCodePreview product={r} type={labelType} compact /> }
        ]} rows={products} />
      </section>

      <section className={`barcode-print-area ${labelSize}`}>
        <div className="print-title">Product Labels</div>
        <div className="label-sheet">
          {labels.map((product, index) => (
            <div className="product-label" key={`${product.id}-${index}`}>
              <strong>{product.name}</strong>
              <span>Price: LKR {Number(product.salePrice || 0).toFixed(2)}</span>
              <ProductCodePreview product={product} type={labelType} compact />
              <small>{product.barcode || product.sku || product.id?.slice(0, 12)}</small>
            </div>
          ))}
          {!labels.length && <div className="empty-label-note no-print">Select products to preview printable labels.</div>}
        </div>
      </section>
    </div>
  );
}
