import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, LayoutDashboard, Plus, RefreshCw, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyLayout = { name: 'Manager Dashboard', description: 'Custom dashboard for daily business monitoring', visibility: 'ALL_ROLES', refreshInterval: 300, isDefault: false };
const emptyWidget = { title: 'Monthly Sales', widgetType: 'KPI', dataSource: 'MONTH_SALES', chartType: 'NUMBER', gridX: 0, gridY: 0, gridW: 3, gridH: 2, sortOrder: 10, isVisible: true };
const emptyShortcut = { title: 'New Invoice', targetUrl: '/invoices', icon: 'receipt', color: 'purple', sortOrder: 10, isActive: true };

function formatValue(value, unit) {
  if (unit === 'money') return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return Number(value || 0).toLocaleString();
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function widgetTone(widget) {
  const source = widget?.dataSource;
  if (['OVERDUE_INVOICES', 'LOW_STOCK_ITEMS', 'OVERDUE_TASKS'].includes(source) && Number(widget?.lastValue || 0) > 0) return 'danger';
  if (['TODAY_RECEIPTS', 'CASH_BANK_BALANCE'].includes(source)) return 'green';
  if (['MONTH_SALES', 'MONTHLY_SALES_SERIES'].includes(source)) return 'blue';
  return 'purple';
}

function BarSeries({ series = [] }) {
  const max = Math.max(...series.map((row) => Number(row.value || 0)), 1);
  return <div className="dashboard-mini-chart">
    {series.map((row) => <div className="dashboard-chart-col" key={row.label} title={`${row.label}: ${row.value}`}>
      <div style={{ height: `${Math.max(8, (Number(row.value || 0) / max) * 100)}%` }} />
      <small>{row.label}</small>
    </div>)}
  </div>;
}

function TablePreview({ rows = [] }) {
  if (!rows.length) return <div className="empty-state small">No rows yet. Refresh this widget.</div>;
  const keys = Object.keys(rows[0]).slice(0, 4);
  return <div className="dashboard-widget-table"><table><thead><tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0, 6).map((row, index) => <tr key={index}>{keys.map((k) => <td key={k}>{String(row[k] ?? '-').slice(0, 40)}</td>)}</tr>)}</tbody></table></div>;
}

function WidgetCard({ widget }) {
  const payload = widget.lastPayload || {};
  const tone = widgetTone(widget);
  return <div className={`dashboard-widget-card tone-${tone}`}>
    <div className="dashboard-widget-head"><span>{widget.widgetType}</span><strong>{widget.title}</strong></div>
    {widget.widgetType === 'CHART' || payload.series ? <BarSeries series={payload.series || []} /> : widget.widgetType === 'TABLE' || payload.rows ? <TablePreview rows={payload.rows || []} /> : <div className="dashboard-widget-value">{formatValue(widget.lastValue, payload.unit)}</div>}
    <div className="dashboard-widget-foot"><span>{widget.dataSource}</span><small>Updated {dateTime(widget.lastRefreshedAt)}</small></div>
  </div>;
}

export default function DashboardBuilder() {
  const [summary, setSummary] = useState(null);
  const [library, setLibrary] = useState({ dataSources: [], widgetTypes: [], chartTypes: [], visibilities: [] });
  const [layouts, setLayouts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState('');
  const [layoutForm, setLayoutForm] = useState(emptyLayout);
  const [widgetForm, setWidgetForm] = useState(emptyWidget);
  const [shortcutForm, setShortcutForm] = useState(emptyShortcut);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedLayout = useMemo(() => layouts.find((layout) => layout.id === selectedLayoutId) || layouts[0] || null, [layouts, selectedLayoutId]);

  async function load() {
    setError('');
    const [summaryRes, libraryRes, layoutsRes, metricsRes] = await Promise.all([
      api.get('/dashboard-builder/summary'),
      api.get('/dashboard-builder/library'),
      api.get('/dashboard-builder/layouts'),
      api.get('/dashboard-builder/metrics')
    ]);
    const rows = layoutsRes.data || [];
    setSummary(summaryRes.data || null);
    setLibrary(libraryRes.data || { dataSources: [] });
    setLayouts(rows);
    setMetrics(metricsRes.data || []);
    if (!selectedLayoutId && rows[0]?.id) setSelectedLayoutId(rows[0].id);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load dashboard builder')); }, []);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  async function createDefaults() {
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/dashboard-builder/defaults');
      flash('Default dashboard created');
      setSelectedLayoutId(data.id);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create default dashboard'); }
    finally { setSaving(false); }
  }

  async function createLayout(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/dashboard-builder/layouts', layoutForm);
      setLayoutForm(emptyLayout);
      setSelectedLayoutId(data.id);
      flash('Dashboard layout saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create layout'); }
    finally { setSaving(false); }
  }

  async function setDefaultLayout() {
    if (!selectedLayout) return;
    setSaving(true); setError('');
    try {
      await api.post(`/dashboard-builder/layouts/${selectedLayout.id}/default`);
      flash('Default dashboard updated');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to set default dashboard'); }
    finally { setSaving(false); }
  }

  async function addWidget(e) {
    e.preventDefault();
    if (!selectedLayout) return setError('Create or select a layout first');
    setSaving(true); setError('');
    try {
      await api.post(`/dashboard-builder/layouts/${selectedLayout.id}/widgets`, widgetForm);
      setWidgetForm({ ...emptyWidget, sortOrder: Number(widgetForm.sortOrder || 0) + 10 });
      flash('Widget added');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to add widget'); }
    finally { setSaving(false); }
  }

  async function addShortcut(e) {
    e.preventDefault();
    if (!selectedLayout) return setError('Create or select a layout first');
    setSaving(true); setError('');
    try {
      await api.post(`/dashboard-builder/layouts/${selectedLayout.id}/shortcuts`, shortcutForm);
      setShortcutForm({ ...emptyShortcut, sortOrder: Number(shortcutForm.sortOrder || 0) + 10 });
      flash('Shortcut added');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to add shortcut'); }
    finally { setSaving(false); }
  }

  async function refreshLayout() {
    if (!selectedLayout) return setError('Select a layout first');
    setSaving(true); setError('');
    try {
      const { data } = await api.post(`/dashboard-builder/layouts/${selectedLayout.id}/refresh`);
      setLayouts((old) => old.map((row) => row.id === data.id ? data : row));
      flash('Dashboard widgets refreshed');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to refresh dashboard'); }
    finally { setSaving(false); }
  }

  async function deleteWidget(id) {
    if (!window.confirm('Remove this widget?')) return;
    setSaving(true); setError('');
    try {
      await api.delete(`/dashboard-builder/widgets/${id}`);
      flash('Widget removed');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to remove widget'); }
    finally { setSaving(false); }
  }

  async function deleteShortcut(id) {
    if (!window.confirm('Remove this shortcut?')) return;
    setSaving(true); setError('');
    try {
      await api.delete(`/dashboard-builder/shortcuts/${id}`);
      flash('Shortcut removed');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to remove shortcut'); }
    finally { setSaving(false); }
  }

  const widgetColumns = [
    { key: 'title', label: 'Widget', render: (r) => <><strong>{r.title}</strong><span className="table-subtext">{r.widgetType} · {r.dataSource}</span></> },
    { key: 'layout', label: 'Size / Position', render: (r) => `${r.gridW}x${r.gridH} at ${r.gridX},${r.gridY}` },
    { key: 'value', label: 'Last Value', render: (r) => formatValue(r.lastValue, r.lastPayload?.unit) },
    { key: 'refresh', label: 'Last Refresh', render: (r) => dateTime(r.lastRefreshedAt) },
    { key: 'actions', label: 'Actions', render: (r) => <button className="mini-danger" onClick={() => deleteWidget(r.id)}><Trash2 size={14}/> Remove</button> }
  ];

  const shortcutColumns = [
    { key: 'title', label: 'Shortcut', render: (r) => <><strong>{r.title}</strong><span className="table-subtext">{r.targetUrl}</span></> },
    { key: 'sortOrder', label: 'Order' },
    { key: 'active', label: 'Active', render: (r) => r.isActive ? 'Yes' : 'No' },
    { key: 'actions', label: 'Actions', render: (r) => <button className="mini-danger" onClick={() => deleteShortcut(r.id)}><Trash2 size={14}/> Remove</button> }
  ];

  return <div className="page dashboard-builder-page">
    <div className="page-header dashboard-builder-hero">
      <div><span className="eyebrow">Custom analytics workspace</span><h1>Advanced Dashboard Builder</h1><p>Create role-based dashboards, KPI cards, charts, tables, shortcuts and alert widgets for each business.</p></div>
      <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Reload</button><button className="secondary-btn" disabled={saving} onClick={createDefaults}><Wand2 size={16}/> Create Defaults</button><button className="primary-btn" disabled={saving || !selectedLayout} onClick={refreshLayout}><Sparkles size={16}/> Refresh Widgets</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid dashboard-builder-stats">
      <StatCard title="Layouts" value={summary?.layouts || 0} subtitle={summary?.defaultLayout?.name || 'No default layout'} />
      <StatCard title="Widgets" value={summary?.widgets || 0} subtitle={`${summary?.refreshedWidgets || 0} refreshed`} tone="blue" />
      <StatCard title="Shortcuts" value={summary?.activeShortcuts || 0} subtitle="Active quick actions" tone="green" />
      <StatCard title="Data Sources" value={library?.dataSources?.length || 0} subtitle="KPI, chart and table sources" tone="orange" />
    </div>

    <section className="panel dashboard-live-panel">
      <div className="section-title-row">
        <div><h2><LayoutDashboard size={20}/> Live Dashboard Preview</h2><p className="muted-text">Select a layout, add widgets, then refresh to store the latest KPI values.</p></div>
        <select value={selectedLayout?.id || ''} onChange={(e)=>setSelectedLayoutId(e.target.value)}><option value="">Select layout</option>{layouts.map((layout)=><option key={layout.id} value={layout.id}>{layout.name}{layout.isDefault ? ' · Default' : ''}</option>)}</select>
      </div>
      {selectedLayout ? <>
        <div className="dashboard-layout-meta"><strong>{selectedLayout.name}</strong><span>{selectedLayout.description || 'No description'}</span><span>{selectedLayout.visibility} · every {selectedLayout.refreshInterval}s</span><button className="mini-action" onClick={setDefaultLayout} disabled={selectedLayout.isDefault || saving}>Set Default</button></div>
        <div className="dashboard-widget-grid">{selectedLayout.widgets?.length ? selectedLayout.widgets.filter((w)=>w.isVisible).map((widget)=><WidgetCard key={widget.id} widget={widget} />) : <div className="empty-state">No widgets yet. Add widgets from the form below or create defaults.</div>}</div>
        <div className="dashboard-shortcut-row">{selectedLayout.shortcuts?.filter((s)=>s.isActive).map((shortcut)=><Link key={shortcut.id} to={shortcut.targetUrl} className="dashboard-shortcut-chip"><span>{shortcut.icon || 'link'}</span><strong>{shortcut.title}</strong></Link>)}</div>
      </> : <div className="empty-state">No dashboard layout yet. Click Create Defaults or create your own layout.</div>}
    </section>

    <div className="dashboard-builder-grid">
      <section className="panel">
        <h2><Plus size={20}/> Create Layout</h2>
        <form className="form-grid compact" onSubmit={createLayout}>
          <label>Name<input value={layoutForm.name} onChange={(e)=>setLayoutForm({...layoutForm,name:e.target.value})} required /></label>
          <label>Description<textarea value={layoutForm.description || ''} onChange={(e)=>setLayoutForm({...layoutForm,description:e.target.value})} /></label>
          <div className="form-grid two"><label>Visibility<select value={layoutForm.visibility} onChange={(e)=>setLayoutForm({...layoutForm,visibility:e.target.value})}>{(library.visibilities || ['ALL_ROLES']).map((v)=><option key={v}>{v}</option>)}</select></label><label>Refresh seconds<input type="number" value={layoutForm.refreshInterval} onChange={(e)=>setLayoutForm({...layoutForm,refreshInterval:Number(e.target.value)})} /></label></div>
          <label className="check-label"><input type="checkbox" checked={layoutForm.isDefault} onChange={(e)=>setLayoutForm({...layoutForm,isDefault:e.target.checked})} /> Make default dashboard</label>
          <button className="primary-btn" disabled={saving}><Save size={18}/> Save Layout</button>
        </form>
      </section>

      <section className="panel">
        <h2><BarChart3 size={20}/> Add Widget</h2>
        <form className="form-grid compact" onSubmit={addWidget}>
          <label>Title<input value={widgetForm.title} onChange={(e)=>setWidgetForm({...widgetForm,title:e.target.value})} required /></label>
          <div className="form-grid two"><label>Widget type<select value={widgetForm.widgetType} onChange={(e)=>setWidgetForm({...widgetForm,widgetType:e.target.value})}>{(library.widgetTypes || ['KPI']).map((v)=><option key={v}>{v}</option>)}</select></label><label>Chart type<select value={widgetForm.chartType || 'NUMBER'} onChange={(e)=>setWidgetForm({...widgetForm,chartType:e.target.value})}>{(library.chartTypes || ['NUMBER']).map((v)=><option key={v}>{v}</option>)}</select></label></div>
          <label>Data source<select value={widgetForm.dataSource} onChange={(e)=>setWidgetForm({...widgetForm,dataSource:e.target.value})}>{(library.dataSources || []).map((src)=><option key={src.key} value={src.key}>{src.label}</option>)}</select></label>
          <div className="form-grid four"><label>X<input type="number" value={widgetForm.gridX} onChange={(e)=>setWidgetForm({...widgetForm,gridX:Number(e.target.value)})} /></label><label>Y<input type="number" value={widgetForm.gridY} onChange={(e)=>setWidgetForm({...widgetForm,gridY:Number(e.target.value)})} /></label><label>W<input type="number" value={widgetForm.gridW} onChange={(e)=>setWidgetForm({...widgetForm,gridW:Number(e.target.value)})} /></label><label>H<input type="number" value={widgetForm.gridH} onChange={(e)=>setWidgetForm({...widgetForm,gridH:Number(e.target.value)})} /></label></div>
          <div className="form-grid two"><label>Sort order<input type="number" value={widgetForm.sortOrder} onChange={(e)=>setWidgetForm({...widgetForm,sortOrder:Number(e.target.value)})} /></label><label className="check-label"><input type="checkbox" checked={widgetForm.isVisible} onChange={(e)=>setWidgetForm({...widgetForm,isVisible:e.target.checked})} /> Visible</label></div>
          <button className="primary-btn" disabled={saving || !selectedLayout}><Plus size={18}/> Add Widget</button>
        </form>
      </section>

      <section className="panel">
        <h2><Plus size={20}/> Add Shortcut</h2>
        <form className="form-grid compact" onSubmit={addShortcut}>
          <label>Title<input value={shortcutForm.title} onChange={(e)=>setShortcutForm({...shortcutForm,title:e.target.value})} required /></label>
          <label>Target URL<input value={shortcutForm.targetUrl} onChange={(e)=>setShortcutForm({...shortcutForm,targetUrl:e.target.value})} placeholder="/invoices" required /></label>
          <div className="form-grid two"><label>Icon label<input value={shortcutForm.icon || ''} onChange={(e)=>setShortcutForm({...shortcutForm,icon:e.target.value})} /></label><label>Color<input value={shortcutForm.color || ''} onChange={(e)=>setShortcutForm({...shortcutForm,color:e.target.value})} /></label></div>
          <div className="form-grid two"><label>Sort order<input type="number" value={shortcutForm.sortOrder} onChange={(e)=>setShortcutForm({...shortcutForm,sortOrder:Number(e.target.value)})} /></label><label className="check-label"><input type="checkbox" checked={shortcutForm.isActive} onChange={(e)=>setShortcutForm({...shortcutForm,isActive:e.target.checked})} /> Active</label></div>
          <button className="secondary-btn" disabled={saving || !selectedLayout}><Plus size={18}/> Add Shortcut</button>
        </form>
      </section>
    </div>

    <div className="dashboard-builder-lists">
      <section className="panel"><h2>Widgets in Selected Layout</h2><DataTable columns={widgetColumns} rows={selectedLayout?.widgets || []} empty="No widgets yet" /></section>
      <section className="panel"><h2>Shortcuts in Selected Layout</h2><DataTable columns={shortcutColumns} rows={selectedLayout?.shortcuts || []} empty="No shortcuts yet" /></section>
    </div>

    <section className="panel dashboard-source-panel">
      <h2>Available Data Sources</h2>
      <div className="dashboard-source-grid">{(library.dataSources || []).map((src)=><div key={src.key} className="dashboard-source-card"><strong>{src.label}</strong><span>{src.key}</span><small>{src.type} · {src.unit}</small></div>)}</div>
      <h3>Current Metric Preview</h3>
      <div className="dashboard-metric-preview">{metrics.map((metric)=><div key={metric.source}><span>{metric.label}</span><strong>{formatValue(metric.value, metric.unit)}</strong></div>)}</div>
    </section>
  </div>;
}
