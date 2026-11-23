import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Edit, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { UnitSelect } from './UnitSelect';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const blank = () => ({ name: '', unit: '', qty: '' });

// Nov 23 2026 — Project → Materials → Theoretical Quantity → Labour. Planning
// enters the planned quantity per work item; Accounts → Project Wise →
// Material CC compares it with the project's work orders, matched by name —
// so the work order scope names are offered while typing.
export default function LabourTheoreticalQty({ projectId }) {
  const [items, setItems] = useState(null);
  const [scope, setScope] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState(null); // rows while editing
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setDraft(null);
    axios.get(`${API}/projects/${projectId}/labour-theoretical`).then((r) => {
      if (cancelled) return;
      setItems(r.data.items || []);
      setScope(r.data.scope_items || []);
      setCanEdit(!!r.data.can_edit);
    }).catch((e) => {
      if (cancelled) return;
      setItems([]);
      toast.error(e?.response?.data?.detail || 'Could not load labour quantities');
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const update = (i, patch) => setDraft((d) => d.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const setName = (i, name) => {
    const match = scope.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    // Take the work order's unit so the two sides can be compared.
    update(i, match?.unit ? { name, unit: match.unit } : { name });
  };

  // A row left completely empty is ignored; a half-filled one blocks Save.
  const filled = (draft || []).filter((r) => r.name.trim() || r.qty !== '');
  const invalid = filled.some((r) => !r.name.trim() || !(parseFloat(r.qty) > 0));

  const save = async () => {
    setBusy(true);
    try {
      const r = await axios.put(`${API}/projects/${projectId}/labour-theoretical`, {
        items: filled.map((x) => ({ name: x.name.trim(), unit: x.unit || '', qty: parseFloat(x.qty) })),
      });
      setItems(r.data.items);
      setDraft(null);
      toast.success('Labour theoretical quantities saved');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (items === null) return <p className="text-sm text-gray-400 text-center py-4">Loading...</p>;

  return (
    <div className="border rounded-lg" data-testid="labour-theoretical">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b flex-wrap">
        <p className="text-sm font-medium">Labour Theoretical Quantity</p>
        {canEdit && (draft === null ? (
          <Button size="sm" variant="outline" onClick={() => setDraft(items.length ? items.map((x) => ({ ...x, qty: String(x.qty) })) : [blank()])} data-testid="labour-theo-edit">
            <Edit className="h-3 w-3 mr-1" />Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft((d) => [...d, blank()])} data-testid="labour-theo-add"><Plus className="h-3 w-3 mr-1" />Add</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={busy}><X className="h-3 w-3 mr-1" />Cancel</Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={save} disabled={busy || invalid} data-testid="labour-theo-save"><Save className="h-3 w-3 mr-1" />Save</Button>
          </div>
        ))}
      </div>

      {draft === null ? (
        items.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">Labour theoretical quantities — no items yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs uppercase text-gray-500">
                <th className="px-3 py-2 text-left font-medium w-10">#</th>
                <th className="px-3 py-2 text-left font-medium">Work Item</th>
                <th className="px-3 py-2 text-right font-medium">Theoretical Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((x, i) => (
                <tr key={x.name}>
                  <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{x.name}</td>
                  <td className="px-3 py-2 text-right">{Number(x.qty).toLocaleString('en-IN')}{x.unit ? ` ${x.unit}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div className="p-3 space-y-2">
          <datalist id="labour-theo-scope">{scope.map((s) => <option key={s.name} value={s.name} />)}</datalist>
          <p className="text-xs text-gray-500">Use the same name as in the work order, so the two can be compared.</p>
          {draft.map((r, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Input list="labour-theo-scope" value={r.name} onChange={(e) => setName(i, e.target.value)} placeholder="Work item" className="h-9 text-sm flex-1 min-w-[180px]" data-testid={`labour-theo-name-${i}`} />
              <div className="w-36 shrink-0"><UnitSelect value={r.unit || ''} onChange={(v) => update(i, { unit: v })} className="h-9" data-testid={`labour-theo-unit-${i}`} /></div>
              <Input type="number" min={0} step="any" value={r.qty} onChange={(e) => update(i, { qty: e.target.value })} placeholder="Quantity" className="h-9 text-sm w-32 shrink-0" data-testid={`labour-theo-qty-${i}`} />
              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-600 shrink-0" onClick={() => setDraft((d) => d.filter((_, n) => n !== i))} aria-label="Remove row"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {invalid && <p className="text-xs text-red-600">Every row needs a work item and a quantity above 0.</p>}
        </div>
      )}
    </div>
  );
}
