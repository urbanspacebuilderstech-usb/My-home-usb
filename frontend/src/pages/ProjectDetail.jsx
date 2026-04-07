import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, LogOut, ArrowLeft, ArrowRight, Plus, Edit, Trash2, Save, X,
  DollarSign, FileText, TrendingUp, Wallet, MinusCircle, CheckCircle2, Clock,
  AlertTriangle, Check, XCircle, ShieldCheck, Send, Upload, Printer, Download, Folder,
  ArrowDownRight, ArrowUpRight, RefreshCw, Eye, Layers, Users, Package, HardHat, CreditCard,
  GitBranch
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { generateREPDF } from '../utils/pdfGenerator';
import { FileUpload, FileList } from '../components/FileUpload';
import { AppHeader } from '../components/AppHeader';
import GanttChart from '../components/GanttChart';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';
import { SortableList, SortableTableRow, DragHandle } from '../components/SortableList';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Initial empty rows for bulk add
const createEmptyRows = (type, count = 3) => {
  if (type === 'scope') {
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }));
  } else if (type === 'payment') {
    return Array(count).fill(null).map(() => ({ stage_name: '', percentage: '', amount: '', due_date: '' }));
  } else if (type === 'addition') {
    return Array(count).fill(null).map(() => ({ description: '', estimated_amount: '' }));
  } else if (type === 'deduction') {
    return Array(count).fill(null).map(() => ({ description: '', amount: '', remarks: '' }));
  }
  return [];
};

const WorkflowBadge = ({ status }) => {
  const config = {
    draft: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_verification: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_approval: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    approved: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle }
  };
  const cfg = config[status] || config.draft;
  const Icon = cfg.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

// ============ PAYMENT SUMMARY SECTION WITH INCOME/EXPENSE VIEWS ============
const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

function PaymentSummarySection({ user, projectId, paymentSummary, formatCurrency, getPaymentStatusBadge, openCollectDialog }) {
  const [incomeData, setIncomeData] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [financeTab, setFinanceTab] = useState('income');

  const canSeeTotals = ['super_admin', 'accountant'].includes(user?.role);
  const canSeePaymentDetails = ['super_admin', 'accountant', 'general_manager', 'planning'].includes(user?.role);

  useEffect(() => {
    if (canSeePaymentDetails) {
      (async () => {
        try {
          const [incRes, expRes] = await Promise.all([
            axios.get(`${API}/projects/${projectId}/income`).catch(() => null),
            axios.get(`${API}/projects/${projectId}/expenses`).catch(() => null),
          ]);
          if (incRes) setIncomeData(incRes.data);
          if (expRes) setExpenseData(expRes.data);
        } catch { /* ignore */ }
        setLoadingFinance(false);
      })();
    } else {
      setLoadingFinance(false);
    }
  }, [projectId, canSeePaymentDetails]);

  const incomeEntries = incomeData?.entries || [];
  const incomeSummary = incomeData?.summary || {};
  const expenseSummary = expenseData?.summary || {};
  const materialExpenses = expenseData?.material || [];
  const labourExpenses = expenseData?.labour || [];
  const vendorExpenses = expenseData?.vendor_service || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Payment Summary</h3>
          <p className="text-xs sm:text-sm text-gray-500">Complete payment schedule from advance to handover</p>
        </div>
      </div>

      {/* Totals - Only for Super Admin & Accountant */}
      {canSeeTotals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="payment-summary-totals">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Income</p>
              <p className="text-lg font-bold text-green-700">{fmtFull(incomeSummary.total_income)}</p>
              <p className="text-[10px] text-gray-400">{incomeEntries.length} entries</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Expense</p>
              <p className="text-lg font-bold text-red-600">{fmtFull(expenseSummary.total_expenses)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Paid</p>
              <p className="text-lg font-bold text-blue-600">{fmtFull(expenseSummary.total_paid)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Net Balance</p>
              <p className={`text-lg font-bold ${(incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmtFull((incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Cards */}
      {paymentSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-3">
              <p className="text-xs text-indigo-600 font-medium">Project Value</p>
              <p className="text-lg font-bold text-indigo-700">{formatCurrency(paymentSummary.project_value || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-3">
              <p className="text-xs text-emerald-600 font-medium">Advance Paid</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(paymentSummary.advance_payment?.amount || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600 font-medium">Stages Scheduled</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(paymentSummary.summary?.total_scheduled || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-600 font-medium">Total Received</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(paymentSummary.summary?.total_received || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <p className="text-xs text-orange-600 font-medium">Balance Due</p>
              <p className="text-lg font-bold text-orange-700">{formatCurrency(paymentSummary.summary?.total_balance || 0)}</p>
              <p className="text-[10px] text-orange-500">{paymentSummary.summary?.collection_percentage?.toFixed(1) || 0}% collected</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income / Expense Mini Views - Visible to GM, Planning, Super Admin, Accountant */}
      {canSeePaymentDetails && (
        <Card data-testid="income-expense-section">
          <CardHeader className="pb-0 pt-3 px-4 border-b">
            <Tabs value={financeTab} onValueChange={setFinanceTab}>
              <TabsList className="grid grid-cols-2 w-full max-w-xs">
                <TabsTrigger value="income" className="gap-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-800" data-testid="project-income-tab">
                  <ArrowDownRight className="h-3.5 w-3.5" /> Income ({incomeEntries.length})
                </TabsTrigger>
                <TabsTrigger value="expense" className="gap-1.5 data-[state=active]:bg-red-100 data-[state=active]:text-red-800" data-testid="project-expense-tab">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Expense
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFinance ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-amber-600" /></div>
            ) : financeTab === 'income' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-income-table">
                  <thead className="bg-green-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Reference</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomeEntries.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No income entries</td></tr>
                    ) : incomeEntries.map((e, i) => (
                      <tr key={e.income_id || i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">{new Date(e.payment_date || e.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 font-medium">{e.stage || e.description || 'Payment'}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] capitalize">{e.payment_mode?.replace('_', ' ') || 'Cash'}</Badge></td>
                        <td className="px-3 py-2 font-mono text-[10px]">{e.reference_number || e.cheque_number || '-'}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{fmtFull(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {canSeeTotals && incomeEntries.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-gray-600">Total Income:</td>
                        <td className="px-3 py-2 text-right text-green-700 text-sm">{fmtFull(incomeSummary.total_income)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-expense-table">
                  <thead className="bg-red-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialExpenses.length === 0 && labourExpenses.length === 0 && vendorExpenses.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No expense entries</td></tr>
                    ) : (
                      <>
                        {materialExpenses.map((e, i) => (
                          <tr key={e.expense_id || `m-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-blue-100 text-blue-700 text-[10px]">Material</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.material_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.final_amount || e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {labourExpenses.map((e, i) => (
                          <tr key={e.expense_id || `l-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-purple-100 text-purple-700 text-[10px]">Labour</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.description || e.worker_name || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.contractor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {vendorExpenses.map((e, i) => (
                          <tr key={e.expense_id || `v-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + labourExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-amber-100 text-amber-700 text-[10px]">Vendor</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.service_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                  {canSeeTotals && (materialExpenses.length > 0 || labourExpenses.length > 0 || vendorExpenses.length > 0) && (
                    <tfoot className="bg-red-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total Expense:</td>
                        <td className="px-3 py-2 text-right text-red-600 text-sm">{fmtFull(expenseSummary.total_expenses)}</td>
                        <td className="px-3 py-2 text-right text-green-600 text-sm">{fmtFull(expenseSummary.total_paid)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage-wise Payment Schedule */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" /> Stage-wise Payment Schedule
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">S.No</th>
                <th className="px-3 py-3 text-left font-semibold">Payment Stage</th>
                <th className="px-3 py-3 text-right font-semibold">%</th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
                <th className="px-3 py-3 text-right font-semibold">Received</th>
                <th className="px-3 py-3 text-center font-semibold">Mode</th>
                <th className="px-3 py-3 text-center font-semibold">Date</th>
                <th className="px-3 py-3 text-center font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Remarks</th>
                {(user?.role === 'cre' || user?.role === 'super_admin') && (
                  <th className="px-3 py-3 text-center font-semibold">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(!paymentSummary?.payment_stages || paymentSummary.payment_stages.length === 0) ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No payment schedule created yet.</td></tr>
              ) : paymentSummary.payment_stages.map((stage, idx) => {
                const isPaid = stage.status === 'paid';
                return (
                  <tr key={stage.stage_id} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}>
                    <td className="px-3 py-3 font-medium">{stage.stage_label || idx + 1}</td>
                    <td className="px-3 py-3 max-w-xs"><p className="font-medium truncate">{stage.stage_name}</p></td>
                    <td className="px-3 py-3 text-right">{stage.percentage}%</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatCurrency(stage.amount)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-green-600">{formatCurrency(stage.amount_received || 0)}</td>
                    <td className="px-3 py-3 text-center text-xs">
                      {stage.payment_mode ? <Badge variant="outline" className="capitalize">{stage.payment_mode.replace('_', ' ')}</Badge> : '-'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">{stage.payment_date ? new Date(stage.payment_date).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="px-3 py-3 text-center">{getPaymentStatusBadge(stage.status)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-xs truncate">{stage.remarks || '-'}</td>
                    {(user?.role === 'cre' || user?.role === 'super_admin') && (
                      <td className="px-3 py-3 text-center">
                        {!isPaid ? (
                          <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => openCollectDialog(stage)}>
                            <DollarSign className="h-3 w-3 mr-1" /> Collect
                          </Button>
                        ) : <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {paymentSummary?.payment_stages?.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right">100%</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(paymentSummary.summary?.total_scheduled)}</td>
                  <td className="px-3 py-3 text-right text-green-600">{formatCurrency(paymentSummary.summary?.total_received)}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('rough-estimate');
  
  // Bulk dialog states
  const [bulkScopeDialog, setBulkScopeDialog] = useState(false);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  const [bulkAdditionDialog, setBulkAdditionDialog] = useState(false);
  const [bulkDeductionDialog, setBulkDeductionDialog] = useState(false);
  
  // Verification dialog
  const [verifyDialog, setVerifyDialog] = useState({ open: false, type: '', ids: [] });
  const [verifyCode, setVerifyCode] = useState('');
  
  // Multi-select for bulk delete
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  
  // Project Stages
  const [projectStages, setProjectStages] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showAddStages, setShowAddStages] = useState(false);
  const [newStages, setNewStages] = useState([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageData, setEditStageData] = useState({});
  const [stagesView, setStagesView] = useState('table'); // 'table' or 'gantt'
  
  // Bulk form data
  const [bulkScopeRows, setBulkScopeRows] = useState(createEmptyRows('scope'));
  const [bulkPaymentRows, setBulkPaymentRows] = useState(createEmptyRows('payment'));
  const [bulkAdditionRows, setBulkAdditionRows] = useState(createEmptyRows('addition'));
  const [bulkDeductionRows, setBulkDeductionRows] = useState(createEmptyRows('deduction'));
  
  // Editing states
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingAddition, setEditingAddition] = useState(null);
  const [editingScopeItem, setEditingScopeItem] = useState(null);
  const [editScopeForm, setEditScopeForm] = useState({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  const [deleteProjectDialog, setDeleteProjectDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Payment Schedule Edit Dialog states
  const [editPaymentDialog, setEditPaymentDialog] = useState(false);
  const [editPaymentStage, setEditPaymentStage] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ stage_name: '', percentage: '', amount: '', due_date: '' });
  const [submitScheduleDialog, setSubmitScheduleDialog] = useState(false);
  
  // Payment Summary state
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [collectPaymentDialog, setCollectPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount_received: '', payment_mode: 'bank_transfer', payment_reference: '', remarks: '' });
  
  // Rough Estimate state
  const [reProject, setReProject] = useState(null);
  const [reRevisions, setReRevisions] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [designData, setDesignData] = useState({ site_plans: [], design_files: [] });
  const [teamData, setTeamData] = useState({ architect: null, project_manager: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
  const [materialsData, setMaterialsData] = useState({ summary: {}, materials: [] });
  const [laboursData, setLaboursData] = useState({ summary: {}, labours: [] });
  const [vendorAssignments, setVendorAssignments] = useState([]);
  const [allVendors, setAllVendors] = useState([]);
  const [vendorCategories, setVendorCategories] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [materialSubTab, setMaterialSubTab] = useState('materials');
  const [assignVendorDialog, setAssignVendorDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ category: '', vendor_id: '', brand: '' });
  const [workOrders, setWorkOrders] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  const [labourSubTab, setLabourSubTab] = useState('requests');
  const [showWOForm, setShowWOForm] = useState(false);
  const [woForm, setWoForm] = useState({ contractor_id: '', description: '', total_amount: 0, payment_stages: [{ stage_name: 'Stage 1', amount: 0, percentage: 0 }] });
  const [labourAttendance, setLabourAttendance] = useState([]);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [attForm, setAttForm] = useState({ contractor_id: '', work_order_id: '', stage_id: '', date: new Date().toISOString().split('T')[0], entries: [] });
  const [materialInventory, setMaterialInventory] = useState([]);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [invForm, setInvForm] = useState({ material_name: '', unit: '', date: new Date().toISOString().split('T')[0], opening_stock: 0, received: 0, used: 0, notes: '' });

  // Team editing state
  const [teamEditDialog, setTeamEditDialog] = useState(false);
  const [teamRoleUsers, setTeamRoleUsers] = useState({});
  const [teamDraft, setTeamDraft] = useState({});
  const [teamSaving, setTeamSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      // Redirect Site Engineers to their dedicated board
      if (userRes.data.role === 'site_engineer') {
        window.location.href = `/site-engineer/project/${projectId}`;
        return;
      }
      
      // Run ALL data fetches in parallel
      const [projectRes, summaryRes, stagesRes, templatesRes, filesRes, designRes, teamRes, materialsRes, laboursRes, vendorAssignRes, vendorsRes, vendorCatsRes, poRes] = await Promise.all([
        axios.get(`${API}/projects/${projectId}/full-details`),
        axios.get(`${API}/projects/${projectId}/payment-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/project-stages`).catch(() => null),
        axios.get(`${API}/stage-templates`).catch(() => null),
        axios.get(`${API}/files?project_id=${projectId}`, { withCredentials: true }).catch(() => null),
        axios.get(`${API}/architect/projects/${projectId}/all-design-data`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/team`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/materials-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/labours-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/vendor-assignments`).catch(() => null),
        axios.get(`${API}/vendor-master`).catch(() => null),
        axios.get(`${API}/vendor-categories`).catch(() => null),
        axios.get(`${API}/purchase-orders?project_id=${projectId}`).catch(() => null),
      ]);
      
      setProjectData(projectRes.data);
      if (summaryRes) setPaymentSummary(summaryRes.data);
      if (stagesRes) setProjectStages(stagesRes.data);
      if (templatesRes) setStageTemplates(templatesRes.data);
      if (filesRes) setProjectFiles(filesRes.data);
      if (designRes) setDesignData(designRes.data || { site_plans: [], design_files: [] });
      if (teamRes) setTeamData(teamRes.data || { architect: null, project_manager: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
      if (materialsRes) setMaterialsData(materialsRes.data || { summary: {}, materials: [] });
      if (laboursRes) setLaboursData(laboursRes.data || { summary: {}, labours: [] });
      if (vendorAssignRes) setVendorAssignments(vendorAssignRes.data || []);
      if (vendorsRes) setAllVendors(vendorsRes.data || []);
      if (vendorCatsRes) setVendorCategories(vendorCatsRes.data || []);
      if (poRes) setPurchaseOrders(poRes.data || []);

      // Load work orders, contractors, attendance, inventory
      try {
        const [woRes, contRes, attRes, invRes] = await Promise.all([
          axios.get(`${API}/labour-work-orders?project_id=${projectId}`).catch(() => null),
          axios.get(`${API}/contractors`).catch(() => null),
          axios.get(`${API}/labour-attendance?project_id=${projectId}`).catch(() => null),
          axios.get(`${API}/material-inventory?project_id=${projectId}`).catch(() => null)
        ]);
        if (woRes) setWorkOrders(woRes.data || []);
        if (contRes) setAllContractors(contRes.data || []);
        if (attRes) setLabourAttendance(attRes.data || []);
        if (invRes) setMaterialInventory(invRes.data || []);
      } catch { /* ignore */ }
      
      // Fetch RE project if available (depends on projectRes)
      if (projectRes.data.project?.re_project_id) {
        try {
          const reRes = await axios.get(`${API}/crm/re-projects/${projectRes.data.project.re_project_id}`);
          setReProject(reRes.data);
          // Load all revisions
          if (reRes.data.parent_re_number) {
            try {
              const revRes = await axios.get(`${API}/crm/re-projects/by-number/${reRes.data.parent_re_number}`);
              setReRevisions(revRes.data || []);
            } catch { setReRevisions([reRes.data]); }
          } else {
            setReRevisions([reRes.data]);
          }
        } catch (e) { /* RE project not available */ }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const fetchProjectFiles = async () => {
    try {
      const res = await axios.get(`${API}/files?project_id=${projectId}`, { withCredentials: true });
      setProjectFiles(res.data);
    } catch {
      // Files endpoint may not have data yet
    }
  };

  const fetchDesignData = async () => {
    try {
      const res = await axios.get(`${API}/architect/projects/${projectId}/all-design-data`);
      setDesignData(res.data || { site_plans: [], design_files: [] });
    } catch {
      // Design data may not exist
    }
  };

  const TEAM_ROLES = [
    { key: 'architect', label: 'Architect', dbRole: 'architect', color: 'purple' },
    { key: 'project_manager', label: 'Project Manager', dbRole: 'project_manager', color: 'indigo' },
    { key: 'sr_site_engineer', label: 'Sr. Site Engineer', dbRole: 'sr_site_engineer', color: 'amber' },
    { key: 'site_engineer', label: 'Site Engineer', dbRole: 'site_engineer', color: 'green' },
    { key: 'cre', label: 'CRE', dbRole: 'cre', color: 'blue' },
    { key: 'qc', label: 'QC', dbRole: 'qc', color: 'rose' },
    { key: 'procurement', label: 'Procurement', dbRole: 'procurement', color: 'orange' },
  ];

  const fetchTeamData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/team`);
      setTeamData(res.data || { architect: null, project_manager: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
    } catch { /* No team data */ }
  };

  const openTeamEditDialog = async () => {
    // Build draft from current assignments
    const draft = {};
    TEAM_ROLES.forEach(r => { draft[r.key] = teamData[r.key]?.user_id || ''; });
    setTeamDraft(draft);
    // Fetch users for each role in parallel
    const roleMap = {};
    await Promise.all(TEAM_ROLES.map(async (r) => {
      try {
        const res = await axios.get(`${API}/users/by-role/${r.dbRole}`);
        roleMap[r.key] = res.data || [];
      } catch { roleMap[r.key] = []; }
    }));
    setTeamRoleUsers(roleMap);
    setTeamEditDialog(true);
  };

  const handleTeamSave = async () => {
    setTeamSaving(true);
    try {
      const payload = {};
      TEAM_ROLES.forEach(r => { payload[r.key] = (teamDraft[r.key] && teamDraft[r.key] !== '__none__') ? teamDraft[r.key] : null; });
      await axios.patch(`${API}/projects/${projectId}/team`, payload);
      toast.success('Team updated successfully');
      setTeamEditDialog(false);
      fetchTeamData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update team'); }
    setTeamSaving(false);
  };

  const fetchMaterialsData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/materials-summary`);
      setMaterialsData(res.data || { summary: {}, materials: [] });
    } catch { /* No materials data */ }
  };

  const fetchVendorData = async () => {
    try {
      const [aRes, vRes, cRes, poRes] = await Promise.all([
        axios.get(`${API}/projects/${projectId}/vendor-assignments`),
        axios.get(`${API}/vendor-master`),
        axios.get(`${API}/vendor-categories`),
        axios.get(`${API}/purchase-orders?project_id=${projectId}`)
      ]);
      setVendorAssignments(aRes.data || []);
      setAllVendors(vRes.data || []);
      setVendorCategories(cRes.data || []);
      setPurchaseOrders(poRes.data || []);
    } catch { /* ignore */ }
  };

  const handleAssignVendor = async () => {
    if (!assignForm.category || !assignForm.vendor_id) return toast.error('Select category and vendor');
    try {
      await axios.post(`${API}/projects/${projectId}/vendor-assignments`, assignForm);
      toast.success('Vendor assigned');
      setAssignVendorDialog(false);
      setAssignForm({ category: '', vendor_id: '', brand: '' });
      fetchVendorData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRemoveAssignment = async (category) => {
    if (!window.confirm('Remove this vendor assignment?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/vendor-assignments/${encodeURIComponent(category)}`);
      toast.success('Removed');
      fetchVendorData();
    } catch { toast.error('Failed to remove'); }
  };

  const fetchWorkOrderData = async () => {
    try {
      const [woRes, cRes, attRes, invRes] = await Promise.all([
        axios.get(`${API}/labour-work-orders?project_id=${projectId}`),
        axios.get(`${API}/contractors`),
        axios.get(`${API}/labour-attendance?project_id=${projectId}`),
        axios.get(`${API}/material-inventory?project_id=${projectId}`)
      ]);
      setWorkOrders(woRes.data || []);
      setAllContractors(cRes.data || []);
      setLabourAttendance(attRes.data || []);
      setMaterialInventory(invRes.data || []);
    } catch { /* ignore */ }
  };

  const handleCreateWO = async () => {
    if (!woForm.contractor_id || !woForm.total_amount) return toast.error('Select contractor and amount');
    const contractor = allContractors.find(c => c.contractor_id === woForm.contractor_id);
    try {
      await axios.post(`${API}/labour-work-orders`, {
        project_id: projectId,
        project_name: project?.name || '',
        contractor_id: woForm.contractor_id,
        contractor_name: contractor?.name || '',
        contractor_type: contractor?.contractor_type || '',
        description: woForm.description,
        total_amount: woForm.total_amount,
        payment_stages: woForm.payment_stages
      });
      toast.success('Work order created! Site Engineer can now log attendance.');
      setShowWOForm(false);
      setWoForm({ contractor_id: '', description: '', total_amount: 0, payment_stages: [{ stage_name: 'Stage 1', amount: 0, percentage: 0 }] });
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRequestStagePayment = async (woId, stageId, amount) => {
    try {
      await axios.patch(`${API}/labour-work-orders/${woId}/stages/${stageId}/request-payment`, { requested_amount: amount });
      toast.success('Payment requested! Goes to Planning for review.');
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleSubmitAttendance = async () => {
    if (!attForm.contractor_id) return toast.error('Select contractor');
    const contractor = allContractors.find(c => c.contractor_id === attForm.contractor_id);
    try {
      await axios.post(`${API}/labour-attendance`, {
        project_id: projectId,
        contractor_id: attForm.contractor_id,
        contractor_name: contractor?.name || '',
        work_order_id: attForm.work_order_id,
        stage_id: attForm.stage_id,
        date: attForm.date,
        entries: attForm.entries
      });
      toast.success('Attendance saved for the day.');
      setShowAttendanceForm(false);
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleSubmitInventory = async () => {
    if (!invForm.material_name) return toast.error('Select material');
    try {
      await axios.post(`${API}/material-inventory`, {
        project_id: projectId,
        ...invForm
      });
      toast.success('Inventory entry saved.');
      setShowInventoryForm(false);
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const fetchLaboursData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/labours-summary`);
      setLaboursData(res.data || { summary: {}, labours: [] });
    } catch { /* No labours data */ }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  // Format currency for PDF
  // Generate PDF handler using shared utility
  const handleGenerateREPDF = async () => {
    if (!reProject) {
      toast.error('No Rough Estimate available');
      return;
    }
    try {
      await generateREPDF(reProject);
      toast.success('Rough Estimate PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleConvertToScope = async () => {
    const scopeItems = reProject?.rough_scope_items || reProject?.scope_items || [];
    if (!scopeItems.length) {
      toast.error('No scope items in the Rough Estimate to convert');
      setActiveTab('scope');
      return;
    }
    
    // Check if already converted (scope items from RE already exist)
    const existingFromRE = (projectData?.scope_items || []).filter(
      s => s.remarks && s.remarks.includes('From RE:')
    );
    if (existingFromRE.length > 0) {
      toast.error('Scope items already converted from Rough Estimate');
      setActiveTab('scope');
      return;
    }
    
    try {
      const items = scopeItems.map(item => ({
        item_name: item.name || item.item_name,
        quantity: parseFloat(item.quantity) || 1,
        unit: item.unit || 'Nos',
        unit_rate: parseFloat(item.rate || item.unit_rate) || 0,
        remarks: `From RE: ${reProject.project_name || ''}`
      }));
      
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items
      });
      
      toast.success(`Converted ${items.length} RE items to project scope`);
      await fetchData(false);
      setActiveTab('scope');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to convert to scope');
    }
  };

  // ==================== BULK ADD HANDLERS ====================
  const handleBulkAddScope = async () => {
    const validItems = bulkScopeRows.filter(r => r.item_name && r.unit_rate);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          item_name: r.item_name,
          quantity: parseFloat(r.quantity) || 1,
          unit: r.unit || 'Nos',
          unit_rate: parseFloat(r.unit_rate) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} scope items`);
      setBulkScopeDialog(false);
      setBulkScopeRows(createEmptyRows('scope'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add scope items');
    }
  };

  const handleBulkAddPayment = async () => {
    const validItems = bulkPaymentRows.filter(r => r.stage_name && (r.percentage || r.amount));
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    // Validate: total percentage cannot exceed 100%
    const existingPct = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
    const newPct = validItems.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
    
    if (existingPct + newPct > 100) {
      const remaining = Math.round((100 - existingPct) * 100) / 100;
      toast.error(`Total would be ${existingPct + newPct}%. Only ${remaining}% remaining.`);
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          stage_name: r.stage_name,
          percentage: parseFloat(r.percentage) || 0,
          amount: parseFloat(r.amount) || 0,
          due_date: r.due_date || null
        }))
      });
      toast.success(`Added ${validItems.length} payment stages`);
      setBulkPaymentDialog(false);
      setBulkPaymentRows(createEmptyRows('payment'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add payment stages');
    }
  };

  const handleBulkAddAddition = async () => {
    const validItems = bulkAdditionRows.filter(r => r.description && r.estimated_amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/additional-costs/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          estimated_amount: parseFloat(r.estimated_amount) || 0
        }))
      });
      toast.success(`Added ${validItems.length} additions`);
      setBulkAdditionDialog(false);
      setBulkAdditionRows(createEmptyRows('addition'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add additions');
    }
  };

  const handleBulkAddDeduction = async () => {
    const validItems = bulkDeductionRows.filter(r => r.description && r.amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/deductions/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          amount: parseFloat(r.amount) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} deductions`);
      setBulkDeductionDialog(false);
      setBulkDeductionRows(createEmptyRows('deduction'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add deductions');
    }
  };

  // ==================== VERIFICATION HANDLER ====================
  const openVerifyDialog = (type, ids) => {
    setVerifyDialog({ open: true, type, ids });
    setVerifyCode('');
  };

  const handleVerify = async () => {
    if (verifyCode !== 'VERIFY') {
      toast.error("Please type 'VERIFY' exactly in capital letters");
      return;
    }
    
    try {
      const endpoint = {
        scope: '/scope-items/verify',
        payment: '/payment-stages/verify',
        addition: '/additional-costs/verify',
        deduction: '/deductions/verify'
      }[verifyDialog.type];
      
      await axios.post(`${API}${endpoint}`, {
        item_ids: verifyDialog.ids,
        verification_code: verifyCode
      });
      
      toast.success('Items verified! Goes to Accountant for payment approval.');
      setVerifyDialog({ open: false, type: '', ids: [] });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Verification failed');
    }
  };

  // ==================== APPROVAL HANDLER (Super Admin) ====================
  const handleApprove = async (type, ids, action) => {
    try {
      const endpoint = {
        scope: '/scope-items/approve',
        payment: '/payment-stages/approve',
        addition: '/additional-costs/approve',
        deduction: '/deductions/approve'
      }[type];
      
      await axios.post(`${API}${endpoint}`, { item_ids: ids, action });
      toast.success(`Items ${action}d successfully`);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || `${action} failed`);
    }
  };

  // ==================== DELETE HANDLERS ====================
  const handleDeleteScope = async (scopeId) => {
    if (!confirm('Delete this scope item?')) return;
    try {
      await axios.delete(`${API}/scope-items/${scopeId}`);
      toast.success('Scope item deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete scope item');
    }
  };

  const handleScopeReorder = async (newIds) => {
    // Optimistic local reorder
    const newItems = newIds.map(id => scope_items.find(s => s.scope_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      scope_items: newItems
    }));
    try {
      await axios.post(`${API}/scope-items/reorder`, { scope_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleAdditionalCostReorder = async (newIds) => {
    const newItems = newIds.map(id => additional_costs.find(c => c.cost_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      additional_costs: newItems
    }));
    try {
      await axios.post(`${API}/additional-costs/reorder`, { cost_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleDeductionReorder = async (newIds) => {
    const newItems = newIds.map(id => deductions.find(d => d.deduction_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      deductions: newItems
    }));
    try {
      await axios.post(`${API}/deductions/reorder`, { deduction_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleStageReorder = async (newIds) => {
    const newStages = newIds.map(id => projectStages.find(s => s.stage_id === id)).filter(Boolean);
    setProjectStages(newStages);
    try {
      await axios.post(`${API}/projects/${projectId}/project-stages/reorder`, { stage_ids: newIds });
    } catch { toast.error('Failed to save stage order'); }
  };

  const handleDeletePayment = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  const handleBulkDeleteScope = async () => {
    if (!selectedScopeIds.length) return;
    if (!confirm(`Delete ${selectedScopeIds.length} selected scope item(s)?`)) return;
    try {
      await Promise.all(selectedScopeIds.map(id => axios.delete(`${API}/scope-items/${id}`)));
      toast.success(`Deleted ${selectedScopeIds.length} scope item(s)`);
      setSelectedScopeIds([]);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete some items');
    }
  };

  const handleBulkDeletePayment = async () => {
    if (!selectedPaymentIds.length) return;
    if (!confirm(`Delete ${selectedPaymentIds.length} selected payment stage(s)?`)) return;
    try {
      await Promise.all(selectedPaymentIds.map(id => axios.delete(`${API}/payment-stages/${id}`)));
      toast.success(`Deleted ${selectedPaymentIds.length} payment stage(s)`);
      setSelectedPaymentIds([]);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete some stages');
    }
  };

  const toggleScopeSelect = (id) => {
    setSelectedScopeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllScope = () => {
    setSelectedScopeIds(prev => prev.length === scope_items.length ? [] : scope_items.map(s => s.scope_id));
  };
  const togglePaymentSelect = (id) => {
    setSelectedPaymentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllPayment = () => {
    setSelectedPaymentIds(prev => prev.length === payment_stages.length ? [] : payment_stages.map(p => p.stage_id));
  };

  // ---- Project Stages Handlers ----
  const handleLoadTemplate = async (name) => {
    setSelectedTemplate(name);
    if (!name) return;
    try {
      const res = await axios.get(`${API}/stage-templates/${encodeURIComponent(name)}`);
      const tmplStages = (res.data.stages || []).map(s => ({
        stage_name: s.stage_name || '',
        start_date: s.start_date || '',
        target_date: s.target_date || '',
        status: s.status || 'yet_to_start',
        remarks: s.remarks || ''
      }));
      if (tmplStages.length > 0) {
        setNewStages(tmplStages);
        setShowAddStages(true);
        toast.success(`Loaded "${name}" template with ${tmplStages.length} stages`);
      }
    } catch { toast.error('Failed to load template'); }
  };

  const addNewStageRow = () => {
    setNewStages(prev => [...prev, { stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
  };
  const removeNewStageRow = (idx) => {
    setNewStages(prev => prev.filter((_, i) => i !== idx));
  };
  const updateNewStage = (idx, field, value) => {
    setNewStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSaveStages = async () => {
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/project-stages/bulk`, valid);
      toast.success(`Added ${valid.length} stages`);
      setShowAddStages(false);
      setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]);
      fetchData(false);
    } catch (error) { toast.error('Failed to add stages'); }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error('Enter template name'); return; }
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/stage-templates`, { template_name: templateName, stages: valid });
      toast.success(`Template "${templateName}" saved`);
      setSaveTemplateDialog(false);
      setTemplateName('');
      const res = await axios.get(`${API}/stage-templates`);
      setStageTemplates(res.data);
    } catch (error) { toast.error('Failed to save template'); }
  };

  const handleUpdateStage = async (stageId) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${stageId}`, editStageData);
      toast.success('Stage updated');
      setEditingStageId(null);
      fetchData(false);
    } catch { toast.error('Failed to update'); }
  };

  const handleDeleteStage = async (stageId) => {
    if (!confirm('Delete this stage?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/project-stages/${stageId}`);
      toast.success('Stage deleted');
      fetchData(false);
    } catch { toast.error('Failed to delete'); }
  };

  const stageStatusConfig = {
    yet_to_start: { label: 'Yet to Start', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    started: { label: 'Started', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    finished: { label: 'Finished', color: 'bg-green-100 text-green-700 border-green-300' }
  };


  const handleRequestPayment = async (stageId) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}/request`);
      toast.success('Payment requested! Goes to CRE for processing.');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete addition');
    }
  };

  const handleRequestAdditionPayment = async (costId) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}/request-payment`);
      toast.success('Additional work payment requested! Goes to CRE for processing.');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
    }
  };

  const handleDeleteDeduction = async (deductionId) => {
    if (!confirm('Delete this deduction?')) return;
    try {
      await axios.delete(`${API}/deductions/${deductionId}`);
      toast.success('Deduction deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  // ==================== UPDATE HANDLERS ====================
  const handleUpdatePayment = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment updated');
      setEditingPayment(null);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update payment');
    }
  };

  // Open edit dialog for payment stage
  const openEditPaymentDialog = (stage) => {
    setEditPaymentStage(stage);
    setEditPaymentForm({
      stage_name: stage.stage_name || '',
      percentage: stage.percentage?.toString() || '',
      amount: stage.amount?.toString() || '',
      due_date: stage.due_date ? new Date(stage.due_date).toISOString().split('T')[0] : ''
    });
    setEditPaymentDialog(true);
  };

  // Handle save from edit payment dialog
  const handleSavePaymentEdit = async () => {
    if (!editPaymentStage) return;
    
    try {
      await axios.patch(`${API}/payment-stages/${editPaymentStage.stage_id}`, {
        stage_name: editPaymentForm.stage_name,
        percentage: parseFloat(editPaymentForm.percentage) || 0,
        amount: parseFloat(editPaymentForm.amount) || 0,
        due_date: editPaymentForm.due_date || null
      });
      toast.success('Payment stage updated');
      setEditPaymentDialog(false);
      setEditPaymentStage(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update payment stage');
    }
  };

  // Submit/finalize draft payment schedule
  const handleSubmitPaymentSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/submit`);
      toast.success('Payment schedule submitted! Goes to CRE for collection.');
      setSubmitScheduleDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit payment schedule');
    }
  };

  const handleUpdateAddition = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update addition');
    }
  };

  // ==================== SCOPE ITEM EDIT HANDLERS ====================
  const openScopeEdit = (item) => {
    setEditingScopeItem(item.scope_id);
    setEditScopeForm({
      item_name: item.item_name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Nos',
      unit_rate: item.unit_rate || 0,
      remarks: item.remarks || ''
    });
  };

  const handleUpdateScope = async () => {
    if (!editingScopeItem) return;
    
    try {
      await axios.patch(`${API}/scope-items/${editingScopeItem}`, {
        item_name: editScopeForm.item_name,
        quantity: parseFloat(editScopeForm.quantity) || 1,
        unit: editScopeForm.unit,
        unit_rate: parseFloat(editScopeForm.unit_rate) || 0,
        remarks: editScopeForm.remarks || null
      });
      toast.success('Scope item updated');
      setEditingScopeItem(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update scope item');
    }
  };

  const cancelScopeEdit = () => {
    setEditingScopeItem(null);
    setEditScopeForm({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  };

  // ==================== DELETE PROJECT HANDLER ====================
  const handleDeleteProject = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' exactly in capital letters to confirm");
      return;
    }
    
    try {
      await axios.delete(`${API}/projects/${projectId}`);
      toast.success('Project deleted successfully');
      setDeleteProjectDialog(false);
      // Redirect to projects list
      window.location.href = '/projects';
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete project');
    }
  };

  // ==================== PAYMENT COLLECTION HANDLERS ====================
  const openCollectDialog = (stage) => {
    setSelectedStage(stage);
    setCollectForm({ 
      amount_received: stage.amount - (stage.amount_received || 0), 
      payment_mode: 'bank_transfer', 
      payment_reference: '', 
      remarks: '' 
    });
    setCollectPaymentDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedStage || !collectForm.amount_received) {
      toast.error('Please enter amount');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/${selectedStage.stage_id}/collect`, {
        amount_received: parseFloat(collectForm.amount_received),
        payment_mode: collectForm.payment_mode,
        payment_reference: collectForm.payment_reference || null,
        remarks: collectForm.remarks || null
      });
      toast.success('Payment collected successfully');
      setCollectPaymentDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to collect payment');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' },
      partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
      collected: { label: 'Collected', color: 'bg-amber-50 text-amber-700' }
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
  };

  const canDeleteProject = user?.role === 'super_admin' || 
    (user?.role === 'planning' && (
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.status?.toLowerCase()) ||
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.project_stage?.toLowerCase())
    ));

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning';
  const isSuperAdmin = user?.role === 'super_admin';
  const isPM = user?.role === 'project_manager';
  const canSeeFinancials = !isPM;

  if (loading && !projectData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, scope_items, payment_stages, additional_costs, deductions, summary } = projectData;

  // Get draft items for verification
  const draftScopeItems = scope_items.filter(s => s.workflow_status === 'draft');
  const draftPaymentItems = payment_stages.filter(p => p.workflow_status === 'draft');
  const draftAdditions = additional_costs.filter(a => a.workflow_status === 'draft');
  const draftDeductions = deductions.filter(d => d.workflow_status === 'draft');
  
  // Get pending approval items
  const pendingApprovalScope = scope_items.filter(s => s.workflow_status === 'pending_approval');
  const pendingApprovalPayment = payment_stages.filter(p => p.workflow_status === 'pending_approval');
  const pendingApprovalAdditions = additional_costs.filter(a => a.workflow_status === 'pending_approval');
  const pendingApprovalDeductions = deductions.filter(d => d.workflow_status === 'pending_approval');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-[1800px] mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Project Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/projects'} className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 data-testid="project-detail-title" className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                {project.name}
              </h2>
              <div className="flex items-center gap-2 sm:gap-4 mt-1 flex-wrap text-xs sm:text-sm">
                <span className="text-gray-600"><strong>Client:</strong> {project.client_name}</span>
                <span className="text-gray-600 hidden sm:inline"><strong>Location:</strong> {project.location}</span>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>{project.status}</Badge>
              </div>
            </div>
            {/* Delete Project Button - visible for super_admin or planning (for draft/in_planning projects) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Share as PDF Button */}
              <Button 
                data-testid="share-pdf-btn"
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Share as PDF</span>
              </Button>
              
              {canDeleteProject && (
                <Dialog open={deleteProjectDialog} onOpenChange={setDeleteProjectDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="delete-project-btn"
                      variant="destructive" 
                      size="sm" 
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete Project</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Project
                      </DialogTitle>
                      <DialogDescription>
                        This action <strong>cannot be undone</strong>. This will permanently delete the project 
                        <strong> "{project.name}"</strong> and all related data including scope items, payment stages, 
                        additions, and deductions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                          Type <strong>DELETE</strong> to confirm:
                        </p>
                        <Input
                          data-testid="delete-confirm-input"
                          placeholder="Type DELETE to confirm"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDeleteProjectDialog(false); setDeleteConfirmText(''); }}>
                      Cancel
                    </Button>
                    <Button 
                      data-testid="confirm-delete-project-btn"
                      variant="destructive" 
                      onClick={handleDeleteProject}
                      disabled={deleteConfirmText !== 'DELETE'}
                    >
                      Delete Project
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
          {canSeeFinancials && <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Value
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-amber-700">{formatCurrency(summary.project_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope Total</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Plus className="h-3 w-3" />Additions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-cyan-700">{formatCurrency(summary.additions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Extra Work</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />Total
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-purple-700">{formatCurrency(summary.total_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope + Add</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Income
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-green-700">{formatCurrency(summary.income_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">
                <span className="text-amber-600 cursor-pointer hover:underline" onClick={() => window.location.href = '/income'}>
                  View Income
                </span>
              </p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <MinusCircle className="h-3 w-3" />Deductions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-orange-700">{formatCurrency(summary.deductions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Adjustments</p>
            </CardContent>
          </Card>}

          {canSeeFinancials && <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className={`text-sm sm:text-lg font-bold ${summary.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(summary.balance)}
              </div>
              <p className="text-xs text-gray-500 hidden sm:block">Pending</p>
            </CardContent>
          </Card>}
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b p-3 sm:p-6">
              <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 w-full justify-between overflow-x-auto flex-nowrap">
                <TabsTrigger value="rough-estimate" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Estimate
                </TabsTrigger>
                <TabsTrigger value="scope" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Final Estimate
                </TabsTrigger>
                <TabsTrigger value="project-stages" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-project-stages">
                  Stages
                </TabsTrigger>
                <TabsTrigger value="team" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-team">
                  Team
                </TabsTrigger>
                <TabsTrigger value="materials" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-materials">
                  Materials
                </TabsTrigger>
                <TabsTrigger value="labours" className="data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-labours">
                  Labours
                </TabsTrigger>
                {canSeeFinancials && <TabsTrigger value="payments" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Payments
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="additions" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Additional
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="deductions" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Deduction
                </TabsTrigger>}
                {canSeeFinancials && <TabsTrigger value="payment-summary" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-4 py-3 text-[15px] font-medium bg-green-50 whitespace-nowrap flex-1 text-center">
                  Summary
                </TabsTrigger>}
                <TabsTrigger value="documents" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Documents
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* ==================== ROUGH ESTIMATE TAB ==================== */}
            <TabsContent value="rough-estimate" className="p-3 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Rough Estimate Reference
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">Original rough estimate from Planning department</p>
                </div>
                {reProject && (
                  <div className="flex gap-2">
                    {(projectData?.scope_items || []).some(s => s.remarks?.includes('From RE:')) ? (
                      <Button 
                        disabled
                        className="bg-gray-400 cursor-not-allowed"
                        data-testid="convert-to-scope-btn"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Already Converted
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleConvertToScope} 
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="convert-to-scope-btn"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Convert to Scope
                      </Button>
                    )}
                    <Button 
                      onClick={handleGenerateREPDF} 
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="download-re-pdf"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Revision Tabs */}
              {reRevisions.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-4 border-b pb-3" data-testid="project-re-revision-tabs">
                  {reRevisions.map((rev) => {
                    const isActive = rev.re_project_id === reProject?.re_project_id;
                    const isApproved = ['client_approved', 're_approved'].includes(rev.status);
                    const isDimmed = !isActive && !isApproved;
                    return (
                      <button
                        key={rev.re_project_id}
                        data-testid={`project-re-tab-${rev.revision}`}
                        onClick={() => setReProject(rev)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                          isActive
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : isApproved
                              ? 'bg-green-100 text-green-800 border-green-300 ring-1 ring-green-400'
                              : isDimmed
                                ? 'bg-gray-50 text-gray-400 border-gray-200 opacity-60'
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <GitBranch className="inline h-3 w-3 mr-1" />
                        RE{rev.revision}
                        {isApproved && <CheckCircle2 className="inline h-3 w-3 ml-1 text-green-600" />}
                      </button>
                    );
                  })}
                  <span className="text-xs text-gray-400 ml-2">
                    {reRevisions.length} revision{reRevisions.length > 1 ? 's' : ''} — Approved version highlighted in green
                  </span>
                </div>
              )}
              
              {reProject ? (
                <div className="space-y-4">
                  {/* Revision Badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {reProject.re_number && (
                      <span className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{reProject.re_number}</span>
                    )}
                    <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                      <GitBranch className="h-3 w-3 mr-0.5" /> RE{reProject.revision || 0}
                    </Badge>
                    <Badge className={reProject.status === 'converted' ? 'bg-green-100 text-green-700' : reProject.status === 'client_approved' ? 'bg-emerald-100 text-emerald-700' : reProject.status === 're_approved' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}>
                      {reProject.status?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  
                  {/* RE Project Overview */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">RE Project Name</p>
                        <p className="font-semibold">{reProject.project_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Location</p>
                        <p className="font-medium">{reProject.location || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Area</p>
                        <p className="font-medium">{reProject.sqft?.toLocaleString()} sqft</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Building Type</p>
                        <p className="font-medium capitalize">{reProject.building_type}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-gray-500">Package</p>
                        <p className="font-medium">{reProject.package_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estimated Total</p>
                        <p className="font-bold text-purple-700">₹{(reProject.estimated_total || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Handover Timeline</p>
                        <p className="font-medium">{reProject.handover_months || '-'} months</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* RE Scope Items */}
                  {(reProject.rough_scope_items || reProject.scope_items)?.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Rough Estimate Scope Items</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Rate</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(reProject.rough_scope_items || reProject.scope_items).map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{item.name || item.item_name}</td>
                                <td className="px-3 py-2 text-right">{item.quantity}</td>
                                <td className="px-3 py-2">{item.unit}</td>
                                <td className="px-3 py-2 text-right">₹{(item.rate || item.unit_rate || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right font-medium">₹{(item.total || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-purple-50">
                            <tr>
                              <td colSpan="4" className="px-3 py-2 text-right font-semibold">Estimated Total:</td>
                              <td className="px-3 py-2 text-right font-bold text-purple-700">
                                ₹{(reProject.rough_scope_items || reProject.scope_items).reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* RE Payment Schedule */}
                  {reProject.payment_schedule && reProject.payment_schedule.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm">Estimated Payment Schedule</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Stage</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">%</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {reProject.payment_schedule.map((stage, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{stage.stage_name}</td>
                                <td className="px-3 py-2 text-right">{stage.percentage}%</td>
                                <td className="px-3 py-2 text-right font-medium">₹{(stage.amount || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No Rough Estimate Available</p>
                  <p className="text-sm">This project was not created from a Rough Estimate</p>
                </div>
              )}
            </TabsContent>

            {/* ==================== SCOPE TAB ==================== */}
            <TabsContent value="scope" className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Final Estimate</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Define scope items - total becomes project value</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedScopeIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-scope-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-1 sm:gap-2 text-xs sm:text-sm"
                      onClick={handleBulkDeleteScope}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />Delete Selected ({selectedScopeIds.length})
                    </Button>
                  )}
                  {canManage && (
                    <Dialog open={bulkScopeDialog} onOpenChange={setBulkScopeDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-scope-btn" size="sm" className="gap-1 sm:gap-2 bg-secondary hover:bg-secondary/90 text-xs sm:text-sm">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Scope
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl max-h-[90vh] mx-4 sm:mx-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Scope Items</DialogTitle>
                          <DialogDescription>Add rows as needed. Use X to remove empty rows.</DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[70vh] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-1 py-2 w-8"></th>
                                <th className="px-2 py-2 text-left min-w-[180px]">Item Name *</th>
                                <th className="px-2 py-2 text-left w-20">Qty</th>
                                <th className="px-2 py-2 text-left w-32">Unit</th>
                                <th className="px-2 py-2 text-left w-32">Rate (₹) *</th>
                                <th className="px-2 py-2 text-left w-28">Total</th>
                                <th className="px-2 py-2 text-left min-w-[120px]">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              <SortableList
                                items={bulkScopeRows.map((_, i) => `bulk-scope-${i}`)}
                                onReorder={(newIds) => {
                                  const newRows = newIds.map(id => bulkScopeRows[parseInt(id.split('-')[2])]);
                                  setBulkScopeRows(newRows);
                                }}
                              >
                              {bulkScopeRows.map((row, idx) => (
                                <SortableTableRow key={`bulk-scope-${idx}`} id={`bulk-scope-${idx}`} className="border-b hover:bg-gray-50">
                                  {({ listeners, attributes }) => (
                                    <>
                                  <td className="px-1 py-1"><DragHandle listeners={listeners} attributes={attributes} /></td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.item_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].item_name = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      placeholder="e.g., Foundation Work"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.quantity}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].quantity = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <UnitSelect 
                                      value={row.unit}
                                      onChange={(v) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit = v;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                      data-testid={`bulk-scope-unit-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.unit_rate}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit_rate = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-amber-600 font-medium">
                                    ₹{((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_rate) || 0)).toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkScopeRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkScopeRows.filter((_, i) => i !== idx);
                                          setBulkScopeRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                    </>
                                  )}
                                </SortableTableRow>
                              ))}
                              </SortableList>
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, { item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, ...createEmptyRows('scope', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkScopeDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-scope-btn" onClick={handleBulkAddScope}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && (
                        <th className="px-1 py-3 w-8"></th>
                      )}
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={scope_items.length > 0 && selectedScopeIds.length === scope_items.length}
                            onChange={toggleAllScope}
                            data-testid="select-all-scope"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 8} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope Items" to define project scope.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={scope_items.map(s => s.scope_id)}
                        onReorder={handleScopeReorder}
                      >
                      {scope_items.map((item, index) => {
                        const isEditing = editingScopeItem === item.scope_id;
                        
                        return (
                          <SortableTableRow key={item.scope_id} id={item.scope_id} className={`hover:bg-gray-50 ${selectedScopeIds.includes(item.scope_id) ? 'bg-blue-50' : ''}`}>
                            {({ listeners, attributes }) => (
                              <>
                            {canManage && (
                              <td className="px-1 py-3 text-center">
                                <DragHandle listeners={listeners} attributes={attributes} />
                              </td>
                            )}
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedScopeIds.includes(item.scope_id)}
                                  onChange={() => toggleScopeSelect(item.scope_id)}
                                  data-testid={`select-scope-${item.scope_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-name-${item.scope_id}`}
                                  value={editScopeForm.item_name}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, item_name: e.target.value})}
                                  className="h-8 w-full min-w-[150px]"
                                />
                              ) : (
                                item.item_name
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-scope-qty-${item.scope_id}`}
                                  
                                  value={editScopeForm.quantity}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, quantity: e.target.value})}
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <UnitSelect
                                  data-testid={`edit-scope-unit-${item.scope_id}`}
                                  value={editScopeForm.unit}
                                  onChange={(v) => setEditScopeForm({...editScopeForm, unit: v})}
                                  className="w-24"
                                />
                              ) : (
                                item.unit
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-scope-rate-${item.scope_id}`}
                                  
                                  value={editScopeForm.unit_rate}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit_rate: e.target.value})}
                                  className="h-8 w-24 text-right"
                                />
                              ) : (
                                `₹${item.unit_rate?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-600">
                              {isEditing ? (
                                `₹${((parseFloat(editScopeForm.quantity) || 0) * (parseFloat(editScopeForm.unit_rate) || 0)).toLocaleString()}`
                              ) : (
                                `₹${item.total_amount?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={item.workflow_status || 'draft'} />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-remarks-${item.scope_id}`}
                                  value={editScopeForm.remarks}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, remarks: e.target.value})}
                                  className="h-8 w-full"
                                  placeholder="Remarks"
                                />
                              ) : (
                                item.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button 
                                        data-testid={`save-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleUpdateScope}
                                        className="h-8 w-8"
                                      >
                                        <Save className="h-4 w-4 text-green-500" />
                                      </Button>
                                      <Button 
                                        data-testid={`cancel-scope-edit-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={cancelScopeEdit}
                                        className="h-8 w-8"
                                      >
                                        <X className="h-4 w-4 text-gray-500" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button 
                                        data-testid={`edit-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => openScopeEdit(item)}
                                        className="h-8 w-8"
                                      >
                                        <Edit className="h-4 w-4 text-amber-600" />
                                      </Button>
                                      <Button 
                                        data-testid={`delete-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteScope(item.scope_id)}
                                        className="h-8 w-8"
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        );
                      })}
                      </SortableList>
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan={canManage ? 8 : 5} className="px-4 py-3 text-right font-bold">Project Value (Scope Total):</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">₹{summary.scope_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PROJECT STAGES TAB ==================== */}
            <TabsContent value="project-stages" className="p-3 sm:p-6">
              <div className="space-y-6" data-testid="project-stages-tab">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">Project Stages</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Track construction stages and milestones</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {projectStages.length > 0 && (
                      <div className="flex border rounded-lg overflow-hidden" data-testid="stages-view-toggle">
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'table' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('table')}>Table</button>
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'gantt' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('gantt')} data-testid="gantt-view-btn">Gantt</button>
                      </div>
                    )}
                    {!showAddStages && canManage && (
                      <Button data-testid="add-stages-btn" className="gap-2 bg-secondary hover:bg-secondary/90" onClick={() => setShowAddStages(true)}>
                        <Plus className="h-4 w-4" /> Add Stages
                      </Button>
                    )}
                  </div>
                </div>

                {/* Template Selector */}
                {showAddStages && (
                  <Card className="border-2 border-blue-200 bg-blue-50/30">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <h4 className="font-semibold text-blue-800">Add Project Stages</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Load Template:</span>
                          <select 
                            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                            value={selectedTemplate}
                            onChange={(e) => handleLoadTemplate(e.target.value)}
                            data-testid="template-selector"
                          >
                            <option value="">-- Select Template --</option>
                            {stageTemplates.map(t => (
                              <option key={t.template_id || t.template_name} value={t.template_name}>{t.template_name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Stage Rows */}
                      <div className="space-y-2">
                        {newStages.map((stage, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border" data-testid={`new-stage-row-${idx}`}>
                            <span className="text-sm font-medium text-gray-500 w-6">{idx + 1}.</span>
                            <input
                              type="text"
                              placeholder="Stage name"
                              className="flex-1 min-w-[150px] border rounded-lg px-3 py-1.5 text-sm"
                              value={stage.stage_name}
                              onChange={(e) => updateNewStage(idx, 'stage_name', e.target.value)}
                              data-testid={`stage-name-input-${idx}`}
                            />
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-gray-400">Start</label>
                              <input
                                type="date"
                                className="border rounded-lg px-2 py-1.5 text-sm"
                                value={stage.start_date}
                                onChange={(e) => updateNewStage(idx, 'start_date', e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-gray-400">End</label>
                              <input
                                type="date"
                                className="border rounded-lg px-2 py-1.5 text-sm"
                                value={stage.target_date}
                                onChange={(e) => updateNewStage(idx, 'target_date', e.target.value)}
                              />
                            </div>
                            <select
                              className={`border rounded-lg px-3 py-1.5 text-sm ${stageStatusConfig[stage.status]?.color || ''}`}
                              value={stage.status}
                              onChange={(e) => updateNewStage(idx, 'status', e.target.value)}
                            >
                              <option value="yet_to_start">Yet to Start</option>
                              <option value="started">Started</option>
                              <option value="finished">Finished</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Remarks"
                              className="flex-1 min-w-[100px] border rounded-lg px-3 py-1.5 text-sm"
                              value={stage.remarks}
                              onChange={(e) => updateNewStage(idx, 'remarks', e.target.value)}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeNewStageRow(idx)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Add row + Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={addNewStageRow} data-testid="add-stage-row-btn">
                          <Plus className="h-3 w-3 mr-1" /> Add Row
                        </Button>
                        <div className="flex-1" />
                        <Button variant="outline" size="sm" onClick={() => { setSaveTemplateDialog(true); }} data-testid="save-as-template-btn">
                          <Save className="h-3 w-3 mr-1" /> Save as Template
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleSaveStages} data-testid="save-stages-btn">
                          <Check className="h-3 w-3 mr-1" /> Save Stages
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowAddStages(false); setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '' }]); }}>
                          Cancel
                        </Button>
                      </div>

                      {/* Save as Template Dialog */}
                      {saveTemplateDialog && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm font-medium text-amber-800 mb-2">Save as Template (e.g., G+1, G+2)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Template name (e.g., G+2)"
                              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              data-testid="template-name-input"
                            />
                            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleSaveAsTemplate} data-testid="confirm-save-template-btn">
                              Save Template
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setSaveTemplateDialog(false)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Existing Stages - Table or Gantt View */}
                {projectStages.length > 0 ? (
                  stagesView === 'gantt' ? (
                    <GanttChart stages={projectStages} />
                  ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-1 py-3 w-8"></th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage Name</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Start Date</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Target Date</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                          {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <SortableList
                          items={projectStages.map(s => s.stage_id)}
                          onReorder={handleStageReorder}
                        >
                        {projectStages.map((stage, idx) => (
                          <SortableTableRow key={stage.stage_id} id={stage.stage_id} className="hover:bg-gray-50">
                            {({ listeners, attributes }) => (
                              <>
                            <td className="px-1 py-3 text-center">
                              {canManage && <DragHandle listeners={listeners} attributes={attributes} />}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">{idx + 1}</td>
                            <td className="px-4 py-3">
                              {editingStageId === stage.stage_id ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={editStageData.stage_name || ''} onChange={e => setEditStageData(d => ({...d, stage_name: e.target.value}))} />
                              ) : (
                                <span className="font-medium">{stage.stage_name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.start_date || ''} onChange={e => setEditStageData(d => ({...d, start_date: e.target.value}))} />
                              ) : (
                                <span className="text-sm">{stage.start_date ? new Date(stage.start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.target_date || ''} onChange={e => setEditStageData(d => ({...d, target_date: e.target.value}))} />
                              ) : (
                                <span className="text-sm">{stage.target_date ? new Date(stage.target_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <select className="border rounded px-2 py-1 text-sm" value={editStageData.status || 'yet_to_start'} onChange={e => setEditStageData(d => ({...d, status: e.target.value}))}>
                                  <option value="yet_to_start">Yet to Start</option>
                                  <option value="started">Started</option>
                                  <option value="finished">Finished</option>
                                </select>
                              ) : (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${stageStatusConfig[stage.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                                  {stage.status === 'finished' && <Check className="h-3 w-3 mr-1" />}
                                  {stageStatusConfig[stage.status]?.label || stage.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {editingStageId === stage.stage_id ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={editStageData.remarks || ''} onChange={e => setEditStageData(d => ({...d, remarks: e.target.value}))} />
                              ) : (
                                stage.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                {editingStageId === stage.stage_id ? (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => handleUpdateStage(stage.stage_id)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingStageId(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingStageId(stage.stage_id); setEditStageData({ stage_name: stage.stage_name, start_date: stage.start_date || '', target_date: stage.target_date || '', status: stage.status, remarks: stage.remarks || '' }); }}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteStage(stage.stage_id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        ))}
                        </SortableList>
                      </tbody>
                    </table>
                  </div>
                  )
                ) : !showAddStages && (
                  <div className="text-center py-12 text-gray-500">
                    <Folder className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No project stages defined</p>
                    <p className="text-sm mt-1">Click "Add Stages" to create stages or load from a template</p>
                  </div>
                )}

                {/* Progress Summary */}
                {projectStages.length > 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center border">
                      <p className="text-2xl font-bold text-gray-600">{projectStages.filter(s => s.status === 'yet_to_start').length}</p>
                      <p className="text-xs text-gray-500">Yet to Start</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                      <p className="text-2xl font-bold text-amber-600">{projectStages.filter(s => s.status === 'started').length}</p>
                      <p className="text-xs text-amber-600">In Progress</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{projectStages.filter(s => s.status === 'finished').length}</p>
                      <p className="text-xs text-green-600">Finished</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* ==================== PAYMENTS TAB ==================== */}
            <TabsContent value="payments" className="p-6">
              {/* Balance Payment Info */}
              {(() => {
                const totalValue = summary?.scope_total || projectData?.project?.total_value || 0;
                const totalPctAllocated = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
                const remainingPct = Math.round((100 - totalPctAllocated) * 100) / 100;
                const totalAmountAllocated = payment_stages.reduce((sum, s) => sum + (s.amount || 0), 0);
                const isPM = user?.role === 'project_manager';
                const hasAdvance = payment_stages.some(s => s.is_advance || s.stage_name?.toLowerCase().startsWith('advance'));
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="payment-balance-info">
                    {!isPM && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <p className="text-xs text-blue-600">Total Project Value</p>
                        <p className="text-lg font-bold text-blue-700">₹{totalValue.toLocaleString()}</p>
                      </div>
                    )}
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <p className="text-xs text-green-600">Allocated</p>
                      <p className="text-lg font-bold text-green-700">{totalPctAllocated}%</p>
                      {!isPM && <p className="text-[10px] text-green-500">₹{totalAmountAllocated.toLocaleString()}</p>}
                    </div>
                    <div className={`rounded-lg p-3 border ${remainingPct > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                      <p className="text-xs text-gray-600">Remaining</p>
                      <p className={`text-lg font-bold ${remainingPct > 0 ? 'text-amber-700' : 'text-green-600'}`}>{remainingPct}%</p>
                      {!isPM && <p className="text-[10px] text-gray-400">₹{Math.round(totalValue * remainingPct / 100).toLocaleString()}</p>}
                    </div>
                    {!hasAdvance && canManage && (
                      <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200 flex flex-col justify-center">
                        <p className="text-[10px] text-indigo-600 mb-1">Auto-add advance row</p>
                        <Button size="sm" variant="outline" className="text-xs border-indigo-300 text-indigo-700" onClick={async () => {
                          try {
                            await axios.post(`${API}/payment-stages`, {
                              project_id: projectId,
                              stage_name: 'Advance Collection',
                              stage_label: 'ADV',
                              percentage: 2,
                              amount: Math.round(totalValue * 0.02),
                            });
                            toast.success('Advance Collection (2%) added');
                            fetchData(false);
                          } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
                        }} data-testid="add-advance-btn">Add 2% Advance</Button>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">
                    Milestone payments as % of project value
                    {user?.role !== 'project_manager' && ` (₹${(summary?.scope_total || projectData?.project?.total_value || 0).toLocaleString()})`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPaymentIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-payment-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={handleBulkDeletePayment}
                    >
                      <Trash2 className="h-4 w-4" />Delete Selected ({selectedPaymentIds.length})
                    </Button>
                  )}
                  {canManage && (
                    <Dialog open={bulkPaymentDialog} onOpenChange={setBulkPaymentDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-payment-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Payments
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>Add Payment Stages</DialogTitle>
                          <DialogDescription>
                            {(() => {
                              const allocPct = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
                              const remPct = Math.round((100 - allocPct) * 100) / 100;
                              return `Remaining: ${remPct}% of project value. Total stages cannot exceed 100%.`;
                            })()}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Stage Name *</th>
                                <th className="px-2 py-2 text-left w-20">%</th>
                                <th className="px-2 py-2 text-left w-28">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Due Date</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkPaymentRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.stage_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].stage_name = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="e.g., Advance"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.percentage}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const pct = parseFloat(e.target.value) || 0;
                                        newRows[idx].percentage = e.target.value;
                                        // Auto-calculate amount from percentage of TOTAL project value
                                        const totalVal = summary?.scope_total || projectData?.project?.total_value || 0;
                                        if (totalVal > 0 && pct > 0) {
                                          newRows[idx].amount = Math.round((totalVal * pct) / 100);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="%"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const amt = parseFloat(e.target.value) || 0;
                                        newRows[idx].amount = e.target.value;
                                        // Auto-calculate percentage from amount based on BALANCE
                                        const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                                        if (balance > 0 && amt > 0) {
                                          newRows[idx].percentage = ((amt / balance) * 100).toFixed(2);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="₹"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="date"
                                      value={row.due_date}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].due_date = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkPaymentRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkPaymentRows.filter((_, i) => i !== idx);
                                          setBulkPaymentRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, { stage_name: '', percentage: '', amount: '', due_date: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, ...createEmptyRows('payment', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkPaymentDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-payment-btn" onClick={handleBulkAddPayment}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Edit Payment Stage Dialog */}
              <Dialog open={editPaymentDialog} onOpenChange={setEditPaymentDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Payment Stage</DialogTitle>
                    <DialogDescription>
                      Update payment stage details. Enter percentage or amount - the other will auto-calculate.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-stage-name">Stage Name</Label>
                      <Input
                        id="edit-stage-name"
                        data-testid="edit-payment-stage-name"
                        value={editPaymentForm.stage_name}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, stage_name: e.target.value })}
                        placeholder="e.g., Foundation Payment"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-percentage">Percentage (%)</Label>
                        <NumericInput
                          id="edit-percentage"
                          data-testid="edit-payment-percentage"
                          
                          value={editPaymentForm.percentage}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value) || 0;
                            let newAmount = editPaymentForm.amount;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && pct > 0) {
                              newAmount = Math.round((balance * pct) / 100).toString();
                            }
                            setEditPaymentForm({ ...editPaymentForm, percentage: e.target.value, amount: newAmount });
                          }}
                          placeholder="e.g., 10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-amount">Amount (₹)</Label>
                        <NumericInput
                          id="edit-amount"
                          data-testid="edit-payment-amount"
                          
                          value={editPaymentForm.amount}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            let newPct = editPaymentForm.percentage;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && amt > 0) {
                              newPct = ((amt / balance) * 100).toFixed(2);
                            }
                            setEditPaymentForm({ ...editPaymentForm, amount: e.target.value, percentage: newPct });
                          }}
                          placeholder="e.g., 100000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <Input
                        id="edit-due-date"
                        data-testid="edit-payment-due-date"
                        type="date"
                        value={editPaymentForm.due_date}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, due_date: e.target.value })}
                      />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                      <p>Project Total Value: <span className="font-semibold">₹{projectData?.summary?.total_value?.toLocaleString() || 0}</span></p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditPaymentDialog(false)}>Cancel</Button>
                    <Button data-testid="save-payment-edit-btn" onClick={handleSavePaymentEdit}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={payment_stages.length > 0 && selectedPaymentIds.length === payment_stages.length}
                            onChange={toggleAllPayment}
                            data-testid="select-all-payment"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      {user?.role !== 'project_manager' && (
                        <>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payment_stages.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 10 : 8} className="px-4 py-8 text-center text-gray-500">
                          No payment stages defined yet. Click "Add Payments" to define milestones.
                        </td>
                      </tr>
                    ) : (
                      payment_stages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isPaid = balance <= 0;
                        const isRequested = stage.workflow_status === 'requested' || stage.workflow_status === 'pending_collection';
                        const isPartial = stage.amount_received > 0 && balance > 0;
                        
                        // Determine status badge
                        let statusBadge;
                        if (isPaid) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Collected</span>;
                        } else if (isPartial) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partially Collected</span>;
                        } else if (isRequested) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Requested</span>;
                        } else {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Pending</span>;
                        }
                        
                        return (
                          <tr key={stage.stage_id} data-testid={`payment-row-${stage.stage_id}`} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''} ${selectedPaymentIds.includes(stage.stage_id) ? 'bg-blue-50' : ''}`}>
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedPaymentIds.includes(stage.stage_id)}
                                  onChange={() => togglePaymentSelect(stage.stage_id)}
                                  data-testid={`select-payment-${stage.stage_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{stage.stage_name}</p>
                              {stage.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(stage.due_date).toLocaleDateString('en-IN')}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{stage.percentage}%</td>
                            {user?.role !== 'project_manager' && (
                              <>
                                <td className="px-4 py-3 text-right font-semibold">₹{stage.amount?.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-green-600 font-semibold">₹{(stage.amount_received || 0).toLocaleString()}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                                    ₹{balance.toLocaleString()}
                                  </span>
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3 text-center">
                              {statusBadge}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Request Payment - for partial stages always, or pending stages not yet requested */}
                                {canManage && balance > 0 && !isPaid && (isPartial || (!isRequested)) && (
                                  <Button
                                    data-testid={`req-payment-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-600 border-blue-300 hover:bg-amber-50"
                                    onClick={() => handleRequestPayment(stage.stage_id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Payment
                                  </Button>
                                )}
                                {/* Edit button - only for stages with no collection yet */}
                                {canManage && !isPaid && !isPartial && (
                                  <Button
                                    data-testid={`edit-payment-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditPaymentDialog(stage)}
                                    title="Edit payment stage"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                )}
                                {/* Delete button - only for stages with no collection yet */}
                                {canManage && !isPaid && !isPartial && (
                                  <Button 
                                    data-testid={`delete-payment-${stage.stage_id}`}
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeletePayment(stage.stage_id)}
                                    title="Delete payment stage"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {/* Done badge */}
                                {isPaid && (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {payment_stages.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{(summary.payment_schedule_total || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{(summary.payment_received || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{((summary.payment_schedule_total || 0) - (summary.payment_received || 0)).toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== ADDITIONS TAB ==================== */}
            <TabsContent value="additions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Work</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkAdditionDialog} onOpenChange={setBulkAdditionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-addition-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Additions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Additions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkAdditionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      placeholder="e.g., Extra flooring"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.estimated_amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].estimated_amount = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {bulkAdditionRows.length > 1 && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setBulkAdditionRows(bulkAdditionRows.filter((_, i) => i !== idx))}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkAdditionRows([...bulkAdditionRows, ...createEmptyRows('addition', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkAdditionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddAddition}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-1 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                          No additions recorded yet. Click "Add Additions" for extra work.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={additional_costs.map(c => c.cost_id)}
                        onReorder={handleAdditionalCostReorder}
                      >
                      {additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <SortableTableRow key={cost.cost_id} id={cost.cost_id} className="hover:bg-gray-50">
                            {({ listeners, attributes }) => (
                              <>
                            <td className="px-1 py-3 text-center"><DragHandle listeners={listeners} attributes={attributes} /></td>
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  
                                  className="w-28 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAddition(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(cost.income_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={cost.workflow_status || 'draft'} />
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {balance > 0 && !cost.payment_requested && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 border-green-500 text-green-700 hover:bg-green-50 text-xs"
                                      onClick={() => handleRequestAdditionPayment(cost.cost_id)}
                                      data-testid={`req-payment-addition-${cost.cost_id}`}
                                    >
                                      <Send className="h-3 w-3" /> Req Payment
                                    </Button>
                                  )}
                                  {cost.payment_requested && balance > 0 && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Requested</span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingAddition(isEditing ? null : cost.cost_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-amber-600" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        );
                      })}
                      </SortableList>
                    )}
                  </tbody>
                  {additional_costs.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additions_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additions_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.additions_total - summary.additions_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== DEDUCTIONS TAB ==================== */}
            <TabsContent value="deductions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Deductions</h3>
                  <p className="text-sm text-gray-500">Track penalties, discounts, and adjustments</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkDeductionDialog} onOpenChange={setBulkDeductionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-deduction-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                          <MinusCircle className="h-4 w-4" />Add Deductions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Deductions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkDeductionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      placeholder="e.g., Penalty"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].amount = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {bulkDeductionRows.length > 1 && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setBulkDeductionRows(bulkDeductionRows.filter((_, i) => i !== idx))}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkDeductionRows([...bulkDeductionRows, ...createEmptyRows('deduction', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkDeductionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddDeduction} className="bg-orange-600 hover:bg-orange-700">Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-1 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                          No deductions recorded yet. Click "Add Deductions" for penalties or adjustments.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={deductions.map(d => d.deduction_id)}
                        onReorder={handleDeductionReorder}
                      >
                      {deductions.map((d, index) => (
                        <SortableTableRow key={d.deduction_id} id={d.deduction_id} className="hover:bg-gray-50">
                          {({ listeners, attributes }) => (
                            <>
                          <td className="px-1 py-3 text-center"><DragHandle listeners={listeners} attributes={attributes} /></td>
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{d.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">-₹{d.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <WorkflowBadge status={d.workflow_status || 'draft'} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDeduction(d.deduction_id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                            </>
                          )}
                        </SortableTableRow>
                      ))}
                      </SortableList>
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-orange-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">-₹{summary.deductions_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENT SUMMARY TAB ==================== */}
            <TabsContent value="payment-summary" className="p-3 sm:p-6">
              <PaymentSummarySection
                user={user}
                projectId={projectId}
                paymentSummary={paymentSummary}
                formatCurrency={formatCurrency}
                getPaymentStatusBadge={getPaymentStatusBadge}
                openCollectDialog={openCollectDialog}
              />

              {/* Advance Payment Card */}
            </TabsContent>



            {/* ==================== TEAM TAB ==================== */}
            <TabsContent value="team" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-600" />Project Team
                  </h3>
                  {(user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'planning') && (
                    <Button size="sm" onClick={openTeamEditDialog} className="bg-indigo-600 hover:bg-indigo-700" data-testid="edit-team-btn">
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit Team
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEAM_ROLES.map(role => {
                    const member = teamData[role.key];
                    const bgMap = { purple: 'bg-purple-50 border-purple-200', indigo: 'bg-indigo-50 border-indigo-200', amber: 'bg-amber-50 border-amber-200', green: 'bg-green-50 border-green-200', blue: 'bg-blue-50 border-blue-200', rose: 'bg-rose-50 border-rose-200', orange: 'bg-orange-50 border-orange-200' };
                    const avatarMap = { purple: 'bg-purple-600', indigo: 'bg-indigo-600', amber: 'bg-amber-600', green: 'bg-green-600', blue: 'bg-blue-600', rose: 'bg-rose-600', orange: 'bg-orange-600' };
                    return (
                      <div key={role.key} className={`p-3 rounded-lg border ${member ? bgMap[role.color] : 'bg-gray-50 border-gray-200 border-dashed'}`} data-testid={`team-role-${role.key}`}>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">{role.label}</p>
                        {member ? (
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-full ${avatarMap[role.color]} text-white flex items-center justify-center text-sm font-bold shrink-0`}>
                              {member.name?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{member.name}</p>
                              <p className="text-xs text-gray-500 truncate">{member.phone || member.email || '-'}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Not assigned</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Edit Dialog */}
              <Dialog open={teamEditDialog} onOpenChange={setTeamEditDialog}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Assign Team Members</DialogTitle><DialogDescription>Select a person for each role from the dropdown</DialogDescription></DialogHeader>
                  <div className="py-3 space-y-4">
                    {TEAM_ROLES.map(role => {
                      const users = teamRoleUsers[role.key] || [];
                      const dotMap = { purple: 'bg-purple-500', indigo: 'bg-indigo-500', amber: 'bg-amber-500', green: 'bg-green-500', blue: 'bg-blue-500', rose: 'bg-rose-500', orange: 'bg-orange-500' };
                      return (
                        <div key={role.key}>
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${dotMap[role.color]}`} />{role.label}
                          </Label>
                          <Select value={teamDraft[role.key] || ''} onValueChange={v => setTeamDraft(prev => ({ ...prev, [role.key]: v }))}>
                            <SelectTrigger className="mt-1" data-testid={`team-select-${role.key}`}>
                              <SelectValue placeholder={`Select ${role.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-- None --</SelectItem>
                              {users.map(u => (
                                <SelectItem key={u.user_id} value={u.user_id}>{u.name}{u.phone ? ` (${u.phone})` : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTeamEditDialog(false)}>Cancel</Button>
                    <Button onClick={handleTeamSave} disabled={teamSaving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="confirm-team-assign">
                      {teamSaving ? 'Saving...' : 'Save Team'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* ==================== MATERIALS TAB ==================== */}
            <TabsContent value="materials" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Package className="h-5 w-5 text-orange-600" />Materials in Project
                  </h3>
                </div>

                {/* Sub-tabs */}
                <Tabs value={materialSubTab} onValueChange={setMaterialSubTab}>
                  <TabsList className="grid grid-cols-5 w-full">
                    <TabsTrigger value="materials" data-testid="subtab-materials">Materials</TabsTrigger>
                    <TabsTrigger value="vendors" data-testid="subtab-vendors">Vendors</TabsTrigger>
                    <TabsTrigger value="orders" data-testid="subtab-orders">Orders</TabsTrigger>
                    <TabsTrigger value="payments" data-testid="subtab-payments">Payments</TabsTrigger>
                    <TabsTrigger value="inventory" data-testid="subtab-inventory">Inventory</TabsTrigger>
                  </TabsList>

                  {/* MATERIALS SUB-TAB */}
                  <TabsContent value="materials" className="mt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4" data-testid="materials-summary">
                      <div className="rounded-lg p-3 text-center border bg-gray-50">
                        <p className="text-xl font-bold">{materialsData.summary.total_requests || 0}</p>
                        <p className="text-xs text-gray-500">Total Requests</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-amber-50 border-amber-200">
                        <p className="text-xl font-bold text-amber-700">{materialsData.summary.requested || 0}</p>
                        <p className="text-xs text-gray-500">Pending</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                        <p className="text-xl font-bold text-blue-700">{materialsData.summary.in_progress || 0}</p>
                        <p className="text-xs text-gray-500">In Progress</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                        <p className="text-xl font-bold text-green-700">{materialsData.summary.delivered || 0}</p>
                        <p className="text-xs text-gray-500">Delivered</p>
                      </div>
                      {!isPM && materialsData.summary.total_cost !== undefined && (
                        <div className="rounded-lg p-3 text-center border bg-purple-50 border-purple-200">
                          <p className="text-xl font-bold text-purple-700">{formatCurrency(materialsData.summary.total_cost || 0)}</p>
                          <p className="text-xs text-gray-500">Total Cost</p>
                        </div>
                      )}
                    </div>
                    {materialsData.materials.length > 0 ? (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm" data-testid="materials-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                              {!isPM && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {materialsData.materials.map(m => (
                              <tr key={m.request_id} className="hover:bg-gray-50" data-testid={`mat-row-${m.request_id}`}>
                                <td className="px-3 py-2.5">
                                  <p className="font-medium">{m.material_name}</p>
                                  {m.remarks && <p className="text-xs text-gray-400 truncate max-w-[200px]">{m.remarks}</p>}
                                </td>
                                <td className="px-3 py-2.5 text-center">{m.quantity} {m.unit || ''}</td>
                                <td className="px-3 py-2.5 text-center text-xs">{m.stage || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    m.status === 'requested' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                    ['delivered','received','received_partial'].includes(m.status) ? 'border-green-300 text-green-700 bg-green-50' :
                                    ['accounts_approved','payment_approved'].includes(m.status) ? 'border-blue-300 text-blue-700 bg-blue-50' :
                                    'border-gray-300'
                                  }`}>{(m.status || '').replace(/_/g, ' ')}</Badge>
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  {m.vendor_name || m.assigned_vendor_name || '-'}
                                  {m.po_id && <Badge variant="secondary" className="ml-1 text-[9px] bg-blue-50 text-blue-600">PO</Badge>}
                                  {m.auto_po_generated && !m.vendor_name && m.assigned_vendor_name && <Badge variant="secondary" className="ml-1 text-[9px] bg-green-50 text-green-600">Auto</Badge>}
                                </td>
                                <td className="px-3 py-2.5 text-xs">{m.site_engineer_name || '-'}</td>
                                {!isPM && <td className="px-3 py-2.5 text-right font-medium">{m.total_amount ? formatCurrency(m.total_amount) : '-'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No material requests for this project</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* VENDORS SUB-TAB */}
                  <TabsContent value="vendors" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">{vendorAssignments.length} vendor assignments</p>
                      {['super_admin','planning','procurement'].includes(user?.role) && (
                        <Button size="sm" data-testid="assign-vendor-btn" onClick={() => setAssignVendorDialog(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Assign Vendor
                        </Button>
                      )}
                    </div>
                    {vendorAssignments.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm" data-testid="vendor-assignments-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {vendorAssignments.map(a => (
                              <tr key={a.assignment_id || a.category} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{a.category}</td>
                                <td className="px-3 py-2.5">{a.vendor_name}</td>
                                <td className="px-3 py-2.5">{a.brand || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {['super_admin','planning','procurement'].includes(user?.role) && (
                                    <Button variant="ghost" size="sm" className="text-red-500 h-7" onClick={() => handleRemoveAssignment(a.category)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No vendors assigned to this project yet</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* ORDERS STATUS SUB-TAB */}
                  <TabsContent value="orders" className="mt-4">
                    {purchaseOrders.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">PO ID</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {purchaseOrders.map(po => (
                              <tr key={po.po_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-mono text-xs">
                                  {po.po_id}
                                  {po.auto_generated && <Badge variant="secondary" className="ml-1 text-[9px] bg-blue-50 text-blue-600">Auto</Badge>}
                                </td>
                                <td className="px-3 py-2.5">{po.vendor_name || '-'}</td>
                                <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(po.total_amount || 0)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    po.status === 'delivered' ? 'border-green-300 text-green-700 bg-green-50' :
                                    po.status === 'approved' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                                    po.status === 'cancelled' ? 'border-red-300 text-red-700 bg-red-50' :
                                    'border-amber-300 text-amber-700 bg-amber-50'
                                  }`}>{po.status}</Badge>
                                </td>
                                <td className="px-3 py-2.5 text-xs">{po.created_at?.split('T')[0]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No purchase orders for this project</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* PAYMENT STATUS SUB-TAB */}
                  <TabsContent value="payments" className="mt-4">
                    {purchaseOrders.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                            <p className="text-xl font-bold text-blue-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0))}</p>
                            <p className="text-xs text-gray-500">Total Order Value</p>
                          </div>
                          <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                            <p className="text-xl font-bold text-green-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + (po.paid_amount || 0), 0))}</p>
                            <p className="text-xs text-gray-500">Paid</p>
                          </div>
                          <div className="rounded-lg p-3 text-center border bg-red-50 border-red-200">
                            <p className="text-xl font-bold text-red-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + ((po.total_amount || 0) - (po.paid_amount || 0)), 0))}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </div>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Order Amount</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Payment Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {purchaseOrders.map(po => (
                                <tr key={po.po_id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2.5 font-medium">{po.vendor_name || '-'}</td>
                                  <td className="px-3 py-2.5 text-right">{formatCurrency(po.total_amount || 0)}</td>
                                  <td className="px-3 py-2.5 text-right text-green-600">{formatCurrency(po.paid_amount || 0)}</td>
                                  <td className="px-3 py-2.5 text-right text-red-600">{formatCurrency((po.total_amount || 0) - (po.paid_amount || 0))}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <Badge variant="outline" className={`text-xs capitalize ${
                                      po.payment_status === 'paid' ? 'border-green-300 text-green-700 bg-green-50' :
                                      po.payment_status === 'partial' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                      'border-red-300 text-red-700 bg-red-50'
                                    }`}>{po.payment_status || 'unpaid'}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No payment data for this project</p>
                      </div>
                    )}
                  </TabsContent>
                  {/* INVENTORY SUB-TAB */}
                  <TabsContent value="inventory" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">Daily Opening & Closing Stock</p>
                      {['super_admin','planning','site_engineer'].includes(user?.role) && (
                        <Button size="sm" data-testid="add-inventory-btn" onClick={() => {
                          setInvForm({ material_name: '', unit: '', date: new Date().toISOString().split('T')[0], opening_stock: 0, received: 0, used: 0, notes: '' });
                          setShowInventoryForm(true);
                        }}>
                          <Plus className="h-4 w-4 mr-1" /> Stock Entry
                        </Button>
                      )}
                    </div>
                    {materialInventory.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Opening</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Received</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Used</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Closing</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {materialInventory.map(inv => (
                              <tr key={inv.inventory_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{inv.date}</td>
                                <td className="px-3 py-2.5">{inv.material_name} {inv.unit && <span className="text-gray-400">({inv.unit})</span>}</td>
                                <td className="px-3 py-2.5 text-center">{inv.opening_stock}</td>
                                <td className="px-3 py-2.5 text-center text-green-600">+{inv.received}</td>
                                <td className="px-3 py-2.5 text-center text-red-600">-{inv.used}</td>
                                <td className="px-3 py-2.5 text-center font-bold">{inv.closing_stock}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-500">{inv.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><Package className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No inventory entries</p></div>}
                  </TabsContent>
                </Tabs>

                {/* Inventory Entry Dialog */}
                <Dialog open={showInventoryForm} onOpenChange={setShowInventoryForm}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Stock Entry</DialogTitle>
                      <DialogDescription>Record daily opening and closing stock.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Material Name *</Label>
                        <Input data-testid="inv-material" value={invForm.material_name} onChange={e => setInvForm({ ...invForm, material_name: e.target.value })} placeholder="e.g. Cement" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Unit</Label><Input value={invForm.unit} onChange={e => setInvForm({ ...invForm, unit: e.target.value })} placeholder="e.g. bags" /></div>
                        <div><Label>Date</Label><Input type="date" value={invForm.date} onChange={e => setInvForm({ ...invForm, date: e.target.value })} /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div><Label>Opening Stock</Label><Input type="number" value={invForm.opening_stock} onChange={e => setInvForm({ ...invForm, opening_stock: parseFloat(e.target.value) || 0 })} /></div>
                        <div><Label>Received</Label><Input type="number" value={invForm.received} onChange={e => setInvForm({ ...invForm, received: parseFloat(e.target.value) || 0 })} /></div>
                        <div><Label>Used</Label><Input type="number" value={invForm.used} onChange={e => setInvForm({ ...invForm, used: parseFloat(e.target.value) || 0 })} /></div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Closing Stock</p>
                        <p className="text-2xl font-bold">{invForm.opening_stock + invForm.received - invForm.used}</p>
                      </div>
                      <div><Label>Notes</Label><Input value={invForm.notes} onChange={e => setInvForm({ ...invForm, notes: e.target.value })} /></div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowInventoryForm(false)}>Cancel</Button>
                        <Button data-testid="save-inventory-btn" onClick={handleSubmitInventory}>Save</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Assign Vendor Dialog */}
                <Dialog open={assignVendorDialog} onOpenChange={setAssignVendorDialog}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Assign Vendor to Project</DialogTitle>
                      <DialogDescription>Select a category, vendor, and optional brand.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Material Category *</Label>
                        <Select value={assignForm.category} onValueChange={v => setAssignForm({ ...assignForm, category: v })}>
                          <SelectTrigger data-testid="assign-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {vendorCategories.map(c => (
                              <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Vendor *</Label>
                        <Select value={assignForm.vendor_id} onValueChange={v => {
                          setAssignForm({ ...assignForm, vendor_id: v, brand: '' });
                        }}>
                          <SelectTrigger data-testid="assign-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                          <SelectContent>
                            {allVendors.filter(v => !assignForm.category || v.vendor_type === assignForm.category || v.brands?.some(b => b.category === assignForm.category))
                              .map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)}
                            {allVendors.filter(v => !assignForm.category || v.vendor_type === assignForm.category || v.brands?.some(b => b.category === assignForm.category)).length === 0 && (
                              allVendors.map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {assignForm.vendor_id && (() => {
                        const vendor = allVendors.find(v => v.vendor_id === assignForm.vendor_id);
                        const brands = vendor?.brands?.find(b => b.category === assignForm.category)?.brand_names || [];
                        return brands.length > 0 ? (
                          <div>
                            <Label>Brand</Label>
                            <Select value={assignForm.brand} onValueChange={v => setAssignForm({ ...assignForm, brand: v })}>
                              <SelectTrigger data-testid="assign-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                              <SelectContent>
                                {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setAssignVendorDialog(false)}>Cancel</Button>
                        <Button data-testid="confirm-assign-btn" onClick={handleAssignVendor}>Assign</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>

            {/* ==================== LABOURS TAB ==================== */}
            <TabsContent value="labours" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-teal-600" />Labour & Work Orders
                  </h3>
                </div>

                <Tabs value={labourSubTab} onValueChange={setLabourSubTab}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="requests" data-testid="subtab-labour-req">Labour Requests</TabsTrigger>
                    <TabsTrigger value="workorders" data-testid="subtab-workorders">Work Orders</TabsTrigger>
                    <TabsTrigger value="attendance" data-testid="subtab-attendance">Attendance</TabsTrigger>
                  </TabsList>

                  {/* LABOUR REQUESTS SUB-TAB */}
                  <TabsContent value="requests" className="mt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4" data-testid="labours-summary">
                      <div className="rounded-lg p-3 text-center border bg-gray-50">
                        <p className="text-xl font-bold">{laboursData.summary.total || 0}</p>
                        <p className="text-xs text-gray-500">Total Requests</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-amber-50 border-amber-200">
                        <p className="text-xl font-bold text-amber-700">{laboursData.summary.requested || 0}</p>
                        <p className="text-xs text-gray-500">Pending</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                        <p className="text-xl font-bold text-green-700">{laboursData.summary.approved || 0}</p>
                        <p className="text-xs text-gray-500">Approved</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                        <p className="text-xl font-bold text-blue-700">{laboursData.summary.total_workers || 0}</p>
                        <p className="text-xs text-gray-500">Total Workers</p>
                      </div>
                      {!isPM && laboursData.summary.total_cost !== undefined && (
                        <div className="rounded-lg p-3 text-center border bg-purple-50 border-purple-200">
                          <p className="text-xl font-bold text-purple-700">{formatCurrency(laboursData.summary.total_cost || 0)}</p>
                          <p className="text-xs text-gray-500">Total Cost</p>
                        </div>
                      )}
                    </div>
                    {laboursData.labours.length > 0 ? (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm" data-testid="labours-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Contractor</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Workers</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              {!isPM && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {laboursData.labours.map(l => (
                              <tr key={l.labour_expense_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{l.description || l.labour_type || '-'}</td>
                                <td className="px-3 py-2.5 text-xs">{l.contractor_name || '-'}</td>
                                <td className="px-3 py-2.5 text-center">{l.num_workers || '-'}</td>
                                <td className="px-3 py-2.5 text-center">{l.num_days || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    l.status === 'requested' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                    ['accounts_approved','payment_approved','pm_approved'].includes(l.status) ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300'
                                  }`}>{(l.status || '').replace(/_/g, ' ')}</Badge>
                                </td>
                                {!isPM && <td className="px-3 py-2.5 text-right font-medium">{l.total_amount ? formatCurrency(l.total_amount) : '-'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><HardHat className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No labour requests</p></div>}
                  </TabsContent>

                  {/* WORK ORDERS SUB-TAB */}
                  <TabsContent value="workorders" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">{workOrders.length} work orders</p>
                      {['super_admin','planning'].includes(user?.role) && (
                        <Button size="sm" data-testid="create-wo-btn" onClick={() => setShowWOForm(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Create Work Order
                        </Button>
                      )}
                    </div>
                    {workOrders.length > 0 ? (
                      <div className="space-y-4">
                        {workOrders.map(wo => (
                          <Card key={wo.work_order_id} data-testid={`wo-card-${wo.work_order_id}`}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-semibold">{wo.contractor_name}</p>
                                  <p className="text-xs text-gray-500">{wo.contractor_type} | {wo.work_order_id}</p>
                                  {wo.description && <p className="text-sm text-gray-600 mt-1">{wo.description}</p>}
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-lg">{formatCurrency(wo.total_amount)}</p>
                                  <p className="text-xs text-green-600">Paid: {formatCurrency(wo.paid_amount || 0)}</p>
                                </div>
                              </div>
                              {wo.payment_stages?.length > 0 && (
                                <div className="mt-3 border-t pt-3">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Payment Stages</p>
                                  <div className="space-y-2">
                                    {wo.payment_stages.map(s => (
                                      <div key={s.stage_id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                                        <span className="font-medium">{s.stage_name}</span>
                                        <div className="flex items-center gap-3">
                                          <span>{formatCurrency(s.amount)}</span>
                                          <Badge variant="outline" className={`text-xs capitalize ${
                                            s.status === 'approved' ? 'border-green-300 text-green-700 bg-green-50' :
                                            s.status === 'requested' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                            'border-gray-300'
                                          }`}>{s.status}</Badge>
                                          {s.status === 'pending' && user?.role === 'site_engineer' && (
                                            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleRequestStagePayment(wo.work_order_id, s.stage_id, s.amount)}>
                                              Request Payment
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><FileText className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No work orders</p></div>}
                  </TabsContent>

                  {/* ATTENDANCE SUB-TAB */}
                  <TabsContent value="attendance" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">{labourAttendance.length} entries</p>
                      {['super_admin','planning','site_engineer'].includes(user?.role) && (
                        <Button size="sm" data-testid="add-attendance-btn" onClick={() => {
                          setAttForm({ contractor_id: '', work_order_id: '', stage_id: '', date: new Date().toISOString().split('T')[0], entries: [] });
                          setShowAttendanceForm(true);
                        }}>
                          <Plus className="h-4 w-4 mr-1" /> Daily Entry
                        </Button>
                      )}
                    </div>
                    {/* Daily summary */}
                    {labourAttendance.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                          <p className="text-xl font-bold text-blue-700">{labourAttendance.reduce((s, a) => s + (a.total_workers || 0), 0)}</p>
                          <p className="text-xs text-gray-500">Total Workers (All Days)</p>
                        </div>
                        <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                          <p className="text-xl font-bold text-green-700">{formatCurrency(labourAttendance.reduce((s, a) => s + (a.total_cost || 0), 0))}</p>
                          <p className="text-xs text-gray-500">Total Cost</p>
                        </div>
                        <div className="rounded-lg p-3 text-center border bg-gray-50">
                          <p className="text-xl font-bold">{labourAttendance.length}</p>
                          <p className="text-xs text-gray-500">Total Entries</p>
                        </div>
                      </div>
                    )}
                    {labourAttendance.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Contractor</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Workers</th>
                              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {labourAttendance.map(a => (
                              <tr key={a.attendance_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{a.date}</td>
                                <td className="px-3 py-2.5">{a.contractor_name || '-'}</td>
                                <td className="px-3 py-2.5 text-center font-bold">{a.total_workers}</td>
                                <td className="px-3 py-2.5 text-right">{formatCurrency(a.total_cost || 0)}</td>
                                <td className="px-3 py-2.5 text-xs">
                                  {a.entries?.map((e, i) => (
                                    <span key={i} className="mr-2">{e.label || e.type}: {e.count}</span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><Users className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No attendance entries</p></div>}
                  </TabsContent>
                </Tabs>

                {/* Create Work Order Dialog */}
                <Dialog open={showWOForm} onOpenChange={setShowWOForm}>
                  <DialogContent className="max-w-lg max-h-[90vh]">
                    <DialogHeader>
                      <DialogTitle>Create Work Order</DialogTitle>
                      <DialogDescription>Assign a contractor and define payment stages.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Contractor *</Label>
                        <Select value={woForm.contractor_id} onValueChange={v => setWoForm({ ...woForm, contractor_id: v })}>
                          <SelectTrigger data-testid="wo-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                          <SelectContent>
                            {allContractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name} ({c.contractor_type || 'General'})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} rows={2} />
                      </div>
                      <div>
                        <Label>Total Amount *</Label>
                        <Input type="number" data-testid="wo-amount" value={woForm.total_amount} onChange={e => setWoForm({ ...woForm, total_amount: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label className="flex justify-between"><span>Payment Stages</span>
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setWoForm({ ...woForm, payment_stages: [...woForm.payment_stages, { stage_name: `Stage ${woForm.payment_stages.length + 1}`, amount: 0, percentage: 0 }] })}>+ Add Stage</Button>
                        </Label>
                        <div className="space-y-2 mt-2">
                          {woForm.payment_stages.map((s, i) => (
                            <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                              <Input className="h-8 flex-1" value={s.stage_name} onChange={e => { const stages = [...woForm.payment_stages]; stages[i].stage_name = e.target.value; setWoForm({ ...woForm, payment_stages: stages }); }} />
                              <Input className="h-8 w-28" type="number" placeholder="Amount" value={s.amount} onChange={e => { const stages = [...woForm.payment_stages]; stages[i].amount = parseFloat(e.target.value) || 0; setWoForm({ ...woForm, payment_stages: stages }); }} />
                              <Button variant="ghost" size="sm" className="h-8 text-red-500" onClick={() => setWoForm({ ...woForm, payment_stages: woForm.payment_stages.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowWOForm(false)}>Cancel</Button>
                        <Button data-testid="save-wo-btn" onClick={handleCreateWO}>Create</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Attendance Entry Dialog */}
                <Dialog open={showAttendanceForm} onOpenChange={setShowAttendanceForm}>
                  <DialogContent className="max-w-lg max-h-[90vh]">
                    <DialogHeader>
                      <DialogTitle>Daily Labour Entry</DialogTitle>
                      <DialogDescription>Enter attendance for each labour type.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Contractor *</Label>
                        <Select value={attForm.contractor_id} onValueChange={v => {
                          const contractor = allContractors.find(c => c.contractor_id === v);
                          const entries = (contractor?.labour_types || []).map(lt => ({
                            type: lt.type, label: lt.label, count: 0, per_day_cost: lt.per_day_cost
                          }));
                          setAttForm({ ...attForm, contractor_id: v, entries });
                        }}>
                          <SelectTrigger data-testid="att-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                          <SelectContent>
                            {allContractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Work Order</Label>
                        <Select value={attForm.work_order_id} onValueChange={v => setAttForm({ ...attForm, work_order_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select work order (optional)" /></SelectTrigger>
                          <SelectContent>
                            {workOrders.filter(wo => wo.contractor_id === attForm.contractor_id).map(wo => (
                              <SelectItem key={wo.work_order_id} value={wo.work_order_id}>{wo.description || wo.work_order_id} ({formatCurrency(wo.total_amount)})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {attForm.work_order_id && (() => {
                        const wo = workOrders.find(w => w.work_order_id === attForm.work_order_id);
                        const openStages = wo?.payment_stages?.filter(s => s.status === 'pending') || [];
                        return openStages.length > 0 ? (
                          <div>
                            <Label>Stage</Label>
                            <Select value={attForm.stage_id} onValueChange={v => setAttForm({ ...attForm, stage_id: v })}>
                              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                              <SelectContent>
                                {openStages.map(s => <SelectItem key={s.stage_id} value={s.stage_id}>{s.stage_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}
                      <div>
                        <Label>Date</Label>
                        <Input type="date" value={attForm.date} onChange={e => setAttForm({ ...attForm, date: e.target.value })} />
                      </div>
                      {attForm.entries.length > 0 && (
                        <div className="space-y-3">
                          <Label>Labour Count</Label>
                          {attForm.entries.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                              <span className="flex-1 text-sm font-medium">{e.label}</span>
                              <Input className="w-20 h-8 text-center" type="number" min="0" value={e.count} onChange={ev => {
                                const entries = [...attForm.entries];
                                entries[i].count = parseInt(ev.target.value) || 0;
                                setAttForm({ ...attForm, entries });
                              }} />
                              <span className="text-xs text-gray-500 w-20 text-right">{e.per_day_cost}/day</span>
                              <span className="text-sm font-bold w-24 text-right">{((e.count || 0) * (e.per_day_cost || 0)).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center bg-blue-50 rounded-lg p-3">
                            <span className="font-semibold">Total</span>
                            <div className="text-right">
                              <span className="text-sm mr-4">{attForm.entries.reduce((s, e) => s + (e.count || 0), 0)} workers</span>
                              <span className="font-bold">{attForm.entries.reduce((s, e) => s + (e.count || 0) * (e.per_day_cost || 0), 0).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowAttendanceForm(false)}>Cancel</Button>
                        <Button data-testid="save-attendance-btn" onClick={handleSubmitAttendance}>Submit</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>

            {/* ==================== DOCUMENTS TAB ==================== */}
            <TabsContent value="documents" className="p-3 sm:p-6">
              <div className="space-y-6">

                {/* Architect Design Data - FIRST */}
                {(designData.site_plans.length > 0 || designData.design_files.length > 0) && (
                  <div className="space-y-4">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-600" />
                      Architect Designs
                    </h3>

                    {/* Site Plans */}
                    {designData.site_plans.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Site Plans ({designData.site_plans.length})</p>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Floor</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Drive Link</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {designData.site_plans.map(plan => (
                                <tr key={plan.plan_id} className="hover:bg-gray-50" data-testid={`doc-site-plan-${plan.plan_id}`}>
                                  <td className="px-3 py-2 font-medium">{plan.floor_name}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                      plan.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300' :
                                      plan.status === 'approval_waiting' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                      plan.status === 'design' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                      'bg-gray-100 text-gray-700 border-gray-300'
                                    }`}>
                                      {plan.status === 'yet_to_start' ? 'Yet to Start' : plan.status === 'approval_waiting' ? 'Approval Waiting' : plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {plan.drive_link ? <a href={plan.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Open</a> : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{plan.remarks || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Design Files (3D + Elevations) */}
                    {designData.design_files.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">3D Photos & Elevations ({designData.design_files.length})</p>
                        <div className="grid gap-2">
                          {designData.design_files.map(file => (
                            <div key={file.file_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border" data-testid={`doc-design-file-${file.file_id}`}>
                              <div>
                                <p className="font-medium text-sm">{file.file_name}</p>
                                <p className="text-xs text-gray-400">{file.file_type === '3d_photo' ? '3D Photo' : 'Elevation'} {file.remarks ? `- ${file.remarks}` : ''}</p>
                              </div>
                              {file.drive_link && (
                                <a href={file.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs border border-blue-200 rounded px-2 py-1">
                                  Open Drive
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project Documents - compact with upload button */}
                <div className={designData.site_plans.length > 0 || designData.design_files.length > 0 ? 'pt-4 border-t' : ''}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Folder className="h-5 w-5 text-amber-600" />
                      Project Documents
                      <Badge variant="outline" className="ml-1">{projectFiles.length}</Badge>
                    </h3>
                    <FileUpload
                      projectId={projectId}
                      category="project-documents"
                      onUploadComplete={fetchProjectFiles}
                      compact
                    />
                  </div>

                  <FileList
                    files={projectFiles}
                    onDelete={fetchProjectFiles}
                    canDelete={user && ['super_admin', 'planning', 'project_manager'].includes(user.role)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Verification Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(open) => !open && setVerifyDialog({ open: false, type: '', ids: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Verify Items
            </DialogTitle>
            <DialogDescription>
              You are about to verify {verifyDialog.ids.length} {verifyDialog.type} item(s) and send them for Super Admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Please review all items carefully before verification. 
                Once verified, items will be sent to the Super Admin for final approval.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Type <span className="font-bold text-amber-600">VERIFY</span> to confirm
              </Label>
              <Input
                data-testid="verify-code-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Type VERIFY"
                className="mt-2"
              />
              {verifyCode && verifyCode !== 'VERIFY' && (
                <p className="text-xs text-red-500 mt-1">Please type 'VERIFY' exactly in capital letters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog({ open: false, type: '', ids: [] })}>
              Cancel
            </Button>
            <Button 
              data-testid="confirm-verify-btn"
              onClick={handleVerify}
              disabled={verifyCode !== 'VERIFY'}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify & Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={collectPaymentDialog} onOpenChange={setCollectPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Collect Payment
            </DialogTitle>
            <DialogDescription>
              {selectedStage?.stage_label} - {selectedStage?.stage_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Stage Amount</p>
                <p className="font-semibold">{formatCurrency(selectedStage?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Already Received</p>
                <p className="font-semibold text-green-600">{formatCurrency(selectedStage?.amount_received || 0)}</p>
              </div>
            </div>
            
            <div>
              <Label>Amount to Collect *</Label>
              <NumericInput
                
                value={collectForm.amount_received}
                onChange={(e) => setCollectForm({...collectForm, amount_received: e.target.value})}
                placeholder="Enter amount"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Payment Mode *</Label>
              <select
                value={collectForm.payment_mode}
                onChange={(e) => setCollectForm({...collectForm, payment_mode: e.target.value})}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            
            <div>
              <Label>Reference / Transaction ID</Label>
              <Input
                value={collectForm.payment_reference}
                onChange={(e) => setCollectForm({...collectForm, payment_reference: e.target.value})}
                placeholder="Transaction ID or Cheque No."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Input
                value={collectForm.remarks}
                onChange={(e) => setCollectForm({...collectForm, remarks: e.target.value})}
                placeholder="Optional remarks"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
