import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ChevronDown, ChevronRight, FileText, History } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Oct 1 2026 — when Sales asks for an RE a second or third time, GM and
// Planning see the earlier estimates in full inside the RE popup. Used by
// the RE Projects page (Planning, and GM through the Planning Board) and the
// GM Dashboard's RE View / Edit popups.

const STATUS_LABELS = {
  re_requested: 'Requested',
  re_in_progress: 'In progress',
  re_submitted: 'Sent to GM',
  re_approved: 'GM approved',
  re_rejected: 'GM rejected',
  sent_to_client: 'Sent to client',
  client_feedback: 'Client feedback',
  client_approved: 'Client approved',
  deal_closed: 'Deal closed',
  converted: 'Converted',
};

const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
// Matches the popups' "(Revision RE2)" title; revision 0 is the first RE.
const reLabel = (revision) => (revision ? `Revision RE${revision}` : 'Original RE');

export default function PreviousREPanel({ reProjectId, revision }) {
  const [items, setItems] = useState([]);
  const [openIds, setOpenIds] = useState({});

  useEffect(() => {
    setItems([]);
    // An original RE (revision 0) has nothing before it.
    if (!reProjectId || !revision) return undefined;
    let alive = true;
    axios.get(`${API}/crm/re-projects/${reProjectId}/previous`)
      .then((r) => {
        if (!alive) return;
        const list = r.data || [];
        setItems(list);
        // The one just before this revision opens; older ones stay closed.
        setOpenIds(list[0] ? { [list[0].re_project_id]: true } : {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [reProjectId, revision]);

  if (!items.length) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50" data-testid="previous-re-panel">
      <CardContent className="p-4">
        <h4 className="font-semibold text-sm text-indigo-900 flex items-center gap-1.5">
          <History className="h-4 w-4" />
          Previous Rough Estimates
          <Badge className="bg-indigo-100 text-indigo-700 text-[10px] ml-1">{items.length}</Badge>
        </h4>
        <p className="text-xs text-indigo-700 mt-0.5">What was estimated before this revision (read-only).</p>
        <div className="space-y-2 mt-3">
          {items.map((p) => (
            <PreviousRE
              key={p.re_project_id}
              p={p}
              open={!!openIds[p.re_project_id]}
              onToggle={() => setOpenIds((o) => ({ ...o, [p.re_project_id]: !o[p.re_project_id] }))}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PreviousRE({ p, open, onToggle }) {
  const scope = p.rough_scope_items || [];
  const schedule = p.payment_schedule || [];
  const attachments = p.attachments || [];
  const total = p.estimated_total || scope.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const reason = p.revision_reason || p.regenerate_remarks || p.previous_client_feedback;
  const feedback = p.client_feedback_notes && p.client_feedback_notes !== reason ? p.client_feedback_notes : '';
  const trail = [
    p.prepared_by_name && `Prepared by ${p.prepared_by_name}`,
    p.submitted_at && `Sent to GM ${day(p.submitted_at)}`,
    p.gm_approved_at && `GM approved${p.gm_approved_by_name ? ` by ${p.gm_approved_by_name}` : ''} ${day(p.gm_approved_at)}`,
    p.sent_to_client_at && `Sent to client ${day(p.sent_to_client_at)}`,
  ].filter(Boolean);
  const details = [
    ['Project Name', p.project_name],
    ['Location', p.location],
    ['Square Feet', p.sqft ? `${p.sqft} sqft` : ''],
    // Stored lowercase ("villa").
    ['Building Type', p.building_type ? p.building_type.charAt(0).toUpperCase() + p.building_type.slice(1) : ''],
    ['Handover', p.handover_months ? `${p.handover_months} months` : ''],
  ];

  return (
    <div className="bg-white border border-indigo-100 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
        data-testid={`previous-re-${p.re_project_id}`}
      >
        {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
        <span className="font-semibold text-sm text-gray-900">{reLabel(p.revision)}</span>
        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[p.status] || String(p.status || '').replace(/_/g, ' ')}</Badge>
        {p.created_at && <span className="text-xs text-gray-500">{day(p.created_at)}</span>}
        <span className="ml-auto font-semibold text-sm text-purple-800">{inr(total)}</span>
      </button>

      {open && (
        <div className="border-t px-3 py-3 space-y-3 text-sm">
          {trail.length > 0 && <p className="text-xs text-gray-500">{trail.join(' · ')}</p>}

          {p.rough_requirement && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-800">Rough Requirement from Sales</p>
              <p className="text-gray-800 whitespace-pre-wrap">{p.rough_requirement}</p>
              {p.rough_requirement_by && (
                <p className="text-[11px] text-amber-600 mt-1">
                  {p.rough_requirement_by}{p.rough_requirement_at ? ` · ${day(p.rough_requirement_at)}` : ''}
                </p>
              )}
            </div>
          )}
          {reason && (
            <div className="rounded border border-orange-200 bg-orange-50 p-2">
              <p className="text-xs font-semibold text-orange-800">Revision Reason</p>
              <p className="text-gray-800 whitespace-pre-wrap">{reason}</p>
            </div>
          )}
          {feedback && (
            <div className="rounded border border-orange-200 bg-orange-50 p-2">
              <p className="text-xs font-semibold text-orange-800">Client Feedback</p>
              <p className="text-gray-800 whitespace-pre-wrap">{feedback}</p>
            </div>
          )}
          {p.status === 're_rejected' && p.gm_rejection_reason && (
            <div className="rounded border border-red-200 bg-red-50 p-2">
              <p className="text-xs font-semibold text-red-800">GM Rejection Reason</p>
              <p className="text-gray-800 whitespace-pre-wrap">{p.gm_rejection_reason}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[11px] text-gray-500">{label}</p>
                <p className="font-medium break-words">{value || '-'}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Rough Scope of Work</p>
            {scope.length === 0 ? (
              <p className="text-xs text-gray-400">No scope items.</p>
            ) : (
              <div className="border rounded overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-8">#</th>
                      <th className="px-2 py-1.5 text-left">Description</th>
                      <th className="px-2 py-1.5 text-center">Qty</th>
                      <th className="px-2 py-1.5 text-center">Unit</th>
                      <th className="px-2 py-1.5 text-right">Rate</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {scope.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1.5">{item.description || item.name || '-'}</td>
                        <td className="px-2 py-1.5 text-center">{item.quantity ?? '-'}</td>
                        <td className="px-2 py-1.5 text-center">{item.unit || '-'}</td>
                        <td className="px-2 py-1.5 text-right">{inr(item.rate)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{inr(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-purple-50">
                      <td colSpan={5} className="px-2 py-1.5 text-right font-semibold text-purple-800">Estimated Total</td>
                      <td className="px-2 py-1.5 text-right font-bold text-purple-900">{inr(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {schedule.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Payment Schedule</p>
              <div className="border rounded overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Stage</th>
                      <th className="px-2 py-1.5 text-right">%</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                      <th className="px-2 py-1.5 text-left">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schedule.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">{row.stage_name || '-'}</td>
                        <td className="px-2 py-1.5 text-right">{row.percentage !== '' && row.percentage != null ? `${row.percentage}%` : '-'}</td>
                        <td className="px-2 py-1.5 text-right">{inr(row.amount)}</td>
                        <td className="px-2 py-1.5">{row.due_date ? day(row.due_date) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {p.planning_notes && (
            <div>
              <p className="text-xs font-semibold text-gray-700">Planning Notes</p>
              <p className="text-gray-700 whitespace-pre-wrap">{p.planning_notes}</p>
            </div>
          )}

          {attachments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <a
                    key={att.file_id}
                    href={`${API}/crm/re-projects/attachments/${att.file_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-purple-700 hover:underline border rounded px-2 py-1 bg-white max-w-full"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{att.label || att.filename}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
