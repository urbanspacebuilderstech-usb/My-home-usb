import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { StatusPill } from "./StatusPill";
import { AlertTriangle, Edit3, Clock, User as UserIcon } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Unified Correction Dialog — shared across all entities that flow through the
 * Correction Engine (petty cash, material request, lead advance, income, etc.).
 *
 * Props:
 *   open, onClose          — modal state
 *   entityType             — display name (e.g. "Petty Cash", "Material Request")
 *   doc                    — the backend document for the entity (must include status + history)
 *   resubmitUrl            — full URL for the resubmit POST (e.g. `${API}/petty-cash/{id}/resubmit`)
 *   editableFields         — array of { key, label, type, required } describing the editable form
 *   canEdit                — boolean. When false the dialog is read-only (e.g. accountant viewing history)
 *   onAfterResubmit        — callback after successful resubmit; parent should refresh data
 */
export const CorrectionDialog = ({
  open,
  onClose,
  entityType = "Request",
  doc,
  resubmitUrl,
  editableFields = [],
  canEdit = true,
  onAfterResubmit,
}) => {
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && doc) {
      // Seed editable fields with current values for easy correction.
      const seed = {};
      editableFields.forEach((f) => {
        if (doc[f.key] != null) seed[f.key] = doc[f.key];
      });
      setEdits(seed);
      setEditing(false);
    }
  }, [open, doc?.[Object.keys(doc || {})[0]]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return null;

  const status = doc.status || "";
  const isRejected = status === "accountant_rejected" || status === "rejected" || status === "accounts_rejected";
  const isCorrection = status === "under_correction";
  const reasonText = doc.rejection_reason || doc.correction_reason || doc.rejected_reason || "";
  const rejectorName = doc.rejected_by_name || doc.correction_requested_by_name || "Accountant";
  const rejectedAt = doc.rejected_at || doc.correction_requested_at;
  const history = doc.correction_history || [];

  const handleResubmit = async () => {
    // Validate required fields
    for (const f of editableFields) {
      if (f.required && (edits[f.key] == null || edits[f.key] === "")) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await axios.post(resubmitUrl, edits);
      toast.success(`${entityType} resubmitted for accountant approval`);
      if (typeof onAfterResubmit === "function") await onAfterResubmit();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resubmit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="correction-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {isCorrection
              ? `${entityType} — Sent Back for Correction`
              : isRejected
              ? `${entityType} — Rejected by Accountant`
              : `${entityType} — Review`}
            <StatusPill status={status} className="ml-2" />
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-left">
              {/* Rejection / correction reason banner */}
              {(isRejected || isCorrection) && reasonText && (
                <div className="mt-2 p-3 rounded-lg bg-red-50 border-2 border-red-300" data-testid="correction-reason-banner">
                  <div className="flex items-center gap-2 mb-1">
                    <UserIcon className="h-3.5 w-3.5 text-red-700" />
                    <span className="text-xs font-bold text-red-800">
                      {isCorrection ? "Correction requested by" : "Rejected by"}: {rejectorName}
                    </span>
                    {rejectedAt && (
                      <span className="text-xs text-red-600">
                        <Clock className="h-3 w-3 inline mr-0.5" />
                        {new Date(rejectedAt).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-red-900 font-medium">
                    <span className="font-bold">Reason:</span> {reasonText}
                  </p>
                  {isCorrection && (
                    <p className="text-[11px] text-red-700 mt-1 italic">
                      ⚠ This entry was already approved. The amount has been removed from Cashbook and Cashflow Engine until you correct & resubmit.
                    </p>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Editable fields */}
        {canEdit && (isRejected || isCorrection) && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Edit3 className="h-4 w-4 text-blue-600" />
                Edit & Resubmit
              </h4>
              {!editing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  className="text-xs"
                  data-testid="correction-edit-btn"
                >
                  <Edit3 className="h-3 w-3 mr-1" /> Enable Edit
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {editableFields.map((f) => (
                <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
                  <Label className="text-xs font-semibold text-gray-700">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </Label>
                  {f.type === "textarea" ? (
                    <Textarea
                      data-testid={`correction-field-${f.key}`}
                      disabled={!editing}
                      value={edits[f.key] ?? ""}
                      onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    <Input
                      data-testid={`correction-field-${f.key}`}
                      disabled={!editing}
                      type={f.type || "text"}
                      value={edits[f.key] ?? ""}
                      onChange={(e) => setEdits({ ...edits, [f.key]: f.type === "number" ? parseFloat(e.target.value || 0) : e.target.value })}
                      placeholder={f.placeholder}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History timeline */}
        {history.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-bold text-gray-800 mb-2">Correction History</h4>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {history.slice().reverse().map((h, i) => (
                <div key={i} className="text-xs p-2 rounded bg-gray-50 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {h.action === "rejected" ? "🔴 Rejected" : h.action === "resubmitted" ? "🟡 Resubmitted" : h.action === "sent_for_correction" ? "🔄 Sent for Correction" : h.action}
                    </Badge>
                    <span className="text-gray-500">{h.by_name} • {new Date(h.at).toLocaleString("en-IN")}</span>
                  </div>
                  {h.reason && <p className="text-gray-700 mt-1 italic">"{h.reason}"</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel data-testid="correction-close-btn">Close</AlertDialogCancel>
          {canEdit && editing && (isRejected || isCorrection) && (
            <AlertDialogAction
              data-testid="correction-resubmit-btn"
              onClick={handleResubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? "Resubmitting..." : "Save & Resubmit for Approval"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CorrectionDialog;
