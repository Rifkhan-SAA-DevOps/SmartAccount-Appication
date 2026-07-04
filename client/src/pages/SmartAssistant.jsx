import { useEffect, useMemo, useState } from 'react';
import { Bot, BrainCircuit, AlertTriangle, CheckCircle2, Lightbulb, Send, Sparkles } from 'lucide-react';
import { api } from '../api/http.js';
import StatCard from '../components/ui/StatCard.jsx';
import DataTable from '../components/ui/DataTable.jsx';

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString()}`;
}

function insightIcon(type) {
  if (type === 'danger' || type === 'warning') return AlertTriangle;
  if (type === 'success') return CheckCircle2;
  return Lightbulb;
}

export default function SmartAssistant() {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const [from, setFrom] = useState(formatDate(monthStart));
  const [to, setTo] = useState(formatDate(today));
  const [data, setData] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  const loadInsights = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/assistant/insights', { params: { from, to } });
      setData(res.data);
      setAnswer(null);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load Smart Assistant insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (text = question) => {
    const finalQuestion = text.trim();
    if (!finalQuestion) return;
    setAsking(true);
    setError('');
    try {
      const res = await api.post('/assistant/ask', { question: finalQuestion, from, to });
      setQuestion(finalQuestion);
      setAnswer(res.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to answer question');
    } finally {
      setAsking(false);
    }
  };

  const metrics = data?.metrics || {};

  return (
    <div className="page smart-assistant-page">
      <div className="assistant-hero">
        <div className="assistant-hero-icon"><Bot size={34} /></div>
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Version 4.6</span>
          <h1>Smart Business Assistant</h1>
          <p>Ask simple questions about sales, profit, stock, expenses, cash flow, receivables, and risks. This first version is a rule-based assistant using your own ERP data.</p>
        </div>
      </div>

      <section className="panel assistant-filter-panel">
        <div>
          <h2>Assistant Period</h2>
          <p>Choose the period the assistant should analyze.</p>
        </div>
        <div className="assistant-filter-row">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary-btn" onClick={loadInsights} disabled={loading}>{loading ? 'Analyzing...' : 'Analyze'}</button>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <StatCard title="Net Sales" value={money(metrics.netSales)} subtitle={`${metrics.invoiceCount || 0} invoices`} tone="purple" />
        <StatCard title="Net Profit" value={money(metrics.netProfit)} subtitle={`${metrics.grossMarginPercent || 0}% gross margin`} tone="green" />
        <StatCard title="Cash / Bank" value={money(metrics.cashBankBalance)} subtitle={`${money(metrics.receivables)} receivable`} tone="blue" />
        <StatCard title="Risk Alerts" value={(data?.insights || []).filter((i) => i.priority === 'high').length} subtitle={`${metrics.lowStockCount || 0} low stock, ${metrics.overdueInvoiceCount || 0} overdue`} tone="orange" />
      </div>

      <section className="panel assistant-summary-card">
        <div className="assistant-summary-head"><BrainCircuit size={22} /><h2>Executive Summary</h2></div>
        <p>{data?.summary || 'No assistant summary loaded yet.'}</p>
      </section>

      <div className="assistant-grid">
        <section className="panel">
          <h2>Ask the Assistant</h2>
          <div className="assistant-question-box">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: Why is profit low this month?" rows={4} />
            <button className="primary-btn" onClick={() => ask()} disabled={asking || !question.trim()}><Send size={16} /> {asking ? 'Thinking...' : 'Ask'}</button>
          </div>
          <div className="assistant-suggestions">
            {(data?.suggestedQuestions || []).map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}
          </div>
          {answer && <div className="assistant-answer"><strong>Answer</strong><p>{answer.answer}</p></div>}
        </section>

        <section className="panel">
          <h2>Smart Insights</h2>
          <div className="assistant-insight-list">
            {(data?.insights || []).map((insight, index) => {
              const Icon = insightIcon(insight.type);
              return (
                <article key={`${insight.title}-${index}`} className={`assistant-insight ${insight.type}`}>
                  <Icon size={20} />
                  <div>
                    <strong>{insight.title}</strong>
                    <p>{insight.message}</p>
                    <small>{insight.action}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="assistant-grid two">
        <section className="panel">
          <h2>Low Stock Attention</h2>
          <DataTable columns={[
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', render: (r) => r.sku || '-' },
            { key: 'stockQty', label: 'Stock' },
            { key: 'reorderLevel', label: 'Reorder' }
          ]} rows={data?.lists?.lowStock || []} />
        </section>
        <section className="panel">
          <h2>Highest Receivable Customers</h2>
          <DataTable columns={[
            { key: 'name', label: 'Customer' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
            { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }
          ]} rows={data?.lists?.highReceivableCustomers || []} />
        </section>
      </div>
    </div>
  );
}
